/**
 * Curated professional builder identities.
 * Do not invent titles at runtime. Agent Orchestrator is catalogued but not awarded in MVP.
 */

export const IDENTITY_CATALOG = [
  {
    id: 'product_shipper',
    label: 'Product Shipper',
    awardable: true,
    cardLine: 'I turn rough ideas into working products.',
    weights: {
      shippingConsistency: 0.3,
      productOwnership: 0.25,
      iterationIntensity: 0.2,
      verificationDiscipline: 0.25,
    },
    gates: {
      minSubstantialSessions: 8,
      minProjectCount: 2,
      minProductSurfaceSessions: 5,
      minVerificationDiscipline: 55,
    },
    disqualify: {
      maxVerificationDiscipline: 40,
    },
  },
  {
    id: 'debugging_closer',
    label: 'Debugging Closer',
    awardable: true,
    cardLine: 'I stay with the problem until the fix works.',
    weights: {
      recoveryEffectiveness: 0.4,
      iterationIntensity: 0.3,
      verificationDiscipline: 0.3,
    },
    gates: {
      minSubstantialSessions: 6,
      minRecoveryLoopEvents: 8,
      minRecoveryEffectiveness: 60,
    },
  },
  {
    id: 'full_stack_owner',
    label: 'Full-Stack Owner',
    awardable: true,
    cardLine: 'I work across the stack and own the final result.',
    weights: {
      buildBreadth: 0.25,
      productOwnership: 0.25,
      systemDepth: 0.2,
      verificationDiscipline: 0.3,
    },
    gates: {
      minFrontendSignal: 50,
      minBackendSignal: 50,
      minConnectedWorkflowSessions: 4,
      minProjectCount: 2,
    },
  },
  {
    id: 'reliability_builder',
    label: 'Reliability Builder',
    awardable: true,
    cardLine: 'I test the work and make sure it holds up.',
    weights: {
      verificationDiscipline: 0.35,
      testDiscipline: 0.35,
      recoveryEffectiveness: 0.3,
    },
    gates: {
      minSubstantialSessions: 6,
      minTestActivitySessions: 5,
      minVerificationDiscipline: 65,
    },
  },
  {
    id: 'agent_orchestrator',
    label: 'Agent Orchestrator',
    awardable: false, // deferred until multi-agent overlap telemetry is reliable
    cardLine: 'I split the work clearly and bring it back together.',
    weights: {
      agentOrchestration: 0.5,
      contextDiscipline: 0.25,
      verificationDiscipline: 0.25,
    },
    gates: {
      minAgentsUsed: 2,
      minMultiAgentSessions: 3,
      minVerificationDiscipline: 50,
    },
  },
  {
    id: 'context_architect',
    label: 'Context Architect',
    awardable: true,
    cardLine: 'I make the work clear before the build gets complicated.',
    weights: {
      contextDiscipline: 0.45,
      planningQuality: 0.3,
      documentationUse: 0.25,
    },
    gates: {
      minContextArtifacts: 1,
      minContextHeavySessions: 5,
    },
  },
  {
    id: 'systems_builder',
    label: 'Systems Builder',
    awardable: true,
    cardLine: 'I build the systems behind the product.',
    weights: {
      systemDepth: 0.45,
      verificationDiscipline: 0.3,
      buildBreadth: 0.25,
    },
    gates: {
      minSystemsSessions: 5,
      minSystemDepth: 60,
    },
  },
  {
    id: 'prototype_sprinter',
    label: 'Prototype Sprinter',
    awardable: true,
    cardLine: 'Give me an idea. I’ll turn it into something usable.',
    weights: {
      iterationIntensity: 0.35,
      shippingConsistency: 0.35,
      productOwnership: 0.2,
      verificationDiscipline: 0.1,
    },
    gates: {
      minSubstantialSessions: 5,
      minFastSessionShare: 40,
      minVerificationDiscipline: 35,
    },
    disqualify: {
      maxVerificationDiscipline: 25,
      requireProductSignals: true,
    },
  },
];

export function getIdentityById(id) {
  return IDENTITY_CATALOG.find((item) => item.id === id) || null;
}
