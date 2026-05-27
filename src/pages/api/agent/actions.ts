import type { APIRoute } from 'astro';
import { connectDB } from '@/lib/mongodb';
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
        'You are the Builder Profile Agent for a talent marketplace connecting builders with founders. Your goal is to help builders improve their profile quality and proof-of-work so they can get hired. Be concise, specific, and useful. Never invent data. If the user asks about their current profile (headline/bio/summary), summarize it accurately based on the context provided. Provide actionable advice to improve their profile quality. Keep most replies under 2-4 sentences. Ask one follow-up question at a time. You can use markdown formatting like bold text, bullet points, and paragraph breaks to make your responses more readable.',
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

async function applyClaimProfile(builder: any, claimConfirmed: boolean) {
  if (claimConfirmed) builder.verificationStatus = 'builder_confirmed';
  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;
  await builder.save();
  return completion;
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
  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;
  await builder.save();
  return completion;
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

  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;
  await builder.save();
  return completion;
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
        hoursPerWeek: 10,
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
  if (updates.headline !== undefined) builder.headline = updates.headline;
  if (updates.bio !== undefined) builder.bio = updates.bio;
  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;
  await builder.save();
  return completion;
}

async function applyRoleSkillUpdate(builder: any, updates: { roles?: string[]; skills?: string[] }) {
  const existing = new Set<string>((builder.rolePreference || []).map((value: string) => value.trim()));
  (updates.roles || []).forEach((role) => existing.add(role));
  (updates.skills || []).forEach((skill) => existing.add(skill));
  builder.rolePreference = Array.from(existing);

  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;
  await builder.save();
  return completion;
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

  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;
  await builder.save();
  return completion;
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
    await connectDB();
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
              'You route builder chat into tools. Return strict JSON with keys: tool, args. Tools: claim_profile, update_availability, update_links, update_role_skills, update_work_preferences, update_profile_basics, read_profile_basics, link_summary, profile_summary, recommend_next_steps, suggest_evidence_improvements, evaluate_profile_quality, import_project, create_project, list_projects, read_project, update_project, delete_project, none. Never request any ID. args for import_project: url(string). Project CRUD args may include projectName, newProjectName, description, problemSolved, builderContribution, techStack(string[]), contributionTags(string[]), githubUrl, demoUrl, devpostUrl, status, confirmDelete(boolean). args for update_availability: availableNow(boolean optional), hoursPerWeek(number optional), desiredCompensation(string optional), remotePreference(remote|hybrid|in_person|unspecified optional). args for update_links: github(string optional), linkedin(string optional), resume(string optional). args for update_work_preferences: preferredWorkTypes(string[]), availableNow(boolean optional). args for update_profile_basics: headline(string optional), bio(string optional). No markdown.',
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

      const projects = await ProjectRecord.find({ builderId: builder._id }).select('projectName techStack links').lean();
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
            const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
            const completion = computeBuilderScores(builder, projects);
            if (builder.profileCompletion?.score !== completion.score) {
              builder.profileCompletion = completion;
              await builder.save();
            }
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
          const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
          const completion = computeBuilderScores(builder, projects);
          builder.profileCompletion = completion;
          await builder.save();
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
                  : tool === 'import_project'
                    ? (importProjectMessage || `I could not import that project yet. Please try a valid Devpost or GitHub project URL.`)
                    : tool === 'create_project' || tool === 'list_projects' || tool === 'read_project' || tool === 'update_project' || tool === 'delete_project'
                      ? (projectCrudMessage || 'I handled that project request.')
                    : `I can do this from your login: claim profile, update availability, summarize your profile, suggest next steps, or improve proof-of-work evidence.`;

      const deterministicOnlyTools = new Set(['import_project', 'create_project', 'list_projects', 'read_project', 'update_project', 'delete_project', 'read_profile_basics']);
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
              builderName: builder.name,
              headline: builder.headline,
              bio: builder.bio,
              rolePreference: builder.rolePreference,
              preferredWorkType: builder.preferredWorkType,
              availability: builder.availability,
              links: builder.links,
              completion,
              profileQuality: builder.profileQuality,
              projects: projects.map(p => ({ title: p.projectName, description: p.description, contribution: p.builderContribution })),
              mustNeverAskForBuilderId: true,
            },
            history: Array.isArray(payload?.history) ? payload.history : undefined,
          });
      console.log('[agent/actions] builder_chat:final', {
        builderId: String(builder._id),
        tool,
        importProjectFailed,
        uiBlocks: uiBlocks.map((block) => block.type),
      });

      return ok({
        message,
        uiBlocks,
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
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
      });
    }

    return bad(`Unsupported action: ${action}`);
  } catch (error) {
    return bad(error instanceof Error ? error.message : 'Action failed', 500);
  }
};
