import { MIN_SESSIONS_FOR_IDENTITY } from './constants.js';

/**
 * Evidence Strength describes evidence amount/diversity/reliability — not a quality grade.
 */
export function computeEvidenceStrength(facts, signals) {
  const signalValues = Object.values(signals).filter((v) => typeof v === 'number');
  const above50 = signalValues.filter((v) => v >= 50).length;
  const timedRatio =
    facts.substantialSessions > 0
      ? facts.timedSubstantial / facts.substantialSessions
      : 0;

  let confidence = 'low';
  if (facts.substantialSessions >= 12 && facts.projectCount >= 3 && timedRatio >= 0.35) {
    confidence = 'high';
  } else if (facts.substantialSessions >= MIN_SESSIONS_FOR_IDENTITY && facts.projectCount >= 1) {
    confidence = 'moderate';
  }

  let evidenceStrength = 'emerging';
  if (
    facts.substantialSessions >= 20 &&
    facts.projectCount >= 4 &&
    above50 >= 5 &&
    confidence === 'high'
  ) {
    evidenceStrength = 'exceptional';
  } else if (facts.substantialSessions >= 12 && facts.projectCount >= 2 && above50 >= 3) {
    evidenceStrength = 'verified';
  } else if (facts.substantialSessions >= MIN_SESSIONS_FOR_IDENTITY && above50 >= 2) {
    evidenceStrength = 'established';
  }

  return { evidenceStrength, confidence };
}
