import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import SystemStats from '@/models/SystemStats';
import { addMemoryToContainer } from '@/lib/talent/supermemory';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATS_DOC_TYPE = 'talent_pool_stats';
const TALENT_POOL_CONTAINER = 'talent_database:global';

// How long before stats are considered stale and need a recompute.
// Reads ALWAYS serve from MongoDB (shared across all worker instances).
// Recompute is triggered either by a builder mutation or when this TTL expires.
const STALE_AFTER_HOURS = 4;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkillCount = { skill: string; count: number; pct: number };
export type RoleCategoryCount = { category: string; count: number };

export type TalentDatabaseStats = {
  computedAt: string;
  totalBuilders: number;
  availableNow: number;
  availabilityRate: number;
  topSkills: SkillCount[];
  topRoleCategories: RoleCategoryCount[];
  topProjectTechnologies: SkillCount[];
  hireTypeBreakdown: Record<string, number>;
  remoteBreakdown: Record<string, number>;
  buildersWithVerifiedProjects: number;
  buildersWithGitHub: number;
  avgProjectsPerBuilder: number;
};

// ─── Computation ──────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function countMap(items: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = norm(item);
    if (!key || key.length < 2) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function topN(map: Map<string, number>, n: number, total: number): SkillCount[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([skill, count]) => ({
      skill,
      count,
      pct: Math.round((count / Math.max(total, 1)) * 100),
    }));
}

export async function computeTalentDatabaseStats(): Promise<TalentDatabaseStats> {
  const [builders, projects] = await Promise.all([
    BuilderProfile.find({
      verificationStatus: { $ne: 'rejected' },
      visibilityStatus: { $ne: 'hidden' },
    })
      .select('rolePreference preferredWorkType availability hiringIntent links profileCompletion verificationStatus')
      .lean(),
    ProjectRecord.find({}).select('builderId techStack verificationStatus').lean(),
  ]);

  const total = builders.length;
  const availableNow = builders.filter((b: any) => b.availability?.availableNow).length;

  const skillMap = countMap(builders.flatMap((b: any) => b.rolePreference || []));
  const topSkills = topN(skillMap, 20, total);
  const topRoleCategories: RoleCategoryCount[] = [...skillMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, count]) => ({ category, count }));

  const techMap = countMap(projects.flatMap((p: any) => p.techStack || []));
  const topProjectTechnologies = topN(techMap, 25, projects.length);

  const VERIFIED = new Set(['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified']);
  const projectsByBuilder = new Map<string, any[]>();
  for (const p of projects) {
    const key = String((p as any).builderId);
    if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
    projectsByBuilder.get(key)!.push(p);
  }

  const buildersWithVerifiedProjects = builders.filter((b: any) => {
    const bps = projectsByBuilder.get(String((b as any)._id)) || [];
    return bps.some((p) => VERIFIED.has(p.verificationStatus));
  }).length;

  const buildersWithGitHub = builders.filter((b: any) => b.links?.github).length;
  const avgProjectsPerBuilder =
    total > 0 ? Math.round((projects.length / total) * 10) / 10 : 0;

  const hireTypeBreakdown: Record<string, number> = {
    full_time: 0, internship: 0, either: 0, unspecified: 0,
  };
  for (const b of builders) {
    const types: string[] = (b as any).preferredWorkType || [];
    const ft = types.some((t) => /full.?time/i.test(t));
    const intern = types.some((t) => /intern/i.test(t));
    if (ft && intern) hireTypeBreakdown.either++;
    else if (ft) hireTypeBreakdown.full_time++;
    else if (intern) hireTypeBreakdown.internship++;
    else hireTypeBreakdown.unspecified++;
  }

  const remoteBreakdown: Record<string, number> = {
    remote: 0, hybrid: 0, in_person: 0, unspecified: 0,
  };
  for (const b of builders) {
    const pref = norm((b as any).availability?.remotePreference || 'unspecified');
    if (pref in remoteBreakdown) remoteBreakdown[pref]++;
    else remoteBreakdown.unspecified++;
  }

  return {
    computedAt: new Date().toISOString(),
    totalBuilders: total,
    availableNow,
    availabilityRate: total > 0 ? Math.round((availableNow / total) * 100) : 0,
    topSkills,
    topRoleCategories,
    topProjectTechnologies,
    hireTypeBreakdown,
    remoteBreakdown,
    buildersWithVerifiedProjects,
    buildersWithGitHub,
    avgProjectsPerBuilder,
  };
}

