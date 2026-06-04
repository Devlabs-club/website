import type { ScoredCandidate } from './scoring';

export type LlmCandidateJudgment = {
  builderId: string;
  fitSummary: string;
  evidenceBasedReasoning: string[];
  risks: string[];
  missingInformation: string[];
  recommendedAction: 'intro' | 'trial' | 'save' | 'pass';
  rerankBoost: number;
  rerankPenalty: number;
};

export async function rerankTopCandidates(params: {
  candidates: ScoredCandidate[];
  opportunity: any;
  builderMap: Map<string, { builder: any; projects: any[] }>;
  generateReply: (systemPrompt: string, userPrompt: string) => Promise<string>;
  limit?: number;
}): Promise<ScoredCandidate[]> {
  const { candidates, opportunity, builderMap, generateReply, limit = 25 } = params;

  const top = candidates.slice(0, limit);

  if (!top.length) return candidates;

  const judgments = await Promise.allSettled(
    top.map((candidate) => judgeCandidate({ candidate, opportunity, builderMap, generateReply }))
  );

  const judgedMap = new Map<string, LlmCandidateJudgment>();
  for (const result of judgments) {
    if (result.status === 'fulfilled' && result.value) {
      judgedMap.set(result.value.builderId, result.value);
    }
  }

  return candidates.map((candidate) => {
    const judgment = judgedMap.get(candidate.builderId);
    if (!judgment) return candidate;

    const adjusted = {
      ...candidate,
      components: {
        ...candidate.components,
        llmRerankAdjustment: judgment.rerankBoost - judgment.rerankPenalty,
      },
      explanation: {
        ...candidate.explanation,
        strongestSignals: judgment.evidenceBasedReasoning.length
          ? judgment.evidenceBasedReasoning
          : candidate.explanation.strongestSignals,
        concerns: judgment.risks.length ? judgment.risks : candidate.explanation.concerns,
        missingEvidence: judgment.missingInformation.length
          ? judgment.missingInformation
          : candidate.explanation.missingEvidence,
        recommendedAction: mapJudgmentAction(judgment.recommendedAction),
      },
    };

    return adjusted;
  }).sort((a, b) => {
    const aFit = computeFitWithAdjustment(a);
    const bFit = computeFitWithAdjustment(b);
    return bFit - aFit;
  });
}

async function judgeCandidate(params: {
  candidate: ScoredCandidate;
  opportunity: any;
  builderMap: Map<string, { builder: any; projects: any[] }>;
  generateReply: (systemPrompt: string, userPrompt: string) => Promise<string>;
}): Promise<LlmCandidateJudgment | null> {
  const { candidate, opportunity, builderMap, generateReply } = params;
  const data = builderMap.get(candidate.builderId);
  if (!data) return null;

  const { builder, projects } = data;

  const systemPrompt = `You are a hiring intelligence system evaluating builder-to-role fit.
Evaluate whether this builder is a strong fit for the role. Be evidence-based and honest about risks.
Return strictly valid JSON with keys: fitSummary (string), evidenceBasedReasoning (string[]), risks (string[]), missingInformation (string[]), recommendedAction ("intro"|"trial"|"save"|"pass"), rerankBoost (number 0-0.15), rerankPenalty (number 0-0.15).
rerankBoost: how much to boost this candidate above their score (0 = no boost, 0.15 = significant boost).
rerankPenalty: how much to penalize this candidate (0 = no penalty, 0.15 = significant penalty).
No markdown, just JSON.`;

  const userPrompt = `Role: ${opportunity.roleTitle || 'Unknown'}
What they will build: ${opportunity.builderWillDo || 'Not specified'}
Required skills: ${(opportunity.skillsNeeded || []).join(', ') || 'Not specified'}
Hire type: ${opportunity.hireType || opportunity.workType || 'Not specified'}

Builder: ${builder.name || 'Unknown'}
Headline: ${builder.headline || 'None'}
Skills/roles: ${(builder.rolePreference || []).join(', ') || 'None listed'}
Availability: ${builder.availability?.availableNow ? `Available, ${builder.availability.hoursPerWeek || '?'} hrs/week` : 'Not available'}

Top projects (up to 3):
${projects.slice(0, 3).map((p: any, i: number) => `${i + 1}. ${p.projectName || 'Unnamed'}: ${p.description || 'No description'}. Contribution: ${p.builderContribution || 'Not stated'}. Stack: ${(p.techStack || []).join(', ')}. Verified: ${p.verificationStatus || 'unverified'}.`).join('\n')}

Current deterministic score: ${(candidate.overallFit * 100).toFixed(0)}/100`;

  try {
    const raw = await generateReply(systemPrompt, userPrompt);
    const json = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(json);
    return {
      builderId: candidate.builderId,
      fitSummary: String(parsed.fitSummary || ''),
      evidenceBasedReasoning: Array.isArray(parsed.evidenceBasedReasoning) ? parsed.evidenceBasedReasoning.slice(0, 4) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3) : [],
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation.slice(0, 3) : [],
      recommendedAction: (['intro', 'trial', 'save', 'pass'].includes(parsed.recommendedAction) ? parsed.recommendedAction : 'save') as LlmCandidateJudgment['recommendedAction'],
      rerankBoost: Math.min(0.15, Math.max(0, Number(parsed.rerankBoost) || 0)),
      rerankPenalty: Math.min(0.15, Math.max(0, Number(parsed.rerankPenalty) || 0)),
    };
  } catch {
    return null;
  }
}

function mapJudgmentAction(action: LlmCandidateJudgment['recommendedAction']): ScoredCandidate['explanation']['recommendedAction'] {
  if (action === 'intro') return 'request_intro';
  if (action === 'trial') return 'send_trial';
  if (action === 'pass') return 'reject';
  return 'save';
}

function computeFitWithAdjustment(candidate: ScoredCandidate): number {
  return Math.max(0, Math.min(1, candidate.overallFit + candidate.components.llmRerankAdjustment));
}
