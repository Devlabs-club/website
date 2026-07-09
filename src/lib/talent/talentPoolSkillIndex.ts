import TalentSearchKey from '@/models/talent/TalentSearchKey';
import SystemStats from '@/models/SystemStats';
import { getOrRefreshTalentStats } from '@/lib/talent/talentDatabaseStats';

export type TalentSkillSignal = {
  skill: string;
  score: number;
  builderCount: number;
  projectCount: number;
  proofCount: number;
};

export type TalentPoolIndex = {
  generatedAt: Date;
  topSkills: TalentSkillSignal[];
  skillMap: Map<string, TalentSkillSignal>;
  source: 'search_keys' | 'stats_cache' | 'memory';
};

const STATS_DOC_TYPE = 'talent_pool_skill_index';
const MEMORY_TTL_MS = 60 * 60 * 1000;
const MONGO_STALE_MS = 4 * 60 * 60 * 1000;

let memoryCache: { expiresAt: number; value: TalentPoolIndex } | null = null;

function normalizeSkillKey(skill: string) {
  return skill.toLowerCase().trim();
}

function indexFromSignals(signals: TalentSkillSignal[], source: TalentPoolIndex['source']): TalentPoolIndex {
  const topSkills = [...signals].sort((a, b) => b.score - a.score).slice(0, 80);
  return {
    generatedAt: new Date(),
    topSkills,
    skillMap: new Map(topSkills.map((signal) => [normalizeSkillKey(signal.skill), signal])),
    source,
  };
}

function serializeIndex(index: TalentPoolIndex) {
  return {
    generatedAt: index.generatedAt.toISOString(),
    topSkills: index.topSkills,
    source: index.source,
  };
}

function deserializeIndex(payload: { generatedAt: string; topSkills: TalentSkillSignal[]; source?: TalentPoolIndex['source'] }) {
  return indexFromSignals(payload.topSkills, payload.source || 'search_keys');
}

async function readMongoIndex(): Promise<TalentPoolIndex | null> {
  try {
    const doc = await SystemStats.findOne({ type: STATS_DOC_TYPE }).lean() as any;
    if (!doc?.data?.topSkills?.length) return null;
    const ageMs = Date.now() - new Date(doc.computedAt || doc.data.generatedAt).getTime();
    if (ageMs > MONGO_STALE_MS) return null;
    return deserializeIndex(doc.data);
  } catch {
    return null;
  }
}

async function writeMongoIndex(index: TalentPoolIndex, durationMs: number) {
  await SystemStats.findOneAndUpdate(
    { type: STATS_DOC_TYPE },
    {
      $set: {
        type: STATS_DOC_TYPE,
        data: serializeIndex(index),
        computedAt: index.generatedAt,
        computeDurationMs: durationMs,
      },
    },
    { upsert: true }
  );
}

async function aggregateFromSearchKeys(): Promise<TalentSkillSignal[]> {
  const rows = await TalentSearchKey.aggregate([
    { $match: { kind: { $in: ['skill', 'project_tech', 'contribution'] } } },
    {
      $group: {
        _id: '$term',
        builders: { $addToSet: '$builderId' },
        skillHits: { $sum: { $cond: [{ $eq: ['$kind', 'skill'] }, 1, 0] } },
        projectHits: { $sum: { $cond: [{ $eq: ['$kind', 'project_tech'] }, 1, 0] } },
        proofHits: { $sum: { $cond: [{ $eq: ['$kind', 'contribution'] }, 1, 0] } },
        totalWeight: { $sum: { $max: ['$weight', 1] } },
      },
    },
    { $sort: { totalWeight: -1 } },
    { $limit: 100 },
  ]).option({ maxTimeMS: 4000 });

  return rows.map((row: any) => {
    const builderCount = Array.isArray(row.builders) ? row.builders.length : 0;
    const projectCount = Number(row.projectHits || 0);
    const proofCount = Number(row.proofHits || 0);
    const skillHits = Number(row.skillHits || 0);
    const score = Number(row.totalWeight || 0) + builderCount * 1.5 + projectCount * 0.5;
    return {
      skill: String(row._id || ''),
      score,
      builderCount,
      projectCount: projectCount || skillHits,
      proofCount,
    };
  }).filter((signal) => signal.skill.length >= 2);
}

function indexFromTalentStats(stats: Awaited<ReturnType<typeof getOrRefreshTalentStats>>): TalentPoolIndex {
  const merged = new Map<string, TalentSkillSignal>();
  for (const entry of stats.topSkills) {
    const key = normalizeSkillKey(entry.skill);
    merged.set(key, {
      skill: entry.skill,
      score: entry.count * 1.5,
      builderCount: entry.count,
      projectCount: 0,
      proofCount: 0,
    });
  }
  for (const entry of stats.topProjectTechnologies) {
    const key = normalizeSkillKey(entry.skill);
    const existing = merged.get(key) || {
      skill: entry.skill,
      score: 0,
      builderCount: 0,
      projectCount: 0,
      proofCount: 0,
    };
    existing.projectCount = entry.count;
    existing.score += entry.count * 2;
    merged.set(key, existing);
  }
  return indexFromSignals([...merged.values()], 'stats_cache');
}

async function buildFreshIndex(): Promise<TalentPoolIndex> {
  const startedAt = Date.now();
  const aggregated = await aggregateFromSearchKeys();
  if (aggregated.length >= 12) {
    const index = indexFromSignals(aggregated, 'search_keys');
    await writeMongoIndex(index, Date.now() - startedAt);
    return index;
  }

  const stats = await getOrRefreshTalentStats();
  const index = indexFromTalentStats(stats);
  await writeMongoIndex(index, Date.now() - startedAt);
  return index;
}

/**
 * Fast pool skill index for job shaping — no full builder/project table scans.
 * Resolution order: in-memory → Mongo snapshot → TalentSearchKey aggregation → talent stats cache.
 */
export async function getTalentPoolSkillIndex(): Promise<TalentPoolIndex> {
  if (memoryCache && memoryCache.expiresAt > Date.now()) {
    return { ...memoryCache.value, source: 'memory' };
  }

  const mongoCached = await readMongoIndex();
  if (mongoCached) {
    memoryCache = { expiresAt: Date.now() + MEMORY_TTL_MS, value: mongoCached };
    return mongoCached;
  }

  const fresh = await buildFreshIndex();
  memoryCache = { expiresAt: Date.now() + MEMORY_TTL_MS, value: fresh };
  return fresh;
}

/** Invalidate after search-index backfills or large profile imports. */
export function invalidateTalentPoolSkillIndexCache() {
  memoryCache = null;
}

export function scheduleTalentPoolSkillIndexRefresh() {
  invalidateTalentPoolSkillIndexCache();
  void buildFreshIndex().catch((error) => {
    console.warn(
      '[talent-pool-skill-index] background refresh failed:',
      error instanceof Error ? error.message : error
    );
  });
}
