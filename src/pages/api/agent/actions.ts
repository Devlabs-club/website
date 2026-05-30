import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import Opportunity from '@/models/talent/Opportunity';
import MatchRecord from '@/models/talent/MatchRecord';
import ProjectRecord from '@/models/talent/ProjectRecord';
import EventRecord from '@/models/talent/EventRecord';
import MomentumUpdate from '@/models/talent/MomentumUpdate';
import { computeProfileCompletion, computeBuilderScores } from '@/lib/talent/matching';
import { evaluateBuilderProfileQuality, evaluateDeterministicQuality } from '@/lib/talent/profileQuality';
import mongoose from 'mongoose';
import { generateOpenRouterReply, getOpenRouterChatModel, hasOpenRouterConfig } from '@/lib/openrouter';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import {
  buildFounderUiBlocks,
  mergeExtractedIntoOpportunity,
  parseFounderAgentTurn,
} from '@/lib/talent/founderAgent';
import {
  applyEditFromText,
  buildCandidateAnswer,
  buildPreviewExplanation,
  canRunPreviewAnyway,
  inferSkipFieldKey,
  isDoneMessage,
  isSkipMessage,
  matchCandidateByName,
  getMissingRequiredFields,
} from '@/lib/talent/founderSearchQuality';
import {
  buildTalentPreviewUiBlock,
  rankBuildersForOpportunity,
  toAnonymousCandidates,
  toPublicShortlist,
} from '@/lib/talent/builderSearch';
import { buildFullCandidatesForShortlist } from '@/lib/talent/founderCandidate';
import {
  buildFounderPipeline,
  buildSuggestedIntroMessage,
  PIPELINE_TO_MATCH_STATUS,
  pipelineStatusLabel,
} from '@/lib/talent/founderPipeline';
import {
  generateTrialProject,
  normalizeTrialProject,
} from '@/lib/talent/founderTrialProject';
import Shortlist from '@/models/talent/Shortlist';
import IntroRequest from '@/models/talent/IntroRequest';
import CallSchedule from '@/models/talent/CallSchedule';
import User from '@/models/user.tsx';
import {
  countUnreadForBuilder,
  countUnreadForFounder,
  getNotificationsForBuilder,
  getNotificationsForFounder,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/talent/notifications';
import {
  getBuilderIntroInbox,
  notifyBuilderIntroReceived,
  respondToIntro,
} from '@/lib/talent/introFlow';
import {
  completeCallByFounder,
  confirmCallScheduleByFounder,
  getBuilderUpcomingCalls,
  getCallScheduleForMatch,
  respondCallScheduleByBuilder,
  scheduleCallByFounder,
} from '@/lib/talent/callSchedule';
import {
  getBuilderActiveTrials,
  hireBuilder,
  rejectBuilder,
  reviewTrialSubmission,
  sendTrialProjectToBuilder,
  submitTrialByBuilder,
} from '@/lib/talent/trialFlow';
import {
  extractBioDraftFromHistory,
  extractBioFromUserText,
  extractHeadlineFromText,
  isAffirmativeConfirmation,
  wantsBioUpdate,
  type ChatTurn,
} from '@/lib/talent/builderChatHelpers';
import {
  getBuilderThreads,
  getFounderThreads,
  getOrCreateThread,
  getThreadMessages,
  seedThreadFromIntro,
  sendThreadMessage,
} from '@/lib/talent/messageFlow';
import { sendTalentEmail, dashboardDeepLink } from '@/lib/talent/talentEmail';

type ImportedProjectData = {
  projectName: string;
  description: string | null;
  techStack: string[];
  links: { devpost: string | null; github: string | null; demo: string | null; screenshots: string | null };
};

function normalizeProjectUrl(input: string) {
  const parsed = new URL(input);
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
}

function getAllowedProjectSource(input: string) {
  const normalizedUrl = normalizeProjectUrl(input);
  const parsed = new URL(normalizedUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const isDevpost = hostname === 'devpost.com' && /^\/software\/[^/]+\/?$/.test(parsed.pathname);
  const isGithub = hostname === 'github.com' && /^\/[^/]+\/[^/]+\/?$/.test(parsed.pathname);

  return { normalizedUrl, isDevpost, isGithub };
}

function buildUrlToMarkdownUrl(url: string) {
  const params = new URLSearchParams({
    url,
    title: 'true',
    links: 'true',
    clean: 'true',
  });
  return `https://urltomarkdown.herokuapp.com/?${params.toString()}`;
}

function extractFirstMarkdownImage(markdown: string) {
  const imageMatches = Array.from(markdown.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)[^)]*\)/gi));
  const firstImage = imageMatches
    .map((match) => match[1])
    .find((imageUrl) => !/badge|logo|avatar|profile/i.test(imageUrl));
  return firstImage || imageMatches[0]?.[1] || null;
}