// ─── MongoDB cache (shared across all worker instances) ───────────────────────

async function readStatsFromMongo(): Promise<TalentDatabaseStats | null> {
  try {
    const doc = await SystemStats.findOne({ type: STATS_DOC_TYPE }).lean() as any;
    if (!doc?.data) return null;
    return doc.data as TalentDatabaseStats;
  } catch {
    return null;
  }
}

async function writeStatsToMongo(stats: TalentDatabaseStats, durationMs: number): Promise<void> {
  await SystemStats.findOneAndUpdate(
    { type: STATS_DOC_TYPE },
    {
      $set: {
        type: STATS_DOC_TYPE,
        data: stats,
        computedAt: new Date(stats.computedAt),
        computeDurationMs: durationMs,
      },
    },
    { upsert: true }
  );
}

function isStale(computedAt: string): boolean {
  const ageMs = Date.now() - new Date(computedAt).getTime();
  return ageMs > STALE_AFTER_HOURS * 60 * 60 * 1000;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get current stats. Reads from MongoDB (shared cache). Recomputes synchronously
 * only when the cache is cold or the `force` flag is set. Stale-but-present stats
 * are returned immediately while a background recompute is kicked off.
 */
export async function getOrRefreshTalentStats(force = false): Promise<TalentDatabaseStats> {
  const cached = await readStatsFromMongo();

  if (cached && !force) {
    // If stale, trigger a background refresh so the NEXT request gets fresh data.
    // Return the stale data immediately — a slightly old stat is better than a slow response.
    if (isStale(cached.computedAt)) {
      void recomputeAndStore();
    }
    return cached;
  }

  // Cache cold or forced: compute synchronously so the caller gets real data.
  return recomputeAndStore();
}

/**
 * Recompute stats and persist to MongoDB + Supermemory. Safe to call fire-and-forget.
 */
export async function recomputeAndStore(): Promise<TalentDatabaseStats> {
  const t0 = Date.now();
  const stats = await computeTalentDatabaseStats();
  const durationMs = Date.now() - t0;

  await writeStatsToMongo(stats, durationMs);

  // Also write to Supermemory so the founder agent can search it narratively.
  void addMemoryToContainer(
    TALENT_POOL_CONTAINER,
    `DevLabs Talent Pool Statistics (recomputed ${stats.computedAt}, took ${durationMs}ms):\n${formatStatsForPrompt(stats)}`
  );

  console.log(`[talentStats] recomputed in ${durationMs}ms — ${stats.totalBuilders} builders`);
  return stats;
}

/**
 * Mark stats as stale and kick off a background recompute.
 * Call this after any builder profile mutation.
 */
export function scheduleTalentStatsRefresh(): void {
  // Fire-and-forget — the next getOrRefreshTalentStats call will serve fresh data.
  void recomputeAndStore().catch((err) =>
    console.warn('[talentStats] background refresh failed:', err instanceof Error ? err.message : err)
  );
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatStatsForPrompt(stats: TalentDatabaseStats): string {
  const topSkillsList = stats.topSkills
    .slice(0, 15)
    .map((s) => `${s.skill} (${s.count})`)
    .join(', ');
  const topTechList = stats.topProjectTechnologies
    .slice(0, 15)
    .map((s) => `${s.skill} (${s.count})`)
    .join(', ');
  const topRoleList = stats.topRoleCategories
    .slice(0, 8)
    .map((r) => `${r.category} (${r.count})`)
    .join(', ');

  return `[Talent Pool Intelligence — updated ${new Date(stats.computedAt).toLocaleDateString()}]
Total builders: ${stats.totalBuilders} | Available now: ${stats.availableNow} (${stats.availabilityRate}%)
Builders with verified projects: ${stats.buildersWithVerifiedProjects} | With GitHub: ${stats.buildersWithGitHub}
Avg projects per builder: ${stats.avgProjectsPerBuilder}

Top skills/roles: ${topSkillsList}
Top project technologies: ${topTechList}
Top role categories: ${topRoleList}

Hire type: Full-time ${stats.hireTypeBreakdown.full_time}, Internship ${stats.hireTypeBreakdown.internship}, Either ${stats.hireTypeBreakdown.either}
Remote: Remote ${stats.remoteBreakdown.remote}, Hybrid ${stats.remoteBreakdown.hybrid}, In-person ${stats.remoteBreakdown.in_person}`;
}
