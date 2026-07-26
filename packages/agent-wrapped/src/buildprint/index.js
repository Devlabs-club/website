import { extractFacts } from './extractFacts.js';
import { computeSignals } from './computeSignals.js';
import { computeEvidenceStrength } from './evidenceStrength.js';
import { qualifyIdentities } from './qualifyIdentities.js';
import { presentBuildprint, toLegacyCompatFields } from './presentBuildprint.js';

export function buildBuildprint({ samples, languages = [], frameworks = [] }) {
  const facts = extractFacts(samples);
  const signals = computeSignals(facts);
  const { evidenceStrength, confidence } = computeEvidenceStrength(facts, signals);
  const { earnedIdentities, primaryIdentityId, nextUnlock } = qualifyIdentities(
    facts,
    signals,
    confidence
  );
  const buildprint = presentBuildprint({
    facts,
    signals,
    evidenceStrength,
    confidence,
    earnedIdentities,
    primaryIdentityId,
    nextUnlock,
    languages,
    frameworks,
  });
  const legacy = toLegacyCompatFields(buildprint, facts, signals);
  return { buildprint, facts, signals, legacy };
}

export { extractFacts, computeSignals, qualifyIdentities };