async function fetchDevpostMarkdown(url: string) {
  const markdownUrl = buildUrlToMarkdownUrl(url);
  console.log('[agent/actions] import_project:urltomarkdown:start', { url, markdownUrl });

  const response = await fetch(markdownUrl);
  const markdown = await response.text();

  console.log('[agent/actions] import_project:urltomarkdown:response', {
    url,
    ok: response.ok,
    status: response.status,
    markdownLength: markdown.length,
    imageUrl: extractFirstMarkdownImage(markdown),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Devpost markdown: HTTP ${response.status}`);
  }

  if (!markdown.trim()) {
    throw new Error('Failed to fetch Devpost markdown: empty response.');
  }

  return markdown;
}

async function scrapeAndImportProject(url: string, builderId: any) {
  const { normalizedUrl, isDevpost, isGithub } = getAllowedProjectSource(url);
  const projectData: ImportedProjectData = {
    projectName: '',
    description: null,
    techStack: [] as string[],
    links: { devpost: null as string | null, github: null as string | null, demo: null as string | null, screenshots: null as string | null },
  };

  console.log('[agent/actions] import_project:start', {
    builderId: String(builderId),
    url: normalizedUrl,
    isDevpost,
    isGithub,
  });

  if (isDevpost) {
    const markdown = await fetchDevpostMarkdown(normalizedUrl);
    const imageUrl = extractFirstMarkdownImage(markdown);

    // Use LLM to extract project details from markdown
    const extractionResponse = await generateOpenRouterReply({
      systemPrompt: 'You extract project details from markdown generated from a Devpost page. Return strictly JSON with keys: projectName (string), description (string, max 300 chars), techStack (array of strings, e.g. ["React", "TypeScript"]), githubUrl (string|null), demoUrl (string|null). No markdown formatting, just JSON.',
      userPrompt: `Extract details from this Devpost project markdown:\n\n${markdown.substring(0, 4000)}`,
      temperature: 0,
      maxTokens: 500,
    });
    
    try {
      const parsed = JSON.parse(extractionResponse.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim());
      projectData.projectName = parsed.projectName || 'Devpost Project';
      projectData.description = parsed.description || null;
      projectData.techStack = Array.isArray(parsed.techStack) ? parsed.techStack : [];
      projectData.links.devpost = normalizedUrl;
      projectData.links.github = typeof parsed.githubUrl === 'string' ? parsed.githubUrl : null;
      projectData.links.demo = typeof parsed.demoUrl === 'string' ? parsed.demoUrl : null;
      projectData.links.screenshots = imageUrl;
      console.log('[agent/actions] import_project:devpost:extracted', {
        url: normalizedUrl,
        projectName: projectData.projectName,
        descriptionLength: projectData.description?.length || 0,
        techStack: projectData.techStack,
        imageUrl,
        githubUrl: projectData.links.github,
        demoUrl: projectData.links.demo,
      });
    } catch (e) {
      console.log('[agent/actions] import_project:devpost:parse_failed', {
        url: normalizedUrl,
        extractionPreview: extractionResponse.slice(0, 300),
        error: e instanceof Error ? e.message : 'unknown',
      });
      throw new Error('Failed to parse extracted Devpost data.');
    }
  } else if (isGithub) {
    // Extract owner/repo
    const match = normalizedUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
    if (!match) throw new Error('Invalid GitHub URL');
    const owner = match[1];
    const repo = match[2];
    console.log('[agent/actions] import_project:github:start', { owner, repo });

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    console.log('[agent/actions] import_project:github:repo_response', {
      owner,
      repo,
      ok: response.ok,
      status: response.status,
    });
    if (!response.ok) throw new Error(`Failed to fetch from GitHub API: HTTP ${response.status}`);
    const data = await response.json();

    projectData.projectName = data.name || 'GitHub Project';
    projectData.description = data.description || null;
    projectData.links.github = data.html_url || normalizedUrl;
    projectData.links.demo = data.homepage || null;
    projectData.links.screenshots = data.owner?.avatar_url || null;

    // Fetch languages
    const langResponse = await fetch(data.languages_url);
    console.log('[agent/actions] import_project:github:languages_response', {
      owner,
      repo,
      ok: langResponse.ok,
      status: langResponse.status,
    });
    if (langResponse.ok) {
      const langData = await langResponse.json();
      projectData.techStack = Object.keys(langData).slice(0, 5);
    }
  } else {
    throw new Error('Only Devpost and GitHub links are supported for import right now.');
  }

  // Create Project Record
  const project = await ProjectRecord.findOneAndUpdate(
    { builderId, sourceId: normalizedUrl },
    {
      $set: {
        builderId,
        projectName: projectData.projectName,
        description: projectData.description,
        techStack: projectData.techStack,
        'links.devpost': projectData.links.devpost,
        'links.github': projectData.links.github,
        'links.demo': projectData.links.demo,
        'links.screenshots': projectData.links.screenshots,
        sourceId: normalizedUrl,
        source: isDevpost ? 'devpost_urltomarkdown' : 'github_api',
        verificationStatus: 'builder_confirmed',
      }
    },
    { upsert: true, new: true }
  );

  console.log('[agent/actions] import_project:saved', {
    builderId: String(builderId),
    projectId: String(project._id),
    source: project.source,
    projectName: project.projectName,
  });

  return project;
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, ...((data as object) || {}) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bad(error: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getAgentMessage(params: {
  fallback: string;
  intent: string;
  context: Record<string, unknown>;
  history?: Array<{ role: string; content: string }>;
}) {
  if (!hasOpenRouterConfig()) return params.fallback;
  try {
    return await generateOpenRouterReply({
      systemPrompt:
        'You are the Builder Profile Agent for DevLabs. Your tone is pragmatic, direct, and builder-centric. Speak like a senior engineer or technical founder. No fluff, no corporate speak, and absolutely NO emojis. Your role is a collaborative writing partner. If a builder asks for help phrasing their bio, headline, or project contributions, actively help them draft it. Ask probing questions to extract the impact of their work (e.g., "What was the scale?", "Did you own the backend?"). Translate vague statements ("worked on frontend") into specific proof ("Built the React frontend and integrated Stripe for payments"). Focus on outcomes, technical depth, and ownership. Use the provided JSON context to reference their current headline, bio, projects, and skills. Keep responses punchy, use markdown for legibility, and always end with a clear next step or a single follow-up question. If evaluating profile quality with chat history, communicate strengths and issues directly in text.',
      userPrompt: `Intent: ${params.intent}\nContext JSON:\n${JSON.stringify(params.context)}`,
      temperature: 0.15,
      maxTokens: 250,
      history: params.history,
    });
  } catch {
    return params.fallback;
  }
}

function getSkillSignals(builder: any, requiredSkills: string[]) {
  const skillSet = new Set((builder.rolePreference || []).map((s: string) => s.toLowerCase()));
  const projectSkills = new Set<string>();
  (builder._projectSkills || []).forEach((s: string) => projectSkills.add(s.toLowerCase()));

  const required = requiredSkills.map((s) => s.toLowerCase());
  const matches = required.filter((s) => skillSet.has(s) || projectSkills.has(s));
  const ratio = required.length ? matches.length / required.length : 0.5;
  return ratio;
}

async function updateBuilderScores(builder: any) {
  const [projects, events, momentum] = await Promise.all([
    ProjectRecord.find({ builderId: builder._id }).lean(),
    EventRecord.find({ builderId: builder._id }).lean(),
    MomentumUpdate.find({ builderId: builder._id }).lean(),
  ]);
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;

  try {
    const quality = await evaluateBuilderProfileQuality(builder, projects, events, momentum);
    builder.profileQuality = quality;
    builder.profileQuality.evaluatedAt = new Date();
  } catch (err) {
    console.error('[updateBuilderScores] Quality evaluation failed:', err);
  }

  await builder.save();
  return completion;
}

async function applyClaimProfile(builder: any, claimConfirmed: boolean) {
  if (claimConfirmed) builder.verificationStatus = 'builder_confirmed';
  return await updateBuilderScores(builder);
}

async function applyAvailabilityUpdate(
  builder: any,
  updates: { availableNow?: boolean; hoursPerWeek?: number | null; desiredCompensation?: string | null; remotePreference?: string | null }
) {
  builder.availability = {
    ...builder.availability,
    ...(typeof updates.availableNow === 'boolean' ? { availableNow: updates.availableNow } : {}),
    hoursPerWeek: updates.hoursPerWeek ?? builder.availability?.hoursPerWeek ?? null,
    desiredCompensation: updates.desiredCompensation ?? builder.availability?.desiredCompensation ?? null,
    remotePreference: updates.remotePreference ?? builder.availability?.remotePreference ?? 'unspecified',
    refreshedAt: new Date(),
  };
  return await updateBuilderScores(builder);
}

async function applyLinksUpdate(
  builder: any,
  updates: { github?: string | null; linkedin?: string | null; resume?: string | null; portfolio?: string | null }
) {
  builder.links = {
    ...builder.links,
    ...(updates.github !== undefined ? { github: updates.github } : {}),
    ...(updates.linkedin !== undefined ? { linkedin: updates.linkedin } : {}),
    ...(updates.resume !== undefined ? { resume: updates.resume } : {}),
    ...(updates.portfolio !== undefined ? { portfolio: updates.portfolio } : {}),
  };

  return await updateBuilderScores(builder);
}

async function resolveAuthedFounder(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = extractTokenFromHeader(authHeader) || extractTokenFromCookies(cookieHeader);
  if (!token) {
    return { error: 'Please log in to continue.' as const };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return { error: 'Session expired. Please log in again.' as const };
  }

  if (decoded.role !== 'founder') {
    return { error: 'Founder account required.' as const };
  }

  const email = (decoded.email || '').toLowerCase().trim();
  if (!email) {
    return { error: 'Authenticated email not available in session.' as const };
  }

  let founderName = email.split('@')[0];
  try {
    await connectAdminDB();
    const user = await User.findById(decoded.userId).select('name').lean();
    if (user?.name) founderName = user.name;
  } catch {
    // use email fallback
  }

  return { decoded, email, founderName };
}

async function resolveAuthedBuilder(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = extractTokenFromHeader(authHeader) || extractTokenFromCookies(cookieHeader);
  if (!token) {
    return { error: 'Please log in to continue.' as const };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return { error: 'Session expired. Please log in again.' as const };
  }

  const email = (decoded.email || '').toLowerCase().trim();
  if (!email) {
    return { error: 'Authenticated email not available in session.' as const };
  }

  let builder = await BuilderProfile.findOne({
    $or: [
      { userId: decoded.userId },
      { email },
    ],
  });

  if (!builder) {
    const fallbackName = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    builder = await BuilderProfile.create({
      userId: decoded.userId,
      email,
      name: fallbackName || 'Builder',
      verificationStatus: 'builder_confirmed',
      availability: {
        availableNow: true,
        hoursPerWeek: null,
        remotePreference: 'unspecified',
        refreshedAt: new Date(),
      },
      hiringIntent: {
        optedIn: true,
        projectSprint: true,
      },
    });
  } else if (!builder.userId) {
    builder.userId = decoded.userId;
    await builder.save();
  }

  return { builder };
}

function extractAvailabilityFromText(text: string) {
  const lower = text.toLowerCase();
  const hoursMatch = lower.match(/(\d{1,2})\s*(hours|hrs|hr)/);
  const availableNow = lower.includes('not available')
    ? false
    : (lower.includes('available') || lower.includes('open') || lower.includes('yes') ? true : undefined);
  const remotePreference =
    lower.includes('hybrid') ? 'hybrid'
      : lower.includes('in person') || lower.includes('onsite') ? 'in_person'
        : lower.includes('remote') ? 'remote'
          : undefined;

  return {
    availableNow,
    hoursPerWeek: hoursMatch ? Number(hoursMatch[1]) : null,
    remotePreference,
  };
}

function getStrongestEvidence(builder: any, projects: any[]) {
  const firstProject = projects.find((project) => project?.projectName);
  if (firstProject) {
    const link = firstProject?.links?.github || firstProject?.links?.devpost || firstProject?.links?.demo || null;
    return {
      label: firstProject.projectName,
      url: link,
    };
  }

  if (builder?.links?.github) return { label: 'GitHub profile', url: builder.links.github };
  if (builder?.links?.portfolio) return { label: 'Portfolio', url: builder.links.portfolio };
  return { label: 'No verified proof link yet', url: null };
}

function buildNextSteps(builder: any, completion: any, projectCount: number) {
  const steps: string[] = [];
  if (!builder?.links?.github) steps.push('Add your GitHub link so founders can verify technical proof-of-work.');
  if (!builder?.links?.linkedin) steps.push('Add LinkedIn for identity credibility and easier founder trust.');
  if (!builder?.links?.resume) steps.push('Attach your resume to improve profile completeness and ranking.');
  if (projectCount < 2) steps.push('Add at least 2 shipped projects with clear contribution notes and demo links.');
  if (!builder?.availability?.availableNow || !builder?.availability?.hoursPerWeek) {
    steps.push('Update availability and weekly hours so matching can include you in active searches.');
  }
  if (!Array.isArray(builder?.rolePreference) || builder.rolePreference.length === 0) {
    steps.push('Set role/skill preferences so founder searches can route to your profile correctly.');
  }
  if (completion?.score < 70) {
    steps.push('Raise profile completion above 70% to become consistently shortlist-ready.');
  }

  return steps.slice(0, 3);
}

function extractProfileLinksFromText(text: string) {
  const matches = text.match(/https?:\/\/[^\s)]+/gi) || [];
  let github: string | null = null;
  let linkedin: string | null = null;

  for (const url of matches) {
    const cleaned = url.replace(/[.,]$/, '');
    if (!github && /github\.com/i.test(cleaned)) github = cleaned;
    if (!linkedin && /linkedin\.com\/in\//i.test(cleaned)) linkedin = cleaned;
  }

  return { github, linkedin };
}

function wantsLinkSummary(text: string) {
  return /(what'?s|what is|show|tell me).*(github|linkedin)|(github|linkedin).*(what'?s|what is|show|tell me)/i.test(text);
}

function extractRolesAndSkillsFromText(text: string) {
  const lower = text.toLowerCase();
  const roles = new Set<string>();
  const skills = new Set<string>();

  if (/(full[\s-]?stack)/i.test(text)) roles.add('full-stack developer');
  if (/(app development|mobile app|mobile developer|flutter developer)/i.test(text)) roles.add('mobile app developer');
  if (/(frontend|front-end)/i.test(text)) roles.add('frontend engineer');
  if (/(backend|back-end)/i.test(text)) roles.add('backend engineer');
  if (/(product engineer)/i.test(text)) roles.add('product engineer');

  const skillMap: Array<[RegExp, string]> = [
    [/typescript/i, 'TypeScript'],
    [/flutter/i, 'Flutter'],
    [/react(\.js)?/i, 'React'],
    [/next(\.js)?/i, 'Next.js'],
    [/\bsql\b/i, 'SQL'],
    [/mongo(db)?/i, 'MongoDB'],
    [/node(\.js)?/i, 'Node.js'],
    [/python/i, 'Python'],
    [/fastapi/i, 'FastAPI'],
    [/langchain/i, 'LangChain'],
  ];
  for (const [pattern, label] of skillMap) {
    if (pattern.test(lower)) skills.add(label);
  }

  return { roles: Array.from(roles), skills: Array.from(skills) };
}

async function applyProfileBasicsUpdate(builder: any, updates: { headline?: string | null; bio?: string | null }) {
  if (updates.headline !== undefined) builder.headline = updates.headline?.trim() || null;
  if (updates.bio !== undefined) builder.bio = updates.bio?.trim() || null;
  await builder.save();
  return await updateBuilderScores(builder);
}

async function reloadBuilderForAgent(builderId: any) {
  return BuilderProfile.findById(builderId);
}

async function buildBuilderAgentContext(builder: any) {
  const [projects, matches, introInbox, activeTrials, upcomingCalls, threads] = await Promise.all([
    ProjectRecord.find({ builderId: builder._id }).select('projectName description techStack builderContribution verificationStatus').limit(8).lean(),
    MatchRecord.find({ builderId: builder._id }).sort({ updatedAt: -1 }).limit(6).populate('opportunityId').lean(),
    getBuilderIntroInbox(String(builder._id)),
    getBuilderActiveTrials(String(builder._id)),
    getBuilderUpcomingCalls(String(builder._id)),
    getBuilderThreads(String(builder._id)),
  ]);
  const completion = computeBuilderScores(builder, projects);
  return {
    builderName: builder.name,
    headline: builder.headline,
    bio: builder.bio,
    rolePreference: builder.rolePreference,
    preferredWorkType: builder.preferredWorkType,
    availability: builder.availability,
    links: builder.links,
    completion,
    profileQuality: builder.profileQuality,
    projects: projects.map((p: any) => ({
      title: p.projectName,
      description: p.description,
      contribution: p.builderContribution,
      techStack: p.techStack,
    })),
    matches: matches.map((m: any) => ({
      status: m.status,
      roleTitle: m.opportunityId?.roleTitle,
      company: m.opportunityId?.company,
    })),
    introInboxCount: introInbox.length,
    activeTrials,
    upcomingCalls,
    messageThreads: threads,
    mustNeverAskForBuilderId: true,
  };
}

async function applyRoleSkillUpdate(builder: any, updates: { roles?: string[]; skills?: string[] }) {
  const existing = new Set<string>((builder.rolePreference || []).map((value: string) => value.trim()));
  (updates.roles || []).forEach((role) => existing.add(role));
  (updates.skills || []).forEach((skill) => existing.add(skill));
  builder.rolePreference = Array.from(existing);

  return await updateBuilderScores(builder);
}

async function applyWorkPreferencesUpdate(
  builder: any,
  updates: { preferredWorkTypes?: string[]; availableNow?: boolean }
) {
  const nextTypes = Array.isArray(updates.preferredWorkTypes) ? updates.preferredWorkTypes : [];
  const existing = new Set<string>((builder.preferredWorkType || []).map((value: string) => value.trim()));
  nextTypes.forEach((workType) => existing.add(workType));
  builder.preferredWorkType = Array.from(existing);

  if (typeof updates.availableNow === 'boolean') {
    builder.availability = {
      ...builder.availability,
      availableNow: updates.availableNow,
      refreshedAt: new Date(),
    };
  }

  return await updateBuilderScores(builder);
}

function extractWorkTypesFromText(text: string) {
  const lower = text.toLowerCase();
  const workTypes = new Set<string>();
  if (/full[\s-]?time/.test(lower)) workTypes.add('full_time');
  if (/part[\s-]?time/.test(lower)) workTypes.add('part_time_contract');
  if (/contract|freelance/.test(lower)) workTypes.add('part_time_contract');
  if (/intern(ship)?/.test(lower)) workTypes.add('internship');
  if (/sprint|project/.test(lower)) workTypes.add('paid_sprint');
  if (/anything works|open to anything|open/.test(lower) && workTypes.size === 0) {
    workTypes.add('full_time');
    workTypes.add('part_time_contract');
    workTypes.add('paid_sprint');
  }

  const availableNow = /(available|ready now|open to work|anything works|open)/.test(lower) ? true : undefined;
  return { preferredWorkTypes: Array.from(workTypes), availableNow };
}

function getNextQuestion(builder: any, projectCount: number) {
  if (!Array.isArray(builder?.rolePreference) || builder.rolePreference.length === 0) {
    return 'What roles do you want founders to find you for (e.g. full-stack, frontend, mobile)?';
  }
  if (!Array.isArray(builder?.rolePreference) || builder.rolePreference.length <= 1) { // checking skills logic here
     // Assuming skills are mixed into rolePreference for now, but really we want to ensure they have enough details.
  }
  if (!Array.isArray(builder?.preferredWorkType) || builder.preferredWorkType.length === 0) {
    return 'What work types do you want: full-time, contract, internship, or sprint?';
  }
  if (!builder?.availability?.hoursPerWeek || builder?.availability?.remotePreference === 'unspecified') {
    return 'How many hours per week are you available right now, and do you prefer remote or in-person?';
  }
  if (!builder?.links?.resume && !builder?.links?.linkedin && !builder?.links?.github) {
    return 'Adding a resume, LinkedIn, or GitHub improves founder trust quickly. Want to provide one now?';
  }
  if (projectCount < 1) {
    return 'Share one project link and tell me what you personally built to boost your Match Readiness.';
  }
  if (!builder?.bio && !builder?.headline) {
    return 'Would you like me to help write a quick founder-facing headline and bio for you?';
  }
  return 'Great progress. Check your matches tab to see opportunities, or add more projects to boost your score further.';
}

function normalizeProjectName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseListValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[,\n|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function cleanNullableString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function projectSummaryBlock(project: any, type = 'project_card') {
  const links = [
    project.links?.github ? `GitHub: ${project.links.github}` : null,
    project.links?.demo ? `Demo: ${project.links.demo}` : null,
    project.links?.devpost ? `Devpost: ${project.links.devpost}` : null,
    project.links?.screenshots ? `Image: ${project.links.screenshots}` : null,
  ].filter(Boolean);

  return {
    type,
    title: project.projectName || 'Untitled project',
    body: project.description || project.builderContribution || 'No description yet.',
    items: [
      project.techStack?.length ? `Tech stack: ${project.techStack.join(', ')}` : 'Tech stack: missing',
      project.builderContribution ? `Contribution: ${project.builderContribution}` : 'Contribution: missing',
      `Status: ${project.status || 'unknown'}`,
      `Verification: ${project.verificationStatus || 'imported_unverified'}`,
      ...links,
    ],
  };
}

async function findBuilderProject(builderId: any, projectName?: unknown) {
  const projects = await ProjectRecord.find({ builderId }).sort({ updatedAt: -1 }).lean();
  const query = typeof projectName === 'string' ? normalizeProjectName(projectName) : '';

  if (!query) {
    return {
      project: projects.length === 1 ? projects[0] : null,
      projects,
      needsProjectName: projects.length !== 1,
    };
  }

  const exact = projects.find((project: any) => normalizeProjectName(project.projectName || '') === query);
  if (exact) return { project: exact, projects, needsProjectName: false };

  const fuzzy = projects.find((project: any) => {
    const name = normalizeProjectName(project.projectName || '');
    return name.includes(query) || query.includes(name);
  });

  return { project: fuzzy || null, projects, needsProjectName: false };
}

function buildProjectUpdates(args: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  const links: Record<string, string | null> = {};

  const nextName = cleanNullableString(args.newProjectName ?? args.projectTitle ?? args.title);
  const description = cleanNullableString(args.description);
  const problemSolved = cleanNullableString(args.problemSolved);
  const builderContribution = cleanNullableString(args.builderContribution ?? args.contribution);
  const status = cleanNullableString(args.status);
  const github = cleanNullableString(args.githubUrl ?? args.github);
  const demo = cleanNullableString(args.demoUrl ?? args.demo);
  const devpost = cleanNullableString(args.devpostUrl ?? args.devpost);
  const screenshots = cleanNullableString(args.imageUrl ?? args.screenshotUrl ?? args.screenshots);
  const techStack = parseListValue(args.techStack ?? args.skills);
  const contributionTags = parseListValue(args.contributionTags);

  if (nextName) updates.projectName = nextName;
  if (description) updates.description = description;
  if (problemSolved) updates.problemSolved = problemSolved;
  if (builderContribution) updates.builderContribution = builderContribution;
  if (status && ['prototype', 'launched', 'abandoned', 'active', 'incorporated', 'unknown'].includes(status)) updates.status = status;
  if (techStack.length) updates.techStack = techStack;
  if (contributionTags.length) updates.contributionTags = contributionTags;
  if (github) links.github = github;
  if (demo) links.demo = demo;
  if (devpost) links.devpost = devpost;
  if (screenshots) links.screenshots = screenshots;
  for (const [key, value] of Object.entries(links)) updates[`links.${key}`] = value;

  return updates;
}

function routeProjectCrudFallback(userText: string) {
  const lower = userText.toLowerCase();
  if (!/(project|projects|proof.of.work|proof-of-work|repo|repository)/i.test(userText)) return null;
  if (/(devpost\.com\/software|github\.com\/[^/\s]+\/[^/\s]+)/i.test(userText)) return null;

  if (/(list|show|view|what).*(projects|proof.of.work|proof-of-work)/i.test(userText)) {
    return { tool: 'list_projects' as const, args: {} };
  }

  const deleteMatch = userText.match(/(?:confirm\s+)?(?:delete|remove)\s+(?:the\s+)?(?:project\s+)?["']?([^"'.]+)["']?/i);
  if (deleteMatch) {
    return {
      tool: 'delete_project' as const,
      args: {
        projectName: deleteMatch[1].trim(),
        confirmDelete: /confirm|yes|permanently/i.test(lower),
      },
    };
  }

  if (/(details|read|show|view).*(project)/i.test(userText)) {
    const projectName = userText.split(/project/i).pop()?.replace(/["'.]/g, '').trim();
    return { tool: 'read_project' as const, args: { projectName } };
  }

  return null;
}

async function routeProjectCrudWithLLM(userText: string) {
  const fallback = routeProjectCrudFallback(userText);
  if (fallback) return fallback;
  if (!/(project|projects|proof.of.work|proof-of-work|repo|repository)/i.test(userText)) return null;
  if (/(devpost\.com\/software|github\.com\/[^/\s]+\/[^/\s]+)/i.test(userText)) return null;
  if (!/(create|add|manual|list|show|view|read|details|update|edit|change|set|rename|delete|remove)/i.test(userText)) return null;
  if (!hasOpenRouterConfig()) return null;

  try {
    const routingRaw = await generateOpenRouterReply({
      systemPrompt:
        'Route builder project CRUD requests into strict JSON. Tools: create_project, list_projects, read_project, update_project, delete_project, none. Return JSON with keys: tool, args. args may include projectName, newProjectName, description, problemSolved, builderContribution, techStack string array, contributionTags string array, githubUrl, demoUrl, devpostUrl, status, confirmDelete boolean. For delete, confirmDelete is true only if the user explicitly says confirm/yes/permanently delete. No markdown.',
      userPrompt: `Builder says: "${userText}"`,
      temperature: 0,
      maxTokens: 300,
    });
    const normalized = routingRaw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const routed = JSON.parse(normalized);
    if (
      routed?.tool === 'create_project' ||
      routed?.tool === 'list_projects' ||
      routed?.tool === 'read_project' ||
      routed?.tool === 'update_project' ||
      routed?.tool === 'delete_project'
    ) {
      return { tool: routed.tool, args: typeof routed.args === 'object' && routed.args ? routed.args : {} };
    }
  } catch (error) {
    console.log('[agent/actions] project_crud:routing_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return null;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    await connectAdminDB();
    const body = await request.json();
    const action = body?.action;
    const payload = body?.payload || {};
    console.log('[agent/actions] request', { action, hasPayload: Boolean(payload) });

    if (!action) return bad('action is required');

    if (action === 'claim_profile') {
      const { claimConfirmed } = payload;
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyClaimProfile(builder, claimConfirmed === true);
      const message = await getAgentMessage({
        fallback: 'Profile claim updated',
        intent: 'claim_profile_success',
        context: { builderName: builder.name, completion },
      });

      return ok({
        message,
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'profile_completion',
            title: 'Your Builder Profile Strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ],
      });
    }

    if (action === 'update_availability') {
      const { availableNow, hoursPerWeek, desiredCompensation, remotePreference } = payload;
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyAvailabilityUpdate(builder, {
        availableNow: typeof availableNow === 'boolean' ? availableNow : undefined,
        hoursPerWeek,
        desiredCompensation,
        remotePreference,
      });
      const message = await getAgentMessage({
        fallback: 'Availability updated',
        intent: 'update_availability_success',
        context: {
          builderName: builder.name,
          availableNow: builder.availability.availableNow,
          hoursPerWeek: builder.availability.hoursPerWeek,
        },
      });

      return ok({
        message,
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'summary_card',
            title: 'Availability Updated',
            body: `Now marked ${builder.availability.availableNow ? 'available' : 'not available'} with ${builder.availability.hoursPerWeek || 0} hrs/week.`,
          },
        ],
      });
    }

    if (action === 'update_links') {
      const { github, linkedin, portfolio } = payload;
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyLinksUpdate(builder, { github, linkedin, portfolio });

      return ok({
        message: 'Links updated.',
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'summary_card',
            title: 'Links updated',
            body: `Your profile links have been saved.`,
          },
        ],
      });
    }

    if (action === 'update_profile_basics') {
      const { headline, bio } = payload;
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyProfileBasicsUpdate(builder, { headline, bio });

      return ok({
        message: 'Profile basics updated.',
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'summary_card',
            title: 'Profile updated',
            body: `Headline and bio saved.`,
          },
        ],
      });
    }

    if (action === 'update_work_preferences') {
      const { preferredWorkTypes, availableNow } = payload;
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyWorkPreferencesUpdate(builder, {
        preferredWorkTypes: Array.isArray(preferredWorkTypes) ? preferredWorkTypes.filter(Boolean) : [],
        availableNow: typeof availableNow === 'boolean' ? availableNow : undefined,
      });

      return ok({
        message: 'Work preferences updated.',
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'summary_card',
            title: 'Work preferences updated',
            body: `Preferred work types: ${Array.isArray(builder.preferredWorkType) && builder.preferredWorkType.length ? builder.preferredWorkType.join(', ') : 'none'}`,
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ],
      });
    }

    if (action === 'builder_chat') {
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;
      const userText = String(payload?.message || '').trim();
      if (!userText) return bad('message is required');
      console.log('[agent/actions] builder_chat:start', {
        builderId: String(builder._id),
        userText,
      });

      const lower = userText.toLowerCase();
      let tool:
        | 'claim_profile'
        | 'update_availability'
        | 'update_links'
        | 'update_role_skills'
        | 'update_work_preferences'
        | 'update_profile_basics'
        | 'read_profile_basics'
        | 'link_summary'
        | 'profile_summary'
        | 'recommend_next_steps'
        | 'suggest_evidence_improvements'
        | 'import_project'
        | 'create_project'
        | 'list_projects'
        | 'read_project'
        | 'update_project'
        | 'delete_project'
        | 'evaluate_profile_quality'
        | 'resume_uploaded'
        | 'none' = 'none';
      let toolArgs: Record<string, unknown> = {};
      const extractedLinks = extractProfileLinksFromText(userText);
      const extractedRoleSkills = extractRolesAndSkillsFromText(userText);
      const extractedWorkTypes = extractWorkTypesFromText(userText);
      const resumeUrl = typeof payload?.attachments?.resumeUrl === 'string' ? payload.attachments.resumeUrl : null;
      const projectCrudRoute = await routeProjectCrudWithLLM(userText);

      if (projectCrudRoute) {
        tool = projectCrudRoute.tool;
        toolArgs = projectCrudRoute.args;
      } else if (/(claim|verify)/i.test(userText)) {
        tool = 'claim_profile';
      } else if (/(availability|available|hours|open to work|remote|hybrid|onsite|in person)/i.test(userText)) {
        tool = 'update_availability';
        toolArgs = extractAvailabilityFromText(userText);
      } else if (userText.match(/https?:\/\/(www\.)?devpost\.com\/software\/[^\s)]+/i) || userText.match(/https?:\/\/(www\.)?github\.com\/[^\s)]+\/[^\s)]+/i)) {
        // Find if user provided a project URL to import
        const devpostMatch = userText.match(/https?:\/\/(www\.)?devpost\.com\/software\/[^\s)]+/i);
        const githubMatch = userText.match(/https?:\/\/(www\.)?github\.com\/[^\s)]+\/[^\s)]+/i);
        const url = devpostMatch ? devpostMatch[0] : (githubMatch ? githubMatch[0] : null);
        if (url) {
          tool = 'import_project';
          toolArgs = { url };
        } else if (extractedLinks.github || extractedLinks.linkedin) {
          tool = 'update_links';
          toolArgs = extractedLinks;
        }
      } else if (extractedLinks.github || extractedLinks.linkedin) {
        tool = 'update_links';
        toolArgs = extractedLinks;
      } else if (resumeUrl && userText.includes('The parser extracted')) {
        tool = 'resume_uploaded';
        toolArgs = { resume: resumeUrl };
      } else if (resumeUrl) {
        tool = 'update_links';
        toolArgs = { resume: resumeUrl };
      } else if (extractedWorkTypes.preferredWorkTypes.length > 0) {
        tool = 'update_work_preferences';
        toolArgs = extractedWorkTypes;
      } else if (extractedRoleSkills.roles.length > 0 || extractedRoleSkills.skills.length > 0) {
        tool = 'update_role_skills';
        toolArgs = extractedRoleSkills;
      } else if (wantsLinkSummary(userText)) {
        tool = 'link_summary';
      } else if (/(what does my current.*summary|read my.*summary|show my.*summary|current.*summary|what is my.*summary|read.*bio|show.*bio|current.*bio|what is my.*bio|read.*headline|show.*headline|current.*headline|what is my.*headline)/i.test(userText)) {
        tool = 'read_profile_basics';
      } else if (/(update.*summary|edit.*summary|change.*summary|improve.*summary|write.*summary|update.*bio|edit.*bio|change.*bio|improve.*bio|write.*bio|update.*headline|edit.*headline|change.*headline|improve.*headline|write.*headline)/i.test(userText)) {
        tool = 'update_profile_basics';
        // Let the LLM extract the actual headline/bio if possible, but set the intent
      } else if (/(everything you know|about me|my profile|what do you know)/i.test(userText)) {
        tool = 'profile_summary';
      } else if (/(improve match|next steps|better matches|match quality|improve profile|make my profile better)/i.test(userText)) {
        tool = 'evaluate_profile_quality';
      } else if (/(projects|proof-of-work|skills|evidence|founder|portfolio)/i.test(userText)) {
        tool = 'suggest_evidence_improvements';
      }
      console.log('[agent/actions] builder_chat:routed_regex', {
        builderId: String(builder._id),
        tool,
        toolArgs,
        extractedLinks,
        extractedRoleSkills,
        extractedWorkTypes,
        resumeUrl,
      });

      const deterministicLocked = tool !== 'none';

      if (hasOpenRouterConfig() && !deterministicLocked) {
        try {
          const routingRaw = await generateOpenRouterReply({
            systemPrompt:
              'You route builder chat into tools. Return strict JSON with keys: tool, args. Tools: claim_profile, update_availability, update_links, update_role_skills, update_work_preferences, update_profile_basics, read_profile_basics, link_summary, profile_summary, recommend_next_steps, suggest_evidence_improvements, evaluate_profile_quality, import_project, create_project, list_projects, read_project, update_project, delete_project, resume_uploaded, none. IMPORTANT: If the user is asking for advice, feedback, or help drafting/rephrasing content (e.g., "help me rewrite my bio", "how does this sound?"), use the `none` tool so you can converse with them and provide suggestions. Only use `update_*` tools when the user explicitly provides the finalized content they want to save. Never request any ID. args for import_project: url(string). Project CRUD args may include projectName, newProjectName, description, problemSolved, builderContribution, techStack(string[]), contributionTags(string[]), githubUrl, demoUrl, devpostUrl, status, confirmDelete(boolean). args for update_availability: availableNow(boolean optional), hoursPerWeek(number optional), desiredCompensation(string optional), remotePreference(remote|hybrid|in_person|unspecified optional). args for update_links: github(string optional), linkedin(string optional), resume(string optional). args for update_work_preferences: preferredWorkTypes(string[]), availableNow(boolean optional). args for update_profile_basics: headline(string optional), bio(string optional). No markdown.',
            userPrompt: `Builder says: "${userText}"`,
            temperature: 0,
            maxTokens: 180,
          });
          const normalized = routingRaw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          const routed = JSON.parse(normalized);
          if (
            routed?.tool === 'claim_profile' ||
            routed?.tool === 'update_availability' ||
            routed?.tool === 'update_links' ||
            routed?.tool === 'update_role_skills' ||
            routed?.tool === 'update_work_preferences' ||
            routed?.tool === 'update_profile_basics' ||
            routed?.tool === 'read_profile_basics' ||
            routed?.tool === 'link_summary' ||
            routed?.tool === 'profile_summary' ||
            routed?.tool === 'recommend_next_steps' ||
            routed?.tool === 'suggest_evidence_improvements' ||
            routed?.tool === 'import_project' ||
            routed?.tool === 'create_project' ||
            routed?.tool === 'list_projects' ||
            routed?.tool === 'read_project' ||
            routed?.tool === 'update_project' ||
            routed?.tool === 'delete_project' ||
            routed?.tool === 'evaluate_profile_quality' ||
            routed?.tool === 'resume_uploaded' ||
            routed?.tool === 'none'
          ) {
            tool = routed.tool;
            toolArgs = typeof routed.args === 'object' && routed.args ? routed.args : {};
            console.log('[agent/actions] builder_chat:routed_llm', {
              builderId: String(builder._id),
              tool,
              toolArgs,
            });
          }
        } catch (error) {
          console.log('[agent/actions] builder_chat:routing_llm_failed', {
            builderId: String(builder._id),
            error: error instanceof Error ? error.message : 'unknown',
          });
        }
      } else if (deterministicLocked) {
        console.log('[agent/actions] builder_chat:routing_locked', {
          builderId: String(builder._id),
          tool,
          reason: 'deterministic_regex_match',
        });
      }

      const chatHistory: ChatTurn[] = Array.isArray(payload?.history) ? payload.history : [];

      if (
        (tool === 'none' || tool === 'update_profile_basics') &&
        (isAffirmativeConfirmation(userText) || wantsBioUpdate(userText))
      ) {
        const draftBio = extractBioDraftFromHistory(chatHistory);
        if (draftBio) {
          tool = 'update_profile_basics';
          toolArgs = { ...toolArgs, bio: draftBio };
        }
      }

      if (tool === 'update_profile_basics' && !toolArgs.bio && !toolArgs.headline) {
        const fromText = extractBioFromUserText(userText);
        const fromHistory = extractBioDraftFromHistory(chatHistory);
        const headline = extractHeadlineFromText(userText);
        if (fromText) toolArgs.bio = fromText;
        else if (fromHistory) toolArgs.bio = fromHistory;
        if (headline) toolArgs.headline = headline;
      }

      const projects = await ProjectRecord.find({ builderId: builder._id }).select('projectName techStack links description builderContribution').lean();
      const projectCount = projects.length;
      let uiBlocks: any[] = [];
      let importProjectMessage: string | null = null;
      let importProjectFailed = false;
      let projectCrudMessage: string | null = null;
      if (tool === 'claim_profile') {
        const completion = await applyClaimProfile(builder, true);
        uiBlocks = [
          {
            type: 'profile_completion',
            title: 'Profile claim updated',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ];
      }

      if (tool === 'update_availability') {
        const completion = await applyAvailabilityUpdate(builder, {
          availableNow: typeof toolArgs.availableNow === 'boolean' ? toolArgs.availableNow : undefined,
          hoursPerWeek: typeof toolArgs.hoursPerWeek === 'number' ? toolArgs.hoursPerWeek : null,
          desiredCompensation: typeof toolArgs.desiredCompensation === 'string' ? toolArgs.desiredCompensation : null,
          remotePreference: typeof toolArgs.remotePreference === 'string' ? toolArgs.remotePreference : null,
        });
        uiBlocks = [
          {
            type: 'summary_card',
            title: 'Availability updated',
            body: `${builder.availability.availableNow ? 'Available' : 'Unavailable'} · ${builder.availability.hoursPerWeek || 0} hrs/week`,
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ];
      }

      if (tool === 'update_profile_basics') {
        const hasHeadline = typeof toolArgs.headline === 'string';
        const hasBio = typeof toolArgs.bio === 'string';
        
        if (hasHeadline || hasBio) {
          const completion = await applyProfileBasicsUpdate(builder, {
            headline: hasHeadline ? toolArgs.headline as string : undefined,
            bio: hasBio ? toolArgs.bio as string : undefined,
          });
          uiBlocks = [
            {
              type: 'summary_card',
              title: 'Profile basics updated',
              body: `Headline: ${builder.headline || 'missing'} · Bio: ${builder.bio ? 'added' : 'missing'}`,
            },
            {
              type: 'profile_completion',
              title: 'Profile strength',
              score: completion.score,
              missingItems: completion.missingItems,
              eligibility: completion.eligibility,
            },
          ];
        } else {
          // User asked to update, but didn't provide the content yet
          uiBlocks = [
            {
              type: 'summary_card',
              title: 'Update Profile Basics',
              body: `Current Headline: ${builder.headline || 'Not set'}\nCurrent Bio: ${builder.bio || 'Not set'}\n\nWhat would you like to change them to?`,
            },
          ];
        }
      }

      if (tool === 'read_profile_basics') {
        uiBlocks = [
          {
            type: 'summary_card',
            title: 'Your profile basics',
            body: `Headline: ${builder.headline || 'Not set'}\nBio: ${builder.bio || 'Not set'}`,
          },
        ];
      }

      if (tool === 'resume_uploaded') {
        const completion = await applyLinksUpdate(builder, { resume: typeof toolArgs.resume === 'string' ? toolArgs.resume : null });
        uiBlocks = [
          {
            type: 'summary_card',
            title: 'Resume Processed',
            body: `I've analyzed your resume and extracted your skills and projects.`,
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ];
      }

      if (tool === 'update_links') {
        console.log('[agent/actions] builder_chat:update_links:before', {
          builderId: String(builder._id),
          existing: builder.links,
          incoming: toolArgs,
        });
        const completion = await applyLinksUpdate(builder, {
          github: typeof toolArgs.github === 'string' ? toolArgs.github : null,
          linkedin: typeof toolArgs.linkedin === 'string' ? toolArgs.linkedin : null,
          resume: typeof toolArgs.resume === 'string' ? toolArgs.resume : null,
        });
        const refreshed = await BuilderProfile.findById(builder._id).select('links').lean() as any;
        console.log('[agent/actions] builder_chat:update_links:after', {
          builderId: String(builder._id),
          saved: refreshed?.links || null,
        });
        uiBlocks = [
          {
            type: 'summary_card',
            title: 'Links updated',
            body: `GitHub: ${refreshed?.links?.github || 'missing'} · LinkedIn: ${refreshed?.links?.linkedin || 'missing'} · Resume: ${refreshed?.links?.resume ? 'added' : 'missing'}`,
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ];
      }

      if (tool === 'update_role_skills') {
        const completion = await applyRoleSkillUpdate(builder, {
          roles: Array.isArray(toolArgs.roles) ? toolArgs.roles.filter(Boolean) : [],
          skills: Array.isArray(toolArgs.skills) ? toolArgs.skills.filter(Boolean) : [],
        });
        uiBlocks = [
          {
            type: 'summary_card',
            title: 'Roles and skills updated',
            body: `Roles: ${Array.isArray(toolArgs.roles) && toolArgs.roles.length ? toolArgs.roles.join(', ') : 'none'} · Skills: ${Array.isArray(toolArgs.skills) && toolArgs.skills.length ? toolArgs.skills.join(', ') : 'none'}`,
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ];
      }

      if (tool === 'update_work_preferences') {
        const completion = await applyWorkPreferencesUpdate(builder, {
          preferredWorkTypes: Array.isArray(toolArgs.preferredWorkTypes)
            ? toolArgs.preferredWorkTypes.filter(Boolean)
            : [],
          availableNow: typeof toolArgs.availableNow === 'boolean' ? toolArgs.availableNow : undefined,
        });
        uiBlocks = [
          {
            type: 'summary_card',
            title: 'Work preferences updated',
            body: `Preferred work types: ${Array.isArray(builder.preferredWorkType) && builder.preferredWorkType.length ? builder.preferredWorkType.join(', ') : 'none'}`,
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ];
      }

      if (tool === 'link_summary') {
        console.log('[agent/actions] builder_chat:link_summary', {
          builderId: String(builder._id),
          links: builder.links || null,
        });
        uiBlocks = [
          {
            type: 'summary_card',
            title: 'Your saved links',
            body: `GitHub: ${builder?.links?.github || 'missing'} · LinkedIn: ${builder?.links?.linkedin || 'missing'}`,
          },
        ];
      }

      if (tool === 'import_project') {
        const url = typeof toolArgs.url === 'string' ? toolArgs.url : null;
        console.log('[agent/actions] builder_chat:import_project:requested', {
          builderId: String(builder._id),
          url,
        });
        if (!url) {
          importProjectFailed = true;
          importProjectMessage = 'I need a valid Devpost or GitHub project URL before I can import it.';
          uiBlocks = [{
            type: 'summary_card',
            title: 'Import Project',
            body: 'Please provide a valid Devpost or GitHub URL to import your project.',
          }];
        } else {
          try {
            const project = await scrapeAndImportProject(url, builder._id);
            const completion = await updateBuilderScores(builder);
            importProjectMessage = `Imported "${project.projectName}" into your Proof of Work. Review the card and tell me what you personally built so I can strengthen the founder-facing contribution.`;
            uiBlocks = [
              {
                type: 'summary_card',
                title: `Project Imported: ${project.projectName}`,
                body: project.description || 'No description found.',
                items: [`Tech Stack: ${project.techStack?.join(', ') || 'None found'}`, `Source: ${project.source}`],
              },
              {
                type: 'profile_completion',
                title: 'Profile strength',
                score: completion.score,
                missingItems: completion.missingItems,
                eligibility: completion.eligibility,
              },
            ];
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            importProjectFailed = true;
            importProjectMessage = `I could not import that project yet: ${errorMessage}`;
            console.log('[agent/actions] builder_chat:import_project:failed', {
              builderId: String(builder._id),
              url,
              error: errorMessage,
            });
            uiBlocks = [{
              type: 'summary_card',
              title: 'Import Failed',
              body: `Failed to import project from URL. ${errorMessage}.`,
            }];
          }
        }
      }

      if (tool === 'list_projects') {
        const ownedProjects = await ProjectRecord.find({ builderId: builder._id }).sort({ updatedAt: -1 }).lean();
        projectCrudMessage = ownedProjects.length
          ? `You have ${ownedProjects.length} project${ownedProjects.length === 1 ? '' : 's'} in your Proof of Work.`
          : 'You do not have any projects yet. Send me a GitHub or Devpost link, or tell me the project name and description to add one manually.';
        uiBlocks = [
          {
            type: 'project_list',
            title: 'Your Proof of Work',
            body: ownedProjects.length ? 'Here are the projects saved to your builder profile.' : 'No projects saved yet.',
            items: ownedProjects.map((project: any) => `${project.projectName} · ${project.techStack?.slice(0, 4).join(', ') || 'tech stack missing'}`),
          },
        ];
      }

      if (tool === 'read_project') {
        const { project, projects: ownedProjects, needsProjectName } = await findBuilderProject(builder._id, toolArgs.projectName);
        if (needsProjectName) {
          projectCrudMessage = ownedProjects.length
            ? 'Which project should I show? Send the project name.'
            : 'You do not have any projects yet.';
          uiBlocks = [{
            type: 'project_list',
            title: 'Choose a project',
            body: ownedProjects.length ? 'I need the project name to show details.' : 'No projects saved yet.',
            items: ownedProjects.map((item: any) => item.projectName),
          }];
        } else if (!project) {
          projectCrudMessage = `I could not find a project named "${toolArgs.projectName || 'that'}" on your profile.`;
          uiBlocks = [{
            type: 'summary_card',
            title: 'Project not found',
            body: 'I can only read projects connected to your logged-in builder profile.',
          }];
        } else {
          projectCrudMessage = `Here are the details I have for "${project.projectName}".`;
          uiBlocks = [projectSummaryBlock(project)];
        }
      }

      if (tool === 'create_project') {
        const projectName = cleanNullableString(toolArgs.projectName ?? toolArgs.title ?? toolArgs.projectTitle);
        if (!projectName) {
          projectCrudMessage = 'I can create a project, but I need the project name first.';
          uiBlocks = [{
            type: 'summary_card',
            title: 'Project name needed',
            body: 'Try: Add project "DealFlow AI" with description "...", tech stack React, TypeScript, MongoDB.',
          }];
        } else {
          const updates = buildProjectUpdates({ ...toolArgs, newProjectName: projectName });
          const project = await ProjectRecord.create({
            builderId: builder._id,
            projectName,
            description: cleanNullableString(toolArgs.description) || null,
            problemSolved: cleanNullableString(toolArgs.problemSolved) || null,
            techStack: Array.isArray(updates.techStack) ? updates.techStack : [],
            builderContribution: cleanNullableString(toolArgs.builderContribution ?? toolArgs.contribution) || null,
            contributionTags: Array.isArray(updates.contributionTags) ? updates.contributionTags : [],
            links: {
              github: cleanNullableString(toolArgs.githubUrl ?? toolArgs.github) || null,
              demo: cleanNullableString(toolArgs.demoUrl ?? toolArgs.demo) || null,
              devpost: cleanNullableString(toolArgs.devpostUrl ?? toolArgs.devpost) || null,
              screenshots: cleanNullableString(toolArgs.imageUrl ?? toolArgs.screenshotUrl ?? toolArgs.screenshots) || null,
            },
            source: 'manual_agent',
            sourceId: `manual_agent:${builder._id}:${Date.now()}`,
            verificationStatus: 'builder_confirmed',
            status: typeof updates.status === 'string' ? updates.status : 'unknown',
          });
          const completion = await updateBuilderScores(builder);
          projectCrudMessage = `Created "${project.projectName}" and added it to your Proof of Work.`;
          uiBlocks = [
            projectSummaryBlock(project, 'project_created'),
            {
              type: 'profile_completion',
              title: 'Profile strength',
              score: completion.score,
              missingItems: completion.missingItems,
              eligibility: completion.eligibility,
            },
          ];
        }
      }

      if (tool === 'update_project') {
        const { project, projects: ownedProjects, needsProjectName } = await findBuilderProject(builder._id, toolArgs.projectName);
        const updates = buildProjectUpdates(toolArgs);
        if (needsProjectName) {
          projectCrudMessage = ownedProjects.length
            ? 'Which project should I update? Send the project name plus the field you want changed.'
            : 'You do not have any projects yet.';
          uiBlocks = [{
            type: 'project_list',
            title: 'Choose a project to update',
            body: 'Project updates are scoped to your saved Proof of Work.',
            items: ownedProjects.map((item: any) => item.projectName),
          }];
        } else if (!project) {
          projectCrudMessage = `I could not find a project named "${toolArgs.projectName || 'that'}" on your profile.`;
          uiBlocks = [{
            type: 'summary_card',
            title: 'Project not found',
            body: 'I can update title, description, tech stack, links, status, and your contribution once you give me a saved project name.',
          }];
        } else if (Object.keys(updates).length === 0) {
          projectCrudMessage = `I found "${project.projectName}", but I need a field to update.`;
          uiBlocks = [{
            type: 'summary_card',
            title: 'Update details needed',
            body: 'I can update description, tech stack, GitHub/demo/Devpost links, status, project title, problem solved, and your contribution.',
          }];
        } else {
          const updatedProject = await ProjectRecord.findOneAndUpdate(
            { _id: project._id, builderId: builder._id },
            { $set: updates },
            { new: true }
          );
          await updateBuilderScores(builder);
          projectCrudMessage = `Updated "${updatedProject.projectName}" successfully.`;
          uiBlocks = [projectSummaryBlock(updatedProject, 'project_updated')];
        }
      }

      if (tool === 'delete_project') {
        const { project, projects: ownedProjects, needsProjectName } = await findBuilderProject(builder._id, toolArgs.projectName);
        const confirmDelete = toolArgs.confirmDelete === true;
        if (needsProjectName) {
          projectCrudMessage = ownedProjects.length
            ? 'Which project should I delete? Send the exact project name.'
            : 'You do not have any projects to delete.';
          uiBlocks = [{
            type: 'project_list',
            title: 'Choose a project to delete',
            body: 'I need an exact project name before starting delete confirmation.',
            items: ownedProjects.map((item: any) => item.projectName),
          }];
        } else if (!project) {
          projectCrudMessage = `I could not find a project named "${toolArgs.projectName || 'that'}" on your profile.`;
          uiBlocks = [{
            type: 'summary_card',
            title: 'Project not found',
            body: 'No project was deleted.',
          }];
        } else if (!confirmDelete) {
          projectCrudMessage = `I found "${project.projectName}". To delete it, reply: confirm delete ${project.projectName}`;
          uiBlocks = [{
            type: 'delete_confirmation',
            title: `Confirm delete: ${project.projectName}`,
            body: 'This will remove the project from your Proof of Work. Reply with the exact confirmation phrase to continue.',
            items: [`confirm delete ${project.projectName}`],
          }];
        } else {
          await ProjectRecord.deleteOne({ _id: project._id, builderId: builder._id });
          await updateBuilderScores(builder);
          projectCrudMessage = `Deleted "${project.projectName}" from your Proof of Work.`;
          uiBlocks = [{
            type: 'summary_card',
            title: 'Project deleted',
            body: `${project.projectName} was removed from your builder profile.`,
          }];
        }
      }

      if (tool === 'profile_summary') {
        const completion = computeBuilderScores(builder, projects);
        const strongestEvidence = getStrongestEvidence(builder, projects);
        const nextSteps = buildNextSteps(builder, completion, projectCount);
        uiBlocks = [
          {
            type: 'profile_snapshot',
            title: `${builder.name || 'Builder'} profile snapshot`,
            sections: {
              identity: {
                name: builder.name || 'missing',
                email: builder.email || 'missing',
                location: builder.location || 'missing',
                verificationStatus: builder.verificationStatus || 'imported_unverified',
              },
              availability: {
                availableNow: Boolean(builder.availability?.availableNow),
                hoursPerWeek: builder.availability?.hoursPerWeek || 0,
                remotePreference: builder.availability?.remotePreference || 'unspecified',
                readiness: builder.availability?.availableNow ? 'ready_now' : 'not_ready',
              },
              topSkills: (builder.rolePreference || []).slice(0, 8),
              strongestEvidence,
              projects: {
                count: projectCount,
                strongestProof: strongestEvidence.label,
              },
              profileStrength: {
                completionScore: completion.score,
                eligibility: completion.eligibility,
              },
              missingItems: completion.missingItems || [],
              immediateNextActions: nextSteps,
            },
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ];
      }

      if (tool === 'recommend_next_steps') {
        const completion = computeBuilderScores(builder, projects);
        const steps = buildNextSteps(builder, completion, projectCount);
        uiBlocks = [
          {
            type: 'next_steps',
            title: 'Highest-impact next steps',
            items: steps,
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ];
      }

      if (tool === 'suggest_evidence_improvements') {
        const strongestEvidence = getStrongestEvidence(builder, projects);
        const suggestions = [
          projectCount < 2
            ? 'Add at least one more shipped project with demo + repo + your exact contribution.'
            : 'For each top project, add one clear founder-facing outcome (users, conversion, launch, speed).',
          !builder?.links?.github
            ? 'Link your GitHub profile and pin 2 repos relevant to the roles you want.'
            : 'Tag 2 strongest repositories and make README outcomes explicit.',
          'For each major skill, attach one proof link (project/demo/repo) so founders can validate quickly.',
        ];

        uiBlocks = [
          {
            type: 'evidence_improvements',
            title: 'Proof-of-work improvements for founder trust',
            strongestEvidence,
            items: suggestions,
          },
        ];
      }

      if (tool === 'evaluate_profile_quality') {
        const events = await EventRecord.find({ builderId: builder._id }).lean();
        const momentum = await MomentumUpdate.find({ builderId: builder._id }).lean();
        const quality = await evaluateBuilderProfileQuality(builder, projects, events, momentum);
        
        builder.profileQuality = quality;
        builder.profileQuality.evaluatedAt = new Date();
        await builder.save();

        const hasHistory = Array.isArray(payload?.history) && payload.history.length > 0;

        if (!hasHistory) {
          uiBlocks = [
            {
              type: 'summary_card',
              title: 'Profile Quality Evaluated',
              body: quality.oneLineSummary,
            }
          ];
          
          if (quality.issues?.length > 0) {
            uiBlocks.push({
              type: 'issues_list',
              title: 'Needs Improvement',
              items: quality.issues.map(i => `${i.title}: ${i.detail}`)
            });
          }
          
          if (quality.suggestedFixes?.length > 0) {
            uiBlocks.push({
              type: 'suggested_fixes',
              title: 'Suggested Fixes',
              items: quality.suggestedFixes.map(f => f.action)
            });
          }
        }
      }

      const completion = computeBuilderScores(builder, projects);
      const nextQuestion = getNextQuestion(builder, projectCount);
      const deterministicReply =
        tool === 'claim_profile'
          ? `Done — your profile is now claimed and set to builder_confirmed. Profile strength is ${completion.score}%. ${nextQuestion}`
          : tool === 'update_availability'
            ? `Updated your availability. You are ${builder.availability?.availableNow ? 'available' : 'not available'} with ${builder.availability?.hoursPerWeek || 0} hrs/week. ${nextQuestion}`
            : tool === 'update_links'
              ? `Saved. I updated your profile links. ${nextQuestion}`
              : tool === 'update_work_preferences'
                ? `Got it — I updated your work preferences. ${nextQuestion}`
              : tool === 'update_role_skills'
                ? `Perfect — I added those roles and skills to your profile. ${nextQuestion}`
              : tool === 'update_profile_basics'
                ? (typeof toolArgs.headline === 'string' || typeof toolArgs.bio === 'string' ? `I've updated your profile basics. ${nextQuestion}` : `What would you like to change your headline or bio to?`)
              : tool === 'read_profile_basics'
                ? `Here is what I have for your profile basics.`
              : tool === 'link_summary'
                ? `Here are your saved links from your profile.`
            : tool === 'profile_summary'
              ? `Here’s everything I currently know about your profile, including missing fields and top next actions.`
              : tool === 'recommend_next_steps'
                ? `I mapped the highest-impact steps to improve your founder match quality. Start with step 1 today.`
                : tool === 'suggest_evidence_improvements'
                  ? `I listed evidence upgrades that directly improve founder trust and shortlist outcomes.`
                  : tool === 'evaluate_profile_quality'
                    ? `I've evaluated your profile quality. Check the suggestions to improve your founder clarity.`
                  : tool === 'resume_uploaded'
                    ? `I've processed your resume and updated your profile with the extracted skills and projects. Let me know if you want to review or edit anything.`
                  : tool === 'import_project'
                    ? (importProjectMessage || `I could not import that project yet. Please try a valid Devpost or GitHub project URL.`)
                    : tool === 'create_project' || tool === 'list_projects' || tool === 'read_project' || tool === 'update_project' || tool === 'delete_project'
                      ? (projectCrudMessage || 'I handled that project request.')
                    : `I can do this from your login: claim profile, update availability, summarize your profile, suggest next steps, or improve proof-of-work evidence.`;

      const deterministicOnlyTools = new Set(['import_project', 'create_project', 'list_projects', 'read_project', 'update_project', 'delete_project', 'read_profile_basics', 'resume_uploaded']);
      const freshBuilder = await reloadBuilderForAgent(builder._id);
      const agentContext = freshBuilder ? await buildBuilderAgentContext(freshBuilder) : {};
      const message = deterministicOnlyTools.has(tool)
        ? deterministicReply
        : await getAgentMessage({
            fallback: deterministicReply,
            intent: 'builder_chat_response',
            context: {
              userText,
              tool,
              toolArgs,
              extractedLinks,
              extractedRoleSkills,
              ...agentContext,
            },
            history: chatHistory,
          });
      console.log('[agent/actions] builder_chat:final', {
        builderId: String(builder._id),
        tool,
        importProjectFailed,
        uiBlocks: uiBlocks.map((block) => block.type),
      });

      const profileForClient = freshBuilder
        ? {
            _id: String(freshBuilder._id),
            name: freshBuilder.name,
            email: freshBuilder.email,
            headline: freshBuilder.headline,
            bio: freshBuilder.bio,
            links: freshBuilder.links,
            availability: freshBuilder.availability,
            rolePreference: freshBuilder.rolePreference,
            preferredWorkType: freshBuilder.preferredWorkType,
            profileCompletion: computeBuilderScores(freshBuilder, projects),
            profileQuality: freshBuilder.profileQuality,
          }
        : null;

      return ok({
        message,
        uiBlocks,
        builder: profileForClient,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
      });
    }

    if (action === 'create_role_brief') {
      const { founderName, founderEmail, company, startupSummary, roleTitle, roleType, skillsNeeded, budget, timeline, workType, successIn30Days } = payload;
      if (!company || !roleTitle) return bad('company and roleTitle are required');

      const opportunity = await Opportunity.create({
        founderName,
        founderEmail,
        company,
        startupSummary,
        roleTitle,
        roleType: Array.isArray(roleType) ? roleType : roleType ? [roleType] : [],
        skillsNeeded: Array.isArray(skillsNeeded) ? skillsNeeded : skillsNeeded ? [skillsNeeded] : [],
        budget,
        timeline,
        workType,
        successIn30Days,
        status: 'matching',
      });
      const message = await getAgentMessage({
        fallback: 'Role brief created',
        intent: 'create_role_brief_success',
        context: { company: opportunity.company, roleTitle: opportunity.roleTitle, skillsNeeded: opportunity.skillsNeeded },
      });

      return ok({
        message,
        opportunity,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'role_brief',
            title: `${opportunity.roleTitle} @ ${opportunity.company}`,
            body: opportunity.startupSummary,
            meta: {
              timeline: opportunity.timeline,
              budget: opportunity.budget,
              workType: opportunity.workType,
            },
          },
        ],
      });
    }

    if (action === 'run_candidate_search') {
      const { opportunityId } = payload;
      if (!opportunityId) return bad('opportunityId is required');
      if (!mongoose.Types.ObjectId.isValid(opportunityId)) {
        const message = await getAgentMessage({
          fallback: 'Please paste a valid opportunity ID from the role-brief response before running search.',
          intent: 'run_candidate_search_invalid_id',
          context: { opportunityId },
        });
        return ok({
          message,
          uiBlocks: [
            {
              type: 'summary_card',
              title: 'Need Opportunity ID',
              body: 'Create role brief first, then paste the returned opportunity ID.',
            },
          ],
        });
      }

      const opportunity = await Opportunity.findById(opportunityId).lean() as any;
      if (!opportunity) return bad('Opportunity not found', 404);

      const builders = await BuilderProfile.find({
        'availability.availableNow': true,
        verificationStatus: { $in: ['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified'] },
      })
        .limit(120)
        .lean();

      const requiredSkills = Array.isArray(opportunity.skillsNeeded) ? opportunity.skillsNeeded : [];

      const ranked: any[] = [];
      for (const builder of builders) {
        const projects = await ProjectRecord.find({ builderId: builder._id }).select('projectName techStack links').lean();
        const flattenedSkills = projects.flatMap((project) => project.techStack || []);
        const ratio = getSkillSignals({ ...builder, _projectSkills: flattenedSkills }, requiredSkills);
        const availabilityFactor = Math.min(((builder.availability?.hoursPerWeek || 0) / 20), 1);
        const proofFactor = Math.min(projects.length / 3, 1);

        const score = Math.round((ratio * 0.5 + availabilityFactor * 0.2 + proofFactor * 0.3) * 100);

        const signalScore = (value: number) => (value >= 0.75 ? 'high' : value >= 0.45 ? 'medium' : 'low');

        ranked.push({
          builder,
          projects,
          score,
          signals: {
            skillMatch: signalScore(ratio),
            proofOfWork: signalScore(proofFactor),
            reliability: 'medium',
            startupReadiness: projects.length > 1 ? 'high' : 'medium',
            availability: signalScore(availabilityFactor),
            collaboration: 'medium',
          },
        });
      }

      ranked.sort((a, b) => b.score - a.score);
      const shortlist = ranked.slice(0, 5);

      for (const entry of shortlist) {
        await MatchRecord.findOneAndUpdate(
          { builderId: entry.builder._id, opportunityId },
          {
            $set: {
              builderId: entry.builder._id,
              opportunityId,
              matchScore: entry.score,
              signalScores: entry.signals,
              reasoning: `Strong fit based on proof-of-work and skills overlap for ${opportunity.roleTitle}.`,
              evidence: entry.projects.slice(0, 3).map((project: any) => ({ label: project.projectName, url: project.links?.devpost || project.links?.github || '' })),
              riskFlags: [
                ...(entry.projects.length === 0 ? ['No confirmed shipped project yet'] : []),
                ...((entry.builder.availability?.hoursPerWeek || 0) < 10 ? ['Limited weekly bandwidth'] : []),
              ],
              status: 'generated',
            },
          },
          { upsert: true, new: true }
        );
      }

      const message = await getAgentMessage({
        fallback: 'Candidate search completed',
        intent: 'run_candidate_search_success',
        context: {
          roleTitle: opportunity.roleTitle,
          company: opportunity.company,
          shortlistedCount: shortlist.length,
          topCandidate: shortlist[0]?.builder?.name || null,
        },
      });

      return ok({
        message,
        shortlist: shortlist.map((entry) => ({
          builderId: entry.builder._id,
          name: entry.builder.name,
          location: entry.builder.location,
          matchScore: entry.score,
          availability: entry.builder.availability,
          signals: entry.signals,
          proof: entry.projects.slice(0, 3).map((project: any) => ({
            name: project.projectName,
            devpost: project.links?.devpost,
            github: project.links?.github,
          })),
        })),
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: shortlist.map((entry) => ({
          type: 'candidate_card',
          title: `${entry.builder.name} — ${entry.score}% match`,
          subtitle: `${entry.builder.location || 'Remote'} · ${entry.builder.availability?.hoursPerWeek || 0} hrs/week`,
          riskFlags: entry.projects.length ? [] : ['No confirmed project history yet'],
        })),
      });
    }

    if (action === 'evaluate_profile_quality') {
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
      const events = await EventRecord.find({ builderId: builder._id }).lean();
      const momentum = await MomentumUpdate.find({ builderId: builder._id }).lean();

      const quality = await evaluateBuilderProfileQuality(builder, projects, events, momentum);
      builder.profileQuality = quality;
      builder.profileQuality.evaluatedAt = new Date();
      await builder.save();

      return ok({
        message: 'Profile quality evaluated.',
        builder,
        profileQuality: quality
      });
    }

    if (action === 'get_founder_dashboard') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunities = await Opportunity.find({ founderEmail: email })
        .sort({ updatedAt: -1 })
        .lean();

      const opportunityIds = opportunities.map((o: any) => o._id);
      const shortlistDocs = await Shortlist.find({ opportunityId: { $in: opportunityIds } }).lean();
      const oppById = new Map(opportunities.map((o: any) => [String(o._id), o]));

      const shortlists = await Promise.all(
        shortlistDocs.map(async (sl: any) => {
          const pub = toPublicShortlist(sl);
          if (!pub) return null;
          if (sl.unlocked) {
            const opportunity = oppById.get(String(sl.opportunityId));
            const fullCandidates = await buildFullCandidatesForShortlist(sl, opportunity, {
              BuilderProfile,
              ProjectRecord,
              MatchRecord,
            });
            return { ...pub, fullCandidates: fullCandidates.filter((c: any) => !c.hidden) };
          }
          return { ...pub, fullCandidates: null };
        })
      );

      const shortlistByOpp = new Map(
        shortlists.filter(Boolean).map((s: any) => [String(s.opportunityId), s])
      );

      const opportunitiesWithSearch = opportunities.map((opp: any) => {
        const sl = shortlistByOpp.get(String(opp._id));
        return {
          ...opp,
          searchStats: sl
            ? {
                totalMatches: sl.totalMatches,
                strongMatchCount: sl.strongMatchCount,
                previewGenerated: Boolean(sl.previewGeneratedAt),
                locked: !sl.unlocked,
              }
            : null,
        };
      });

      const pipeline = await buildFounderPipeline(email, {
        Opportunity,
        Shortlist,
        MatchRecord,
        BuilderProfile,
        IntroRequest,
        CallSchedule,
      });

      const [notifications, unreadCount] = await Promise.all([
        getNotificationsForFounder(email),
        countUnreadForFounder(email),
      ]);

      return ok({
        opportunities: opportunitiesWithSearch,
        shortlists: shortlists.filter(Boolean),
        pipeline,
        notifications,
        unreadNotificationCount: unreadCount,
      });
    }

    if (action === 'suggest_intro_message') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email, founderName } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist?.unlocked) return bad('Unlock the shortlist before requesting intros.', 403);

      const [opportunity, builder, match] = await Promise.all([
        Opportunity.findOne({ _id: opportunityId, founderEmail: email }).lean(),
        BuilderProfile.findById(builderId).lean(),
        MatchRecord.findOne({ opportunityId, builderId }).lean(),
      ]);
      if (!opportunity || !builder) return bad('Candidate or search not found', 404);

      const projects = await ProjectRecord.find({ builderId })
        .select('projectName techStack builderContribution')
        .limit(3)
        .lean();
      const topProject = projects[0];
      const shortlistCandidate = (shortlist.candidates || []).find(
        (c: any) => String(c.builderId) === builderId
      );
      const topSkills =
        shortlistCandidate?.topSkills?.length > 0
          ? shortlistCandidate.topSkills
          : (topProject?.techStack || []).slice(0, 3);

      const suggestedMessage = buildSuggestedIntroMessage({
        founderName,
        builderName: builder.name,
        opportunity,
        matchReasoning: match?.reasoning,
        topSkills,
        projectHighlight: topProject?.projectName || null,
      });

      return ok({ suggestedMessage });
    }

    if (action === 'request_intro') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email, founderName } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const introMessage = String(payload?.introMessage || '').trim();

      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      if (!introMessage || introMessage.length < 20) {
        return bad('Please provide an intro message (at least 20 characters).');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist) return bad('Shortlist not found', 404);
      if (!shortlist.unlocked) return bad('Unlock the shortlist before requesting intros.', 403);

      const onShortlist = (shortlist.candidates || []).some(
        (c: any) => String(c.builderId) === builderId
      );
      if (!onShortlist) return bad('Candidate is not on this shortlist', 404);

      const match = await MatchRecord.findOne({ opportunityId, builderId });
      if (!match) return bad('Match not found', 404);

      const intro = await IntroRequest.findOneAndUpdate(
        { opportunityId, builderId },
        {
          $set: {
            opportunityId,
            builderId,
            matchRecordId: match._id,
            founderEmail: email,
            founderName,
            introMessage,
            status: 'requested',
          },
        },
        { upsert: true, new: true }
      );

      match.status = 'intro_requested';
      match.pipelineNextStep = 'Awaiting builder response';
      await match.save();

      const [builderDoc, opportunityDoc] = await Promise.all([
        BuilderProfile.findById(builderId).select('email name').lean(),
        Opportunity.findById(opportunityId).lean(),
      ]);

      if (builderDoc?.email) {
        await notifyBuilderIntroReceived({
          builderId,
          builderEmail: builderDoc.email,
          founderName: founderName || email.split('@')[0],
          roleTitle: opportunityDoc?.roleTitle || 'Role',
          company: opportunityDoc?.company || 'Startup',
          introRequestId: String(intro._id),
        });
      }

      await seedThreadFromIntro(intro);

      return ok({
        message: 'Intro request sent. The candidate will appear in your pipeline.',
        introRequest: {
          _id: String(intro._id),
          status: intro.status,
          introMessage: intro.introMessage,
        },
        matchStatus: match.status,
      });
    }

    if (action === 'update_candidate_status') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const pipelineStatus = String(payload?.status || payload?.pipelineStatus || '').trim();

      if (!opportunityId || !builderId || !pipelineStatus) {
        return bad('opportunityId, builderId, and status are required');
      }

      const matchStatus = PIPELINE_TO_MATCH_STATUS[pipelineStatus as keyof typeof PIPELINE_TO_MATCH_STATUS];
      if (!matchStatus) return bad('Invalid pipeline status');

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist?.unlocked) return bad('Unlock the shortlist first.', 403);

      const match = await MatchRecord.findOne({ opportunityId, builderId });
      if (!match) return bad('Match not found', 404);

      match.status = matchStatus;
      match.pipelineNextStep = null;
      await match.save();

      return ok({
        message: `Status updated to ${pipelineStatusLabel(pipelineStatus as any)}.`,
        matchStatus: match.status,
        pipelineStatus,
      });
    }

    if (action === 'unlock_shortlist') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || payload?.searchId || '').trim();
      if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
        return bad('A valid opportunityId is required');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist) return bad('Shortlist not found. Run a builder search first.', 404);

      if (!shortlist.previewGeneratedAt) {
        return bad('Generate a preview search before unlocking.', 400);
      }

      shortlist.unlocked = true;
      shortlist.unlockedAt = new Date();
      await shortlist.save();

      const opportunity = await Opportunity.findById(opportunityId).lean();
      const fullCandidates = await buildFullCandidatesForShortlist(shortlist, opportunity, {
        BuilderProfile,
        ProjectRecord,
        MatchRecord,
      });

      const opportunityDoc = await Opportunity.findById(opportunityId);
      if (opportunityDoc && opportunityDoc.status === 'preview') {
        opportunityDoc.status = 'shortlisted';
        await opportunityDoc.save();
      }

      const pub = toPublicShortlist(shortlist);

      return ok({
        message: 'Shortlist unlocked. You can now view full candidate profiles and request intros.',
        shortlist: { ...pub, fullCandidates },
        meta: { unlockMode: 'dev' },
      });
    }

    if (action === 'generate_trial_project') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(
        payload?.opportunityId || payload?.searchId || ''
      ).trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) {
        return bad('opportunityId (or searchId) and builderId are required');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist?.unlocked) {
        return bad('Unlock the shortlist before generating a trial project.', 403);
      }

      const [opportunity, builder, match] = await Promise.all([
        Opportunity.findOne({ _id: opportunityId, founderEmail: email }).lean(),
        BuilderProfile.findById(builderId).lean(),
        MatchRecord.findOne({ opportunityId, builderId }),
      ]);
      if (!opportunity || !builder) return bad('Search or candidate not found', 404);
      if (!match) return bad('Match not found', 404);

      // RESTORE BEFORE GIT PUSH — intro call required before trial generation
      // if (!match.callCompletedAt) {
      //   return bad('Complete the intro call before generating a trial project.', 400);
      // }

      const existingStatus = match.trialProject?.status;
      if (existingStatus && !['draft', 'rejected'].includes(existingStatus)) {
        return bad('A trial has already been sent for this builder.', 400);
      }

      const projects = await ProjectRecord.find({ builderId })
        .select('projectName techStack builderContribution description')
        .limit(5)
        .lean();

      const shortlistCandidate = (shortlist.candidates || []).find(
        (c: any) => String(c.builderId) === builderId
      );
      const topSkills =
        shortlistCandidate?.topSkills?.length > 0
          ? shortlistCandidate.topSkills
          : [
              ...(builder.rolePreference || []),
              ...projects.flatMap((p: any) => p.techStack || []).slice(0, 4),
            ].slice(0, 8);

      const { trialProject, source } = await generateTrialProject({
        opportunity,
        builderName: builder.name,
        topSkills,
        projects,
        matchReasoning: match.reasoning,
      });

      match.trialProject = { ...trialProject, status: 'draft', updatedAt: new Date() };
      await match.save();

      return ok({
        message: 'Trial project draft generated.',
        trialProject,
        source,
        matchStatus: match.status,
      });
    }

    if (action === 'save_trial_project') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || payload?.searchId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const draft = payload?.trialProject || payload?.draft;

      if (!opportunityId || !builderId) {
        return bad('opportunityId and builderId are required');
      }

      const normalized = normalizeTrialProject(draft);
      if (!normalized) {
        return bad('Invalid trial project — title, deliverables, and success criteria are required.');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist?.unlocked) return bad('Unlock the shortlist first.', 403);

      const match = await MatchRecord.findOne({ opportunityId, builderId });
      if (!match) return bad('Match not found', 404);

      match.trialProject = { ...normalized, status: match.trialProject?.status || 'draft', updatedAt: new Date() };
      await match.save();

      return ok({
        message: 'Trial project draft saved.',
        trialProject: { ...normalized, updatedAt: match.trialProject.updatedAt },
      });
    }

    if (action === 'founder_candidate_action') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const candidateAction = String(payload?.candidateAction || '').trim();

      if (!opportunityId || !builderId || !candidateAction) {
        return bad('opportunityId, builderId, and candidateAction are required');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist) return bad('Shortlist not found', 404);
      if (!shortlist.unlocked) return bad('Unlock the shortlist first.', 403);

      const match = await MatchRecord.findOne({ opportunityId, builderId });
      if (!match) return bad('Match not found', 404);

      if (candidateAction === 'request_intro') {
        return bad('Use suggest_intro_message and request_intro with an intro message.');
      }

      if (candidateAction === 'save') {
        match.status = 'approved';
        await match.save();
        return ok({ message: 'Candidate saved to your shortlist.', matchStatus: match.status, saved: true });
      }

      if (candidateAction === 'hide') {
        const hidden = new Set((shortlist.hiddenBuilderIds || []).map(String));
        hidden.add(builderId);
        shortlist.hiddenBuilderIds = Array.from(hidden);
        await shortlist.save();
        return ok({ message: 'Candidate hidden from this shortlist.', hidden: true });
      }

      return bad('Unknown candidateAction');
    }

    if (action === 'run_builder_search' || action === 'rerun_search') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || payload?.searchId || '').trim();
      if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
        return bad('A valid opportunityId is required');
      }

      const opportunity = await Opportunity.findOne({ _id: opportunityId, founderEmail: email });
      if (!opportunity) return bad('Search not found', 404);

      const oppPlain =
        typeof opportunity.toObject === 'function' ? opportunity.toObject() : opportunity;

      if (!canRunPreviewAnyway(oppPlain)) {
        return bad(
          'Add at least a role title, what they will build, and required skills before running preview.'
        );
      }

      const isRerun = action === 'rerun_search';
      const existingShortlist = await Shortlist.findOne({ opportunityId, founderEmail: email }).lean();
      const wasUnlocked = isRerun && Boolean(existingShortlist?.unlocked);

      const builders = await BuilderProfile.find({
        verificationStatus: {
          $in: ['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified'],
        },
        visibilityStatus: { $ne: 'hidden' },
      })
        .limit(200)
        .lean();

      const builderIds = builders.map((b: any) => b._id);
      const allProjects = await ProjectRecord.find({ builderId: { $in: builderIds } })
        .select(
          'builderId projectName description problemSolved techStack builderContribution contributionTags verificationStatus links'
        )
        .lean();

      const projectsByBuilder = new Map<string, any[]>();
      for (const project of allProjects) {
        const key = String(project.builderId);
        if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
        projectsByBuilder.get(key)!.push(project);
      }

      const ranked = rankBuildersForOpportunity(builders, projectsByBuilder, oppPlain, 12);
      const previewCount = wasUnlocked ? ranked.length : 6;
      const previewCandidates = toAnonymousCandidates(ranked, previewCount);
      const strongMatchCount = ranked.filter((r) => r.matchLabel === 'Strong Match').length;

      const candidatesWithMatchIds: any[] = [];
      for (const anon of previewCandidates) {
        const entry = ranked.find((r) => r.builderId === anon.builderId);
        if (!entry) continue;

        const existingMatch = await MatchRecord.findOne({
          builderId: entry.builderId,
          opportunityId,
        }).lean();

        const matchUpdate: Record<string, unknown> = {
          builderId: entry.builderId,
          opportunityId,
          matchScore: entry.matchScore,
          matchLabel: entry.matchLabel,
          anonymousLabel: anon.anonymousLabel,
          signalScores: entry.signals,
          reasoning: entry.whyTheyMatch,
          evidence: [],
          riskFlags: entry.projects.length === 0 ? ['Limited verified proof'] : [],
        };
        if (!existingMatch || existingMatch.status === 'generated') {
          matchUpdate.status = 'generated';
        }

        const match = await MatchRecord.findOneAndUpdate(
          { builderId: entry.builderId, opportunityId },
          { $set: matchUpdate },
          { upsert: true, new: true }
        );

        candidatesWithMatchIds.push({
          ...anon,
          matchRecordId: match._id,
          builderId: entry.builderId,
        });
      }

      // Keep in-pipeline builders on the board even if they fall out of the new top ranks
      const seenBuilderIds = new Set(candidatesWithMatchIds.map((c) => String(c.builderId)));
      if (isRerun && existingShortlist?.candidates?.length) {
        const pipelineMatches = await MatchRecord.find({
          opportunityId,
          status: { $nin: ['generated', 'closed', 'rejected'] },
        }).lean();

        for (const pipelineMatch of pipelineMatches) {
          const builderId = String(pipelineMatch.builderId);
          if (seenBuilderIds.has(builderId)) continue;
          const prior = (existingShortlist.candidates as any[]).find(
            (c) => String(c.builderId) === builderId
          );
          if (!prior) continue;
          candidatesWithMatchIds.push({
            ...prior,
            matchRecordId: pipelineMatch._id,
            builderId: pipelineMatch.builderId,
          });
          seenBuilderIds.add(builderId);
        }
      }

      const shortlistFields: Record<string, unknown> = {
        opportunityId,
        founderEmail: email,
        totalMatches: ranked.length,
        strongMatchCount,
        candidates: candidatesWithMatchIds,
        previewGeneratedAt: new Date(),
      };

      if (wasUnlocked) {
        shortlistFields.unlocked = true;
        shortlistFields.unlockedAt = existingShortlist?.unlockedAt || new Date();
      } else if (!isRerun) {
        shortlistFields.unlocked = false;
      } else {
        shortlistFields.unlocked = false;
      }

      const shortlist = await Shortlist.findOneAndUpdate(
        { opportunityId },
        { $set: shortlistFields },
        { upsert: true, new: true }
      );

      opportunity.status = wasUnlocked ? 'shortlisted' : 'preview';
      await opportunity.save();

      const publicShortlist = toPublicShortlist(shortlist);
      let fullCandidates: Awaited<ReturnType<typeof buildFullCandidatesForShortlist>> | null = null;
      if (wasUnlocked) {
        fullCandidates = await buildFullCandidatesForShortlist(shortlist, oppPlain, {
          BuilderProfile,
          ProjectRecord,
          MatchRecord,
        });
      }
      const previewExplanation = buildPreviewExplanation(oppPlain, ranked.length, strongMatchCount);
      const uiBlocks: any[] = [
        buildTalentPreviewUiBlock(shortlist, oppPlain),
        ...(previewExplanation
          ? [
              {
                type: 'preview_explanation',
                title: 'Why 0 strong matches?',
                body: previewExplanation,
              },
            ]
          : []),
        ...previewCandidates.map((c) => ({
          type: 'anonymous_candidate',
          title: `${c.anonymousLabel} · ${c.matchLabel}`,
          subtitle: c.roleType,
          body: c.whyTheyMatch,
          items: c.topSkills,
          meta: {
            proofSummary: c.proofSummary,
            availabilitySummary: c.availabilitySummary,
            matchScore: c.matchScore,
            matchLabel: c.matchLabel,
            locked: true,
          },
        })),
      ];

      const previewMsg = wasUnlocked
        ? `Search refreshed for ${oppPlain.roleTitle}. ${candidatesWithMatchIds.length} builder${candidatesWithMatchIds.length === 1 ? '' : 's'} on your board (${strongMatchCount} strong).`
        : strongMatchCount === 0 && ranked.length > 0
          ? `Preview ready for ${oppPlain.roleTitle}: ${ranked.length} potential match${ranked.length === 1 ? '' : 'es'}, 0 strong matches. See why on the right — you can still unlock to review.`
          : `Preview generated for ${oppPlain.roleTitle}. ${ranked.length} potential matches (${strongMatchCount} strong). Unlock the shortlist to see full profiles.`;

      return ok({
        message: previewMsg,
        opportunity: oppPlain,
        shortlist: fullCandidates
          ? { ...publicShortlist, fullCandidates: fullCandidates.filter((c: any) => !c.hidden) }
          : publicShortlist,
        searchStats: {
          totalMatches: ranked.length,
          strongMatchCount,
          previewGenerated: true,
          locked: !wasUnlocked,
        },
        uiBlocks,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
      });
    }

    if (action === 'update_role_brief') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
        return bad('A valid opportunityId is required');
      }

      const opportunity = await Opportunity.findOne({ _id: opportunityId, founderEmail: email });
      if (!opportunity) return bad('Search not found', 404);

      const fields = payload?.fields && typeof payload.fields === 'object' ? payload.fields : payload;
      const allowed = [
        'company',
        'startupSummary',
        'industry',
        'roleTitle',
        'roleType',
        'skillsNeeded',
        'niceToHaveSkills',
        'workType',
        'timeline',
        'budget',
        'locationPreference',
        'availabilityNeeded',
        'builderWillDo',
        'successIn30Days',
        'seniority',
        'hoursPerWeek',
        'deliverables',
        'fundingStage',
      ] as const;

      for (const key of allowed) {
        const val = fields[key];
        if (val === undefined) continue;
        if (key === 'roleType' || key === 'skillsNeeded' || key === 'niceToHaveSkills' || key === 'deliverables') {
          opportunity[key] = Array.isArray(val)
            ? val.map(String).filter(Boolean)
            : typeof val === 'string'
              ? val.split(',').map((s: string) => s.trim()).filter(Boolean)
              : [];
        } else if (typeof val === 'string') {
          opportunity[key] = val.trim() || null;
          if (key === 'locationPreference' && val.trim()) {
            opportunity.availabilityNeeded = val.trim();
          }
        }
      }

      await opportunity.save();
      const oppPlain = opportunity.toObject();
      const uiBlocks = buildFounderUiBlocks(oppPlain);

      return ok({
        message: 'I updated the brief.',
        opportunity: oppPlain,
        uiBlocks,
      });
    }

    if (action === 'archive_opportunity') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
        return bad('A valid opportunityId is required');
      }

      const opportunity = await Opportunity.findOne({ _id: opportunityId, founderEmail: email });
      if (!opportunity) return bad('Search not found', 404);

      opportunity.status = 'closed';
      await opportunity.save();

      return ok({ message: 'Search archived.', opportunity: opportunity.toObject() });
    }

    if (action === 'founder_chat') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email, founderName } = resolved;

      const userText = String(payload?.message || '').trim();
      if (!userText) return bad('message is required');

      const opportunityId = payload?.opportunityId ? String(payload.opportunityId) : null;
      let opportunity: any = null;

      if (opportunityId && mongoose.Types.ObjectId.isValid(opportunityId)) {
        opportunity = await Opportunity.findOne({ _id: opportunityId, founderEmail: email });
      }
      if (!opportunity) {
        opportunity = await Opportunity.findOne({ founderEmail: email, status: 'draft' }).sort({ updatedAt: -1 });
      }

      const isFirstMessage =
        !opportunity ||
        (Array.isArray(payload?.history) && payload.history.filter((h: any) => h.role === 'user').length <= 1);
      const isDone = isDoneMessage(userText);
      const oppObj = opportunity ? opportunity.toObject?.() || opportunity : null;

      let shortlistDoc: any = null;
      let unlockedCandidates: any[] = [];
      if (opportunity) {
        shortlistDoc = await Shortlist.findOne({ opportunityId: opportunity._id, founderEmail: email });
        if (shortlistDoc?.unlocked) {
          const oppForCards = oppObj;
          unlockedCandidates = await buildFullCandidatesForShortlist(shortlistDoc, oppForCards, {
            BuilderProfile,
            ProjectRecord,
            MatchRecord,
          });
          unlockedCandidates = unlockedCandidates.filter((c: any) => !c.hidden);
        }
      }

      if (/(tell me more about|more about|who is|what about).*(for this role|for the role|for this)/i.test(userText) ||
        /tell me more about\s+[A-Za-z]/i.test(userText)) {

        // Extract Candidate letter/name from text (e.g. "Candidate A", "A", or "Dkalaise")
        const nameMatch = userText.match(/(?:about|on)\s+([A-Za-z][A-Za-z0-9_-]+)/i) || userText.match(/candidate\s+([a-zA-Z])/i);
        const queryName = nameMatch?.[1] || userText;

        if (!shortlistDoc?.unlocked) {
          // Locked state - we can ONLY discuss anonymous candidates!
          const candidatesList = shortlistDoc?.candidates || [];
          // Try to match Candidate A, Candidate B, etc.
          const matchedAnon = candidatesList.find((c: any) => {
            const label = String(c.anonymousLabel || '').toLowerCase();
            const q = queryName.toLowerCase();
            return label.includes(q) || q.includes(label) || label.endsWith(` ${q}`);
          });

          if (matchedAnon) {
            const answer = `**${matchedAnon.anonymousLabel}** (${matchedAnon.matchLabel}):
- **Role Type**: ${matchedAnon.roleType}
- **Top Skills**: ${Array.isArray(matchedAnon.topSkills) ? matchedAnon.topSkills.join(', ') : 'React, TypeScript'}
- **Proof Summary**: ${matchedAnon.proofSummary}
- **Availability**: ${matchedAnon.availabilitySummary}
- **Why they match**: ${matchedAnon.whyTheyMatch}

*Unlock this shortlist for $499 to reveal their identity, see full portfolios, and request a direct intro.*`;
            return ok({
              message: answer,
              intent: 'ask_about_candidate',
              opportunity: oppObj,
              uiBlocks: oppObj ? buildFounderUiBlocks(oppObj) : [],
            });
          }

          return ok({
            message: 'You can ask me about anonymous candidates (e.g. "Candidate A") or unlock the shortlist for $499 to search and ask about specific candidates by name.',
            intent: 'ask_about_candidate',
            opportunity: oppObj,
            uiBlocks: oppObj ? buildFounderUiBlocks(oppObj) : [],
          });
        }

        // Unlocked state - we can discuss specific candidate details by name or by anon label!
        const matched = matchCandidateByName(
          queryName,
          unlockedCandidates.map((c: any) => ({ name: c.name, builderId: c.builderId }))
        ) || unlockedCandidates.find((c: any) => {
          const anonLabel = String(c.anonymousLabel || '').toLowerCase();
          const q = queryName.toLowerCase();
          return anonLabel.includes(q) || q.includes(anonLabel) || anonLabel.endsWith(` ${q}`);
        });

        if (!matched) {
          return ok({
            message: "I don't see that candidate in this shortlist. Double check the name or spelling.",
            intent: 'ask_about_candidate',
            opportunity: oppObj,
            uiBlocks: oppObj ? buildFounderUiBlocks(oppObj) : [],
          });
        }

        const candidate = unlockedCandidates.find((c: any) => c.builderId === matched.builderId);
        const answer = buildCandidateAnswer(candidate);

        return ok({
          message: answer,
          intent: 'ask_about_candidate',
          opportunity: oppObj,
          uiBlocks: oppObj ? buildFounderUiBlocks(oppObj) : [],
          session: {
            currentSearchId: String(opportunity._id),
            unlockedCandidates: unlockedCandidates.map((c: any) => c.name),
            shortlistState: 'unlocked',
          },
        });
      }

      const parsed = await parseFounderAgentTurn({
        userText,
        history: Array.isArray(payload?.history) ? payload.history : undefined,
        opportunity: oppObj,
        founderName,
        isDone,
        isFirstMessage,
      });

      if (opportunity && isSkipMessage(userText)) {
        const skipKey = inferSkipFieldKey(userText, oppObj || {});
        if (skipKey) {
          const skipped = Array.isArray(opportunity.skippedFields) ? [...opportunity.skippedFields] : [];
          if (!skipped.includes(skipKey)) skipped.push(skipKey);
          opportunity.skippedFields = skipped;
          await opportunity.save();
        }
      }

      if (opportunity && /(change|update|edit|switch)/i.test(userText)) {
        const edits = applyEditFromText(userText, oppObj || {});
        Object.assign(opportunity, edits);
      }

      const hasExtractedFields = Object.keys(parsed.extractedData).some((k) => {
        const v = parsed.extractedData[k as keyof typeof parsed.extractedData];
        return v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== '');
      });

      const shouldPersist =
        parsed.intent !== 'role_summary' &&
        parsed.intent !== 'recommend_next_question' &&
        parsed.intent !== 'ask_about_candidate' &&
        (hasExtractedFields || !opportunity || isDone);

      if (shouldPersist) {
        if (!opportunity) {
          const initial = { ...parsed.extractedData };
          if (!initial.builderWillDo && userText.length > 20) {
            initial.builderWillDo = userText.trim().slice(0, 400);
          }
          if (!initial.roleTitle || initial.roleTitle === 'New role') {
            if (/engineer|developer|designer|builder/i.test(userText)) {
              initial.roleTitle = initial.roleTitle || 'Builder';
            }
          }
          opportunity = await Opportunity.create({
            founderName,
            founderEmail: email,
            company: initial.company || 'Your startup',
            startupSummary: initial.startupSummary || null,
            industry: initial.industry || null,
            roleTitle: initial.roleTitle || 'New role',
            roleType: initial.roleType || [],
            skillsNeeded: initial.skillsNeeded || [],
            niceToHaveSkills: initial.niceToHaveSkills || [],
            workType: initial.workType || null,
            timeline: initial.timeline || null,
            budget: initial.budget || null,
            locationPreference: initial.locationPreference || null,
            builderWillDo: initial.builderWillDo || null,
            successIn30Days: initial.successIn30Days || null,
            seniority: initial.seniority || null,
            hoursPerWeek: initial.hoursPerWeek || null,
            deliverables: initial.deliverables || [],
            fundingStage: initial.fundingStage || null,
            skippedFields: [],
            status: 'draft',
          });
        } else {
          mergeExtractedIntoOpportunity(opportunity, parsed.extractedData);
          if (!opportunity.company) opportunity.company = 'Your startup';
          if (!opportunity.roleTitle) opportunity.roleTitle = 'New role';
          await opportunity.save();
        }
      }

      const oppPlain = opportunity
        ? typeof opportunity.toObject === 'function'
          ? opportunity.toObject()
          : opportunity
        : null;

      const uiBlocks = oppPlain ? buildFounderUiBlocks(oppPlain) : [];

      let replyMessage = parsed.message;
      if (isDone && !replyMessage.includes('run')) {
        replyMessage = 'Got it. Your brief is ready. Want me to run the builder search?';
      }

      const skipped = oppPlain?.skippedFields || [];
      const missingRequired = oppPlain ? getMissingRequiredFields(oppPlain, skipped) : [];

      return ok({
        message: replyMessage,
        intent: parsed.intent,
        opportunity: oppPlain,
        uiBlocks,
        session: oppPlain
          ? {
              currentSearchId: String(oppPlain._id),
              currentRoleBrief: oppPlain,
              skippedFields: skipped,
              missingRequiredFields: missingRequired,
              shortlistState: shortlistDoc?.unlocked ? 'unlocked' : shortlistDoc ? 'locked' : 'none',
              unlockedCandidates: unlockedCandidates.map((c: any) => c.name),
            }
          : null,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
      });
    }

    if (action === 'get_builder_dashboard') {
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const [projects, rawMatches, events, rawMomentum, allProjectsForStats] = await Promise.all([
        ProjectRecord.find({ builderId: builder._id }).sort({ createdAt: -1 }).limit(6).lean(),
        MatchRecord.find({ builderId: builder._id }).sort({ updatedAt: -1 }).limit(6).populate('opportunityId').lean(),
        EventRecord.find({ builderId: builder._id }).sort({ date: -1 }).limit(3).lean(),
        MomentumUpdate.find({ builderId: builder._id }).sort({ date: -1 }).limit(5).lean(),
        ProjectRecord.find({ builderId: builder._id }).select('links source verificationStatus').lean(),
      ]);

      const matches = rawMatches.map((match: any) => {
        const opp = match.opportunityId || {};
        return {
          _id: match._id,
          matchScore: match.matchScore,
          status: match.status,
          reasoning: match.reasoning,
          evidence: match.evidence,
          riskFlags: match.riskFlags,
          missingProof: match.missingProof,
          company: opp.company,
          roleTitle: opp.roleTitle,
          workType: opp.workType,
          compensation: opp.budget || opp.compensation,
          timeline: opp.timeline,
          location: opp.location
        };
      });

      const momentum = rawMomentum.map((update: any) => ({
        _id: update._id,
        title: update.programName 
          ? `${update.programName} · Week ${update.week}` 
          : `Momentum Week ${update.week}`,
        content: update.weeklyUpdate,
        date: update.updatedAt || update.createdAt,
        status: update.status
      }));

      const projectStats = {
        total: allProjectsForStats.length,
        devpostImports: allProjectsForStats.filter((project: any) => Boolean(project.links?.devpost) || /devpost/i.test(project.source || '')).length,
        githubProjects: allProjectsForStats.filter((project: any) => Boolean(project.links?.github) || project.source === 'github_api').length,
        verifiedContributions: allProjectsForStats.filter((project: any) => ['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified'].includes(project.verificationStatus)).length,
      };

      const completion = computeBuilderScores(builder, allProjectsForStats);
      if (builder.profileCompletion?.score !== completion.score) {
        builder.profileCompletion = completion;
        await builder.save();
      }

      let profileQuality = builder.profileQuality;
      if (!profileQuality || !profileQuality.label || profileQuality.label === 'Needs Work' && !profileQuality.evaluatedAt) {
        profileQuality = evaluateDeterministicQuality(builder, allProjectsForStats);
        builder.profileQuality = profileQuality;
        builder.profileQuality.evaluatedAt = new Date();
        await builder.save();
      }

      return ok({
        message: 'Builder dashboard data loaded.',
        builder,
        completion,
        projects,
        matches,
        events,
        momentum,
        projectStats,
        introInbox: await getBuilderIntroInbox(String(builder._id)),
        activeTrials: await getBuilderActiveTrials(String(builder._id)),
        upcomingCalls: await getBuilderUpcomingCalls(String(builder._id)),
        notifications: await getNotificationsForBuilder(String(builder._id)),
        unreadNotificationCount: await countUnreadForBuilder(String(builder._id)),
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
      });
    }

    if (action === 'get_notifications') {
      const founderResolved = await resolveAuthedFounder(request);
      if (!('error' in founderResolved)) {
        const notifications = await getNotificationsForFounder(founderResolved.email);
        const unreadCount = await countUnreadForFounder(founderResolved.email);
        return ok({ notifications, unreadCount, recipientType: 'founder' });
      }
      const builderResolved = await resolveAuthedBuilder(request);
      if ('error' in builderResolved) return bad('Please log in to continue.', 401);
      const notifications = await getNotificationsForBuilder(String(builderResolved.builder._id));
      const unreadCount = await countUnreadForBuilder(String(builderResolved.builder._id));
      return ok({ notifications, unreadCount, recipientType: 'builder' });
    }

    if (action === 'mark_notification_read') {
      const notificationId = String(payload?.notificationId || '').trim();
      const markAll = payload?.all === true;
      const founderResolved = await resolveAuthedFounder(request);
      if (!('error' in founderResolved)) {
        if (markAll) {
          await markAllNotificationsRead({ type: 'founder', email: founderResolved.email });
          return ok({ message: 'All notifications marked read.' });
        }
        if (!notificationId) return bad('notificationId is required');
        const updated = await markNotificationRead(notificationId, {
          type: 'founder',
          email: founderResolved.email,
        });
        if (!updated) return bad('Notification not found', 404);
        return ok({ notification: updated });
      }
      const builderResolved = await resolveAuthedBuilder(request);
      if ('error' in builderResolved) return bad('Please log in to continue.', 401);
      if (markAll) {
        await markAllNotificationsRead({
          type: 'builder',
          builderId: String(builderResolved.builder._id),
        });
        return ok({ message: 'All notifications marked read.' });
      }
      if (!notificationId) return bad('notificationId is required');
      const updated = await markNotificationRead(notificationId, {
        type: 'builder',
        builderId: String(builderResolved.builder._id),
      });
      if (!updated) return bad('Notification not found', 404);
      return ok({ notification: updated });
    }

    if (action === 'get_builder_intro_inbox') {
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const introInbox = await getBuilderIntroInbox(String(resolved.builder._id));
      return ok({ introInbox });
    }

    if (action === 'respond_intro') {
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const introRequestId = String(payload?.introRequestId || '').trim();
      const response = String(payload?.response || '').trim() as 'view' | 'accept' | 'decline';
      if (!introRequestId || !['view', 'accept', 'decline'].includes(response)) {
        return bad('introRequestId and response (view|accept|decline) are required');
      }
      const result = await respondToIntro({
        introRequestId,
        builderId: String(resolved.builder._id),
        response,
        note: payload?.note,
        declineReason: payload?.declineReason,
      });
      if ('error' in result && result.error) {
        return bad(result.error, result.status || 400);
      }
      return ok({
        message:
          response === 'accept'
            ? 'Intro accepted.'
            : response === 'decline'
              ? 'Intro declined.'
              : 'Intro marked as viewed.',
        introRequest: result.intro
          ? {
              _id: String(result.intro._id),
              status: result.intro.status,
              viewedAt: result.intro.viewedAt,
              respondedAt: result.intro.respondedAt,
            }
          : null,
        matchStatus: result.match?.status || null,
      });
    }

    if (action === 'schedule_call') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const slot = payload?.slot || payload?.proposedSlot;
      if (!opportunityId || !builderId || !slot) {
        return bad('opportunityId, builderId, and slot are required');
      }
      const result = await scheduleCallByFounder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        slot,
        meetingUrl: payload?.meetingUrl,
        notes: payload?.notes,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Call proposed to builder.',
        callSchedule: result.schedule,
        matchStatus: result.match?.status || null,
      });
    }

    if (action === 'respond_call_schedule') {
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const callScheduleId = String(payload?.callScheduleId || '').trim();
      const scheduleAction = String(payload?.scheduleAction || payload?.action || '').trim();
      if (!callScheduleId || !['accept', 'counter'].includes(scheduleAction)) {
        return bad('callScheduleId and scheduleAction (accept|counter) are required');
      }
      const result = await respondCallScheduleByBuilder({
        callScheduleId,
        builderId: String(resolved.builder._id),
        action: scheduleAction as 'accept' | 'counter',
        slot: payload?.slot,
        notes: payload?.notes,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: scheduleAction === 'accept' ? 'Call confirmed.' : 'Counter-proposal sent.',
        callSchedule: result.schedule,
      });
    }

    if (action === 'confirm_call_schedule') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const callScheduleId = String(payload?.callScheduleId || '').trim();
      if (!callScheduleId) return bad('callScheduleId is required');
      const result = await confirmCallScheduleByFounder({
        callScheduleId,
        founderEmail: resolved.email,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({ message: 'Call confirmed.', callSchedule: result.schedule });
    }

    if (action === 'complete_call') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      const result = await completeCallByFounder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Call marked complete. You can hire or start a trial.',
        callSchedule: result.schedule,
        callCompletedAt: result.match?.callCompletedAt || null,
      });
    }

    if (action === 'get_call_schedule') {
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      const founderResolved = await resolveAuthedFounder(request);
      if (!('error' in founderResolved)) {
        const opp = await Opportunity.findOne({
          _id: opportunityId,
          founderEmail: founderResolved.email,
        }).lean();
        if (!opp) return bad('Not authorized', 403);
      } else {
        const builderResolved = await resolveAuthedBuilder(request);
        if ('error' in builderResolved) return bad('Please log in to continue.', 401);
        if (String(builderResolved.builder._id) !== builderId) return bad('Not authorized', 403);
      }
      const callSchedule = await getCallScheduleForMatch(opportunityId, builderId);
      return ok({ callSchedule });
    }

    if (action === 'send_trial_project') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const deadlineDate = String(payload?.deadlineDate || payload?.deadline || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      if (!deadlineDate) return bad('deadlineDate is required (YYYY-MM-DD)');
      const deadlineAt = new Date(deadlineDate);
      if (Number.isNaN(deadlineAt.getTime())) return bad('Invalid deadlineDate');
      deadlineAt.setHours(12, 0, 0, 0);
      const result = await sendTrialProjectToBuilder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        deadlineAt,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Trial project sent to builder.',
        trialProject: result.trialProject,
        matchStatus: result.matchStatus,
      });
    }

    if (action === 'submit_trial') {
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(resolved.builder._id);
      const videoUrl = String(payload?.videoUrl || payload?.demoUrl || '').trim();
      const githubUrl = String(payload?.githubUrl || '').trim();
      if (!opportunityId) return bad('opportunityId is required');
      const result = await submitTrialByBuilder({
        opportunityId,
        builderId,
        videoUrl,
        githubUrl,
        notes: payload?.notes,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Trial submitted for founder review.',
        trialProject: result.trialProject,
        matchStatus: result.matchStatus,
      });
    }

    if (action === 'review_trial_submission') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const decision = String(payload?.decision || '').trim() as 'approve' | 'reject';
      if (!opportunityId || !builderId || !['approve', 'reject'].includes(decision)) {
        return bad('opportunityId, builderId, and decision (approve|reject) are required');
      }
      const result = await reviewTrialSubmission({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        decision,
        note: payload?.note,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: decision === 'approve' ? 'Trial approved.' : 'Trial rejected with feedback.',
        trialProject: result.trialProject,
        matchStatus: result.matchStatus,
      });
    }

    if (action === 'hire_builder') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      const result = await hireBuilder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        note: payload?.note,
        skipTrial: payload?.skipTrial === true,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Builder hired.',
        matchStatus: result.matchStatus,
        opportunityStatus: result.opportunityStatus,
      });
    }

    if (action === 'reject_builder') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      const result = await rejectBuilder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        note: payload?.note,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({ message: 'Candidate closed.', matchStatus: result.matchStatus });
    }

    if (action === 'get_founder_threads') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const threads = await getFounderThreads(resolved.email);
      return ok({ threads });
    }

    if (action === 'get_builder_threads') {
      const resolved = await resolveAuthedBuilder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const threads = await getBuilderThreads(String(resolved.builder._id));
      return ok({ threads });
    }

    if (action === 'get_thread_messages') {
      const threadId = String(payload?.threadId || '').trim();
      if (!threadId) return bad('threadId is required');

      const founderResolved = await resolveAuthedFounder(request);
      if (!('error' in founderResolved)) {
        const result = await getThreadMessages(threadId, { type: 'founder', email: founderResolved.email });
        if ('error' in result && result.error) return bad(result.error, result.status || 400);
        return ok(result);
      }

      const builderResolved = await resolveAuthedBuilder(request);
      if ('error' in builderResolved) return bad('Please log in to continue.', 401);
      const result = await getThreadMessages(threadId, { type: 'builder', builderId: String(builderResolved.builder._id) });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok(result);
    }

    if (action === 'send_message') {
      const threadId = String(payload?.threadId || '').trim();
      const body = String(payload?.body || payload?.message || '').trim();
      if (!threadId || !body) return bad('threadId and body are required');

      const founderResolved = await resolveAuthedFounder(request);
      if (!('error' in founderResolved)) {
        const result = await sendThreadMessage({
          threadId,
          senderType: 'founder',
          senderEmail: founderResolved.email,
          body,
        });
        if ('error' in result && result.error) return bad(result.error, result.status || 400);
        return ok({ message: 'Message sent.', thread: result.thread, messageDoc: result.message });
      }

      const builderResolved = await resolveAuthedBuilder(request);
      if ('error' in builderResolved) return bad('Please log in to continue.', 401);
      const result = await sendThreadMessage({
        threadId,
        senderType: 'builder',
        senderEmail: builderResolved.builder.email,
        body,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({ message: 'Message sent.', thread: result.thread, messageDoc: result.message });
    }

    return bad(`Unsupported action: ${action}`);
  } catch (error) {
    return bad(error instanceof Error ? error.message : 'Action failed', 500);
  }
};
