import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { runBuilderAgentTurn } from '@/lib/agent/runners/builderAgentRunner';
import { runFounderAgentTurn } from '@/lib/agent/runners/founderAgentRunner';
import BuilderProfile from '@/models/talent/BuilderProfile';
import Opportunity from '@/models/talent/Opportunity';
import MatchRecord from '@/models/talent/MatchRecord';
import ProjectRecord from '@/models/talent/ProjectRecord';
import EventRecord from '@/models/talent/EventRecord';
import MomentumUpdate from '@/models/talent/MomentumUpdate';
import { computeProfileCompletion, computeBuilderScores } from '@/lib/talent/matching';
import { evaluateBuilderProfileQuality, evaluateDeterministicQuality } from '@/lib/talent/profileQuality';
import mongoose from 'mongoose';
import { generateOpenRouterReply, generateOpenRouterAgentTurn, getOpenRouterChatModel, hasOpenRouterConfig, type AgentMessage, type ToolDefinition } from '@/lib/openrouter';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { buildFounderUiBlocks } from '@/lib/talent/founderAgent';
import {
  applySanitizedToOpportunity,
  extractRoleHintsFromUserText,
  isPlaceholderCompany,
  mergeHintsIntoSanitized,
  sanitizeRoleBriefArgs,
  type FounderStartupContext,
} from '@/lib/talent/founderRoleBrief';
import { enhanceRoleBriefField, isEnhanceableRoleBriefField } from '@/lib/talent/roleBriefFieldEnhance';
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
import CandidateFeedback from '@/models/talent/CandidateFeedback';
import {
  writeFounderCandidateRejectionMemory,
  writeFounderCandidateSaveMemory,
} from '@/lib/agent/memoryWriter';
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
import {
  addBuilderMemory,
  addFounderMemory,
  formatMemoryForPrompt,
  getBuilderMemoryProfile,
  getFounderMemoryProfile,
} from '@/lib/talent/supermemory';

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
  memoryContext?: string;
}) {
  if (!hasOpenRouterConfig()) return params.fallback;
  const memoryBlock = params.memoryContext
    ? `\n\n[Builder memory from previous sessions]\n${params.memoryContext}`
    : '';
  try {
    return await generateOpenRouterReply({
      systemPrompt:
        `You are the DevLabs Builder Agent — a proactive profile intelligence agent.

Your job is NOT to wait for questions. You read the builder's profile, find the biggest problem, and tell them what to fix — right now. Think of yourself as a senior engineer doing a brutally honest code review on someone's profile before a founder evaluates it.

ALWAYS lead with the most critical profile issue you can see in the Context JSON. If the profile is missing contribution clarity, say so. If there are no projects, say so. If GitHub is missing, say so. Don't wait to be asked.

When someone says "what can you do" or "hey" or anything vague — do not list your features. Instead look at their profile and lead with what's broken:
"Your profile has 3 projects but none of them explain what you personally built. That's the biggest blocker right now. Want me to fix the first one?"

You take actions through tools. When a tool ran (toolResult or toolOutcome in context), acknowledge what you did, show the specific result, then immediately identify the next issue.

Forbidden language — never say:
- "This will help you get matched" / "improve your chances" / "get noticed" / "rank higher" / "unlock opportunities"
- "Done." as a complete response
- Generic capability lists when you have profile data to work with

Approved language:
- "This makes your profile easier to evaluate."
- "This clarifies your proof-of-work."
- "This helps founders understand what you personally built."
- "Missing contribution on [project] — founders can't evaluate what they can't see."

Rules:
- Never invent facts or upgrade self-reported claims to verified proof
- Ask for confirmation before sending intros, messages, or deleting anything
- When importing GitHub: skip forks, tutorials, boilerplates — prioritize shipped projects with READMEs and live links
- When importing Devpost: ask what they personally owned, don't overstate awards
- Project description format: what it does → stack → personal contribution → proof links → what's missing
- If answer is one of fewer than 6 options, list them as choices — don't ask open-ended questions
- No emojis. No corporate speak. One clear next action at the end of every response.

Use Context JSON for the builder's current profile state (projects, headline, bio, skills, availability, quality issues, intro inbox, trials). Use builder memory (if present) for session history.${memoryBlock}`,
      userPrompt: `Intent: ${params.intent}\nContext JSON:\n${JSON.stringify(params.context)}`,
      temperature: 0.3,
      maxTokens: 500,
      history: params.history,
    });
  } catch (err) {
    console.error('[getAgentMessage] LLM call failed:', err instanceof Error ? err.message : err);
    return params.fallback;
  }
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

async function loadFounderStartupContext(founderEmail: string): Promise<FounderStartupContext> {
  const last = await Opportunity.findOne({ founderEmail, status: { $ne: 'closed' } })
    .sort({ updatedAt: -1 })
    .select('company startupSummary industry')
    .lean();

  const company =
    last?.company && !isPlaceholderCompany(String(last.company)) ? String(last.company) : null;

  return {
    company,
    startupSummary: last?.startupSummary ? String(last.startupSummary) : null,
    industry: last?.industry ? String(last.industry) : null,
  };
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

export const postAgentAction: APIRoute = async ({ request }) => {
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
      const builderId = String(builder._id);
      console.log('[agent/actions] builder_chat:delegating', { builderId });
      return runBuilderAgentTurn({ builder, builderId, userText, history: Array.isArray(payload?.history) ? payload.history : [] });
      // ── LEGACY builder agent code below — kept for reference, unreachable ──

      // ── Builder Agent: agentic tool-calling loop ──────────────────────────
      const builderMemoryPromise = getBuilderMemoryProfile(builderId, userText);

      const BUILDER_AGENT_SYSTEM = `You are the DevLabs Builder Agent — a proactive profile intelligence agent.

Read the builder's profile first using get_builder_profile before making ANY claim about what they have or don't have. Never assume a field is missing without checking.

Your job: find the most critical profile gap, tell the builder exactly what's wrong, and fix it. Sound like a senior engineer reviewing someone's profile the night before a founder evaluates it.

Lead with the real issue. When someone says "what can you do" or "hey" — call get_builder_profile, then tell them what's broken, not what you can do.

After any write action, call get_builder_profile again to confirm the change saved correctly, then tell the builder what you updated and what to fix next.

Rules:
- ALWAYS call get_builder_profile before making claims about the profile (links, bio, availability, etc.)
- Chain tools: read → act → confirm → next issue
- Never say "Done." as a full response
- Never say "This will help you get matched", "improve your chances", "rank higher", or "get noticed"
- Say "This makes your profile easier to evaluate" / "This clarifies your proof-of-work"
- No emojis. No fluff. One concrete next step at the end of every response.
- When fewer than 6 options exist, list them — don't ask open-ended questions
- For imports: skip forks/tutorials/boilerplates, prioritize shipped projects with READMEs`;

      const builderAgentTools: ToolDefinition[] = [
        {
          type: 'function',
          function: {
            name: 'get_builder_profile',
            description: 'Read the full builder profile: name, headline, bio, GitHub/LinkedIn/portfolio links, availability, preferred hire type, project count, and profile quality issues. Call this before making any claim about the profile.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_projects',
            description: 'List all builder projects with title, description, tech stack, and personal contribution.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'update_availability',
            description: 'Update the builder availability status.',
            parameters: {
              type: 'object',
              properties: {
                availableNow: { type: 'boolean', description: 'Whether the builder is currently open to work' },
                hoursPerWeek: { type: 'number', description: 'Hours per week available' },
                remotePreference: { type: 'string', enum: ['remote', 'hybrid', 'in_person', 'unspecified'] },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'update_links',
            description: 'Update profile links (GitHub, LinkedIn, portfolio URL).',
            parameters: {
              type: 'object',
              properties: {
                github: { type: 'string', description: 'GitHub profile URL' },
                linkedin: { type: 'string', description: 'LinkedIn URL' },
                portfolio: { type: 'string', description: 'Portfolio/website URL' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'update_profile_basics',
            description: 'Update the builder headline and/or bio.',
            parameters: {
              type: 'object',
              properties: {
                headline: { type: 'string', description: 'One-line role description, e.g. "Full-stack builder — React, Node, Supabase"' },
                bio: { type: 'string', description: 'Short paragraph describing what the builder builds and what they have shipped' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'import_project',
            description: 'Import a project from a GitHub repo URL or Devpost project URL. Scrapes the page, creates a project card, and returns the imported project details.',
            parameters: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Full GitHub repo URL or Devpost project URL' },
              },
              required: ['url'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'evaluate_profile',
            description: 'Run a full quality evaluation of the builder profile. Returns quality score, top issues, and specific fixes to make.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'fetch_intros',
            description: 'Fetch all pending intro requests from founders. Returns founder name, company, role title, hire type, intro message, and current status for each request.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'fetch_work_trials',
            description: 'Fetch all active and submitted work trials. Returns trial title, deliverables, deadline, compensation, submission status, and the company/role for each trial.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'fetch_calls',
            description: 'Fetch all upcoming and pending calls with founders. Returns call status, proposed/confirmed time slot, meeting link, and the role/company context for each call.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'fetch_messages',
            description: 'Fetch all message threads with founders. Returns thread summary, last message preview, unread count, and the associated role/company for each thread.',
            parameters: {
              type: 'object',
              properties: {
                threadId: { type: 'string', description: 'Optional: pass a specific thread ID to fetch the full message history for that conversation.' },
              },
            },
          },
        },
      ];

      // Tool executor — called by the agentic loop
      async function runBuilderTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
        const freshB = await reloadBuilderForAgent(builder._id);
        const freshProjects = await ProjectRecord.find({ builderId: builder._id }).select('projectName description techStack builderContribution verificationStatus source links').lean();

        switch (name) {
          case 'get_builder_profile': {
            const completion = computeBuilderScores(freshB || builder, freshProjects);
            return {
              name: (freshB || builder).name,
              headline: (freshB || builder).headline || null,
              bio: (freshB || builder).bio || null,
              links: {
                github: (freshB || builder).links?.github || null,
                linkedin: (freshB || builder).links?.linkedin || null,
                portfolio: (freshB || builder).links?.portfolio || null,
                devpost: (freshB || builder).links?.devpost || null,
                resume: (freshB || builder).links?.resume || null,
              },
              availability: {
                availableNow: (freshB || builder).availability?.availableNow ?? false,
                hoursPerWeek: (freshB || builder).availability?.hoursPerWeek ?? null,
                remotePreference: (freshB || builder).availability?.remotePreference ?? 'unspecified',
              },
              preferredHireType: (freshB || builder).preferredWorkType || [],
              projectCount: freshProjects.length,
              profileScore: completion.profileScore,
              proofScore: completion.proofScore,
              missingFields: completion.missingItems || [],
              qualityIssues: ((freshB || builder).profileQuality?.issues || []).slice(0, 3).map((i: any) => i.title),
              qualitySummary: (freshB || builder).profileQuality?.oneLineSummary || null,
            };
          }
          case 'get_projects': {
            return {
              projects: freshProjects.map((p: any) => ({
                id: String(p._id),
                title: p.projectName,
                description: p.description || null,
                techStack: p.techStack || [],
                personalContribution: p.builderContribution || null,
                verificationStatus: p.verificationStatus || 'self_reported',
                source: p.source || 'manual',
                githubUrl: p.links?.github || null,
                demoUrl: p.links?.demo || null,
                devpostUrl: p.links?.devpost || null,
              })),
            };
          }
          case 'update_availability': {
            const b = freshB || builder;
            await applyAvailabilityUpdate(b, {
              availableNow: typeof args.availableNow === 'boolean' ? args.availableNow : undefined,
              hoursPerWeek: typeof args.hoursPerWeek === 'number' ? args.hoursPerWeek : null,
              remotePreference: typeof args.remotePreference === 'string' ? args.remotePreference : null,
            });
            void addBuilderMemory(builderId, `Builder ${b.name} updated availability: availableNow=${b.availability?.availableNow}, hoursPerWeek=${b.availability?.hoursPerWeek}, remotePreference=${b.availability?.remotePreference}`);
            return { success: true, updated: { availableNow: b.availability?.availableNow, hoursPerWeek: b.availability?.hoursPerWeek, remotePreference: b.availability?.remotePreference } };
          }
          case 'update_links': {
            const b = freshB || builder;
            // Pass undefined (not null) for missing fields so applyLinksUpdate
            // skips them instead of overwriting existing values with null.
            await applyLinksUpdate(b, {
              github: typeof args.github === 'string' ? args.github : undefined,
              linkedin: typeof args.linkedin === 'string' ? args.linkedin : undefined,
              portfolio: typeof args.portfolio === 'string' ? args.portfolio : undefined,
            });
            void addBuilderMemory(builderId, `Builder ${b.name} updated links: github=${args.github ?? 'unchanged'}, linkedin=${args.linkedin ?? 'unchanged'}`);
            return { success: true, updated: { github: args.github ?? null, linkedin: args.linkedin ?? null, portfolio: args.portfolio ?? null } };
          }
          case 'update_profile_basics': {
            const b = freshB || builder;
            await applyProfileBasicsUpdate(b, {
              headline: typeof args.headline === 'string' ? args.headline : undefined,
              bio: typeof args.bio === 'string' ? args.bio : undefined,
            });
            void addBuilderMemory(builderId, `Builder ${b.name} updated headline: "${args.headline}" and bio.`);
            return { success: true, updated: { headline: args.headline ?? null, bio: typeof args.bio === 'string' ? args.bio.slice(0, 80) + '...' : null } };
          }
          case 'import_project': {
            const url = typeof args.url === 'string' ? args.url : null;
            if (!url) return { success: false, error: 'No URL provided' };
            try {
              const project = await scrapeAndImportProject(url, builder._id);
              void addBuilderMemory(builderId, `Builder imported project "${project.projectName}" from ${url}. Tech: ${(project.techStack || []).join(', ')}`);
              return { success: true, project: { title: project.projectName, description: project.description, techStack: project.techStack, source: project.source } };
            } catch (e) {
              return { success: false, error: e instanceof Error ? e.message : 'Import failed' };
            }
          }
          case 'evaluate_profile': {
            const b = freshB || builder;
            const events = await EventRecord.find({ builderId: builder._id }).lean();
            const momentum = await MomentumUpdate.find({ builderId: builder._id }).lean();
            const quality = await evaluateBuilderProfileQuality(b, freshProjects, events, momentum);
            b.profileQuality = quality;
            b.profileQuality.evaluatedAt = new Date();
            await b.save();
            return {
              overallScore: quality.overallScore,
              label: quality.label,
              summary: quality.oneLineSummary,
              issues: (quality.issues || []).slice(0, 4).map((i: any) => ({ title: i.title, detail: i.detail })),
              suggestedFixes: (quality.suggestedFixes || []).slice(0, 3).map((f: any) => f.action),
            };
          }
          case 'fetch_intros': {
            const intros = await getBuilderIntroInbox(builderId);
            return {
              count: intros.length,
              intros: intros.map((i: any) => ({
                introId: i._id,
                status: i.status,
                founderName: i.founderName,
                company: i.company,
                roleTitle: i.roleTitle,
                hireType: i.hireType || null,
                introMessage: i.introMessage,
                budget: i.budget || null,
                timeline: i.timeline || null,
                receivedAt: i.createdAt,
                viewedAt: i.viewedAt || null,
                threadId: i.threadId || null,
              })),
            };
          }

          case 'fetch_work_trials': {
            const trials = await getBuilderActiveTrials(builderId);
            return {
              count: trials.length,
              trials: trials.map((t: any) => ({
                matchId: t.matchId,
                company: t.company,
                roleTitle: t.roleTitle,
                founderName: t.founderName,
                matchStatus: t.matchStatus,
                trial: t.trialProject ? {
                  title: t.trialProject.title,
                  goal: t.trialProject.goal,
                  deliverables: t.trialProject.deliverables || [],
                  timeline: t.trialProject.timeline,
                  deadline: t.trialProject.deadlineAt || null,
                  status: t.trialProject.status,
                  sentAt: t.trialProject.sentAt || null,
                  submittedAt: t.trialProject.submittedAt || null,
                  compensation: t.trialProject.compensation || null,
                  submission: t.trialProject.submission || null,
                } : null,
              })),
            };
          }

          case 'fetch_calls': {
            const calls = await getBuilderUpcomingCalls(builderId);
            return {
              count: calls.length,
              calls: calls.map((c: any) => ({
                callId: c._id,
                company: c.company,
                roleTitle: c.roleTitle,
                founderName: c.founderName,
                status: c.status,
                proposedBy: c.proposedBy,
                proposedSlot: c.proposedSlot || null,
                confirmedSlot: c.confirmedSlot || null,
                meetingUrl: c.meetingUrl || null,
                notes: c.notes || null,
              })),
            };
          }

          case 'fetch_messages': {
            const threadId = typeof args.threadId === 'string' ? args.threadId : null;

            if (threadId) {
              // Fetch full message history for a specific thread
              const result = await getThreadMessages(threadId, { type: 'builder', builderId });
              if ('error' in result) return { error: result.error };
              return {
                threadId,
                messages: (result as any).messages?.map((m: any) => ({
                  sender: m.senderType,
                  text: m.body,
                  sentAt: m.createdAt,
                })) || [],
                introStatus: (result as any).intro?.status || null,
              };
            }

            // Fetch all thread summaries
            const threads = await getBuilderThreads(builderId);
            return {
              count: threads.length,
              threads: threads.map((t: any) => ({
                threadId: t._id,
                company: t.company || null,
                roleTitle: t.roleTitle || null,
                founderName: t.founderName || null,
                lastMessageAt: t.lastMessageAt || null,
                lastMessagePreview: t.lastMessagePreview || null,
                unreadCount: t.builderUnreadCount || 0,
                introStatus: t.introStatus || null,
              })),
            };
          }

          default:
            return { error: `Unknown tool: ${name}` };
        }
      }

      // Build the memory prefix for the system prompt
      const memoryProfile = await builderMemoryPromise;
      const memoryBlock = memoryProfile
        ? `\n\n[Builder memory]\n${[...((memoryProfile.static || []).slice(0, 5)), ...((memoryProfile.dynamic || []).slice(0, 3))].map(s => `- ${s}`).join('\n')}`
        : '';

      const chatHistory: ChatTurn[] = Array.isArray(payload?.history) ? payload.history : [];

      // Build message thread for the LLM
      const messages: AgentMessage[] = [
        { role: 'system', content: BUILDER_AGENT_SYSTEM + memoryBlock },
        ...chatHistory.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user', content: userText },
      ];

      // Agentic loop — LLM calls tools, we execute, feed results back, repeat
      let agentResponse = await generateOpenRouterAgentTurn({ messages, tools: builderAgentTools, temperature: 0.3, maxTokens: 600 });

      let uiBlocks: any[] = [];
      const MAX_ITERATIONS = 5;
      let iterations = 0;

      while (agentResponse.tool_calls && agentResponse.tool_calls.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;

        // Add the assistant's tool-call message to history
        messages.push({ role: 'assistant', content: agentResponse.content ?? null, tool_calls: agentResponse.tool_calls });

        // Execute each tool call in parallel
        const toolResults = await Promise.all(
          agentResponse.tool_calls.map(async (tc) => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
            console.log(`[agent/agentic] tool_call: ${tc.function.name}`, args);
            const result = await runBuilderTool(tc.function.name, args);

            // Attach UI blocks for write operations
            if (tc.function.name === 'evaluate_profile' && result.issues) {
              uiBlocks = [{ type: 'profile_quality', title: `Profile: ${result.label}`, body: result.summary, items: (result.issues as any[]).map((i: any) => i.title) }];
            }
            if (tc.function.name === 'import_project' && result.success) {
              uiBlocks.push({ type: 'summary_card', title: `Imported: ${(result.project as any)?.title}`, body: (result.project as any)?.description });
            }

            return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
          })
        );

        messages.push(...toolResults);

        // Ask the LLM again with tool results
        agentResponse = await generateOpenRouterAgentTurn({ messages, tools: builderAgentTools, temperature: 0.3, maxTokens: 600 });
      }

      const finalMessage = agentResponse.content
        || 'I ran into an issue generating a response. Try asking again.';

      const finalBuilder = await reloadBuilderForAgent(builder._id);
      const finalProjects = await ProjectRecord.find({ builderId: builder._id }).lean();
      const profileForClient = finalBuilder ? {
        _id: String(finalBuilder._id),
        name: finalBuilder.name,
        email: finalBuilder.email,
        headline: finalBuilder.headline,
        bio: finalBuilder.bio,
        links: finalBuilder.links,
        availability: finalBuilder.availability,
        rolePreference: finalBuilder.rolePreference,
        preferredWorkType: finalBuilder.preferredWorkType,
        profileCompletion: computeBuilderScores(finalBuilder, finalProjects),
        profileQuality: finalBuilder.profileQuality,
      } : null;

      console.log('[agent/actions] builder_chat:done', { builderId, iterations, toolsCalled: messages.filter(m => m.role === 'tool').length });

      return ok({
        message: finalMessage,
        uiBlocks,
        builder: profileForClient,
        meta: { model: getOpenRouterChatModel(), iterations },
      });
    }

    if (action === 'create_role_brief') {
      const { founderName, founderEmail, company, startupSummary, roleTitle, roleType, skillsNeeded, budget, timeline, workType } = payload;
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

      const opportunities = await Opportunity.find({
          founderEmail: email,
          status: { $nin: ['closed', 'archived', 'deleted'] },
        })
        .sort({ updatedAt: -1 })
        .lean();

      const opportunityIds = opportunities.map((o: any) => o._id);
      const shortlistDocs = await Shortlist.find({ opportunityId: { $in: opportunityIds } }).lean();
      const oppById = new Map(opportunities.map((o: any) => [String(o._id), o]));

      const shortlists = await Promise.all(
        shortlistDocs.map(async (sl: any) => {
          const pub = toPublicShortlist(sl);
          if (!pub) return null;
          const opportunity = oppById.get(String(sl.opportunityId));
          const fullCandidates = await buildFullCandidatesForShortlist(sl, opportunity, {
            BuilderProfile,
            ProjectRecord,
            MatchRecord,
          });
          return { ...pub, fullCandidates: fullCandidates.filter((c: any) => !c.hidden) };
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

      const builders = await BuilderProfile.find({
        verificationStatus: { $ne: 'rejected' },
        visibilityStatus: { $ne: 'hidden' },
      })
        .limit(2000)
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
      const previewCandidates = toAnonymousCandidates(ranked, ranked.length);
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
          profileStrength: entry.profileStrength,
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

      shortlistFields.unlocked = true;
      shortlistFields.unlockedAt = existingShortlist?.unlockedAt || new Date();

      const shortlist = await Shortlist.findOneAndUpdate(
        { opportunityId },
        { $set: shortlistFields },
        { upsert: true, new: true }
      );

      opportunity.status = 'shortlisted';
      await opportunity.save();

      const publicShortlist = toPublicShortlist(shortlist);
      const fullCandidates = await buildFullCandidatesForShortlist(shortlist, oppPlain, {
        BuilderProfile,
        ProjectRecord,
        MatchRecord,
      });
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

      const previewMsg = isRerun
        ? `Search refreshed for ${oppPlain.roleTitle}. ${candidatesWithMatchIds.length} builder${candidatesWithMatchIds.length === 1 ? '' : 's'} on your board (${strongMatchCount} strong).`
        : strongMatchCount === 0 && ranked.length > 0
          ? `Search ready for ${oppPlain.roleTitle}: ${ranked.length} potential match${ranked.length === 1 ? '' : 'es'}, 0 strong matches yet — review them on your board.`
          : `Search complete for ${oppPlain.roleTitle}. ${ranked.length} potential matches (${strongMatchCount} strong) are on your board.`;

      return ok({
        message: previewMsg,
        opportunity: oppPlain,
        shortlist: {
          ...publicShortlist,
          fullCandidates: fullCandidates.filter((c: any) => !c.hidden),
        },
        searchStats: {
          totalMatches: ranked.length,
          strongMatchCount,
          previewGenerated: true,
          locked: false,
        },
        uiBlocks,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
      });
    }

    if (action === 'enhance_role_brief_field') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      const field = String(payload?.field || '').trim();
      const currentValue = String(payload?.currentValue || '');
      const briefContext =
        payload?.briefContext && typeof payload.briefContext === 'object' ? payload.briefContext : {};

      if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
        return bad('A valid opportunityId is required');
      }
      if (!isEnhanceableRoleBriefField(field)) {
        return bad('Invalid field');
      }

      const opportunity = await Opportunity.findOne({ _id: opportunityId, founderEmail: email });
      if (!opportunity) return bad('Search not found', 404);

      try {
        const enhancedValue = await enhanceRoleBriefField({
          field,
          currentValue,
          briefContext: briefContext as Record<string, unknown>,
        });
        return ok({ enhancedValue });
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'AI enhancement failed');
      }
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
      const { email, founderName, decoded } = resolved;

      const userText = String(payload?.message || '').trim();
      if (!userText) return bad('message is required');

      const founderId = decoded?.userId ? String(decoded.userId) : email;
      const founderStartupContext = await loadFounderStartupContext(email);

      const payloadOpportunityId = payload?.opportunityId ? String(payload.opportunityId) : null;
      let currentOpportunity: any = null;
      if (payloadOpportunityId && mongoose.Types.ObjectId.isValid(payloadOpportunityId)) {
        currentOpportunity = await Opportunity.findOne({ _id: payloadOpportunityId, founderEmail: email });
      }
      if (!currentOpportunity) {
        currentOpportunity = await Opportunity.findOne({ founderEmail: email, status: 'draft' }).sort({ updatedAt: -1 });
      }

      console.log('[agent/actions] founder_chat:delegating', { founderId });
      return runFounderAgentTurn({
        email,
        founderName,
        founderId,
        userText,
        history: Array.isArray(payload?.history) ? payload.history : [],
        currentOpportunity,
        founderStartupContext,
        payloadOpportunityId,
      });
      // ── LEGACY founder agent code below — kept for reference, unreachable ──
      const FOUNDER_AGENT_SYSTEM_PROMPT = `You are the DevLabs Founder Agent — a direct, no-nonsense hiring agent who helps founders find proof-backed builders fast.

Tone: speak like a sharp technical co-founder, not a recruiter. Blunt, fast, builder-native. No filler, no pleasantries, no emojis.

On EVERY first message: call get_all_roles first, then respond based on what you find:
- If get_all_roles returns existing roles: ask if they want to continue one or start fresh.
- If "just signed up" or get_all_roles is empty: skip the pleasantries. Ask ONE sharp question: "What are you building and who do you need to build it?" — that's it. Don't describe yourself. Don't say welcome. Don't explain the platform.
- Never use "Great!", "Awesome!", "Sure!", or any filler affirmation. Just ask the question.

PROACTIVE BEHAVIOUR — when descriptions are vague, poke hard:
- "I need a developer" → ask: what are they building? what stack? full-time or internship?
- "Someone good with AI" → ask: what specifically — RAG pipelines? fine-tuning? inference? and what's the output — a product, an API, a model?
- "React developer" → ask: is this frontend-only or full-stack? what's the product context? what will they ship first?
Never accept vague answers. Always drill into: what specifically they will build, what stack, what hire type.

OPTION CARDS — whenever the answer is one of a short list, format your response like this:
First write your message normally, then on a new line write the question, then list numbered options:

What kind of hire are you looking for?
1. Full-time
2. Internship
3. Either works

Use this format for: hire type, location preference, timeline, seniority. This triggers the option card UI on the frontend.

TOOL CHAINING:
- Always call get_all_roles first on init to check context
- Call get_role_brief before referencing any role field
- Call update_role_brief only with fields the founder explicitly stated — NEVER invent values
- After create/update: call get_role_brief to confirm what was saved
- When brief has roleTitle + builderWillDo + skillsNeeded: say "Brief looks solid. Want me to run the search?"
- After search: call get_shortlist and summarise who came back

HIRE TYPE — only three values:
- full_time → "Full-time"
- internship → "Internship"
- either → "Either works"
Never use: contract, freelance, part-time, consulting.

CANDIDATE REVIEW — always use this structure:
- Why they fit (specific, not generic)
- Relevant projects and personal contribution
- Evidence quality: verified vs self-reported
- Gap or risk
- Next action

DATA DISCIPLINE — for create_role_brief / update_role_brief:
- Only pass fields the founder explicitly stated
- Never invent budgets, timelines, or company names
- Omit unknown fields entirely — do not send empty strings or placeholders

Confirmation required before: sending an intro, rejecting a candidate, closing a role.
End every response with one concrete next step.`;

      const founderAgentTools: ToolDefinition[] = [
        {
          type: 'function',
          function: {
            name: 'get_role_brief',
            description: 'Read the current role brief: company, role title, hire type, required skills, budget, timeline, location, and what the builder will build. Call this before referencing anything about the role.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_all_roles',
            description: 'List all hiring requests created by this founder with their status and role titles.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'create_role_brief',
            description: 'Create a new hiring request. Use when the founder is describing a new role.',
            parameters: {
              type: 'object',
              properties: {
                roleTitle: { type: 'string' },
                company: { type: 'string' },
                startupSummary: { type: 'string' },
                builderWillDo: { type: 'string', description: 'What the builder will ship in the first few weeks' },
                skillsNeeded: { type: 'array', items: { type: 'string' } },
                niceToHaveSkills: { type: 'array', items: { type: 'string' } },
                hireType: { type: 'string', enum: ['full_time', 'internship', 'either'], description: 'The type of hire' },
                timeline: { type: 'string' },
                budget: { type: 'string' },
                locationPreference: { type: 'string' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'update_role_brief',
            description: 'Update fields on the current role brief. Only pass the fields that need to change.',
            parameters: {
              type: 'object',
              properties: {
                roleTitle: { type: 'string' },
                company: { type: 'string' },
                startupSummary: { type: 'string' },
                builderWillDo: { type: 'string' },
                skillsNeeded: { type: 'array', items: { type: 'string' } },
                niceToHaveSkills: { type: 'array', items: { type: 'string' } },
                hireType: { type: 'string', enum: ['full_time', 'internship', 'either'] },
                timeline: { type: 'string' },
                budget: { type: 'string' },
                locationPreference: { type: 'string' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'run_search',
            description: 'Run the builder search for the current role. Returns how many candidates were found. Call get_shortlist after to see the results.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_shortlist',
            description: 'Get the current candidate shortlist. If unlocked, shows candidate names and proof details. If locked, shows anonymous profiles.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_candidate_details',
            description: 'Get full details on a specific candidate: their projects, contributions, tech stack, proof strength, and pipeline status.',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Candidate name or anonymous label (e.g. "Candidate A")' },
              },
              required: ['name'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'request_intro',
            description: 'Send an intro request to a specific builder. Always confirm with the founder before calling this — it sends an actual notification to the builder.',
            parameters: {
              type: 'object',
              properties: {
                builderName: { type: 'string', description: 'Name of the builder to send an intro to' },
                message: { type: 'string', description: 'Personalized intro message to send' },
              },
              required: ['builderName', 'message'],
            },
          },
        },
      ];

      // Tool executor
      async function runFounderTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
        const opp = currentOpportunity;
        const oppId = opp ? String(opp._id) : null;

        switch (name) {
          case 'get_role_brief': {
            if (!opp) return { message: 'No active role brief yet. Use create_role_brief to start one.' };
            const o = opp.toObject ? opp.toObject() : opp;
            return {
              opportunityId: oppId,
              roleTitle: o.roleTitle,
              company: o.company,
              startupSummary: o.startupSummary,
              hireType: o.hireType || o.workType || null,
              builderWillDo: o.builderWillDo,
              skillsNeeded: o.skillsNeeded || [],
              niceToHaveSkills: o.niceToHaveSkills || [],
              timeline: o.timeline,
              budget: o.budget,
              locationPreference: o.locationPreference,
              status: o.status || 'draft',
              missingFields: getMissingRequiredFields(o, o.skippedFields || []),
            };
          }

          case 'get_all_roles': {
            const roles = await Opportunity.find({ founderEmail: email })
              .sort({ updatedAt: -1 })
              .limit(10)
              .select('roleTitle company status hireType workType createdAt')
              .lean();
            return {
              roles: roles.map((r: any) => ({
                id: String(r._id),
                roleTitle: r.roleTitle,
                company: r.company,
                hireType: r.hireType || r.workType || null,
                status: r.status,
              })),
            };
          }

          case 'create_role_brief': {
            const hints = extractRoleHintsFromUserText(userText);
            let fields = mergeHintsIntoSanitized(
              sanitizeRoleBriefArgs(args, founderStartupContext, userText),
              hints
            );

            if (!fields.roleTitle) {
              return {
                error:
                  'Need a concrete role title from the founder (e.g. Full-stack engineer) before creating the brief.',
              };
            }

            if (!fields.company || isPlaceholderCompany(fields.company)) {
              return {
                error:
                  'Need the real startup/company name. Ask the founder or use their saved company from onboarding.',
              };
            }

            const newOpp = await Opportunity.create({
              founderName,
              founderEmail: email,
              company: fields.company,
              startupSummary: fields.startupSummary || null,
              industry: fields.industry || null,
              roleTitle: fields.roleTitle,
              builderWillDo: fields.builderWillDo || null,
              skillsNeeded: fields.skillsNeeded,
              niceToHaveSkills: fields.niceToHaveSkills,
              hireType: fields.hireType || null,
              workType: fields.workType || null,
              timeline: fields.timeline || null,
              budget: fields.budget || null,
              locationPreference: fields.locationPreference || null,
              skippedFields: [],
              status: 'draft',
            });
            currentOpportunity = newOpp;
            void addFounderMemory(founderId,
              `Founder ${founderName} created role "${newOpp.roleTitle}" at "${newOpp.company}". Hire type: ${newOpp.hireType || newOpp.workType || 'unspecified'}. Skills: ${(newOpp.skillsNeeded || []).join(', ')}.`
            );
            return { success: true, opportunityId: String(newOpp._id), roleTitle: newOpp.roleTitle, company: newOpp.company };
          }

          case 'update_role_brief': {
            if (!opp) return { error: 'No active role brief. Create one first with create_role_brief.' };
            const hints = extractRoleHintsFromUserText(userText);
            const fields = mergeHintsIntoSanitized(
              sanitizeRoleBriefArgs(args, founderStartupContext, userText),
              hints
            );
            applySanitizedToOpportunity(opp, fields);
            const changed = (
              [
                fields.roleTitle ? 'roleTitle' : null,
                fields.company ? 'company' : null,
                fields.startupSummary ? 'startupSummary' : null,
                fields.builderWillDo ? 'builderWillDo' : null,
                fields.skillsNeeded.length ? 'skillsNeeded' : null,
                fields.niceToHaveSkills.length ? 'niceToHaveSkills' : null,
                fields.hireType ? 'hireType' : null,
                fields.timeline ? 'timeline' : null,
                fields.budget ? 'budget' : null,
                fields.locationPreference ? 'locationPreference' : null,
              ] as Array<string | null>
            ).filter(Boolean) as string[];
            await opp.save();
            void addFounderMemory(founderId,
              `Founder ${founderName} updated role "${opp.roleTitle}": ${changed.join(', ') || 'brief fields'} changed.`
            );
            return { success: true, updated: changed, opportunityId: oppId };
          }

          case 'run_search': {
            if (!opp) return { error: 'No active role brief. Create one first.' };
            const oppPlain = opp.toObject ? opp.toObject() : opp;
            if (!canRunPreviewAnyway(oppPlain)) {
              return { error: 'Role brief needs at least a role title, what they will build, and required skills before running search.' };
            }
            const builders = await BuilderProfile.find({
              verificationStatus: { $ne: 'rejected' },
              visibilityStatus: { $ne: 'hidden' },
            }).limit(2000).lean();
            const builderIds = builders.map((b: any) => b._id);
            const allProjects = await ProjectRecord.find({ builderId: { $in: builderIds } })
              .select('builderId projectName description problemSolved techStack builderContribution contributionTags verificationStatus links')
              .lean();
            const projectsByBuilder = new Map<string, any[]>();
            for (const p of allProjects) {
              const key = String(p.builderId);
              if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
              projectsByBuilder.get(key)!.push(p);
            }
            const ranked = rankBuildersForOpportunity(builders, projectsByBuilder, oppPlain, 12);
            const candidates = toAnonymousCandidates(ranked, 8);
            const strongCount = ranked.filter((r) => r.matchLabel === 'Strong Match').length;

            const candidatesWithIds: any[] = [];
            for (const anon of candidates) {
              const entry = ranked.find((r) => r.builderId === anon.builderId);
              if (!entry) continue;
              const match = await MatchRecord.findOneAndUpdate(
                { builderId: entry.builderId, opportunityId: oppId },
                { $set: { builderId: entry.builderId, opportunityId: oppId, matchScore: entry.matchScore, profileStrength: entry.profileStrength, matchLabel: entry.matchLabel, anonymousLabel: anon.anonymousLabel, signalScores: entry.signals, reasoning: entry.whyTheyMatch, status: 'generated' } },
                { upsert: true, new: true }
              );
              candidatesWithIds.push({ ...anon, matchRecordId: match._id, builderId: entry.builderId });
            }
            await Shortlist.findOneAndUpdate(
              { opportunityId: oppId },
              { $set: { opportunityId: oppId, founderEmail: email, totalMatches: ranked.length, strongMatchCount: strongCount, candidates: candidatesWithIds, previewGeneratedAt: new Date(), unlocked: true, unlockedAt: new Date() } },
              { upsert: true, new: true }
            );
            return { success: true, totalFound: ranked.length, strongMatches: strongCount, previewCount: candidates.length, message: `Found ${ranked.length} builders, ${strongCount} strong matches. Call get_shortlist to see them.` };
          }

          case 'get_shortlist': {
            if (!oppId) return { message: 'No active role. Create a role brief first.' };
            const shortlistDoc = await Shortlist.findOne({ opportunityId: oppId, founderEmail: email });
            if (!shortlistDoc) return { message: 'No search run yet. Use run_search to find candidates.' };
            if (shortlistDoc.unlocked) {
              const full = await buildFullCandidatesForShortlist(shortlistDoc, opp?.toObject ? opp.toObject() : opp, { BuilderProfile, ProjectRecord, MatchRecord });
              return {
                shortlistState: 'unlocked',
                totalMatches: shortlistDoc.totalMatches,
                candidates: full.filter((c: any) => !c.hidden).map((c: any) => ({
                  name: c.name,
                  builderId: c.builderId,
                  matchLabel: c.matchLabel,
                  topSkills: c.topSkills || [],
                  proofSummary: c.proofSummary,
                  availabilitySummary: c.availabilitySummary,
                  whyTheyMatch: c.whyTheyMatch,
                  status: c.matchStatus,
                })),
              };
            }
            return {
              shortlistState: 'locked',
              totalMatches: shortlistDoc.totalMatches,
              strongMatches: shortlistDoc.strongMatchCount,
              candidates: (shortlistDoc.candidates as any[] || []).map((c: any) => ({
                anonymousLabel: c.anonymousLabel,
                matchLabel: c.matchLabel,
                topSkills: c.topSkills || [],
                proofSummary: c.proofSummary,
                whyTheyMatch: c.whyTheyMatch,
              })),
              note: 'Shortlist is locked. Candidates are shown anonymously.',
            };
          }

          case 'get_candidate_details': {
            const queryName = String(args.name || '');
            if (!oppId) return { error: 'No active role.' };
            const shortlistDoc = await Shortlist.findOne({ opportunityId: oppId, founderEmail: email });
            if (!shortlistDoc) return { error: 'Run search first to get candidates.' };
            if (!shortlistDoc.unlocked) return { error: 'Shortlist is locked. Unlock to see individual candidate details.' };
            const full = await buildFullCandidatesForShortlist(shortlistDoc, opp?.toObject ? opp.toObject() : opp, { BuilderProfile, ProjectRecord, MatchRecord });
            const candidate = full.find((c: any) =>
              c.name?.toLowerCase().includes(queryName.toLowerCase()) ||
              String(c.anonymousLabel || '').toLowerCase().includes(queryName.toLowerCase())
            );
            if (!candidate) return { error: `Could not find candidate "${queryName}" in this shortlist.` };
            return {
              name: candidate.name,
              headline: candidate.headline,
              matchLabel: candidate.matchLabel,
              matchScore: candidate.matchScore,
              whyTheyMatch: candidate.whyTheyMatch,
              proofSummary: candidate.proofSummary,
              topSkills: candidate.topSkills || [],
              projects: (candidate.projects || []).slice(0, 4).map((p: any) => ({
                title: p.projectName,
                contribution: p.builderContribution,
                tech: p.techStack?.slice(0, 4),
                verified: p.verificationStatus === 'builder_confirmed',
              })),
              availability: candidate.availabilitySummary,
              status: candidate.matchStatus,
              builderId: candidate.builderId,
            };
          }

          case 'request_intro': {
            const builderName = String(args.builderName || '');
            const message = String(args.message || '');
            if (!oppId || !opp) return { error: 'No active role brief.' };
            if (!message || message.length < 20) return { error: 'Intro message must be at least 20 characters.' };
            const shortlistDoc = await Shortlist.findOne({ opportunityId: oppId, founderEmail: email });
            if (!shortlistDoc?.unlocked) return { error: 'Unlock the shortlist before requesting intros.' };
            const full = await buildFullCandidatesForShortlist(shortlistDoc, opp?.toObject ? opp.toObject() : opp, { BuilderProfile, ProjectRecord, MatchRecord });
            const candidate = full.find((c: any) => c.name?.toLowerCase().includes(builderName.toLowerCase()));
            if (!candidate) return { error: `Could not find "${builderName}" in this shortlist.` };
            const matchRecord = await MatchRecord.findOne({ builderId: candidate.builderId, opportunityId: oppId });
            if (!matchRecord) return { error: 'Match record not found for this candidate.' };
            // Create intro request
            const intro = await IntroRequest.findOneAndUpdate(
              { opportunityId: oppId, builderId: candidate.builderId },
              { $set: { opportunityId: oppId, builderId: candidate.builderId, matchRecordId: matchRecord._id, founderEmail: email, founderName, introMessage: message, status: 'requested' } },
              { upsert: true, new: true }
            );
            matchRecord.status = 'intro_requested';
            matchRecord.pipelineNextStep = 'Awaiting builder response';
            await matchRecord.save();
            // Notify builder
            const oppPlainForIntro = opp.toObject ? opp.toObject() : opp;
            const builderDoc = await BuilderProfile.findById(candidate.builderId).select('email').lean() as any;
            if (builderDoc?.email) {
              await notifyBuilderIntroReceived({
                builderId: String(candidate.builderId),
                builderEmail: String(builderDoc.email),
                founderName,
                roleTitle: oppPlainForIntro.roleTitle || 'Role',
                company: oppPlainForIntro.company || 'Startup',
                introRequestId: String(intro._id),
              });
            }
            void addFounderMemory(founderId, `Founder ${founderName} sent intro to "${builderName}" for role "${oppPlainForIntro.roleTitle}".`);
            return { success: true, builderName, introId: String(intro._id), message: `Intro request sent to ${builderName}.` };
          }

          default:
            return { error: `Unknown tool: ${name}` };
        }
      }

      // Build memory prefix
      const memoryProfile = await founderMemoryPromise;
      const memoryBlock = [
        founderStartupContext.company
          ? `\n\n[Founder startup context]\n- Company: ${founderStartupContext.company}${founderStartupContext.startupSummary ? `\n- Summary: ${founderStartupContext.startupSummary}` : ''}`
          : '',
        memoryProfile
          ? `\n\n[Founder memory]\n${[...((memoryProfile.static || []).slice(0, 5)), ...((memoryProfile.dynamic || []).slice(0, 3))].map((s) => `- ${s}`).join('\n')}`
          : '',
      ].join('');

      const chatHistory: Array<{ role: string; content: string }> = Array.isArray(payload?.history) ? payload.history : [];

      const messages: AgentMessage[] = [
        { role: 'system', content: FOUNDER_AGENT_SYSTEM_PROMPT + memoryBlock },
        ...chatHistory.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user', content: userText },
      ];

      // Agentic loop
      let agentResponse = await generateOpenRouterAgentTurn({ messages, tools: founderAgentTools, temperature: 0.3, maxTokens: 700 });

      let uiBlocks: any[] = [];
      const MAX_ITERATIONS = 5;
      let iterations = 0;
      let lastOpportunityId: string | null = payloadOpportunityId;

      while (agentResponse.tool_calls && agentResponse.tool_calls.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        messages.push({ role: 'assistant', content: agentResponse.content ?? null, tool_calls: agentResponse.tool_calls });

        const toolResults = await Promise.all(
          agentResponse.tool_calls.map(async (tc) => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
            console.log(`[agent/founder-agentic] tool_call: ${tc.function.name}`, args);
            const result = await runFounderTool(tc.function.name, args);

            // Update opportunityId if a role was created/updated
            if ((tc.function.name === 'create_role_brief' || tc.function.name === 'update_role_brief') && result.opportunityId) {
              lastOpportunityId = String(result.opportunityId);
            }
            // Generate UI blocks from role brief reads
            if (tc.function.name === 'get_role_brief' && !('error' in result) && !('message' in result) && currentOpportunity) {
              uiBlocks = buildFounderUiBlocks(currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity);
            }
            if (tc.function.name === 'create_role_brief' && result.success && currentOpportunity) {
              uiBlocks = buildFounderUiBlocks(currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity);
            }
            if (tc.function.name === 'update_role_brief' && result.success && currentOpportunity) {
              uiBlocks = buildFounderUiBlocks(currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity);
            }

            return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
          })
        );

        messages.push(...toolResults);
        agentResponse = await generateOpenRouterAgentTurn({ messages, tools: founderAgentTools, temperature: 0.3, maxTokens: 700 });
      }

      const finalMessage = agentResponse.content || 'I ran into an issue. Try again.';

      // Build final opportunity object for client
      const finalOpp = currentOpportunity
        ? (currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity)
        : null;

      const shortlistDoc = finalOpp
        ? await Shortlist.findOne({ opportunityId: String(finalOpp._id), founderEmail: email })
        : null;

      if (finalOpp && uiBlocks.length === 0) {
        uiBlocks = buildFounderUiBlocks(finalOpp);
      }

      const skipped = finalOpp?.skippedFields || [];
      const missingRequired = finalOpp ? getMissingRequiredFields(finalOpp, skipped) : [];

      console.log('[agent/actions] founder_chat:done', { founderId, iterations, toolsCalled: messages.filter(m => m.role === 'tool').length });

      return ok({
        message: finalMessage,
        opportunity: finalOpp,
        uiBlocks,
        session: finalOpp
          ? {
              currentSearchId: String(finalOpp._id),
              currentRoleBrief: finalOpp,
              skippedFields: skipped,
              missingRequiredFields: missingRequired,
              shortlistState: shortlistDoc?.unlocked ? 'unlocked' : shortlistDoc ? 'locked' : 'none',
            }
          : null,
        meta: { model: getOpenRouterChatModel(), iterations },
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

    // ── Phase 8: Candidate Feedback ──────────────────────────────────────────

    if (action === 'founder_save_candidate' || action === 'founder_reject_candidate') {
      const resolved = await resolveAuthedFounder(request);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email, founderName, decoded } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const builderName = String(payload?.builderName || '').trim();
      const reasonCategory = String(payload?.reasonCategory || 'other').trim();
      const reasonText = String(payload?.reasonText || payload?.reason || '').trim();
      const roleTitle = String(payload?.roleTitle || '').trim();

      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');

      const founderId = decoded?.userId ? String(decoded.userId) : email;
      const feedbackAction = action === 'founder_save_candidate' ? 'saved' : 'rejected';

      await CandidateFeedback.findOneAndUpdate(
        { founderId, opportunityId, builderId, action: feedbackAction },
        {
          $set: {
            founderId,
            founderEmail: email,
            opportunityId,
            builderId,
            builderName,
            action: feedbackAction,
            reasonCategory,
            reasonText,
            shouldAffectRanking: true,
          },
        },
        { upsert: true }
      );

      if (feedbackAction === 'rejected') {
        void writeFounderCandidateRejectionMemory(addFounderMemory, {
          founderId,
          founderName,
          builderId,
          builderName,
          opportunityId,
          roleTitle,
          reason: reasonText || reasonCategory,
          reasonCategory,
        });
      } else {
        void writeFounderCandidateSaveMemory(addFounderMemory, {
          founderId,
          founderName,
          builderId,
          builderName,
          opportunityId,
          roleTitle,
          reason: reasonText || reasonCategory,
          reasonCategory,
        });
      }

      // Update match record status
      const matchRecord = await MatchRecord.findOne({ builderId, opportunityId });
      if (matchRecord) {
        if (feedbackAction === 'rejected') {
          matchRecord.status = 'rejected';
        } else {
          matchRecord.status = 'saved';
        }
        await matchRecord.save();
      }

      return ok({
        message: feedbackAction === 'rejected' ? 'Candidate rejected.' : 'Candidate saved.',
        feedbackAction,
        builderId,
        opportunityId,
      });
    }

    return bad(`Unsupported action: ${action}`);
  } catch (error) {
    return bad(error instanceof Error ? error.message : 'Action failed', 500);
  }
};
