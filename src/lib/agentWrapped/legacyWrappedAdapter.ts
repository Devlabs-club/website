import type { AgentWrappedReport } from './types';
import type { BuilderBuildprint, EarnedIdentity, EvidenceStrength } from './buildprintTypes';

export function isBuildprintReport(report: AgentWrappedReport | null | undefined): boolean {
  return Boolean(report?.buildprint?.schemaVersion);
}

export function isLegacyWrappedReport(report: AgentWrappedReport | null | undefined): boolean {
  return Boolean(report) && !isBuildprintReport(report);
}

export function getPublicIdentity(report: AgentWrappedReport): EarnedIdentity | null {
  const bp = report.buildprint;
  if (!bp?.earnedIdentities?.length) return null;
  const selectedId = bp.selectedPublicIdentityId || bp.primaryIdentityId;
  return (
    bp.earnedIdentities.find((item) => item.id === selectedId) ||
    bp.earnedIdentities[0] ||
    null
  );
}

export function getEvidenceStrength(report: AgentWrappedReport): EvidenceStrength | null {
  return report.buildprint?.evidenceStrength || null;
}

export function getPublicHeadline(report: AgentWrappedReport): string {
  const identity = getPublicIdentity(report);
  if (identity) return identity.label;
  if (report.buildprint?.forming) return 'Buildprint forming';
  return report.archetype || 'Builder';
}

export function getPublicCardLine(report: AgentWrappedReport): string {
  const identity = getPublicIdentity(report);
  return (
    report.buildprint?.publicCardLine ||
    identity?.cardLine ||
    report.identities?.[0]?.tagline ||
    'Building habits backed by proof.'
  );
}

export function getBuildprintOrNull(report: AgentWrappedReport): BuilderBuildprint | null {
  return report.buildprint || null;
}
