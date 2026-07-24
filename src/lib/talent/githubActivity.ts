/**
 * Live GitHub activity snapshots for founder discovery ranking.
 * Uses GITHUB_TOKEN when present; caches on BuilderProfile.integrations.github.
 */

const ACTIVITY_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_PARALLEL_FETCHES = 8;

export type GithubActivitySnapshot = {
  username: string;
  score: number;
  publicRepos: number;
  followers: number;
  recentEventCount: number;
  recentlyPushedRepos: number;
  totalStarsSampled: number;
  fetchedAt: string;
  source: 'github_api' | 'unavailable';
  error?: string;
};

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function githubFetch(path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(12000),
  });
}

export function parseGithubUsername(githubUrl: string | null | undefined): string | null {
  if (!githubUrl) return null;
  const trimmed = String(githubUrl).trim();
  if (!trimmed) return null;
  if (!trimmed.includes('/') && !trimmed.includes('.')) {
    return trimmed.replace(/^@/, '') || null;
  }
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    if (!parsed.hostname.toLowerCase().includes('github.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === 'orgs' || parts[0] === 'users') return parts[1] || null;
    return parts[0];
  } catch {
    return null;
  }
}

export function isGithubActivityRequirement(text: string): boolean {
  const normalized = String(text || '').toLowerCase();
  return (
    /github/.test(normalized) &&
    /(activit|active|amazing|strong|solid|impressive|commit|contribution|push)/.test(normalized)
  );
}

export function opportunityAsksGithubActivity(opportunity: any): boolean {
  const texts = [
    ...(Array.isArray(opportunity?.searchRequirements)
      ? opportunity.searchRequirements.map((r: any) => r?.text)
      : []),
    ...(Array.isArray(opportunity?.requirements) ? opportunity.requirements : []),
    opportunity?.builderWillDo,
    opportunity?.description,
  ]
    .map((value) => String(value || ''))
    .filter(Boolean);
  return texts.some(isGithubActivityRequirement);
}

export function evaluateGithubActivityRequirement(score: number | null | undefined): {
  met: 'yes' | 'partial' | 'no';
  evidence: string;
} {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return { met: 'no', evidence: 'GitHub activity unavailable' };
  }
  if (score >= 0.55) {
    return { met: 'yes', evidence: `GitHub activity score ${Math.round(score * 100)}/100` };
  }
  if (score >= 0.35) {
    return { met: 'partial', evidence: `Modest GitHub activity (${Math.round(score * 100)}/100)` };
  }
  return { met: 'no', evidence: `Low GitHub activity (${Math.round(score * 100)}/100)` };
}

export function readCachedGithubActivity(builder: any): GithubActivitySnapshot | null {
  const raw = builder?.integrations?.github?.activitySnapshot;
  if (!raw || typeof raw !== 'object') return null;
  const fetchedAt = raw.fetchedAt ? new Date(raw.fetchedAt).getTime() : 0;
  if (!fetchedAt || Date.now() - fetchedAt > ACTIVITY_CACHE_MS) return null;
  if (typeof raw.score !== 'number') return null;
  return raw as GithubActivitySnapshot;
}

export function scoreGithubActivityFit(
  snapshot: GithubActivitySnapshot | null | undefined,
  roleAsksGithub: boolean
): number {
  if (!snapshot || snapshot.source === 'unavailable') {
    return roleAsksGithub ? 0.15 : 0.4;
  }
  return Math.max(0, Math.min(1, snapshot.score));
}

function deriveActivityScore(params: {
  publicRepos: number;
  followers: number;
  recentEventCount: number;
  recentlyPushedRepos: number;
  totalStarsSampled: number;
}): number {
  const eventScore = Math.min(0.4, (params.recentEventCount / 12) * 0.4);
  const pushScore = Math.min(0.25, (params.recentlyPushedRepos / 4) * 0.25);
  const starScore = Math.min(0.15, (params.totalStarsSampled / 40) * 0.15);
  const repoScore = Math.min(0.2, (params.publicRepos / 15) * 0.2);
  return Math.max(0, Math.min(1, eventScore + pushScore + starScore + repoScore));
}

