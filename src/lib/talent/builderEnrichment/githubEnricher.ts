import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import type { EnrichedProfileDraft, EnrichedProjectDraft, SourceEnrichmentResult } from './types';

const MIN_REPO_SIZE_KB = 30;
const MIN_AUTHOR_COMMITS = 3;
const MAX_REPOS_TO_ENRICH = 3;
const MAX_REPO_AGE_MS = 3 * 365 * 24 * 60 * 60 * 1000;

const TUTORIAL_REPO_PATTERN =
  /(?:^|[-_/])(?:hello-?world|tutorial|course|bootcamp|leetcode|codecademy|freecodecamp|30-days|100-days|exercise|assignment|homework|starter|boilerplate|template|demo-app|sample-app|practice|learning|udemy|coursera|fork|clone|counter|calculator|todo|flask|cdn-worker)(?:$|[-_/])/i;
const CLASSWORK_REPO_PATTERN = /(?:^|[-_/])(?:cse|cs|cis|ser|ece|mat)\d{3,}|(?:^|[-_/])a\d{1,3}(?:$|[-_/])|(?:^|[-_/])(?:lab|hw)\d{1,3}(?:$|[-_/])/i;
const LOW_SIGNAL_NAME_PATTERN = /(?:landing-?page|github\.io|portfolio|resume-site|profile-readme)/i;
const HIGH_SIGNAL_NAME_PATTERN = /(?:agent|api|app|platform|calendar|room|scheduler|workflow|assistant|ai|ml|realtime|chat|automation|mobile|fullstack|dashboard|saas|moderator|detector|computer-?vision)/i;

const MANIFEST_FILES = [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'next.config.js',
  'next.config.mjs',
  'vite.config.ts',
  'vite.config.js',
  'tailwind.config.ts',
  'tailwind.config.js',
  'wrangler.toml',
  'prisma/schema.prisma',
  'Dockerfile',
  'docker-compose.yml',
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'pubspec.yaml',
  'firebase.json',
  'supabase/config.toml',
  'serverless.yml',
];

type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  archived: boolean;
  disabled?: boolean;
  size: number;
  stargazers_count: number;
  pushed_at: string;
  homepage: string | null;
  topics?: string[];
  language: string | null;
  owner: { login: string };
};

type ManifestContext = {
  path: string;
  text: string;
};

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function githubFetch(path: string): Promise<Response> {
  const url = path.startsWith('https://') ? path : `https://api.github.com${path}`;
  return fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(20000) });
}

function parseGithubUsername(githubUrl: string | null | undefined): string | null {
  if (!githubUrl) return null;
  try {
    const parsed = new URL(githubUrl);
    if (!parsed.hostname.toLowerCase().includes('github.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === 'orgs' || parts[0] === 'users') return parts[1] || null;
    return parts[0];
  } catch {
    return null;
  }
}

function isLowSignalRepo(repo: GithubRepo): boolean {
  if (repo.archived || repo.disabled) return true;
  if (repo.fork) return true;
  if (repo.size < MIN_REPO_SIZE_KB) return true;
  if (repo.owner?.login && repo.name.toLowerCase() === repo.owner.login.toLowerCase()) return true;
  if (TUTORIAL_REPO_PATTERN.test(repo.name)) return true;
  if (CLASSWORK_REPO_PATTERN.test(repo.name)) return true;
  if (LOW_SIGNAL_NAME_PATTERN.test(repo.name)) return true;
  if (repo.description && TUTORIAL_REPO_PATTERN.test(repo.description)) return true;
  if (repo.description && LOW_SIGNAL_NAME_PATTERN.test(repo.description)) return true;

  const pushedAt = new Date(repo.pushed_at).getTime();
  if (Number.isNaN(pushedAt) || Date.now() - pushedAt > MAX_REPO_AGE_MS) return true;

  return false;
}

function isStrongProjectRepo(repo: GithubRepo): boolean {
  const signalText = `${repo.name} ${repo.description || ''}`;
  if (HIGH_SIGNAL_NAME_PATTERN.test(signalText)) return true;
  if ((repo.topics || []).length >= 2) return true;
  if (repo.homepage && repo.size >= 5000) return true;
  if (repo.stargazers_count >= 2 && repo.size >= 5000) return true;
  return false;
}

async function getAuthorCommitCount(owner: string, repo: string, author: string): Promise<number> {
  const res = await githubFetch(
    `/repos/${owner}/${repo}/commits?author=${encodeURIComponent(author)}&per_page=100`
  );
  if (!res.ok) return 0;
  const commits = await res.json();
  return Array.isArray(commits) ? commits.length : 0;
}

async function getRepoLanguages(owner: string, repo: string): Promise<string[]> {
  const res = await githubFetch(`/repos/${owner}/${repo}/languages`);
  if (!res.ok) return [];
  const langs = await res.json();
  return Object.keys(langs || {}).slice(0, 8);
}

async function getReadmeText(owner: string, repo: string): Promise<string | null> {
  const res = await githubFetch(`/repos/${owner}/${repo}/readme`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.content || data.encoding !== 'base64') return null;
  try {
    const decoded = Buffer.from(data.content, 'base64').toString('utf8');
    return decoded.slice(0, 6000);
  } catch {
    return null;
  }
}

async function getRootFileNames(owner: string, repo: string): Promise<string[]> {
  const res = await githubFetch(`/repos/${owner}/${repo}/contents`);
  if (!res.ok) return [];
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  return items
    .map((item: any) => item?.name)
    .filter((name: unknown) => typeof name === 'string')
    .slice(0, 20);
}

async function getRepoFileText(owner: string, repo: string, pathName: string): Promise<string | null> {
  const res = await githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(pathName).replace(/%2F/g, '/')}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.content || data.encoding !== 'base64') return null;
  try {
    return Buffer.from(data.content, 'base64').toString('utf8').slice(0, 12000);
  } catch {
    return null;
  }
}

