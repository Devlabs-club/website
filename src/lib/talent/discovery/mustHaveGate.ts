import { getSearchRequirements } from '@/lib/talent/searchTokens';
import type { CandidateScoreComponents } from './scoring';

export type RequirementFinding = {
  text: string;
  met: 'yes' | 'partial' | 'no';
  evidence: string;
};

export type MustHaveGateResult = {
  mustRequirementCount: number;
  unmetMustCount: number;
  unmetPartialCount: number;
  passesMustGate: boolean;
};

export function evaluateMustHaveGate(
  opportunity: any,
  requirementFindings: RequirementFinding[]
): MustHaveGateResult {
  const requirements = getSearchRequirements(opportunity);
  const mustRequirements = requirements.filter((requirement) => requirement.importance === 'must');
  if (!mustRequirements.length) {
    return {
      mustRequirementCount: 0,
      unmetMustCount: 0,
      unmetPartialCount: 0,
      passesMustGate: true,
    };
  }

  const findingsByText = new Map(
    requirementFindings.map((finding) => [finding.text.toLowerCase(), finding])
  );

  let unmetMustCount = 0;
  let unmetPartialCount = 0;
  for (const requirement of mustRequirements) {
    const finding = findingsByText.get(requirement.text.toLowerCase());
    if (!finding || finding.met === 'no') unmetMustCount += 1;
    else if (finding.met === 'partial') unmetPartialCount += 1;
  }

  return {
    mustRequirementCount: mustRequirements.length,
    unmetMustCount,
    unmetPartialCount,
    passesMustGate: unmetMustCount === 0,
  };
}

export function applyMustHavePenalties(
  components: CandidateScoreComponents,
  gate: MustHaveGateResult
): CandidateScoreComponents {
  if (gate.mustRequirementCount === 0) return components;

  let negativeSignalPenalty = components.negativeSignalPenalty;
  if (gate.unmetMustCount > 0) {
    negativeSignalPenalty = Math.min(1, negativeSignalPenalty + 0.35 * gate.unmetMustCount);
  }
  if (gate.unmetPartialCount > 0) {
    negativeSignalPenalty = Math.min(1, negativeSignalPenalty + 0.12 * gate.unmetPartialCount);
  }

  return {
    ...components,
    negativeSignalPenalty,
  };
}

/** Prevent unmet must-haves from ranking as Good/Strong matches even with strong skills. */
export function capOverallFitForMustGate(overallFit: number, gate: MustHaveGateResult): number {
  if (gate.unmetMustCount === 0) return overallFit;
  const cap = gate.unmetPartialCount > 0 ? 0.38 : 0.32;
  return Math.min(overallFit, cap);
}
