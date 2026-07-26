import { IDENTITY_CATALOG } from './catalog/identities.js';
import { SIGNAL_LABELS } from './computeSignals.js';
import { BUILDPRINT_QUALIFICATION_VERSION, MIN_SESSIONS_FOR_IDENTITY } from './constants.js';
import { cardLineForIdentity } from './catalog/captions.js';

function weightedScore(weights, signals) {
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights || {})) {
    total += (signals[key] || 0) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 0;
}

function missingFor(def, facts, signals) {
  const missing = [];
  const g = def.gates || {};
  if (g.minSubstantialSessions && facts.substantialSessions < g.minSubstantialSessions) {
    missing.push(`Need ${g.minSubstantialSessions - facts.substantialSessions} more substantial sessions`);
  }
  if (g.minProjectCount && facts.projectCount < g.minProjectCount) {
    missing.push(`Need evidence across ${g.minProjectCount} project buckets (have ${facts.projectCount})`);
  }
  if (g.minProductSurfaceSessions && facts.productSurfaceSessions < g.minProductSurfaceSessions) {
    missing.push('Need more product-building sessions');
  }
  if (g.minVerificationDiscipline && signals.verificationDiscipline < g.minVerificationDiscipline) {
    missing.push('Need stronger verification activity across sessions');
  }
  if (g.minRecoveryLoopEvents && facts.recoveryLoopEvents < g.minRecoveryLoopEvents) {
    missing.push('Need more debugging/recovery loops');
  }
  if (g.minRecoveryEffectiveness && signals.recoveryEffectiveness < g.minRecoveryEffectiveness) {
    missing.push('Need verification after more recovery loops');
  }
  if (g.minFrontendSignal && signals.frontendSignal < g.minFrontendSignal) {
    missing.push('Need more frontend activity');
  }
  if (g.minBackendSignal && signals.backendSignal < g.minBackendSignal) {
    missing.push('Need more backend activity');
  }
  if (g.minConnectedWorkflowSessions && facts.connectedWorkflowSessions < g.minConnectedWorkflowSessions) {
    missing.push('Need more sessions that span frontend and backend');
  }
  if (g.minTestActivitySessions && facts.testActivitySessions < g.minTestActivitySessions) {
    missing.push('Need more sessions with test/verification activity');
  }
  if (g.minContextArtifacts && facts.contextArtifacts < g.minContextArtifacts) {
    missing.push('Need reusable context artifacts (rules / agents.md)');
  }
  if (g.minContextHeavySessions && facts.contextHeavySessions < g.minContextHeavySessions) {
    missing.push('Need more context-heavy sessions');
  }
  if (g.minSystemsSessions && facts.systemsSessions < g.minSystemsSessions) {
    missing.push('Need more backend/data/infra sessions');
  }
  if (g.minSystemDepth && signals.systemDepth < g.minSystemDepth) {
    missing.push('Need deeper systems work');
  }
  if (g.minFastSessionShare && facts.fastSessionShare < g.minFastSessionShare) {
    missing.push('Need a higher share of short high-iteration sessions');
  }
  return missing;
}

function qualifies(def, facts, signals, confidence) {
  if (!def.awardable) return { ok: false, reason: 'not_awardable' };
  if (facts.substantialSessions < MIN_SESSIONS_FOR_IDENTITY) {
    return { ok: false, reason: 'insufficient_sessions' };
  }
  if (confidence === 'low') return { ok: false, reason: 'low_confidence' };

  const d = def.disqualify || {};
  if (d.maxVerificationDiscipline != null && signals.verificationDiscipline < d.maxVerificationDiscipline) {
    return { ok: false, reason: 'verification_too_low' };
  }
  if (d.requireProductSignals && facts.productSurfaceSessions === 0) {
    return { ok: false, reason: 'no_product_signals' };
  }

  const missing = missingFor(def, facts, signals);
  return { ok: missing.length === 0, missing };
}

