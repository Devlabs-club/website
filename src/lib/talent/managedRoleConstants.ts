export const MANAGED_ROLE_MATCH_REVIEW_STATUSES = [
  'needs_review',
  'approved_for_outreach',
  'rejected_by_team',
  'pending_builder_consent',
  'builder_consented',
] as const;

export type ManagedRoleMatchReviewStatus = (typeof MANAGED_ROLE_MATCH_REVIEW_STATUSES)[number];

export const BUILDER_SHARE_CONSENT_STATUSES = [
  'pending',
  'granted',
  'declined',
  'revoked',
] as const;

export type BuilderShareConsentStatus = (typeof BUILDER_SHARE_CONSENT_STATUSES)[number];

export const BUILDER_SHARE_CONSENT_SCOPES = ['profile', 'intro', 'search_sprint'] as const;

export type BuilderShareConsentScope = (typeof BUILDER_SHARE_CONSENT_SCOPES)[number];

export const MANAGED_ROLE_DRAFT_STATUSES = [
  'draft',
  'approved',
  'rejected',
  'sent_manually',
] as const;

export type ManagedRoleDraftStatus = (typeof MANAGED_ROLE_DRAFT_STATUSES)[number];
