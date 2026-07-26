import { BUILDPRINT_METHODOLOGY_VERSION, BUILDPRINT_SCHEMA_VERSION, MIN_SESSIONS_FOR_IDENTITY } from './constants.js';
import { SIGNAL_LABELS } from './computeSignals.js';
import { cardLineForIdentity } from './catalog/captions.js';

export function presentBuildprint({
  facts,
  signals,
  evidenceStrength,
  confidence,
  earnedIdentities,
  primaryIdentityId,
  nextUnlock,
  languages = [],
  frameworks = [],
}) {
  const selectedPublicIdentityId = primaryIdentityId;
  const primary = earnedIdentities.find((item) => item.id === primaryIdentityId);

  const proofStats = [
    { id: 'substantial_sessions', label: 'Substantial sessions', value: facts.substantialSessions },
    { id: 'project_buckets', label: 'Project buckets', value: facts.projectCount },
    { id: 'verified_sessions', label: 'Sessions with verification activity', value: facts.sessionsWithVerification },
    { id: 'recovery_loops', label: 'Recovery loops detected', value: facts.recoveryLoopEvents },
    { id: 'agents', label: 'Agents used', value: facts.agentsUsed },
  ];

  const stackFingerprint = [
    ...languages.slice(0, 3).map((item) => item.name),
    ...frameworks.slice(0, 3).map((item) => item.name),
  ].filter(Boolean);

  const forming =
    earnedIdentities.length === 0
      ? {
          message:
            'Your Buildprint is still forming. We found your strongest building signals, but there is not enough evidence to award a verified identity yet.',
          sessionsNeeded: Math.max(0, MIN_SESSIONS_FOR_IDENTITY - facts.substantialSessions),
          topSignals: Object.entries(signals)
            .filter(([key]) => SIGNAL_LABELS[key])
            .map(([id, score]) => ({ id, label: SIGNAL_LABELS[id], score: Math.round(score) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3),
        }
      : undefined;

  return {
    schemaVersion: BUILDPRINT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    methodologyVersion: BUILDPRINT_METHODOLOGY_VERSION,
    evidenceStrength,
    confidence,
    primaryIdentityId,
    selectedPublicIdentityId,
    earnedIdentities,
    proofStats,
    stackFingerprint,
    publicCardLine: primary ? cardLineForIdentity(primary.id) : undefined,
    nextUnlock: earnedIdentities.length ? nextUnlock : nextUnlock,
    comparisonBasis: undefined,
    forming,
  };
}

/** Map Buildprint into legacy AgentWrappedReport fields for backward compatibility. */
export function toLegacyCompatFields(buildprint, facts, signals) {
  const primary = buildprint.earnedIdentities.find((item) => item.id === buildprint.primaryIdentityId);
  const archetype = primary?.label || 'Buildprint forming';
  const identities = buildprint.earnedIdentities.map((item) => ({
    name: item.label,
    tagline: item.cardLine,
    score: item.score,
  }));

  // Do not expose Founder Fit semantics. Keep numeric score as a private-ish maturity blend for old readers.
  const score = Math.round(
    (signals.verificationDiscipline +
      signals.iterationIntensity +
      signals.shippingConsistency +
      signals.contextDiscipline +
      signals.recoveryEffectiveness) /
      5
  );

  const summary = primary
    ? primary.proofStatement
    : buildprint.forming?.message ||
      `Analyzed ${facts.substantialSessions} substantial sessions. Buildprint still forming.`;

  return {
    archetype,
    score,
    // Omit fake percentiles
    percentile: undefined,
    confidence: buildprint.confidence,
    identities,
    founderRead: {
      bestFitRoles: [],
      summary,
      strengths: (primary?.proofMetrics || buildprint.proofStats)
        .slice(0, 3)
        .map((metric) => `${metric.label}: ${metric.value}`),
      weaknesses: [],
      riskFlags:
        signals.verificationDiscipline < 35
          ? ['Limited verification activity across substantial sessions.']
          : [],
    },
    evidenceHighlights: [
      `${facts.substantialSessions} substantial session${facts.substantialSessions === 1 ? '' : 's'} analyzed.`,
      facts.agents.length ? `Sources included ${facts.agents.join(', ')}.` : 'Agent source coverage was limited.',
      `Evidence strength: ${buildprint.evidenceStrength}.`,
      'Only aggregated proof-of-work metrics are uploaded after local preview approval.',
    ],
  };
}
