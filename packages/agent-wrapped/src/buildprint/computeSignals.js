function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Diminishing returns: density hits per session → 0–100, no free floor. */
function densityScore(hits, sessions, scale = 8) {
  const density = hits / Math.max(1, sessions);
  return clamp((Math.log1p(density * scale) / Math.log1p(scale * 6)) * 100);
}

function ratioScore(numerator, denominator, target = 0.75) {
  if (denominator <= 0) return 0;
  return clamp((numerator / denominator / target) * 100);
}

/**
 * Layer 2: normalized signals from observed facts.
 */
export function computeSignals(facts) {
  const n = Math.max(1, facts.substantialSessions);

  const verificationDiscipline = clamp(
    0.55 * densityScore(facts.verifyHits, n, 6) +
      0.45 * ratioScore(facts.sessionsWithVerification, facts.substantialSessions, 0.7)
  );

  const testDiscipline = clamp(
    0.5 * densityScore(facts.testHits, n, 6) +
      0.5 * ratioScore(facts.testActivitySessions, facts.substantialSessions, 0.55)
  );

  const iterationIntensity = densityScore(facts.fixHits, n, 7);

  const recoveryEffectiveness = clamp(
    0.4 * densityScore(facts.recoveryLoopEvents, n, 4) +
      0.6 *
        ratioScore(
          facts.sessionsWithVerifiedRecovery,
          Math.max(1, facts.sessionsWithRecovery),
          0.65
        )
  );

  const productOwnership = clamp(
    0.6 * ratioScore(facts.productSurfaceSessions, facts.substantialSessions, 0.55) +
      0.4 * densityScore(facts.frontendHits, n, 5)
  );

  const shippingConsistency = clamp(
    0.5 * productOwnership +
      0.3 * verificationDiscipline +
      0.2 * Math.min(100, facts.projectCount * 18)
  );

  const frontendSignal = densityScore(facts.frontendHits, n, 5);
  const backendSignal = densityScore(facts.backendHits + facts.databaseHits, n, 5);
  const systemDepth = densityScore(facts.databaseHits + facts.infraHits + facts.backendHits * 0.5, n, 5);

  const buildBreadth = clamp(
    Math.min(frontendSignal, backendSignal) * 0.7 +
      (Math.abs(frontendSignal - backendSignal) < 25 ? 30 : 0)
  );

  const contextDiscipline = clamp(
    (facts.contextArtifacts > 0 ? 35 : 0) +
      0.4 * densityScore(facts.contextHits, n, 8) +
      0.25 * ratioScore(facts.contextHeavySessions, facts.substantialSessions, 0.45)
  );

  const planningQuality = densityScore(facts.planHits, n, 6);
  const documentationUse = densityScore(facts.docsHits + facts.contextHits * 0.3, n, 6);

  // Do not award high orchestration from agent count alone.
  const agentOrchestration = clamp(
    facts.agentsUsed >= 2 && facts.multiAgentSessionGroups >= 3
      ? 40 + facts.multiAgentSessionGroups * 8
      : facts.agentsUsed >= 2
        ? 18
        : 8
  );

  return {
    shippingConsistency,
    verificationDiscipline,
    productOwnership,
    systemDepth,
    buildBreadth,
    recoveryEffectiveness,
    contextDiscipline,
    agentOrchestration,
    iterationIntensity,
    testDiscipline,
    planningQuality,
    documentationUse,
    frontendSignal,
    backendSignal,
  };
}

export const SIGNAL_LABELS = {
  shippingConsistency: 'Shipping consistency',
  verificationDiscipline: 'Verification discipline',
  productOwnership: 'Product ownership',
  systemDepth: 'System depth',
  buildBreadth: 'Build breadth',
  recoveryEffectiveness: 'Recovery effectiveness',
  contextDiscipline: 'Context discipline',
  agentOrchestration: 'Agent orchestration',
  iterationIntensity: 'Iteration intensity',
  testDiscipline: 'Test discipline',
  planningQuality: 'Planning quality',
  documentationUse: 'Documentation use',
};
