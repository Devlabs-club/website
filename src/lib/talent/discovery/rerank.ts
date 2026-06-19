import { scoreMatchLabel, type ScoredCandidate } from './scoring';

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

    const adjustedFit = computeFitWithAdjustment({
      ...candidate,
      components: {
        ...candidate.components,
        llmRerankAdjustment: judgment.rerankBoost - judgment.rerankPenalty,
      },
    });

    const adjusted = {
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
  const requirements = normalizeRequirements(opportunity);

  const systemPrompt = `You are a hiring intelligence system evaluating builder-to-role fit.
Evaluate whether this builder is a strong fit for the role. Be evidence-based and honest about risks.
The founder may include open-ended natural-language requirements like "interned at big tech", "went to Stanford or Yale", or "built a chat feature". Evaluate those requirements from the evidence only. You may expand common categories yourself: "big tech" can include companies like Google, Meta, Apple, Amazon, Microsoft, Netflix, OpenAI, Anthropic, Stripe, or similarly elite technical companies.
Return strictly valid JSON with keys: fitSummary (string), requirementFindings (array of {text, met: "yes"|"partial"|"no", evidence}), evidenceBasedReasoning (string[]), risks (string[]), missingInformation (string[]), recommendedAction ("intro"|"trial"|"save"|"pass"), rerankBoost (number 0-0.15), rerankPenalty (number 0-0.15).
For must-have requirements, clear evidence should increase rerankBoost and clear misses should increase rerankPenalty. For nice-to-have requirements, use smaller adjustments. Do not infer a school, employer, or feature unless it appears in the profile, education, experience, project, or link evidence.
rerankBoost: how much to boost this candidate above their score (0 = no boost, 0.15 = significant boost).
rerankPenalty: how much to penalize this candidate (0 = no penalty, 0.15 = significant penalty).
No markdown, just JSON.`;

  const userPrompt = `Role: ${opportunity.roleTitle || 'Unknown'}
What they will build: ${opportunity.builderWillDo || 'Not specified'}
Required skills: ${(opportunity.skillsNeeded || []).join(', ') || 'Not specified'}
Open-ended requirements:
${requirements.length ? requirements.map((requirement, i) => `${i + 1}. [${requirement.importance}] ${requirement.text}`).join('\n') : 'None'}
Hire type: ${opportunity.hireType || opportunity.workType || 'Not specified'}

Builder: ${builder.name || 'Unknown'}
Headline: ${builder.headline || 'None'}
Skills/roles: ${(builder.rolePreference || []).join(', ') || 'None listed'}
Education:
${formatEducation(builder)}
Experience:
${formatExperience(builder)}
Availability: ${builder.availability?.availableNow ? `Available, ${builder.availability.hoursPerWeek || '?'} hrs/week` : 'Not available'}

Top projects (up to 3):
${projects.slice(0, 5).map((p: any, i: number) => `${i + 1}. ${p.projectName || 'Unnamed'}: ${p.description || 'No description'}. Problem: ${p.problemSolved || 'Not stated'}. Contribution: ${p.builderContribution || 'Not stated'}. Stack: ${(p.techStack || []).join(', ')}. Tags: ${(p.contributionTags || []).join(', ') || 'None'}. Links: ${formatLinks(p.links)}. Verified: ${p.verificationStatus || 'unverified'}.`).join('\n')}

Current deterministic score: ${(candidate.overallFit * 100).toFixed(0)}/100`;

  try {
    const raw = await generateReply(systemPrompt, userPrompt);
    const json = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(json);
    return {
      builderId: candidate.builderId,
      fitSummary: String(parsed.fitSummary || ''),
      requirementFindings: Array.isArray(parsed.requirementFindings)
        ? parsed.requirementFindings
            .map((finding: any) => ({
              text: String(finding?.text || '').slice(0, 180),
              met: finding?.met === 'yes' || finding?.met === 'partial' || finding?.met === 'no'
                ? finding.met
                : 'partial',
              evidence: String(finding?.evidence || '').slice(0, 240),
            }))
            .filter((finding: { text: string }) => finding.text)
            .slice(0, 8)
        : [],
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

function normalizeRequirements(opportunity: any): Array<{ text: string; importance: 'must' | 'nice' }> {
  const structured = Array.isArray(opportunity.searchRequirements)
    ? opportunity.searchRequirements
        .map((requirement: any) => ({
          text: String(requirement?.text || '').trim(),
          importance: requirement?.importance === 'nice' ? 'nice' as const : 'must' as const,
        }))
        .filter((requirement: { text: string }) => requirement.text)
    : [];
  const legacy = Array.isArray(opportunity.requirements)
    ? opportunity.requirements
        .map((text: unknown) => ({ text: String(text || '').trim(), importance: 'must' as const }))
        .filter((requirement: { text: string }) => requirement.text)
    : [];
  const seen = new Set<string>();
  return [...structured, ...legacy].filter((requirement) => {
    const key = requirement.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function formatEducation(builder: any): string {
  const rows = (builder.education || [])
    .slice(0, 5)
    .map((entry: any) => [entry.school, entry.degree, entry.field].filter(Boolean).join(' — '))
    .filter(Boolean)
    .map((line: string, i: number) => `${i + 1}. ${line}`);
  if (rows.length) return rows.join('\n');
  return builder.universityOrCompany ? `1. ${builder.universityOrCompany}` : 'None listed';
}

function formatExperience(builder: any): string {
  const rows = (builder.experiences || [])
    .slice(0, 6)
    .map((entry: any, i: number) => {
      const title = [entry.title, entry.company].filter(Boolean).join(' at ') || 'Role';
      const details = [
        entry.dateRange,
        entry.description,
        (entry.skills || []).length ? `Skills: ${(entry.skills || []).slice(0, 8).join(', ')}` : null,
      ].filter(Boolean).join('. ');
      return `${i + 1}. ${title}${details ? ` — ${details}` : ''}`;
    });
  return rows.length ? rows.join('\n') : 'None listed';
}

function formatLinks(links: any): string {
  if (!links) return 'None';
  return ['github', 'demo', 'devpost', 'videoDemo', 'pitchDeck']
    .map((key) => links[key] ? `${key}: ${links[key]}` : null)
    .filter(Boolean)
    .join('; ') || 'None';
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
