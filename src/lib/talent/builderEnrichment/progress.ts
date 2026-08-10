import BuilderProfile from '@/models/talent/BuilderProfile';
import type { EnrichmentSource } from './types';

export type EnrichmentUiStage = 'linkedin' | 'github' | 'research' | 'done';

/** If progress hasn't been updated for this long, treat the run as dead (e.g. server killed). */
export const ENRICHMENT_PROGRESS_STALE_MS = 6 * 60 * 1000;

const STAGE_LABELS: Record<EnrichmentUiStage, string> = {
  linkedin: 'Reading LinkedIn',
  github: 'Scanning GitHub',
  research: 'Deep research',
  done: 'Finishing your enriched profile',
};

const STAGE_DETAILS: Record<EnrichmentUiStage, string> = {
  linkedin: 'Public profile, roles, education, and builder proof.',
  github: 'Repos, languages, and projects that show how you ship.',
  research: 'Connecting resume, web presence, and profile highlights.',
  done: 'Saving highlights and preparing your profile.',
};

const SOURCE_LABELS: Record<EnrichmentSource, string> = {
  linkedin: 'Reading LinkedIn',
  github: 'Scanning GitHub',
  portfolio: 'Reading portfolio',
  resume: 'Parsing resume',
  devpost: 'Reading Devpost',
  twitter: 'Reading X / Twitter',
};

const MAX_LIVE_LOG = 8;

export type EnrichmentProgressUpdate = {
  stage?: EnrichmentUiStage;
  label?: string;
  detail?: string;
  /** Live one-liner: exact URL / repo / page currently being fetched. */
  brief?: string;
};

export function uiStageForSource(source: EnrichmentSource): EnrichmentUiStage | null {
  if (source === 'linkedin') return 'linkedin';
  if (source === 'github') return 'github';
  return null;
}

export function initialUiStageForSources(sources: EnrichmentSource[]): EnrichmentUiStage {
  if (sources.includes('linkedin')) return 'linkedin';
  if (sources.includes('github')) return 'github';
  return 'research';
}

function stageForSource(source: EnrichmentSource): EnrichmentUiStage {
  return uiStageForSource(source) || 'research';
}

async function appendLiveLog(builderId: string, brief: string) {
  const trimmed = brief.trim().slice(0, 220);
  if (!trimmed) return;
  const profile = await BuilderProfile.findById(builderId).select('enrichmentInsights.activeProgress').lean();
  const existing = Array.isArray((profile as any)?.enrichmentInsights?.activeProgress?.log)
    ? ((profile as any).enrichmentInsights.activeProgress.log as string[])
    : [];
  const next = [...existing.filter((line) => line !== trimmed), trimmed].slice(-MAX_LIVE_LOG);
  await BuilderProfile.findByIdAndUpdate(builderId, {
    $set: {
      'enrichmentInsights.activeProgress.log': next,
      'enrichmentInsights.activeProgress.brief': trimmed,
      'enrichmentInsights.activeProgress.updatedAt': new Date(),
      'enrichmentInsights.updatedAt': new Date(),
    },
  });
}

export async function setEnrichmentProgress(
  builderId: string,
  stage: EnrichmentUiStage,
  update: Omit<EnrichmentProgressUpdate, 'stage'> & { resetLog?: boolean } = {}
) {
  const label = update.label || STAGE_LABELS[stage];
  const detail = update.detail || STAGE_DETAILS[stage];
  const brief = update.brief?.trim().slice(0, 220) || detail;
  const profile = await BuilderProfile.findById(builderId).select('enrichmentInsights.activeProgress').lean();
  const existingLog = Array.isArray((profile as any)?.enrichmentInsights?.activeProgress?.log)
    ? ((profile as any).enrichmentInsights.activeProgress.log as string[])
    : [];
  const baseLog = update.resetLog ? [] : existingLog;
  const log = [...baseLog.filter((line) => line !== brief), brief].slice(-MAX_LIVE_LOG);

  await BuilderProfile.findByIdAndUpdate(builderId, {
    $set: {
      'enrichmentInsights.activeProgress': {
        stage,
        label,
        detail,
        brief,
        log,
        updatedAt: new Date(),
      },
      'enrichmentInsights.updatedAt': new Date(),
    },
  });
}

/** Update the live brief without changing stage (for fine-grained fetch updates). */
export async function reportEnrichmentBrief(builderId: string, brief: string) {
  await appendLiveLog(builderId, brief);
}

/** High-level source start — maps source → UI stage + human labels. */
export async function reportSourceProgress(
  builderId: string,
  source: EnrichmentSource,
  opts?: { target?: string | null; detail?: string | null }
) {
  const stage = stageForSource(source);
  const target = opts?.target?.trim() || null;
  const label = SOURCE_LABELS[source] || STAGE_LABELS[stage];
  const detail =
    opts?.detail?.trim() ||
    (target ? `Working on ${target}` : STAGE_DETAILS[stage]);
  const brief = target
    ? `Fetching ${target}`
    : `Starting ${label.toLowerCase()}`;
  await setEnrichmentProgress(builderId, stage, { label, detail, brief });
}

/** Touch updatedAt without changing stage so long-running sources don't look stale. */
export async function touchEnrichmentProgress(builderId: string, brief?: string) {
  if (brief?.trim()) {
    await appendLiveLog(builderId, brief);
    return;
  }
  await BuilderProfile.findByIdAndUpdate(builderId, {
    $set: {
      'enrichmentInsights.activeProgress.updatedAt': new Date(),
      'enrichmentInsights.updatedAt': new Date(),
    },
  });
}

export async function clearEnrichmentProgress(builderId: string) {
  await BuilderProfile.findByIdAndUpdate(builderId, {
    $unset: { 'enrichmentInsights.activeProgress': '' },
    $set: { 'enrichmentInsights.updatedAt': new Date() },
  });
}

export function readEnrichmentProgress(profile: any) {
  const progress = profile?.enrichmentInsights?.activeProgress;
  if (!progress?.stage) return null;
  return {
    stage: progress.stage as EnrichmentUiStage,
    label: progress.label || STAGE_LABELS[progress.stage as EnrichmentUiStage] || '',
    detail: progress.detail || STAGE_DETAILS[progress.stage as EnrichmentUiStage] || '',
    brief: progress.brief || progress.detail || '',
    log: Array.isArray(progress.log) ? progress.log.map(String).slice(-MAX_LIVE_LOG) : [],
    updatedAt: progress.updatedAt || null,
  };
}

export function isEnrichmentProgressStale(progress: { updatedAt?: Date | string | null } | null) {
  if (!progress?.updatedAt) return true;
  const updatedAt = new Date(progress.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return true;
  return Date.now() - updatedAt > ENRICHMENT_PROGRESS_STALE_MS;
}
