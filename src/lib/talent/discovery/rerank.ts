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

const REASONING_COHORT_LIMIT = 35;
// Detailed dossiers are intentionally rich. Keep batches small enough that a
// reasoning model can return every required judgment without truncating JSON.
const REASONING_BATCH_SIZE = 8;

/**
 * Review the strongest eligible cohort, rather than only the visible shortlist.
 * The model gets bounded, evidence-rich dossiers in batches to keep each request
 * auditable and within provider context/output limits.
 */
export async function rerankTopCandidates(params: {
  candidates: ScoredCandidate[];
  opportunity: any;
  builderMap: Map<string, { builder: any; projects: any[] }>;
  generateReply: (systemPrompt: string, userPrompt: string) => Promise<string>;
  limit?: number;
}): Promise<ScoredCandidate[]> {
  const { candidates, opportunity, builderMap, generateReply, limit = REASONING_COHORT_LIMIT } = params;
  const top = candidates.slice(0, Math.min(limit, REASONING_COHORT_LIMIT));
  if (!top.length) return candidates;

  const batches: ScoredCandidate[][] = [];
  for (let index = 0; index < top.length; index += REASONING_BATCH_SIZE) {
    batches.push(top.slice(index, index + REASONING_BATCH_SIZE));
  }
  const judgmentBatches = await Promise.all(batches.map((batch) =>
    judgeCandidatesBatch({
      candidates: batch,
      opportunity,
      builderMap,
      generateReply,
    })
  ));
  const judgments = judgmentBatches.flat();
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

  const systemPrompt = `You are a hiring intelligence system reviewing a qualified candidate cohort.
A SearchPlan already expanded founder requirements into concrete match tokens. Deterministic scoring already applied must/nice gates.
Your job is to form a calibrated, evidence-based consensus for each builder, including edge cases token matching may miss.
Return strictly valid JSON: {"judgments":[{builderId,evidenceBasedReasoning:string[],risks:string[],recommendedAction:"intro"|"trial"|"save"|"pass",rerankBoost:number,rerankPenalty:number}]}
Constraints:
- Return at most 2 evidenceBasedReasoning items and 1 risk, each under 120 characters.
- rerankBoost and rerankPenalty are each 0-0.25.
- Boost builders whose experience/project proof matches the role's domain center of gravity (what they will actually build). Penalize stack/ship-only profiles that lack that domain proof.
- Prefer practiced role evidence (job titles, shipped projects, internships in-domain) over course TA / skill-list mentions.
- Do not invent employers, schools, projects, social activity, work authorization, or GitHub activity absent from the dossier.
- Never mark a must-have as met without concrete evidence. Do not override unmet must-haves with boosts.
- You may make a qualitative inference only when multiple evidence fields support it. State uncertainty in missingInformation instead of treating missing public evidence as a negative fact.
- Include one judgment object per candidate builderId provided.`;

  const candidateBlocks = candidates.map((candidate, index) => {
    const data = builderMap.get(candidate.builderId);
    if (!data) return `${index + 1}. builderId=${candidate.builderId} (missing profile)`;
    const { builder, projects } = data;
    const highlights = Array.isArray(builder.enrichmentInsights?.founderHighlights)
      ? builder.enrichmentInsights.founderHighlights
      : [];
    const github = builder.integrations?.github?.activitySnapshot;
    const sponsorship = builder.workAuthorization || 'Unknown';
    const dossierWhy = (candidate as any).evidenceDossier?.whyTheyMatch
      ? String((candidate as any).evidenceDossier.whyTheyMatch).slice(0, 220)
      : '';
    const domainScore =
      (candidate as any).roleDimensionScore?.hits?.find((hit: any) => hit.id === 'domain_depth')?.score;
    return `${index + 1}. builderId=${candidate.builderId}
Score: ${(candidate.overallFit * 100).toFixed(0)}/100
Headline: ${builder.headline || 'None'}
Skills: ${[...(builder.rolePreference || []), ...(builder.skills || [])].slice(0, 8).join(', ') || 'None'}
Domain depth: ${typeof domainScore === 'number' ? domainScore.toFixed(2) : 'n/a'}
Role evidence summary: ${dossierWhy || 'None'}
Deterministic components: skill=${candidate.components.deterministicSkillFit.toFixed(2)}, proof=${candidate.components.proofStrength.toFixed(2)}, GitHub=${candidate.components.githubActivityFit.toFixed(2)}, sponsorship=${candidate.components.sponsorshipFit.toFixed(2)}
Work authorization: ${sponsorship}
GitHub activity: ${github?.source === 'github_api'
  ? `score ${Math.round((github.score || 0) * 100)}/100, ${github.recentEventCount || 0} recent events, ${github.recentlyPushedRepos || 0} recently pushed repos`
  : 'Unavailable'}
Public/enrichment evidence:
${highlights.slice(0, 2).map((item: any) => `- [${item.source || 'profile'}] ${item.title}: ${String(item.detail || '').slice(0, 100)}`).join('\n') || 'None'}
Education:
${formatEducation(builder)}
Experience:
${formatExperience(builder)}
Projects:
${projects
  .slice(0, 4)
  .map(
    (project: any, projectIndex: number) =>
      `${projectIndex + 1}. ${project.projectName || 'Unnamed'}: ${String(project.description || '').slice(0, 140)}. Contribution: ${String(project.builderContribution || '').slice(0, 90)}. Stack: ${(project.techStack || []).slice(0, 5).join(', ')}`
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
    let raw = await generateReply(systemPrompt, userPrompt);
    let parsed: any;
    try {
      parsed = parseRerankJson(raw);
    } catch (initialError) {
      // Providers occasionally cut a response mid-string despite JSON mode.
      // Retry the same bounded batch with a smaller response contract.
      raw = await generateReply(
        `${systemPrompt}\nThis is a retry after truncated output. Return compact JSON only. Use at most one evidence item and omit risks.`,
        userPrompt
      );
      try {
        parsed = parseRerankJson(raw);
      } catch (retryError) {
        console.warn('[rerank] batched judgment JSON invalid after retry', {
          batchSize: candidates.length,
          initialError: initialError instanceof Error ? initialError.message : String(initialError),
          retryError: retryError instanceof Error ? retryError.message : String(retryError),
          responseLength: raw.length,
        });
        return [];
      }
    }
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
          rerankBoost: Math.min(0.25, Math.max(0, Number(row.rerankBoost) || 0)),
          rerankPenalty: Math.min(0.25, Math.max(0, Number(row.rerankPenalty) || 0)),
        };
      })
      .filter(Boolean) as LlmCandidateJudgment[];
  } catch (error) {
    console.warn('[rerank] batched judgment failed', error instanceof Error ? error.message : error);
    return [];
  }
}

function parseRerankJson(raw: string) {
  const json = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(json);
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
      const details = [entry.dateRange, entry.description ? String(entry.description).slice(0, 180) : null]
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
