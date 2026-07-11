import { scoreMatchLabel, type ScoredCandidate } from './scoring';
import { normalizeRequirements } from '@/lib/talent/searchTokens';
import type { SearchPlan } from '@/lib/talent/searchPlan';

export type LlmCandidateJudgment = {
  builderId: string;
  fitSummary: string;
  requirementFindings: Array<{
    text: string;
    met: 'yes' | 'partial' | 'no';
    evidence: string;
  }>;
  evidenceBasedReasoning: string[];
  risks: string[];
  missingInformation: string[];
  recommendedAction: 'intro' | 'trial' | 'save' | 'pass';
  rerankBoost: number;
  rerankPenalty: number;
};

/**
 * One batched LLM call over the top N candidates (default 12).
 * SearchPlan already expanded founder requirements; this only nudges edge cases.
 */
export async function rerankTopCandidates(params: {
  candidates: ScoredCandidate[];
  opportunity: any;
  builderMap: Map<string, { builder: any; projects: any[] }>;
  generateReply: (systemPrompt: string, userPrompt: string) => Promise<string>;
  limit?: number;
}): Promise<ScoredCandidate[]> {
  const { candidates, opportunity, builderMap, generateReply, limit = 12 } = params;
  const top = candidates.slice(0, limit);
  if (!top.length) return candidates;

  const judgments = await judgeCandidatesBatch({
    candidates: top,
    opportunity,
    builderMap,
    generateReply,
  });
  const judgedMap = new Map(judgments.map((judgment) => [judgment.builderId, judgment]));

  return candidates
    .map((candidate) => {
      const judgment = judgedMap.get(candidate.builderId);
      if (!judgment) return candidate;

      const adjustedFit = computeFitWithAdjustment({
        ...candidate,
        components: {
          ...candidate.components,
          llmRerankAdjustment: judgment.rerankBoost - judgment.rerankPenalty,
        },
      });

      return {
        ...candidate,
        overallFit: adjustedFit,
        matchLabel: scoreMatchLabel(adjustedFit),
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
          requirementFindings: judgment.requirementFindings.length
            ? judgment.requirementFindings
            : candidate.explanation.requirementFindings,
          recommendedAction: mapJudgmentAction(judgment.recommendedAction),
        },
      };
    })
    .sort((a, b) => computeFitWithAdjustment(b) - computeFitWithAdjustment(a));
}