async function getManifestContext(owner: string, repo: string): Promise<ManifestContext[]> {
  const entries = await Promise.all(
    MANIFEST_FILES.map(async (pathName) => {
      const text = await getRepoFileText(owner, repo, pathName);
      return text ? { path: pathName, text } : null;
    })
  );
  return entries.filter(Boolean) as ManifestContext[];
}

function addSkill(skills: Set<string>, skill: string) {
  const trimmed = skill.trim();
  if (trimmed) skills.add(trimmed);
}

function detectPackageJsonSkills(text: string, skills: Set<string>) {
  try {
    const parsed = JSON.parse(text);
    const deps = {
      ...(parsed.dependencies || {}),
      ...(parsed.devDependencies || {}),
      ...(parsed.peerDependencies || {}),
    };
    const names = Object.keys(deps).join('\n').toLowerCase();

    const checks: Array<[string, RegExp]> = [
      ['React', /\breact\b/],
      ['Next.js', /\bnext\b/],
      ['Vite', /\bvite\b/],
      ['TypeScript', /\btypescript\b/],
      ['Node.js', /\bnode\b|@types\/node/],
      ['Express', /\bexpress\b/],
      ['Hono', /\bhono\b/],
      ['tRPC', /\btrpc\b|@trpc\//],
      ['GraphQL', /\bgraphql\b|apollo/],
      ['Tailwind CSS', /\btailwindcss\b/],
      ['shadcn/ui', /shadcn|radix-ui/],
      ['Prisma', /\bprisma\b|@prisma\//],
      ['MongoDB', /\bmongodb\b|mongoose/],
      ['PostgreSQL', /\bpg\b|postgres/],
      ['Redis', /\bredis\b|ioredis|upstash/],
      ['Supabase', /\bsupabase\b/],
      ['Firebase', /\bfirebase\b/],
      ['Cloudflare Workers', /wrangler|@cloudflare\/workers-types/],
      ['Durable Objects', /durable-object|partykit/],
      ['WebSockets', /\bws\b|socket\.io/],
      ['OpenAI API', /\bopenai\b/],
      ['LangChain', /langchain|langgraph/],
      ['Stripe', /\bstripe\b/],
      ['Clerk', /\bclerk\b|@clerk\//],
      ['Auth.js', /next-auth|auth\.js/],
      ['Playwright', /\bplaywright\b/],
      ['Vitest', /\bvitest\b/],
      ['Zod', /\bzod\b/],
      ['Vercel', /@vercel\//],
    ];

    for (const [skill, regex] of checks) {
      if (regex.test(names)) addSkill(skills, skill);
    }
  } catch {
    // Non-JSON package files are ignored.
  }
}

function inferTechStackFromSignals(params: {
  repo: GithubRepo;
  languages: string[];
  readme: string | null;
  rootFiles: string[];
  manifests: ManifestContext[];
}) {
  const { repo, languages, readme, rootFiles, manifests } = params;
  const skills = new Set<string>();
  const allText = [
    repo.name,
    repo.description || '',
    ...(repo.topics || []),
    ...rootFiles,
    readme || '',
    ...manifests.map((manifest) => `${manifest.path}\n${manifest.text}`),
  ].join('\n').toLowerCase();

  for (const language of languages) addSkill(skills, language);
  if (repo.language) addSkill(skills, repo.language);

  for (const manifest of manifests) {
    if (manifest.path === 'package.json') detectPackageJsonSkills(manifest.text, skills);
    if (manifest.path === 'pubspec.yaml') {
      addSkill(skills, 'Flutter');
      addSkill(skills, 'Dart');
      if (/firebase_core|cloud_firestore|firebase_auth/i.test(manifest.text)) addSkill(skills, 'Firebase');
      if (/supabase_flutter/i.test(manifest.text)) addSkill(skills, 'Supabase');
      if (/sqflite|drift/i.test(manifest.text)) addSkill(skills, 'SQLite');
    }
    if (/requirements\.txt|pyproject\.toml|Pipfile/.test(manifest.path)) {
      addSkill(skills, 'Python');
      if (/fastapi/i.test(manifest.text)) addSkill(skills, 'FastAPI');
      if (/flask/i.test(manifest.text)) addSkill(skills, 'Flask');
      if (/django/i.test(manifest.text)) addSkill(skills, 'Django');
      if (/sqlalchemy|psycopg|asyncpg/i.test(manifest.text)) addSkill(skills, 'PostgreSQL');
      if (/pymongo|motor/i.test(manifest.text)) addSkill(skills, 'MongoDB');
      if (/redis/i.test(manifest.text)) addSkill(skills, 'Redis');
      if (/openai/i.test(manifest.text)) addSkill(skills, 'OpenAI API');
      if (/langchain|llama-index/i.test(manifest.text)) addSkill(skills, 'LLM orchestration');
      if (/pandas|numpy/i.test(manifest.text)) addSkill(skills, 'Data processing');
    }
  }

  const textChecks: Array<[string, RegExp]> = [
    ['React', /\breact\b/],
    ['Next.js', /\bnext\.?js\b/],
    ['Astro', /\bastro\b/],
    ['Tailwind CSS', /\btailwind\b/],
    ['Node.js', /\bnode\.?js\b/],
    ['Express', /\bexpress\b/],
    ['FastAPI', /\bfastapi\b/],
    ['Flutter', /\bflutter\b/],
    ['Firebase', /\bfirebase|firestore\b/],
    ['Supabase', /\bsupabase\b/],
    ['MongoDB', /\bmongodb|mongoose\b/],
    ['PostgreSQL', /\bpostgres|postgresql\b/],
    ['Prisma', /\bprisma\b/],
    ['Redis', /\bredis\b/],
    ['Cloudflare Workers', /\bcloudflare workers|wrangler\b/],
    ['Durable Objects', /\bdurable objects?\b/],
    ['WebSockets', /\bwebsocket|socket\.io\b/],
    ['OpenAI API', /\bopenai|gpt-|chatgpt\b/],
    ['LLM orchestration', /\blangchain|langgraph|llamaindex|rag\b/],
    ['Docker', /\bdocker\b|dockerfile|docker-compose/],
    ['Vercel', /\bvercel\b/],
    ['Stripe', /\bstripe\b/],
    ['REST APIs', /\brest api|api server|backend api\b/],
    ['Authentication', /\bauthentication|auth\b|oauth|clerk|next-auth/],
    ['Realtime systems', /\brealtime|real-time|pubsub|streaming\b/],
  ];

  for (const [skill, regex] of textChecks) {
    if (regex.test(allText)) addSkill(skills, skill);
  }

  return Array.from(skills).slice(0, 16);
}

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function extractProblemFromReadme(readme: string | null): string | null {
  if (!readme) return null;
  const lines = readme.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const startIdx = lines.findIndex((line) =>
    /^(#+\s*)?(about|overview|problem|what it does|description|motivation|why)/i.test(line)
  );
  const body = (startIdx >= 0 ? lines.slice(startIdx + 1, startIdx + 8) : lines.slice(0, 6))
    .filter((line) => !/^#+\s/.test(line) && !/^[-*]\s/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return body ? body.slice(0, 220) : null;
}

async function summarizeRepoForProfile(params: {
  repo: GithubRepo;
  username: string;
  languages: string[];
  readme: string | null;
  rootFiles: string[];
  manifests: ManifestContext[];
  inferredStack: string[];
  authorCommits: number;
}): Promise<{ description: string | null; problemSolved: string | null; techStack: string[]; builderContribution: string | null }> {
  const { repo, languages, readme, rootFiles, manifests, inferredStack, authorCommits } = params;

  const fallbackDescription = repo.description?.trim() || extractProblemFromReadme(readme);
  const fallbackProblem = extractProblemFromReadme(readme) || repo.description?.trim() || null;
  const fallbackStack = Array.from(
    new Set([...inferredStack, ...(repo.topics || []), ...languages, repo.language].filter(Boolean) as string[])
  );

  if (!hasOpenRouterConfig()) {
    return {
      description: fallbackDescription,
      problemSolved: fallbackProblem,
      techStack: fallbackStack,
      builderContribution: fallbackDescription
        ? `Built and maintained ${repo.name} (${authorCommits}+ commits).`
        : null,
    };
  }

  const extraction = await generateOpenRouterReply({
    systemPrompt: `You summarize GitHub repos for a founder-facing builder profile.
Return strict JSON:
{
  "description": "string | null (max 300 chars — what the project is)",
  "problemSolved": "string | null (max 220 chars — user/customer problem addressed)",
  "techStack": "string[] (concrete technologies)",
  "builderContribution": "string | null (max 250 chars — what this developer shipped, be specific about features/architecture)"
}
If there is no README, infer from repo metadata, languages, topics, and root files. Do not invent features not supported by the inputs.`,
    userPrompt: `Repo: ${repo.full_name}
GitHub description: ${repo.description || 'none'}
Topics: ${(repo.topics || []).join(', ') || 'none'}
Languages: ${languages.join(', ') || 'none'}
Detected stack from files: ${inferredStack.join(', ') || 'none'}
Primary language: ${repo.language || 'none'}
Stars: ${repo.stargazers_count}
Repo size (KB): ${repo.size}
Author commits (sampled): ${authorCommits}
Root files: ${rootFiles.join(', ') || 'none'}
Manifest excerpts:
${manifests.map((manifest) => `--- ${manifest.path} ---\n${manifest.text.slice(0, 3000)}`).join('\n\n') || 'none'}
README:
${readme || 'NO README — use metadata only'}`,
    temperature: 0,
    maxTokens: 700,
  });

  const parsed = parseJsonResponse(extraction);
  if (!parsed) {
    return {
      description: fallbackDescription,
      problemSolved: fallbackProblem,
      techStack: fallbackStack,
      builderContribution: fallbackDescription
        ? `Built and maintained ${repo.name} (${authorCommits}+ commits).`
        : null,
    };
  }

  return {
    description: typeof parsed.description === 'string' ? parsed.description : fallbackDescription,
    problemSolved:
      typeof parsed.problemSolved === 'string'
        ? parsed.problemSolved
        : fallbackProblem,
    techStack: Array.from(new Set([
      ...(Array.isArray(parsed.techStack)
        ? parsed.techStack.map(String).map((s) => s.trim()).filter(Boolean)
        : []),
      ...fallbackStack,
    ])).slice(0, 16),
    builderContribution:
      typeof parsed.builderContribution === 'string' ? parsed.builderContribution : null,
  };
}

async function listUserRepos(username: string): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  let page = 1;

  while (page <= 3) {
    const res = await githubFetch(
      `/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=pushed&direction=desc&type=owner`
    );
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  return repos;
}

export async function enrichGithubReposForUser(
  username: string,
  builderName?: string,
  opts?: { onProgress?: (brief: string) => void | Promise<void> }
): Promise<{ profile: EnrichedProfileDraft; projects: EnrichedProjectDraft[]; meta: Record<string, unknown> }> {
  const report = async (brief: string) => {
    try {
      await opts?.onProgress?.(brief);
    } catch {
      /* ignore */
    }
  };

  await report(`Fetching github.com/${username}`);
  const [userRes, repos] = await Promise.all([
    githubFetch(`/users/${encodeURIComponent(username)}`),
    listUserRepos(username),
  ]);
  await report(`Found ${repos.length} public repos for ${username}`);

  const profile: EnrichedProfileDraft = {
    links: { github: `https://github.com/${username}` },
  };

  if (userRes.ok) {
    const user = await userRes.json();
    if (!builderName && user.bio) profile.bio = String(user.bio).slice(0, 500);
    if (user.company) profile.universityOrCompany = String(user.company);
  }

  const candidates = repos
    .filter((repo) => !isLowSignalRepo(repo))
    .filter(isStrongProjectRepo)
    .slice(0, 40);

  const scored: Array<{ repo: GithubRepo; authorCommits: number }> = [];
  for (const repo of candidates) {
    const [owner, name] = repo.full_name.split('/');
    await report(`Scoring commits on github.com/${repo.full_name}`);
    const authorCommits = await getAuthorCommitCount(owner, name, username);
    if (authorCommits < MIN_AUTHOR_COMMITS) continue;
    scored.push({ repo, authorCommits });
  }

  scored.sort((a, b) => {
    const score = ({ repo, authorCommits }: { repo: GithubRepo; authorCommits: number }) => {
      const nameSignal = HIGH_SIGNAL_NAME_PATTERN.test(`${repo.name} ${repo.description || ''}`) ? 35 : 0;
      const topicSignal = (repo.topics || []).length * 3;
      const homepageSignal = repo.homepage ? 8 : 0;
      return authorCommits * 2 + repo.stargazers_count * 4 + Math.min(repo.size / 120, 35) + topicSignal + homepageSignal + nameSignal;
    };
    const scoreA = score(a);
    const scoreB = score(b);
    return scoreB - scoreA;
  });

  const selected = scored.slice(0, MAX_REPOS_TO_ENRICH);
  const projects: EnrichedProjectDraft[] = [];
  const allSkills = new Set<string>();

  // Skills from every substantive repo (not just the top 3 showcased projects).
  for (const repo of repos) {
    if (repo.fork || repo.archived || repo.disabled) continue;
    if (repo.language) allSkills.add(repo.language);
    for (const topic of repo.topics || []) addSkill(allSkills, topic);
  }

  for (const { repo, authorCommits } of selected) {
    const [owner, name] = repo.full_name.split('/');
    await report(`Reading README + stack for github.com/${repo.full_name}`);
    const [languages, readme, rootFiles, manifests] = await Promise.all([
      getRepoLanguages(owner, name),
      getReadmeText(owner, name),
      getRootFileNames(owner, name),
      getManifestContext(owner, name),
    ]);
    const inferredStack = inferTechStackFromSignals({
      repo,
      languages,
      readme,
      rootFiles,
      manifests,
    });

    await report(`Summarizing ${repo.full_name} for your profile`);
    const summary = await summarizeRepoForProfile({
      repo,
      username,
      languages,
      readme,
      rootFiles,
      manifests,
      inferredStack,
      authorCommits,
    });

    summary.techStack.forEach((skill) => allSkills.add(skill));

    projects.push({
      projectName: repo.name,
      description: summary.description,
      problemSolved: summary.problemSolved,
      techStack: summary.techStack,
      builderContribution: summary.builderContribution,
      links: {
        github: repo.html_url,
        demo: repo.homepage || null,
      },
      source: 'github_profile_enrichment',
      sourceId: repo.html_url,
      verificationStatus: 'imported_unverified',
      confidence: Math.min(0.95, 0.7 + Math.min(authorCommits, 20) * 0.01),
    });
  }

  profile.skills = Array.from(allSkills).slice(0, 32);

  const shippedRepoCount = repos.filter((r) => !r.fork && !r.archived && !r.disabled && r.size >= MIN_REPO_SIZE_KB).length;
  const additionalProjectsCount = Math.max(0, shippedRepoCount - projects.length);
  const featuredNames = projects.map((p) => p.projectName).join(', ');
  const founderHighlight =
    projects.length > 0
      ? additionalProjectsCount > 0
        ? `Featured ${projects.length} flagship repos (${featuredNames}) — plus ${additionalProjectsCount} more shipped GitHub projects.`
        : `Featured flagship repos: ${featuredNames}.`
      : null;

  return {
    profile,
    projects,
    meta: {
      username,
      reposScanned: repos.length,
      reposQualified: scored.length,
      reposEnriched: projects.length,
      shippedRepoCount,
      additionalProjectsCount,
      founderHighlight,
      featuredProjectNames: projects.map((p) => p.projectName),
    },
  };
}

export async function enrichFromGithub(
  builder: any,
  ctx?: { onProgress?: (brief: string) => void | Promise<void> }
): Promise<SourceEnrichmentResult> {
  const username = parseGithubUsername(builder?.links?.github);
  if (!username) {
    return { source: 'github', errors: ['no_github_username'] };
  }

  try {
    await ctx?.onProgress?.(`Listing public repos for github.com/${username}`);
    const result = await enrichGithubReposForUser(username, builder?.name, {
      onProgress: ctx?.onProgress,
    });
    return {
      source: 'github',
      profile: result.profile,
      projects: result.projects,
      meta: result.meta,
    };
  } catch (err) {
    return {
      source: 'github',
      errors: [err instanceof Error ? err.message : 'github_enrichment_failed'],
    };
  }
}

export const GITHUB_ENRICHMENT_TUNING = {
  MIN_REPO_SIZE_KB,
  MIN_AUTHOR_COMMITS,
  MAX_REPOS_TO_ENRICH,
  MAX_REPO_AGE_MS,
} as const;

function githubRepoFilterReasons(repo: GithubRepo): string[] {
  const reasons: string[] = [];
  if (repo.archived) reasons.push('archived');
  if (repo.disabled) reasons.push('disabled');
  if (repo.fork) reasons.push('fork');
  if (repo.size < MIN_REPO_SIZE_KB) reasons.push(`size_lt_${MIN_REPO_SIZE_KB}kb`);
  if (repo.owner?.login && repo.name.toLowerCase() === repo.owner.login.toLowerCase()) {
    reasons.push('profile_readme_repo');
  }
  if (TUTORIAL_REPO_PATTERN.test(repo.name)) reasons.push('tutorial_name');
  if (CLASSWORK_REPO_PATTERN.test(repo.name)) reasons.push('classwork_name');
  if (LOW_SIGNAL_NAME_PATTERN.test(repo.name)) reasons.push('low_signal_name');
  const pushedAt = new Date(repo.pushed_at).getTime();
  if (Number.isNaN(pushedAt) || Date.now() - pushedAt > MAX_REPO_AGE_MS) reasons.push('stale');
  if (repo.description && TUTORIAL_REPO_PATTERN.test(repo.description)) reasons.push('tutorial_description');
  if (repo.description && LOW_SIGNAL_NAME_PATTERN.test(repo.description)) reasons.push('low_signal_description');
  return reasons;
}

/** Dry-run repo scoring — see which repos pass filters before LLM summarization. */
export async function auditGithubReposForUser(username: string) {
  const repos = await listUserRepos(username);
  const rows: Array<{
    name: string;
    fullName: string;
    url: string;
    sizeKb: number;
    stars: number;
    pushedAt: string;
    language: string | null;
    topics: string[];
    filterReasons: string[];
    passesLowSignalFilter: boolean;
    passesStrongSignal: boolean;
    authorCommits: number | null;
    wouldEnrich: boolean;
  }> = [];

  for (const repo of repos) {
    const filterReasons = githubRepoFilterReasons(repo);
    const passesLowSignalFilter = filterReasons.length === 0;
    const passesStrongSignal = isStrongProjectRepo(repo);
    let authorCommits: number | null = null;
    let wouldEnrich = false;

    if (passesLowSignalFilter && passesStrongSignal) {
      const [owner, name] = repo.full_name.split('/');
      authorCommits = await getAuthorCommitCount(owner, name, username);
      wouldEnrich = authorCommits >= MIN_AUTHOR_COMMITS;
    }

    rows.push({
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      sizeKb: repo.size,
      stars: repo.stargazers_count,
      pushedAt: repo.pushed_at,
      language: repo.language,
      topics: repo.topics || [],
      filterReasons,
      passesLowSignalFilter,
      passesStrongSignal,
      authorCommits,
      wouldEnrich,
    });
  }

  const qualified = rows.filter((r) => r.passesLowSignalFilter && r.passesStrongSignal && (r.authorCommits || 0) >= MIN_AUTHOR_COMMITS);
  qualified.sort((a, b) => {
    const score = (row: typeof rows[number]) =>
      (row.authorCommits || 0) * 2 +
      row.stars * 4 +
      Math.min(row.sizeKb / 120, 35) +
      (row.topics.length * 3);
    return score(b) - score(a);
  });

  return {
    username,
    tuning: GITHUB_ENRICHMENT_TUNING,
    reposScanned: repos.length,
    reposQualified: qualified.length,
    reposWouldEnrich: qualified.slice(0, MAX_REPOS_TO_ENRICH).map((r) => r.fullName),
    repos: rows.sort((a, b) => b.stars - a.stars || b.sizeKb - a.sizeKb),
    topQualified: qualified.slice(0, 10),
  };
}
