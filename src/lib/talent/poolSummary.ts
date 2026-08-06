import { resolveCandidateNarrative } from '@/lib/talent/discovery/scoring';

export type PoolSummary = {
  generatedAt: string;
  scannedBuilders: number;
  candidatesReturned: number;
  reasoningCohortCount: number;
  strongCandidates: number;
  goodCandidates: number;
  poolStrength: 'weak' | 'medium' | 'strong' | 'none';
  confidence: 'low' | 'medium' | 'high';
  bottlenecks: string[];
  suggestedRelaxations: string[];
  noRelevantMatches: boolean;
  requirementCoverage: Array<{
    text: string;
    met: number;
    partial: number;
    unmet: number;
  }>;
  evidenceCoverage: {
    githubActivityAvailable: number;
    publicPresenceEvidence: number;
    sponsorshipKnown: number;
  };
  candidates: Array<{
    builderId: string;
    name: string;
    score: number;
    label: string;
    whyTheyMatch: string;
    concerns: string[];
    evidence: string[];
  }>;
  evidenceDisclaimer: string;
};

function hasPublicPresence(builder: any) {
  const highlights = builder?.enrichmentInsights?.founderHighlights || [];
  return Array.isArray(highlights) && highlights.some((item: any) =>
    /twitter|x\/|public voice|public technical presence|post|writing|talk/i.test(
      `${item?.title || ''} ${item?.detail || ''} ${item?.source || ''}`
    )
  );
}

export function buildPoolSummary(result: any): PoolSummary {
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  const requirementMap = new Map<string, { text: string; met: number; partial: number; unmet: number }>();

  for (const candidate of candidates) {
    for (const finding of candidate?.explanation?.requirementFindings || []) {
      const text = String(finding?.text || '').trim();
      if (!text) continue;
      const current = requirementMap.get(text) || { text, met: 0, partial: 0, unmet: 0 };
      if (finding.met === 'yes') current.met += 1;
      else if (finding.met === 'partial') current.partial += 1;
      else current.unmet += 1;
      requirementMap.set(text, current);
    }
  }

  const githubActivityAvailable = candidates.filter(
    (candidate: any) => candidate?.githubActivity?.source === 'github_api'
  ).length;
  const publicPresenceEvidence = candidates.filter((candidate: any) => hasPublicPresence(candidate.builder)).length;
  const sponsorshipKnown = candidates.filter(
    (candidate: any) => candidate?.sponsorship?.need && candidate.sponsorship.need !== 'unknown'
  ).length;

  return {
    generatedAt: new Date(result?.generatedAt || Date.now()).toISOString(),
    scannedBuilders: Number(result?.totalScanned || 0),
    candidatesReturned: candidates.length,
    reasoningCohortCount: Number(result?.reasoningCohortCount || 0),
    strongCandidates: candidates.filter((candidate: any) => candidate.matchLabel === 'Strong Match').length,
    goodCandidates: candidates.filter((candidate: any) => candidate.matchLabel === 'Good Match').length,
    poolStrength: result?.searchQuality?.poolStrength || (candidates.length ? 'weak' : 'none'),
    confidence: result?.searchQuality?.confidence || 'low',
    bottlenecks: (result?.searchQuality?.bottlenecks || []).slice(0, 3),
    suggestedRelaxations: (result?.searchQuality?.suggestedRelaxations || []).slice(0, 2),
    noRelevantMatches: Boolean(
      result?.noRelevantMatches || result?.searchQuality?.noRelevantMatches || candidates.length === 0
    ),
    requirementCoverage: [...requirementMap.values()].slice(0, 8),
    evidenceCoverage: { githubActivityAvailable, publicPresenceEvidence, sponsorshipKnown },
    candidates: candidates.slice(0, 8).map((candidate: any) => ({
      builderId: String(candidate.builderId),
      name: String(candidate.builder?.name || 'Builder'),
      score: Math.round((Number(candidate.overallFit) || 0) * 100),
      label: candidate.matchLabel || 'Possible Match',
      whyTheyMatch: candidate.explanation
        ? resolveCandidateNarrative(candidate.explanation, candidate.builder, candidate.projects || [])
        : '',
      concerns: (candidate.explanation?.concerns || []).slice(0, 2),
      evidence: (candidate.explanation?.strongestSignals || []).slice(0, 3),
    })),
    evidenceDisclaimer: `Counts reflect the ${candidates.length} candidates returned from ${Number(result?.totalScanned || 0)} builders scanned on ${new Date(result?.generatedAt || Date.now()).toISOString().slice(0, 10)}.`,
  };
}

export function renderPoolSummaryMarkdown(summary: PoolSummary): string {
  if (summary.noRelevantMatches || summary.candidatesReturned === 0) {
    const lines = [
      '## No matching builders',
      '',
      `I scanned **${summary.scannedBuilders}** builders and **did not find anyone who matches this role**.`,
      '',
      'I am **not** showing closest-fit or weak alternatives — none cleared the must-haves and relevant evidence bar for this search.',
    ];
    if (summary.bottlenecks.length) {
      lines.push('', '### Why the pool is empty', '');
      for (const bottleneck of summary.bottlenecks) lines.push(`- ${bottleneck}`);
    }
    if (summary.suggestedRelaxations.length) {
      lines.push('', '### If you want a broader search', '');
      for (const suggestion of summary.suggestedRelaxations) lines.push(`- ${suggestion}`);
    }
    return lines.join('\n');
  }

  const lines = [
    '## Talent pool overview',
    '',
    `I reviewed **${summary.reasoningCohortCount || summary.candidatesReturned} qualified candidates** from **${summary.scannedBuilders} builders scanned**.`,
    `- **${summary.strongCandidates}** strong and **${summary.goodCandidates}** good matches in the current shortlist.`,
    `- Pool confidence: **${summary.confidence}**.`,
  ];

  if (summary.candidates.length) {
    lines.push('', '### Recommended starting points', '');
    for (const candidate of summary.candidates.slice(0, 5)) {
      lines.push(`1. **${candidate.name}** (${candidate.score}% · ${candidate.label})`);
      if (candidate.whyTheyMatch) lines.push(`   - ${candidate.whyTheyMatch}`);
      if (candidate.concerns.length) lines.push(`   - Watch: ${candidate.concerns.join('; ')}`);
    }
  }

  if (summary.bottlenecks.length || summary.suggestedRelaxations.length) {
    lines.push('', '### Trade-offs and coverage', '');
    for (const bottleneck of summary.bottlenecks) lines.push(`- ${bottleneck}`);
    for (const suggestion of summary.suggestedRelaxations) lines.push(`- If you want a broader pool: ${suggestion}`);
  }

  lines.push(
    '',
    '### Evidence coverage',
    '',
    `- Verified GitHub activity: ${summary.evidenceCoverage.githubActivityAvailable}/${summary.candidatesReturned} shown`,
    `- Public social/publishing evidence: ${summary.evidenceCoverage.publicPresenceEvidence}/${summary.candidatesReturned} shown`,
    `- Clear sponsorship signals: ${summary.evidenceCoverage.sponsorshipKnown}/${summary.candidatesReturned} shown`,
    '',
    `_Note: ${summary.evidenceDisclaimer} Missing evidence is treated as unknown, not as a negative claim._`
  );
  return lines.join('\n');
}