function proofFor(def, facts) {
  switch (def.id) {
    case 'product_shipper':
      return {
        statement: `Product-building activity appeared in ${facts.productSurfaceSessions} of ${facts.substantialSessions} substantial sessions, with verification activity in ${facts.sessionsWithVerification} of those sessions.`,
        metrics: [
          { id: 'substantial_sessions', label: 'Substantial sessions', value: facts.substantialSessions },
          { id: 'product_sessions', label: 'Product-building sessions', value: facts.productSurfaceSessions },
          { id: 'verified_sessions', label: 'Sessions with verification activity', value: facts.sessionsWithVerification },
          { id: 'projects', label: 'Project buckets', value: facts.projectCount },
        ],
      };
    case 'debugging_closer':
      return {
        statement: `Debugging activity appeared in ${facts.sessionsWithRecovery} sessions (${facts.recoveryLoopEvents} recovery loops detected), with verification activity in ${facts.sessionsWithVerifiedRecovery} of those sessions.`,
        metrics: [
          { id: 'recovery_sessions', label: 'Sessions with debugging activity', value: facts.sessionsWithRecovery },
          { id: 'recovery_loops', label: 'Recovery loops detected', value: facts.recoveryLoopEvents },
          { id: 'verified_recovery', label: 'Recovery sessions with verification', value: facts.sessionsWithVerifiedRecovery },
        ],
      };
    case 'full_stack_owner':
      return {
        statement: `You worked across frontend and backend in ${facts.connectedWorkflowSessions} substantial sessions spanning ${facts.projectCount} project buckets.`,
        metrics: [
          { id: 'connected', label: 'Connected frontend/backend sessions', value: facts.connectedWorkflowSessions },
          { id: 'projects', label: 'Project buckets', value: facts.projectCount },
        ],
      };
    case 'reliability_builder':
      return {
        statement: `Test or verification activity appeared in ${facts.testActivitySessions} of ${facts.substantialSessions} substantial sessions.`,
        metrics: [
          { id: 'test_sessions', label: 'Sessions with test/verification activity', value: facts.testActivitySessions },
          { id: 'substantial_sessions', label: 'Substantial sessions', value: facts.substantialSessions },
        ],
      };
    case 'context_architect':
      return {
        statement: `Reusable context artifacts were present, and context-heavy work appeared across ${facts.contextHeavySessions} substantial sessions.`,
        metrics: [
          { id: 'context_artifacts', label: 'Context artifacts detected', value: facts.contextArtifacts },
          { id: 'context_sessions', label: 'Context-heavy sessions', value: facts.contextHeavySessions },
        ],
      };
    case 'systems_builder':
      return {
        statement: `Backend, data, or infrastructure activity appeared in ${facts.systemsSessions} substantial sessions.`,
        metrics: [{ id: 'systems_sessions', label: 'Systems sessions', value: facts.systemsSessions }],
      };
    case 'prototype_sprinter':
      return {
        statement: `${facts.prototypeSessions} short, high-iteration sessions showed product-building activity, with verification activity in ${facts.sessionsWithVerification} of ${facts.substantialSessions} substantial sessions.`,
        metrics: [
          { id: 'prototype_sessions', label: 'Short product sessions', value: facts.prototypeSessions },
          { id: 'verified_sessions', label: 'Sessions with verification activity', value: facts.sessionsWithVerification },
        ],
      };
    default:
      return {
        statement: `Based on ${facts.substantialSessions} substantial sessions analyzed.`,
        metrics: [{ id: 'substantial_sessions', label: 'Substantial sessions', value: facts.substantialSessions }],
      };
  }
}

function signalBreakdown(def, signals) {
  return Object.entries(def.weights || {}).map(([signalId, weight]) => ({
    signalId,
    label: SIGNAL_LABELS[signalId] || signalId,
    score: Math.round(signals[signalId] || 0),
    weight,
    explanation: `${SIGNAL_LABELS[signalId] || signalId} contributed to this identity.`,
  }));
}

export function qualifyIdentities(facts, signals, confidence) {
  const evaluated = IDENTITY_CATALOG.map((def) => {
    const score = weightedScore(def.weights, signals);
    const { ok, missing = [] } = qualifies(def, facts, signals, confidence);
    const proof = proofFor(def, facts);
    return {
      id: def.id,
      label: def.label,
      score,
      confidence,
      qualified: ok,
      qualificationVersion: BUILDPRINT_QUALIFICATION_VERSION,
      proofStatement: proof.statement,
      proofMetrics: proof.metrics,
      signalBreakdown: signalBreakdown(def, signals),
      missingRequirements: ok ? undefined : missing,
      cardLine: cardLineForIdentity(def.id),
      awardable: def.awardable,
    };
  });

  const earned = evaluated
    .filter((item) => item.qualified)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ awardable, ...rest }) => rest);

  const nearMiss = evaluated
    .filter((item) => item.awardable && !item.qualified)
    .sort((a, b) => {
      const am = a.missingRequirements?.length ?? 99;
      const bm = b.missingRequirements?.length ?? 99;
      if (am !== bm) return am - bm;
      return b.score - a.score;
    })[0];

  let nextUnlock;
  if (nearMiss) {
    nextUnlock = {
      identityId: nearMiss.id,
      label: nearMiss.label,
      missingRequirements: nearMiss.missingRequirements || [],
      explanation: `Your next unlock: ${nearMiss.label}. ${(nearMiss.missingRequirements || []).slice(0, 2).join(' ')}`,
    };
  }

  return {
    earnedIdentities: earned,
    primaryIdentityId: earned[0]?.id,
    nextUnlock,
    evaluated,
  };
}
