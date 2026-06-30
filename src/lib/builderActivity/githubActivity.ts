import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import type { BuilderActivityItem, BuilderGithubRef } from './types';

const CACHE_TTL_MS = 45_000;
const BUILDERS_TTL_MS = 10 * 60_000;
const BUILDERS_PER_REFRESH = 10;
const MAX_POOL = 160;

type GithubEvent = {
  id: string;
  type: string;
  actor: { login: string; avatar_url?: string };
  repo: { name: string; private?: boolean };
  payload: Record<string, unknown>;
  created_at: string;
};

type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  pushed_at: string;
  description: string | null;
  private?: boolean;
};

type GithubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { date?: string };
  };
};

type ActivityCache = {
  builders: BuilderGithubRef[];
  activities: BuilderActivityItem[];
  buildersFetchedAt: number;
  activitiesFetchedAt: number;
  builderCursor: number;
};

let cache: ActivityCache | null = null;

function githubHeaders(token?: string | null): Record<string, string> {
  const authToken = token || process.env.GITHUB_TOKEN || null;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

async function githubFetch(path: string, token?: string | null): Promise<Response> {
  const url = path.startsWith('https://') ? path : `https://api.github.com${path}`;
  return fetch(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(12_000) });
}

export function parseGithubUsername(githubUrl: string | null | undefined): string | null {
  if (!githubUrl) return null;
  try {
    const parsed = new URL(githubUrl.startsWith('http') ? githubUrl : `https://${githubUrl}`);
    if (!parsed.hostname.toLowerCase().includes('github.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === 'orgs' || parts[0] === 'users') return parts[1] || null;
    if (['settings', 'notifications', 'marketplace'].includes(parts[0])) return null;
    return parts[0];
  } catch {
    return null;
  }
}

function parseGithubRepo(githubUrl: string | null | undefined): { owner: string; repo: string } | null {
  if (!githubUrl) return null;
  try {
    const parsed = new URL(githubUrl.startsWith('http') ? githubUrl : `https://${githubUrl}`);
    if (!parsed.hostname.toLowerCase().includes('github.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function truncate(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function eventUrl(event: GithubEvent): string {
  if (event.type === 'PushEvent') {
    const commits = event.payload?.commits as Array<{ sha?: string }> | undefined;
    const sha = commits?.[0]?.sha;
    if (sha) return `https://github.com/${event.repo.name}/commit/${sha}`;
    return `https://github.com/${event.repo.name}`;
  }
  if (event.type === 'PullRequestEvent') {
    const pr = event.payload?.pull_request as { html_url?: string } | undefined;
    if (pr?.html_url) return pr.html_url;
  }
  if (event.type === 'IssuesEvent') {
    const issue = event.payload?.issue as { html_url?: string } | undefined;
    if (issue?.html_url) return issue.html_url;
  }
  if (event.type === 'CreateEvent') {
    const refType = event.payload?.ref_type;
    if (refType === 'repository') return `https://github.com/${event.repo.name}`;
  }
  return `https://github.com/${event.repo.name}`;
}

function normalizeEvent(
  event: GithubEvent,
  builder: BuilderGithubRef,
  options?: { isPrivate?: boolean }
): BuilderActivityItem | null {
  const repo = event.repo?.name || 'unknown/repo';
  const createdAt = event.created_at;
  const isPrivate = options?.isPrivate ?? Boolean(event.repo?.private);

  if (event.type === 'PushEvent') {
    const commits = (event.payload?.commits as Array<{ message?: string }> | undefined) || [];
    const message = commits[commits.length - 1]?.message || commits[0]?.message || 'Pushed new commits';
    const count = commits.length || 1;
    return {
      id: String(event.id),
      builderName: builder.name,
      githubUsername: builder.githubUsername,
      avatarUrl: builder.avatarUrl,
      kind: 'push',
      action: count > 1 ? `pushed ${count} commits` : 'pushed a commit',
      detail: truncate(message.split('\n')[0] || message, 88),
      repo,
      url: eventUrl(event),
      createdAt,
      isPrivate,
    };
  }

  if (event.type === 'PullRequestEvent') {
    const action = String(event.payload?.action || 'opened');
    const pr = event.payload?.pull_request as { title?: string; merged?: boolean } | undefined;
    const title = pr?.title || 'Pull request update';
    const verb =
      action === 'closed' && pr?.merged ? 'merged a PR' : action === 'opened' ? 'opened a PR' : `${action} a PR`;
    return {
      id: String(event.id),
      builderName: builder.name,
      githubUsername: builder.githubUsername,
      avatarUrl: builder.avatarUrl,
      kind: 'pr',
      action: verb,
      detail: truncate(title, 88),
      repo,
      url: eventUrl(event),
      createdAt,
      isPrivate,
    };
  }

  if (event.type === 'IssuesEvent') {
    const issue = event.payload?.issue as { title?: string } | undefined;
    const action = String(event.payload?.action || 'opened');
    return {
      id: String(event.id),
      builderName: builder.name,
      githubUsername: builder.githubUsername,
      avatarUrl: builder.avatarUrl,
      kind: 'issue',
      action: `${action} an issue`,
      detail: truncate(issue?.title || 'Issue update', 88),
      repo,
      url: eventUrl(event),
      createdAt,
      isPrivate,
    };
  }

  if (event.type === 'CreateEvent') {
    const refType = String(event.payload?.ref_type || 'repository');
    return {
      id: String(event.id),
      builderName: builder.name,
      githubUsername: builder.githubUsername,
      avatarUrl: builder.avatarUrl,
      kind: 'create',
      action: refType === 'repository' ? 'created a repo' : `created a ${refType}`,
      detail: repo.split('/')[1] || repo,
      repo,
      url: eventUrl(event),
      createdAt,
      isPrivate,
    };
  }

  if (event.type === 'ForkEvent') {
    return {
      id: String(event.id),
      builderName: builder.name,
      githubUsername: builder.githubUsername,
      avatarUrl: builder.avatarUrl,
      kind: 'fork',
      action: 'forked a repo',
      detail: repo,
      repo,
      url: eventUrl(event),
      createdAt,
      isPrivate,
    };
  }

  return null;
}

function commitActivity(
  commit: GithubCommit,
  builder: BuilderGithubRef,
  repoFullName: string,
  isPrivate = false
): BuilderActivityItem {
  const message = commit.commit?.message || 'New commit';
  return {
    id: `commit-${repoFullName}-${commit.sha}`,
    builderName: builder.name,
    githubUsername: builder.githubUsername,
    avatarUrl: builder.avatarUrl,
    kind: 'push',
    action: 'pushed a commit',
    detail: truncate(message.split('\n')[0] || message, 88),
    repo: repoFullName,
    url: commit.html_url,
    createdAt: commit.commit?.author?.date || new Date().toISOString(),
    isPrivate,
  };
}

function repoActivity(repo: GithubRepo, builder: BuilderGithubRef): BuilderActivityItem {
  return {
    id: `repo-${builder.githubUsername}-${repo.full_name}`,
    builderName: builder.name,
    githubUsername: builder.githubUsername,
    avatarUrl: builder.avatarUrl,
    kind: 'repo',
    action: 'shipped on',
    detail: truncate(repo.description || `Latest work on ${repo.name}`, 88),
    repo: repo.full_name,
    url: repo.html_url,
    createdAt: repo.pushed_at,
    isPrivate: Boolean(repo.private),
  };
}

async function fetchAuthenticatedEvents(
  builder: BuilderGithubRef,
  token: string
): Promise<BuilderActivityItem[]> {
  const res = await githubFetch('/user/events?per_page=30', token);
  if (!res.ok) return [];
  const events = (await res.json()) as GithubEvent[];
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => normalizeEvent(event, builder))
    .filter((item): item is BuilderActivityItem => Boolean(item));
}

async function fetchAuthenticatedRepoCommits(
  builder: BuilderGithubRef,
  token: string
): Promise<BuilderActivityItem[]> {
  const reposRes = await githubFetch(
    '/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=20&visibility=all',
    token
  );
  if (!reposRes.ok) return [];

  const repos = (await reposRes.json()) as GithubRepo[];
  if (!Array.isArray(repos) || repos.length === 0) return [];

  const activities: BuilderActivityItem[] = [];
  const recentRepos = repos.slice(0, 10);

  await Promise.all(
    recentRepos.map(async (repo) => {
      const commitsRes = await githubFetch(
        `/repos/${repo.full_name}/commits?author=${encodeURIComponent(builder.githubUsername)}&per_page=4`,
        token
      );
      if (!commitsRes.ok) return;
      const commits = (await commitsRes.json()) as GithubCommit[];
      if (!Array.isArray(commits)) return;
      for (const commit of commits) {
        activities.push(commitActivity(commit, builder, repo.full_name, Boolean(repo.private)));
      }
    })
  );

  return activities;
}

async function fetchKnownProjectCommits(builder: BuilderGithubRef): Promise<BuilderActivityItem[]> {
  const projects = await ProjectRecord.find({ builderId: builder.builderId })
    .select('links.github')
    .limit(12)
    .lean();

  const repos = new Set<string>();
  for (const project of projects) {
    const parsed = parseGithubRepo(project?.links?.github);
    if (parsed) repos.add(`${parsed.owner}/${parsed.repo}`);
  }

  const activities: BuilderActivityItem[] = [];
  await Promise.all(
    Array.from(repos).map(async (fullName) => {
      const commitsRes = await githubFetch(
        `/repos/${fullName}/commits?author=${encodeURIComponent(builder.githubUsername)}&per_page=3`
      );
      if (!commitsRes.ok) return;
      const commits = (await commitsRes.json()) as GithubCommit[];
      if (!Array.isArray(commits)) return;
      for (const commit of commits) {
        activities.push(commitActivity(commit, builder, fullName, true));
      }
    })
  );

  return activities;
}

async function fetchPublicEvents(builder: BuilderGithubRef): Promise<BuilderActivityItem[]> {
  const res = await githubFetch(
    `/users/${encodeURIComponent(builder.githubUsername)}/events/public?per_page=12`
  );
  if (res.ok) {
    const events = (await res.json()) as GithubEvent[];
    if (Array.isArray(events) && events.length > 0) {
      return events
        .map((event) => normalizeEvent(event, builder, { isPrivate: false }))
        .filter((item): item is BuilderActivityItem => Boolean(item));
    }
  }

  const reposRes = await githubFetch(
    `/users/${encodeURIComponent(builder.githubUsername)}/repos?per_page=3&sort=pushed&direction=desc&type=owner`
  );
  if (!reposRes.ok) return [];
  const repos = (await reposRes.json()) as GithubRepo[];
  if (!Array.isArray(repos)) return [];
  return repos.slice(0, 2).map((repo) => repoActivity(repo, builder));
}

async function fetchBuilderEvents(builder: BuilderGithubRef): Promise<BuilderActivityItem[]> {
  if (builder.accessToken) {
    const [events, commits, projectCommits] = await Promise.all([
      fetchAuthenticatedEvents(builder, builder.accessToken),
      fetchAuthenticatedRepoCommits(builder, builder.accessToken),
      fetchKnownProjectCommits(builder),
    ]);

    const merged = mergeActivities([], [...events, ...commits, ...projectCommits]);
    if (merged.length > 0) return merged;
  }

  const [publicEvents, projectCommits] = await Promise.all([
    fetchPublicEvents(builder),
    fetchKnownProjectCommits(builder),
  ]);

  return mergeActivities(publicEvents, projectCommits);
}

async function loadBuilders(): Promise<BuilderGithubRef[]> {
  await connectAdminDB();
  const docs = await BuilderProfile.find({
    $or: [
      { 'links.github': { $exists: true, $nin: [null, ''] } },
      { 'integrations.github.accessToken': { $exists: true, $nin: [null, ''] } },
    ],
  })
    .select('+integrations.github.accessToken name avatarUrl links.github integrations.github.username')
    .limit(400)
    .lean();

  const seen = new Set<string>();
  const builders: BuilderGithubRef[] = [];

  const orderedDocs = [...docs].sort((a, b) => {
    const aConnected = a?.integrations?.github?.accessToken ? 1 : 0;
    const bConnected = b?.integrations?.github?.accessToken ? 1 : 0;
    return bConnected - aConnected;
  });

  for (const doc of orderedDocs) {
    const githubUsername =
      doc?.integrations?.github?.username ||
      parseGithubUsername(doc?.links?.github);
    if (!githubUsername || seen.has(githubUsername.toLowerCase())) continue;
    seen.add(githubUsername.toLowerCase());
    builders.push({
      builderId: String(doc._id),
      name: String(doc.name || githubUsername),
      githubUsername,
      avatarUrl: doc.avatarUrl ? String(doc.avatarUrl) : null,
      accessToken: doc?.integrations?.github?.accessToken
        ? String(doc.integrations.github.accessToken)
        : null,
    });
  }

  return builders;
}

function mergeActivities(pool: BuilderActivityItem[], incoming: BuilderActivityItem[]): BuilderActivityItem[] {
  const map = new Map<string, BuilderActivityItem>();
  for (const item of [...incoming, ...pool]) {
    map.set(item.id, item);
  }
  return Array.from(map.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_POOL);
}

async function refreshActivities(state: ActivityCache): Promise<void> {
  if (state.builders.length === 0) return;

  const connected = state.builders.filter((builder) => builder.accessToken);
  const publicOnly = state.builders.filter((builder) => !builder.accessToken);
  const ordered = [...connected, ...publicOnly];

  const slice: BuilderGithubRef[] = [];
  for (let i = 0; i < BUILDERS_PER_REFRESH; i += 1) {
    const builder = ordered[state.builderCursor % ordered.length];
    state.builderCursor += 1;
    slice.push(builder);
  }

  const batches = await Promise.all(slice.map((builder) => fetchBuilderEvents(builder)));
  const incoming = batches.flat();
  if (incoming.length === 0 && state.activities.length > 0) {
    state.activitiesFetchedAt = Date.now();
    return;
  }

  state.activities = mergeActivities(state.activities, incoming);
  state.activitiesFetchedAt = Date.now();
}

async function ensureCache(): Promise<ActivityCache> {
  const now = Date.now();

  if (!cache) {
    cache = {
      builders: [],
      activities: [],
      buildersFetchedAt: 0,
      activitiesFetchedAt: 0,
      builderCursor: 0,
    };
  }

  if (now - cache.buildersFetchedAt > BUILDERS_TTL_MS || cache.builders.length === 0) {
    cache.builders = await loadBuilders();
    cache.buildersFetchedAt = now;
    cache.builderCursor = 0;
  }

  if (now - cache.activitiesFetchedAt > CACHE_TTL_MS || cache.activities.length === 0) {
    await refreshActivities(cache);
  }

  return cache;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function getBuilderGithubActivity(limit = 24): Promise<{
  activities: BuilderActivityItem[];
  builderCount: number;
  connectedCount: number;
  refreshedAt: string;
}> {
  const state = await ensureCache();

  if (state.activities.length === 0 && state.builders.length > 0) {
    await refreshActivities(state);
  }

  const activities = shuffle(state.activities).slice(0, Math.min(limit, state.activities.length));
  const connectedCount = state.builders.filter((builder) => builder.accessToken).length;

  return {
    activities,
    builderCount: state.builders.length,
    connectedCount,
    refreshedAt: new Date(state.activitiesFetchedAt || Date.now()).toISOString(),
  };
}

export function formatActivityForDisplay(item: BuilderActivityItem) {
  return {
    ...item,
    displayName: firstName(item.builderName),
    initials: initials(item.builderName),
  };
}

export function invalidateBuilderActivityCache() {
  cache = null;
}
