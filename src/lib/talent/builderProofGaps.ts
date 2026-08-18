import { isStoredResumeFileUrl } from '@/lib/messaging/inboundResume';

/** Minimal profile shape used for claim/onboarding completeness checks. */
export type BuilderProofProfile = {
  headline?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  experiences?: unknown[] | null;
  projects?: unknown[] | null;
  founderHighlights?: unknown[] | null;
  enrichmentSources?: Array<{ source?: string } | string> | null;
  workAuthorization?: string | null;
  links?: Record<string, string | null | undefined> | null;
  availability?: { availableNow?: boolean | null } | null;
};

export type MissingProofField = 'linkedin' | 'resume' | 'github';

export type MissingProofFields = {
  linkedin: boolean;
  resume: boolean;
  github: boolean;
};

function hasText(value: unknown): boolean {
  return Boolean(String(value || '').trim());
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function hasLinkedIn(profile: BuilderProofProfile | null | undefined): boolean {
  return hasText(profile?.links?.linkedin);
}

export function hasResume(profile: BuilderProofProfile | null | undefined): boolean {
  return isStoredResumeFileUrl(profile?.links?.resume);
}

export function hasGitHub(profile: BuilderProofProfile | null | undefined): boolean {
  return hasText(profile?.links?.github);
}

/**
 * True when the profile already has founder-readable content (pre-enriched or
 * previously completed), not just an empty claim stub.
 */
export function isProfileEnriched(profile: BuilderProofProfile | null | undefined): boolean {
  if (!profile) return false;

  const enrichmentSources = profile.enrichmentSources || [];
  const hasEnrichmentSource = enrichmentSources.some((row) =>
    typeof row === 'string' ? hasText(row) : hasText(row?.source)
  );

  return (
    hasItems(profile.skills) ||
    hasItems(profile.experiences) ||
    hasItems(profile.founderHighlights) ||
    hasItems(profile.projects) ||
    hasEnrichmentSource ||
    (hasText(profile.headline) && hasText(profile.bio))
  );
}

export function getMissingProofFields(
  profile: BuilderProofProfile | null | undefined
): MissingProofFields {
  return {
    linkedin: !hasLinkedIn(profile),
    resume: !hasResume(profile),
    github: !hasGitHub(profile),
  };
}

export function listMissingProofFields(
  profile: BuilderProofProfile | null | undefined
): MissingProofField[] {
  const missing = getMissingProofFields(profile);
  const fields: MissingProofField[] = [];
  if (missing.linkedin) fields.push('linkedin');
  if (missing.resume) fields.push('resume');
  if (missing.github) fields.push('github');
  return fields;
}

export function hasOpenToWorkAnswer(profile: BuilderProofProfile | null | undefined): boolean {
  return typeof profile?.availability?.availableNow === 'boolean';
}

export function hasWorkAuthAnswer(profile: BuilderProofProfile | null | undefined): boolean {
  return hasText(profile?.workAuthorization);
}

export const MISSING_PROOF_LABELS: Record<MissingProofField, string> = {
  linkedin: 'LinkedIn',
  resume: 'Resume',
  github: 'GitHub',
};
