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

export async function setEnrichmentProgress(builderId: string, stage: EnrichmentUiStage) {
  await BuilderProfile.findByIdAndUpdate(builderId, {
    $set: {
      'enrichmentInsights.activeProgress': {
        stage,
        label: STAGE_LABELS[stage],
        detail: STAGE_DETAILS[stage],
        updatedAt: new Date(),
      },
      'enrichmentInsights.updatedAt': new Date(),
    },
  });
}

/** Touch updatedAt without changing stage so long-running sources don't look stale. */
export async function touchEnrichmentProgress(builderId: string) {
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
    updatedAt: progress.updatedAt || null,
  };
}

export function isEnrichmentProgressStale(progress: { updatedAt?: Date | string | null } | null) {
  if (!progress?.updatedAt) return true;
  const updatedAt = new Date(progress.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return true;
  return Date.now() - updatedAt > ENRICHMENT_PROGRESS_STALE_MS;
}
