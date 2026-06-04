import type { SearchStrategy, RankingWeights } from './strategy';

export type RejectionReasonCategory =
  | 'wrong_skills'
  | 'weak_proof'
  | 'unclear_contribution'
  | 'weak_backend'
  | 'weak_frontend'
  | 'availability_mismatch'
  | 'too_junior'
  | 'other';

export type SaveReasonCategory =
  | 'strong_project'
  | 'strong_stack'
  | 'clear_contribution'
  | 'startup_experience'
  | 'good_availability'
  | 'other';

export type CandidateFeedbackRecord = {
  founderId: string;
  opportunityId: string;
  builderId: string;
  action: 'saved' | 'rejected' | 'intro_requested' | 'trial_sent' | 'hired';
  reasonCategory?: RejectionReasonCategory | SaveReasonCategory;
  notes?: string;
  shouldAffectRanking: boolean;
  createdAt: Date;
};

export function adjustWeightsFromFeedback(
  currentWeights: RankingWeights,
  feedbackHistory: CandidateFeedbackRecord[]
): RankingWeights {
  if (!feedbackHistory.length) return currentWeights;

  let weights = { ...currentWeights };
  const recentFeedback = feedbackHistory.slice(-20);

  const rejections = recentFeedback.filter((f) => f.action === 'rejected' && f.shouldAffectRanking);
  const saves = recentFeedback.filter((f) => f.action === 'saved' && f.shouldAffectRanking);

  for (const r of rejections) {
    if (r.reasonCategory === 'weak_proof') {
      weights = nudgeWeight(weights, 'proofStrength', +0.02);
    }
    if (r.reasonCategory === 'unclear_contribution') {
      weights = nudgeWeight(weights, 'contributionClarity', +0.02);
    }
    if (r.reasonCategory === 'wrong_skills') {
      weights = nudgeWeight(weights, 'deterministicSkillFit', +0.02);
    }
    if (r.reasonCategory === 'availability_mismatch') {
      weights = nudgeWeight(weights, 'availabilityFit', +0.02);
    }
    if (r.reasonCategory === 'too_junior') {
      weights = nudgeWeight(weights, 'startupReadiness', +0.02);
    }
  }

  for (const s of saves) {
    if (s.reasonCategory === 'strong_project') {
      weights = nudgeWeight(weights, 'semanticProjectFit', +0.02);
    }
    if (s.reasonCategory === 'strong_stack') {
      weights = nudgeWeight(weights, 'deterministicSkillFit', +0.01);
    }
    if (s.reasonCategory === 'clear_contribution') {
      weights = nudgeWeight(weights, 'contributionClarity', +0.01);
    }
  }

  return normalizeWeights(weights);
}

function nudgeWeight(weights: RankingWeights, key: keyof RankingWeights, delta: number): RankingWeights {
  return {
    ...weights,
    [key]: Math.max(0.02, Math.min(0.4, weights[key] + delta)),
  };
}

function normalizeWeights(weights: RankingWeights): RankingWeights {
  const positiveKeys: Array<keyof RankingWeights> = [
    'deterministicSkillFit', 'semanticRoleFit', 'semanticProjectFit', 'proofStrength',
    'contributionClarity', 'founderPreferenceFit', 'hireTypeFit', 'availabilityFit',
    'profileQuality', 'startupReadiness',
  ];
  const penaltyKeys: Array<keyof RankingWeights> = ['negativeSignalPenalty', 'missingEvidencePenalty'];

  const posSum = positiveKeys.reduce((s, k) => s + weights[k], 0);
  const penaltySum = penaltyKeys.reduce((s, k) => s + weights[k], 0);

  const normalized = { ...weights };
  if (posSum > 0) {
    for (const k of positiveKeys) {
      normalized[k] = weights[k] / posSum;
    }
  }
  if (penaltySum > 0) {
    for (const k of penaltyKeys) {
      normalized[k] = weights[k] / penaltySum;
    }
  }

  return normalized;
}

export function buildFeedbackMemoryContent(params: {
  founderName: string;
  builderName: string;
  builderId: string;
  opportunityId: string;
  roleTitle: string;
  action: CandidateFeedbackRecord['action'];
  reason: string;
  reasonCategory?: string;
}): string {
  if (params.action === 'rejected') {
    return `Founder ${params.founderName} rejected candidate "${params.builderName}" (builder ${params.builderId}) for role "${params.roleTitle}" (opportunity ${params.opportunityId}). Reason: ${params.reason}${params.reasonCategory ? ` (${params.reasonCategory})` : ''}. Adjust future ranking to down-weight this pattern.`;
  }
  if (params.action === 'saved') {
    return `Founder ${params.founderName} saved candidate "${params.builderName}" (builder ${params.builderId}) for role "${params.roleTitle}" (opportunity ${params.opportunityId}). Reason: ${params.reason}${params.reasonCategory ? ` (${params.reasonCategory})` : ''}. Use as positive signal.`;
  }
  return `Founder ${params.founderName} took action "${params.action}" on candidate "${params.builderName}" for role "${params.roleTitle}".`;
}