async function judgeCandidatesBatch(params: {
  candidates: ScoredCandidate[];
  opportunity: any;
  builderMap: Map<string, { builder: any; projects: any[] }>;
  generateReply: (systemPrompt: string, userPrompt: string) => Promise<string>;
}): Promise<LlmCandidateJudgment[]> {
  const { candidates, opportunity, builderMap, generateReply } = params;
  const requirements = normalizeRequirements(opportunity);
  const plan = opportunity?.searchPlan as SearchPlan | undefined;

  const planBlock = plan?.requirements?.length
    ? plan.requirements
        .map(
          (requirement, index) =>
            `${index + 1}. [${requirement.importance}] ${requirement.text}\n   mode=${requirement.mode}; matchAnyOf=${requirement.matchAnyOf.slice(0, 12).join(', ')}`
        )
        .join('\n')
    : requirements
        .map((requirement, index) => `${index + 1}. [${requirement.importance}] ${requirement.text}`)
        .join('\n');

  const systemPrompt = `You are a hiring intelligence system doing a FINAL nudge pass over shortlisted builders.
A SearchPlan already expanded founder requirements into concrete match tokens. Deterministic scoring already applied must/nice gates.
Your job: only adjust for edge cases the token matcher may miss (synonyms, related companies/schools, project evidence phrasing).
Return strictly valid JSON: {"judgments":[{builderId, fitSummary, requirementFindings:[{text, met:"yes"|"partial"|"no", evidence}], evidenceBasedReasoning:string[], risks:string[], missingInformation:string[], recommendedAction:"intro"|"trial"|"save"|"pass", rerankBoost:number, rerankPenalty:number}]}
Constraints:
- rerankBoost and rerankPenalty are each 0-0.12.
- Prefer small adjustments. Do not invent employers, schools, or projects absent from evidence.
- Include one judgment object per candidate builderId provided.`;

  const candidateBlocks = candidates.map((candidate, index) => {
    const data = builderMap.get(candidate.builderId);
    if (!data) return `${index + 1}. builderId=${candidate.builderId} (missing profile)`;
    const { builder, projects } = data;
    return `${index + 1}. builderId=${candidate.builderId}
Name: ${builder.name || 'Unknown'}
Score: ${(candidate.overallFit * 100).toFixed(0)}/100
Headline: ${builder.headline || 'None'}
Skills: ${(builder.rolePreference || []).slice(0, 10).join(', ') || 'None'}
Education:
${formatEducation(builder)}
Experience:
${formatExperience(builder)}
Projects:
${projects
  .slice(0, 3)
  .map(
    (project: any, projectIndex: number) =>
      `${projectIndex + 1}. ${project.projectName || 'Unnamed'}: ${String(project.description || '').slice(0, 120)}. Contribution: ${String(project.builderContribution || '').slice(0, 100)}. Stack: ${(project.techStack || []).slice(0, 6).join(', ')}`
  )
  .join('\n') || 'None'}`;
  });

  const userPrompt = `Role: ${opportunity.roleTitle || opportunity.title || 'Unknown'}
What they will build: ${opportunity.builderWillDo || opportunity.description || 'Not specified'}
Skills: ${(opportunity.skillsNeeded || []).slice(0, 10).join(', ') || 'Not specified'}

Compiled requirements:
${planBlock || 'None'}

Candidates (${candidates.length}):
${candidateBlocks.join('\n\n')}`;

  try {
    const raw = await generateReply(systemPrompt, userPrompt);
    const json = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(json);
    const rows = Array.isArray(parsed?.judgments) ? parsed.judgments : Array.isArray(parsed) ? parsed : [];
    const allowedIds = new Set(candidates.map((candidate) => candidate.builderId));

    return rows
      .map((row: any): LlmCandidateJudgment | null => {
        const builderId = String(row?.builderId || '');
        if (!builderId || !allowedIds.has(builderId)) return null;
        return {
          builderId,
          fitSummary: String(row.fitSummary || '').slice(0, 240),
          requirementFindings: Array.isArray(row.requirementFindings)
            ? row.requirementFindings
                .map((finding: any) => ({
                  text: String(finding?.text || '').slice(0, 180),
                  met:
                    finding?.met === 'yes' || finding?.met === 'partial' || finding?.met === 'no'
                      ? finding.met
                      : 'partial',
                  evidence: String(finding?.evidence || '').slice(0, 240),
                }))
                .filter((finding: { text: string }) => finding.text)
                .slice(0, 8)
            : [],
          evidenceBasedReasoning: Array.isArray(row.evidenceBasedReasoning)
            ? row.evidenceBasedReasoning.map(String).slice(0, 4)
            : [],
          risks: Array.isArray(row.risks) ? row.risks.map(String).slice(0, 3) : [],
          missingInformation: Array.isArray(row.missingInformation)
            ? row.missingInformation.map(String).slice(0, 3)
            : [],
          recommendedAction: (['intro', 'trial', 'save', 'pass'].includes(row.recommendedAction)
            ? row.recommendedAction
            : 'save') as LlmCandidateJudgment['recommendedAction'],
          rerankBoost: Math.min(0.12, Math.max(0, Number(row.rerankBoost) || 0)),
          rerankPenalty: Math.min(0.12, Math.max(0, Number(row.rerankPenalty) || 0)),
        };
      })
      .filter(Boolean) as LlmCandidateJudgment[];
  } catch (error) {
    console.warn('[rerank] batched judgment failed', error instanceof Error ? error.message : error);
    return [];
  }
}

function formatEducation(builder: any): string {
  const rows = (builder.education || [])
    .slice(0, 4)
    .map((entry: any) => [entry.school, entry.degree, entry.field].filter(Boolean).join(' — '))
    .filter(Boolean)
    .map((line: string, i: number) => `${i + 1}. ${line}`);
  if (rows.length) return rows.join('\n');
  return builder.universityOrCompany ? `1. ${builder.universityOrCompany}` : 'None listed';
}

function formatExperience(builder: any): string {
  const rows = (builder.experiences || [])
    .slice(0, 5)
    .map((entry: any, i: number) => {
      const title = [entry.title, entry.company].filter(Boolean).join(' at ') || 'Role';
      const details = [entry.dateRange, entry.description ? String(entry.description).slice(0, 100) : null]
        .filter(Boolean)
        .join('. ');
      return `${i + 1}. ${title}${details ? ` — ${details}` : ''}`;
    });
  return rows.length ? rows.join('\n') : 'None listed';
}

function mapJudgmentAction(
  action: LlmCandidateJudgment['recommendedAction']
): ScoredCandidate['explanation']['recommendedAction'] {
  if (action === 'intro') return 'request_intro';
  if (action === 'trial') return 'send_trial';
  if (action === 'pass') return 'reject';
  return 'save';
}

function computeFitWithAdjustment(candidate: ScoredCandidate): number {
  return Math.max(0, Math.min(1, candidate.overallFit + candidate.components.llmRerankAdjustment));
}