export async function fetchGithubActivitySnapshot(
  username: string
): Promise<GithubActivitySnapshot> {
  const login = username.trim().replace(/^@/, '');
  if (!login) {
    return {
      username: '',
      score: 0,
      publicRepos: 0,
      followers: 0,
      recentEventCount: 0,
      recentlyPushedRepos: 0,
      totalStarsSampled: 0,
      fetchedAt: new Date().toISOString(),
      source: 'unavailable',
      error: 'missing_username',
    };
  }

  try {
    const [userRes, eventsRes, reposRes] = await Promise.all([
      githubFetch(`/users/${encodeURIComponent(login)}`),
      githubFetch(`/users/${encodeURIComponent(login)}/events/public?per_page=30`),
      githubFetch(`/users/${encodeURIComponent(login)}/repos?sort=pushed&per_page=10&type=owner`),
    ]);

    if (!userRes.ok) {
      return {
        username: login,
        score: 0,
        publicRepos: 0,
        followers: 0,
        recentEventCount: 0,
        recentlyPushedRepos: 0,
        totalStarsSampled: 0,
        fetchedAt: new Date().toISOString(),
        source: 'unavailable',
        error: `user_http_${userRes.status}`,
      };
    }

    const user = (await userRes.json()) as { public_repos?: number; followers?: number };
    const events = eventsRes.ok ? ((await eventsRes.json()) as Array<{ type?: string; created_at?: string }>) : [];
    const repos = reposRes.ok
      ? ((await reposRes.json()) as Array<{ stargazers_count?: number; pushed_at?: string; fork?: boolean }>)
      : [];

    const cutoff = Date.now() - RECENT_WINDOW_MS;
    const recentEventCount = events.filter((event) => {
      const at = event.created_at ? new Date(event.created_at).getTime() : 0;
      if (!at || at < cutoff) return false;
      return ['PushEvent', 'PullRequestEvent', 'CreateEvent', 'IssuesEvent'].includes(String(event.type || ''));
    }).length;

    const ownRepos = repos.filter((repo) => !repo.fork);
    const recentlyPushedRepos = ownRepos.filter((repo) => {
      const at = repo.pushed_at ? new Date(repo.pushed_at).getTime() : 0;
      return at >= cutoff;
    }).length;
    const totalStarsSampled = ownRepos.reduce((sum, repo) => sum + (Number(repo.stargazers_count) || 0), 0);
    const publicRepos = Number(user.public_repos) || 0;
    const followers = Number(user.followers) || 0;
    const score = deriveActivityScore({
      publicRepos,
      followers,
      recentEventCount,
      recentlyPushedRepos,
      totalStarsSampled,
    });

    return {
      username: login,
      score,
      publicRepos,
      followers,
      recentEventCount,
      recentlyPushedRepos,
      totalStarsSampled,
      fetchedAt: new Date().toISOString(),
      source: 'github_api',
    };
  } catch (error) {
    return {
      username: login,
      score: 0,
      publicRepos: 0,
      followers: 0,
      recentEventCount: 0,
      recentlyPushedRepos: 0,
      totalStarsSampled: 0,
      fetchedAt: new Date().toISOString(),
      source: 'unavailable',
      error: error instanceof Error ? error.message : 'fetch_failed',
    };
  }
}

export async function ensureGithubActivityForBuilders(params: {
  builders: any[];
  limit?: number;
  persist?: (builderId: string, snapshot: GithubActivitySnapshot) => Promise<void>;
}): Promise<Map<string, GithubActivitySnapshot>> {
  const { builders, limit = 24, persist } = params;
  const out = new Map<string, GithubActivitySnapshot>();
  const toFetch: Array<{ builderId: string; username: string; builder: any }> = [];

  for (const builder of builders) {
    const builderId = String(builder?._id || '');
    if (!builderId) continue;
    const cached = readCachedGithubActivity(builder);
    if (cached) {
      out.set(builderId, cached);
      continue;
    }
    const username =
      builder?.integrations?.github?.username ||
      parseGithubUsername(builder?.links?.github) ||
      null;
    if (!username) {
      out.set(builderId, {
        username: '',
        score: 0,
        publicRepos: 0,
        followers: 0,
        recentEventCount: 0,
        recentlyPushedRepos: 0,
        totalStarsSampled: 0,
        fetchedAt: new Date().toISOString(),
        source: 'unavailable',
        error: 'no_github_username',
      });
      continue;
    }
    toFetch.push({ builderId, username, builder });
  }

  const queue = toFetch.slice(0, limit);
  for (let i = 0; i < queue.length; i += MAX_PARALLEL_FETCHES) {
    const batch = queue.slice(i, i + MAX_PARALLEL_FETCHES);
    const snapshots = await Promise.all(batch.map((item) => fetchGithubActivitySnapshot(item.username)));
    for (let j = 0; j < batch.length; j += 1) {
      const item = batch[j];
      const snapshot = snapshots[j];
      out.set(item.builderId, snapshot);
      if (item.builder.integrations?.github) {
        item.builder.integrations.github.activitySnapshot = snapshot;
        item.builder.integrations.github.activityScore = snapshot.score;
        item.builder.integrations.github.activityFetchedAt = snapshot.fetchedAt;
      } else {
        item.builder.integrations = {
          ...(item.builder.integrations || {}),
          github: {
            username: snapshot.username || item.username,
            activitySnapshot: snapshot,
            activityScore: snapshot.score,
            activityFetchedAt: snapshot.fetchedAt,
          },
        };
      }
      if (persist && snapshot.source === 'github_api') {
        try {
          await persist(item.builderId, snapshot);
        } catch {
          // best-effort cache write
        }
      }
    }
  }

  return out;
}
