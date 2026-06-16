import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import type { EnrichedProfileDraft, EnrichedProjectDraft, SourceEnrichmentResult } from './types';

const MIN_REPO_SIZE_KB = 30;
const MIN_AUTHOR_COMMITS = 5;
const MAX_REPOS_TO_ENRICH = 12;
const MAX_REPO_AGE_MS = 3 * 365 * 24 * 60 * 60 * 1000;

const TUTORIAL_REPO_PATTERN =
  /(?:^|[-_/])(?:hello-?world|tutorial|course|bootcamp|leetcode|codecademy|freecodecamp|30-days|100-days|exercise|assignment|homework|starter|boilerplate|template|demo-app|sample-app|practice|learning|udemy|coursera|fork|clone)(?:$|[-_/])/i;

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
  if (TUTORIAL_REPO_PATTERN.test(repo.name)) return true;
  if (repo.description && TUTORIAL_REPO_PATTERN.test(repo.description)) return true;

  const pushedAt = new Date(repo.pushed_at).getTime();
  if (Number.isNaN(pushedAt) || Date.now() - pushedAt > MAX_REPO_AGE_MS) return true;

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

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function summarizeRepoForProfile(params: {
  repo: GithubRepo;
  username: string;
  languages: string[];
  readme: string | null;
  rootFiles: string[];
  authorCommits: number;
}): Promise<{ description: string | null; techStack: string[]; builderContribution: string | null }> {
  const { repo, languages, readme, rootFiles, authorCommits } = params;

  const fallbackDescription = repo.description?.trim() || null;
  const fallbackStack = Array.from(
    new Set([...(repo.topics || []), ...languages, repo.language].filter(Boolean) as string[])
  );

  if (!hasOpenRouterConfig()) {
    return {
      description: fallbackDescription,
      techStack: fallbackStack,
      builderContribution: fallbackDescription
        ? `Built and maintained ${repo.name} (${authorCommits}+ commits).`
        : null,
    };
  }

  const extraction = await generateOpenRouterReply({
    systemPrompt: `You summarize GitHub repos for a founder-facing builder profile.
Return strict JSON: description (max 300 chars), techStack (string[]), builderContribution (max 250 chars — what the developer shipped, be specific).
If there is no README, infer from repo metadata, languages, topics, and root files. Do not invent features not supported by the inputs.`,
    userPrompt: `Repo: ${repo.full_name}
GitHub description: ${repo.description || 'none'}
Topics: ${(repo.topics || []).join(', ') || 'none'}
Languages: ${languages.join(', ') || 'none'}
Primary language: ${repo.language || 'none'}
Stars: ${repo.stargazers_count}
Repo size (KB): ${repo.size}
Author commits (sampled): ${authorCommits}
Root files: ${rootFiles.join(', ') || 'none'}
README:
${readme || 'NO README — use metadata only'}`,
    temperature: 0,
    maxTokens: 600,
  });

  const parsed = parseJsonResponse(extraction);
  if (!parsed) {
    return {
      description: fallbackDescription,
      techStack: fallbackStack,
      builderContribution: fallbackDescription
        ? `Built and maintained ${repo.name} (${authorCommits}+ commits).`
        : null,
    };
  }

  return {
    description: typeof parsed.description === 'string' ? parsed.description : fallbackDescription,
    techStack: Array.isArray(parsed.techStack)
      ? parsed.techStack.map(String).map((s) => s.trim()).filter(Boolean)
      : fallbackStack,
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
  builderName?: string
): Promise<{ profile: EnrichedProfileDraft; projects: EnrichedProjectDraft[]; meta: Record<string, unknown> }> {
  const [userRes, repos] = await Promise.all([
    githubFetch(`/users/${encodeURIComponent(username)}`),
    listUserRepos(username),
  ]);

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
    .slice(0, 40);

  const scored: Array<{ repo: GithubRepo; authorCommits: number }> = [];
  for (const repo of candidates) {
    const [owner, name] = repo.full_name.split('/');
    const authorCommits = await getAuthorCommitCount(owner, name, username);
    if (authorCommits < MIN_AUTHOR_COMMITS) continue;
    scored.push({ repo, authorCommits });
  }

  scored.sort((a, b) => {
    const scoreA = a.authorCommits * 2 + a.repo.stargazers_count + a.repo.size / 100;
    const scoreB = b.authorCommits * 2 + b.repo.stargazers_count + b.repo.size / 100;
    return scoreB - scoreA;
  });

  const selected = scored.slice(0, MAX_REPOS_TO_ENRICH);
  const projects: EnrichedProjectDraft[] = [];
  const allSkills = new Set<string>();

  for (const { repo, authorCommits } of selected) {
    const [owner, name] = repo.full_name.split('/');
    const [languages, readme, rootFiles] = await Promise.all([
      getRepoLanguages(owner, name),
      getReadmeText(owner, name),
      getRootFileNames(owner, name),
    ]);

    const summary = await summarizeRepoForProfile({
      repo,
      username,
      languages,
      readme,
      rootFiles,
      authorCommits,
    });

    summary.techStack.forEach((skill) => allSkills.add(skill));

    projects.push({
      projectName: repo.name,
      description: summary.description,
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

  profile.rolePreference = Array.from(allSkills);

  return {
    profile,
    projects,
    meta: {
      username,
      reposScanned: repos.length,
      reposQualified: scored.length,
      reposEnriched: projects.length,
    },
  };
}

export async function enrichFromGithub(builder: any): Promise<SourceEnrichmentResult> {
  const username = parseGithubUsername(builder?.links?.github);
  if (!username) {
    return { source: 'github', errors: ['no_github_username'] };
  }

  try {
    const result = await enrichGithubReposForUser(username, builder?.name);
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
