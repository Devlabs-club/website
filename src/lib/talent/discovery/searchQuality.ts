import type { ScoredCandidate } from './scoring';

export type SearchQualityReport = {
  totalCandidatesScanned: number;
  totalCandidatesRetrieved: number;
  strongCandidates: number;
  mediumCandidates: number;
  weakCandidates: number;
  poolStrength: 'weak' | 'medium' | 'strong';
  confidence: 'low' | 'medium' | 'high';
  bottlenecks: string[];
  suggestedRelaxations: string[];
  suggestedTightening: string[];
  missingSupplySignals: string[];
  summary: string;
};

export function buildSearchQualityReport(params: {
  totalScanned: number;
  scored: ScoredCandidate[];
  opportunity: any;
  searchMode: string;
}): SearchQualityReport {
  const { totalScanned, scored, opportunity } = params;

  const strongCandidates = scored.filter((c) => c.matchLabel === 'Strong Match').length;
  const mediumCandidates = scored.filter((c) => c.matchLabel === 'Good Match').length;
  const weakCandidates = scored.filter((c) => c.matchLabel === 'Possible Match' || c.matchLabel === 'Weak Match').length;
  const totalRetrieved = scored.length;

  const poolStrength: SearchQualityReport['poolStrength'] =
    strongCandidates >= 5 ? 'strong'
    : strongCandidates >= 2 || mediumCandidates >= 5 ? 'medium'
    : 'weak';

  const confidence: SearchQualityReport['confidence'] =
    strongCandidates >= 3 ? 'high'
    : strongCandidates >= 1 || mediumCandidates >= 3 ? 'medium'
    : 'low';

  const bottlenecks = detectBottlenecks(scored, opportunity);
  const suggestedRelaxations = buildRelaxationSuggestions(bottlenecks, opportunity, poolStrength);
  const suggestedTightening = poolStrength === 'strong' ? buildTighteningSuggestions(opportunity) : [];
  const missingSupplySignals = detectMissingSupply(scored, opportunity);

  const summary = buildSummary({
    totalRetrieved,
    strongCandidates,
    mediumCandidates,
    poolStrength,
    bottlenecks,
    suggestedRelaxations,
  });

  return {
    totalCandidatesScanned: totalScanned,
    totalCandidatesRetrieved: totalRetrieved,
    strongCandidates,
    mediumCandidates,
    weakCandidates,
    poolStrength,
    confidence,
    bottlenecks,
    suggestedRelaxations,
    suggestedTightening,
    missingSupplySignals,
    summary,
  };
}

function detectBottlenecks(scored: ScoredCandidate[], opportunity: any): string[] {
  const bottlenecks: string[] = [];

  if (scored.length < 5) {
    bottlenecks.push('Very few candidates matched the search — pool may be too narrow');
  }

  const avgSkillFit = scored.reduce((s, c) => s + c.components.deterministicSkillFit, 0) / (scored.length || 1);
  if (avgSkillFit < 0.4) {
    const skills = (opportunity.skillsNeeded || []).slice(0, 3).join(', ');
    bottlenecks.push(`Low skill match overall — the required stack (${skills || 'specified skills'}) may be rare in this pool`);
  }

  const avgProof = scored.reduce((s, c) => s + c.components.proofStrength, 0) / (scored.length || 1);
  if (avgProof < 0.4) {
    bottlenecks.push('Most candidates lack strong proof-of-work for this role type');
  }

  const avgContrib = scored.reduce((s, c) => s + c.components.contributionClarity, 0) / (scored.length || 1);
  if (avgContrib < 0.3) {
    bottlenecks.push('Contribution clarity is low across candidates — consider work trial to validate');
  }

  const lowAvail = scored.filter((c) => c.components.availabilityFit < 0.3).length;
  if (lowAvail > scored.length * 0.6) {
    bottlenecks.push('Many candidates show low availability for the required commitment');
  }

  return bottlenecks.slice(0, 4);
}

function buildRelaxationSuggestions(bottlenecks: string[], opportunity: any, poolStrength: string): string[] {
  if (poolStrength === 'strong') return [];

  const suggestions: string[] = [];
  const skills = opportunity.skillsNeeded || [];

  if (skills.length > 3) {
    suggestions.push(`Relax to ${skills.slice(0, 2).join(' + ')} as core requirements — treat others as nice-to-have`);
  }

  if (/stripe|payment/i.test(JSON.stringify(skills))) {
    suggestions.push('If Stripe/payment is not required on day one, remove it — it limits the pool significantly');
  }
  if (/kubernetes|k8s|terraform|devops/i.test(JSON.stringify(skills))) {
    suggestions.push('Infrastructure skills are rare in startup builders — consider dropping to nice-to-have');
  }

  if (bottlenecks.some((b) => b.includes('proof'))) {
    suggestions.push('Use a paid work trial to validate candidates with promising skills but unclear proof');
  }

  if (bottlenecks.some((b) => b.includes('availability'))) {
    suggestions.push('Consider internship or part-time candidates if full-time is not critical on day one');
  }

  return suggestions.slice(0, 3);
}

function buildTighteningSuggestions(opportunity: any): string[] {
  const suggestions: string[] = [];
  if (!(opportunity.builderWillDo)) {
    suggestions.push('Add "builder will build" description to tighten results around the actual work');
  }
  if (!(opportunity.timeline)) {
    suggestions.push('Add timeline to filter for available builders');
  }
  return suggestions;
}

function detectMissingSupply(scored: ScoredCandidate[], opportunity: any): string[] {
  const signals: string[] = [];

  if (scored.every((c) => !c.retrievalSources.includes('semantic_project'))) {
    signals.push('No builders with semantically matched project proof found');
  }

  const skills = opportunity.skillsNeeded || [];
  for (const skill of skills.slice(0, 3)) {
    const hasSkill = scored.some((c) => c.components.deterministicSkillFit > 0.5);
    if (!hasSkill) signals.push(`Low supply: builders with strong ${skill} proof are scarce`);
  }

  return signals.slice(0, 3);
}

function buildSummary(params: {
  totalRetrieved: number;
  strongCandidates: number;
  mediumCandidates: number;
  poolStrength: string;
  bottlenecks: string[];
  suggestedRelaxations: string[];
}): string {
  const { totalRetrieved, strongCandidates, mediumCandidates, poolStrength, bottlenecks, suggestedRelaxations } = params;

  let summary = `Found ${totalRetrieved} candidates`;
  if (strongCandidates > 0) {
    summary += `, ${strongCandidates} strong`;
  }
  if (mediumCandidates > 0) {
    summary += `, ${mediumCandidates} good`;
  }
  summary += `. Pool strength: ${poolStrength}.`;

  if (bottlenecks.length > 0) {
    summary += ` Main bottleneck: ${bottlenecks[0].toLowerCase()}.`;
  }
  if (suggestedRelaxations.length > 0) {
    summary += ` Suggestion: ${suggestedRelaxations[0].toLowerCase()}.`;
  }

  return summary;
}
