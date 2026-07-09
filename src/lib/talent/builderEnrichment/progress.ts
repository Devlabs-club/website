import BuilderProfile from '@/models/talent/BuilderProfile';
import type { EnrichmentSource } from './types';

export type EnrichmentUiStage = 'linkedin' | 'github' | 'research' | 'done';

const STAGE_LABELS: Record<EnrichmentUiStage, string> = {
  linkedin: 'Scraping information from LinkedIn right now',
  github: 'Scraping your GitHub right now',
  research: 'Deep research going on your profile right now',
  done: 'Finishing your enriched profile',
};

const STAGE_DETAILS: Record<EnrichmentUiStage, string> = {
  linkedin: 'Reading your public profile, roles, education, and builder proof.',
  github: 'Scanning repositories, commits, languages, and projects that show how you ship.',
  research: 'Connecting the dots across your resume, web presence, and founder-facing highlights.',
  done: 'Saving highlights and preparing your founder-facing profile.',
};

export function uiStageForSource(source: EnrichmentSource): EnrichmentUiStage | null {
  if (source === 'linkedin') return 'linkedin';
  if (source === 'github') return 'github';
  return null;
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
