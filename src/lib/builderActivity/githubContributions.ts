import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { parseGithubUsername } from './githubActivity';
import { contributionColor } from './contributionColors';

export type ContributionDay = {
  date: string;
  count: number;
  color: string;
};

export type ContributionWall = {
  id: string;
  builderName: string;
  displayName: string;
  githubUsername: string;
  avatarUrl: string | null;
  totalContributions: number;
  days: ContributionDay[];
};

/** Compact payload for the homepage wall (26 weeks, 0-4 intensity levels). */
export type ContributionWallClient = {
  displayName: string;
  githubUsername: string;
  initials: string;
  totalContributions: number;
  levels: number[];
};

type BuilderRef = {
  id: string;
  name: string;
  githubUsername: string;
  avatarUrl: string | null;
};

type CacheState = {
  builders: BuilderRef[];
  walls: ContributionWall[];
  buildersFetchedAt: number;
  wallsFetchedAt: number;
  fetchCursor: number;
};

const BUILDERS_TTL_MS = 30 * 60_000;
const WALLS_TTL_MS = 6 * 60 * 60_000;
const USERS_PER_GRAPHQL = 20;
const USERS_PER_REFRESH = 40;
const MAX_WALLS = 320;

let cache: CacheState | null = null;

function githubGraphqlHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is required for GitHub contribution graphs');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function builderInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

const WEEKS_SHOWN = 26;

function encodeContributionLevels(days: ContributionDay[]): number[] {
  return days.slice(-WEEKS_SHOWN * 7).map((day) => {
    const count = day.count;
    if (count <= 0) return 0;
    if (count <= 3) return 1;
    if (count <= 6) return 2;
    if (count <= 9) return 3;
    return 4;
  });
}

export function formatContributionWallForClient(wall: ContributionWall): ContributionWallClient {
  return {
    displayName: firstName(wall.builderName),
    githubUsername: wall.githubUsername,
    initials: builderInitials(wall.builderName),
    totalContributions: wall.totalContributions,
    levels: encodeContributionLevels(wall.days),
  };
}

function escapeGraphqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function flattenWeeks(weeks: Array<{ contributionDays: Array<{ contributionCount: number; date: string }> }>) {
  const days: ContributionDay[] = [];
  for (const week of weeks) {
    for (const day of week.contributionDays || []) {
      const count = Number(day.contributionCount || 0);
      days.push({
        date: day.date,
        count,
        color: contributionColor(count),
      });
    }
  }
  return days.slice(-53 * 7);
}

async function fetchContributionWalls(logins: BuilderRef[]): Promise<ContributionWall[]> {
  if (!logins.length) return [];

  const fields = logins
    .map(
      (builder, index) => `
      u${index}: user(login: "${escapeGraphqlString(builder.githubUsername)}") {
        login
        avatarUrl
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }`
    )
    .join('\n');

  const query = `query ContributionWalls {\n${fields}\n}`;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: githubGraphqlHeaders(),
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload.errors?.length && !payload.data) {
    throw new Error(payload.errors[0]?.message || 'GitHub GraphQL error');
  }

  const walls: ContributionWall[] = [];
  for (let i = 0; i < logins.length; i += 1) {
    const builder = logins[i];
    const node = payload.data?.[`u${i}`];
    if (!node) continue;
    const calendar = node?.contributionsCollection?.contributionCalendar;
    if (!calendar) continue;

    const days = flattenWeeks(calendar.weeks || []);
    walls.push({
      id: builder.id,
      builderName: builder.name,
      displayName: firstName(builder.name),
      githubUsername: node.login || builder.githubUsername,
      avatarUrl: node.avatarUrl || builder.avatarUrl,
      totalContributions: Number(calendar.totalContributions || 0),
      days,
    });
  }

  return walls;
}

async function loadBuilders(): Promise<BuilderRef[]> {
  await connectAdminDB();
  const docs = await BuilderProfile.find({
    'links.github': { $exists: true, $nin: [null, ''] },
  })
    .select('name avatarUrl links.github')
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();

  const seen = new Set<string>();
  const builders: BuilderRef[] = [];

  for (const doc of docs) {
    const githubUsername = parseGithubUsername(doc?.links?.github);
    if (!githubUsername || seen.has(githubUsername.toLowerCase())) continue;
    seen.add(githubUsername.toLowerCase());
    builders.push({
      id: String(doc._id),
      name: String(doc.name || githubUsername),
      githubUsername,
      avatarUrl: doc.avatarUrl ? String(doc.avatarUrl) : null,
    });
  }

  return builders;
}

function mergeWalls(existing: ContributionWall[], incoming: ContributionWall[]): ContributionWall[] {
  const map = new Map<string, ContributionWall>();
  for (const wall of [...existing, ...incoming]) {
    map.set(wall.githubUsername.toLowerCase(), wall);
  }
  return Array.from(map.values()).slice(0, MAX_WALLS);
}

async function refreshWalls(state: CacheState): Promise<void> {
  if (state.builders.length === 0) return;

  const slice: BuilderRef[] = [];
  for (let i = 0; i < USERS_PER_REFRESH; i += 1) {
    const builder = state.builders[state.fetchCursor % state.builders.length];
    state.fetchCursor += 1;
    slice.push(builder);
  }

  const batches: BuilderRef[][] = [];
  for (let i = 0; i < slice.length; i += USERS_PER_GRAPHQL) {
    batches.push(slice.slice(i, i + USERS_PER_GRAPHQL));
  }

  const results = await Promise.all(batches.map((batch) => fetchContributionWalls(batch)));
  const incoming = results.flat();

  if (incoming.length === 0 && state.walls.length > 0) {
    state.wallsFetchedAt = Date.now();
    return;
  }

  state.walls = mergeWalls(state.walls, incoming);
  state.wallsFetchedAt = Date.now();
}

async function ensureCache(): Promise<CacheState> {
  const now = Date.now();

  if (!cache) {
    cache = {
      builders: [],
      walls: [],
      buildersFetchedAt: 0,
      wallsFetchedAt: 0,
      fetchCursor: 0,
    };
  }

  if (now - cache.buildersFetchedAt > BUILDERS_TTL_MS || cache.builders.length === 0) {
    cache.builders = await loadBuilders();
    cache.buildersFetchedAt = now;
  }

  if (now - cache.wallsFetchedAt > WALLS_TTL_MS || cache.walls.length === 0) {
    await refreshWalls(cache);
  }

  return cache;
}

export async function getBuilderContributionWalls(): Promise<{
  walls: ContributionWallClient[];
  builderCount: number;
  wallCount: number;
  refreshedAt: string;
}> {
  const state = await ensureCache();

  if (state.walls.length < Math.min(160, state.builders.length) && state.builders.length > 0) {
    await refreshWalls(state);
  }

  const walls = state.walls.map(formatContributionWallForClient);

  return {
    walls,
    builderCount: state.builders.length,
    wallCount: state.walls.length,
    refreshedAt: new Date(state.wallsFetchedAt || Date.now()).toISOString(),
  };
}

export function invalidateContributionWallCache() {
  cache = null;
}
