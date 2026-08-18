import { describe, expect, test } from 'bun:test';
import { buildPoolSummary, renderPoolSummaryMarkdown } from './poolSummary';

describe('pool summary', () => {
  test('reports evidence coverage without treating missing data as a negative', () => {
    const summary = buildPoolSummary({
      totalScanned: 40,
      reasoningCohortCount: 35,
      generatedAt: new Date('2026-07-22T00:00:00.000Z'),
      searchQuality: { poolStrength: 'medium', confidence: 'medium', bottlenecks: [], suggestedRelaxations: [] },
      candidates: [
        {
          builderId: 'a',
          overallFit: 0.8,
          matchLabel: 'Strong Match',
          builder: {
            name: 'Ava',
            enrichmentInsights: { founderHighlights: [{ title: 'Public voice', detail: 'Posts on X', source: 'twitter' }] },
          },
          githubActivity: { source: 'github_api' },
          sponsorship: { need: 'authorized' },
          explanation: {
            whyTheyMatch: 'Strong role proof',
            strongestSignals: ['Relevant project'],
            concerns: [],
            requirementFindings: [{ text: 'React', met: 'yes' }],
          },
        },
        {
          builderId: 'b',
          overallFit: 0.65,
          matchLabel: 'Good Match',
          builder: { name: 'Bea', enrichmentInsights: { founderHighlights: [] } },
          githubActivity: null,
          sponsorship: { need: 'unknown' },
          explanation: { strongestSignals: [], concerns: [], requirementFindings: [{ text: 'React', met: 'partial' }] },
        },
      ],
    });

    expect(summary.reasoningCohortCount).toBe(35);
    expect(summary.evidenceCoverage.githubActivityAvailable).toBe(1);
    expect(summary.evidenceCoverage.publicPresenceEvidence).toBe(1);
    expect(summary.evidenceCoverage.sponsorshipKnown).toBe(1);
    expect(summary.requirementCoverage[0]).toEqual({ text: 'React', met: 1, partial: 1, unmet: 0 });
    expect(summary.locationMix).toBeNull();
    expect(renderPoolSummaryMarkdown(summary)).toContain('Missing evidence is treated as unknown');
  });
});
