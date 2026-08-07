import { mapTrialProjectFromMatch, normalizeTrialProject, trialProjectToSummary } from '@/lib/talent/founderTrialProject';
import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import {
  buildRoleSkillTiers,
  collectBuilderSkillTokens,
  matchedSkills,
} from '@/lib/talent/discovery/roleSkillTiers';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import MessageThread from '@/models/talent/MessageThread';
import Message from '@/models/talent/Message';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import type { FounderEntitlements } from '@/lib/billing/entitlements';
import { buildRoleFitTrace, buildTraceFreshness, type RoleFitTracePayload } from '@/lib/talent/roleFitTrace';
import { normalizeFounderFacingExperiences } from '@/lib/talent/experienceNormalize';

export type AgentTraceTeaserPayload = {
  locked: boolean;
  label: string;
  sourceBadges: string[];
  visibleInsight: string;
  quantifiedSignals?: string[];
  redacted: string[];
  hasAgentWrapped?: boolean;
  archetype?: string | null;
  wrappedScore?: number | null;
  bestFitRoles?: string[];
  evidenceStrength?: string | null;
  /** Optional punchy project + tech one-liner — only when proof is genuinely strong. */
  projectHighlight?: string | null;
  roleFitTrace?: RoleFitTracePayload | null;
  traceFreshness?: {
    daysSinceUpload: number;
    label: string;
    isFresh: boolean;
    sessionCount?: number;
  } | null;
  visibleRiskFlags?: string[];
  interviewProbes?: string[];
};
export type VerificationLabel =
  | 'Builder Claimed'
  | 'DevLabs Verified'
  | 'Founder Verified'
  | 'Peer Confirmed'
  | 'Unverified';

export type FounderSignal = {
  label: string;
  detail: string;
  category: 'shipping' | 'leadership' | 'work' | 'public_presence' | 'hackathon' | 'communication' | 'proof';
  source: string;
  confidence: 'high' | 'medium' | 'low';
};

export function verificationLabelForStatus(
  status: string | null | undefined,
  entity: 'builder' | 'project' = 'builder'
): VerificationLabel {
  const s = (status || '').toLowerCase();
  if (s === 'admin_verified') return 'DevLabs Verified';
  if (s === 'founder_verified') return 'Founder Verified';
  if (s === 'peer_confirmed') return entity === 'project' ? 'Peer Confirmed' : 'Builder Claimed';
  if (s === 'builder_confirmed') return 'Builder Claimed';
  return 'Unverified';
}

export function proofStrengthLabel(builder: any): string {
  const proofScore =
    builder?.profileCompletion?.proofScore ??
    (builder?.profileQuality?.overallScore ? Math.round(builder.profileQuality.overallScore * 0.6) : 0);
  if (proofScore >= 80) return 'Strong proof';
  if (proofScore >= 55) return 'Moderate proof';
  if (proofScore > 0) return 'Limited proof';
  return 'Needs more proof';
}

export function founderClarityLabel(builder: any): string | null {
  const label = builder?.profileQuality?.founderClarity?.label;
  if (label && String(label).trim()) return String(label);
  const score = builder?.profileQuality?.founderClarity?.score;
  if (typeof score === 'number') {
    if (score >= 80) return 'Clear';
    if (score >= 60) return 'Mostly clear';
    return 'Needs clarity';
  }
  return null;
}

export function buildRecommendedNextStep(builder: any, projects: any[], match: any): string {
  if (match?.riskFlags?.length) {
    return 'Review risks, then request an intro if proof aligns with your role.';
  }
  if (!projects.some((p) => ['admin_verified', 'founder_verified', 'peer_confirmed'].includes(p.verificationStatus))) {
    return 'Ask about specific shipped outcomes in your intro call before committing.';
  }
  if (builder?.availability?.availableNow) {
    return 'Strong fit — request an intro while they are marked available.';
  }
  return 'Request an intro to validate scope and timeline fit.';
}

export function buildSuggestedInterviewQuestions(
  opportunity: any,
  builder: any,
  projects: any[]
): string[] {
  const role = opportunity?.roleTitle || 'this role';
  const skills = (opportunity?.skillsNeeded || []).slice(0, 3);
  const questions = [
    `Walk me through the most relevant project work for ${role}.`,
    skills.length
      ? `How have you used ${skills.join(', ')} in a production or shipped context?`
      : 'What stack would you use in the first week, and why?',
    `What would you ship in the first 14 days if we started next week?`,
  ];
  const topProject = projects[0];
  if (topProject?.builderContribution) {
    questions.push('You noted a specific contribution on a project — what was yours vs. the team’s?');
  }
  return questions.slice(0, 5);
}

export function buildSuggestedTrialProject(opportunity: any): string {
  if (opportunity?.builderWillDo) {
    return `Scope a 1–2 week trial around: ${opportunity.builderWillDo}`;
  }
  return 'Define a small paid sprint (5–10 hrs) with a concrete deliverable before a longer engagement.';
}

function firstSentence(value: unknown, fallback: string) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  const match = text.match(/^(.{24,180}?[.!?])\s/);
  return (match?.[1] || text.slice(0, 150)).trim();
}

function compactText(value: unknown, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function truncateAtWord(text: string, max: number) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  const slice = normalized.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > max * 0.55 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

function parseJsonObject(value: string): Record<string, any> | null {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function listStrings(value: unknown, maxItems: number, maxChars: number) {
  return (Array.isArray(value) ? value : [])
    .map((item) => compactText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function uniqueStrings(items: unknown[], maxItems: number, maxChars: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = compactText(item, maxChars);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeSignalText(value: unknown, max = 180) {
  return compactText(value, max).replace(/\s+/g, ' ').trim();
}

function signalKey(label: string, detail: string) {
  return `${label.trim().toLowerCase()}|${detail.trim().toLowerCase()}`;
}

function sourceLabel(source: string) {
  const s = String(source || '').toLowerCase();
  if (s.includes('github')) return 'GitHub';
  if (s.includes('linkedin')) return 'LinkedIn';
  if (s.includes('twitter') || s.includes('x/')) return 'X';
  if (s.includes('devpost')) return 'Devpost';
  if (s.includes('portfolio')) return 'Portfolio';
  if (s.includes('resume')) return 'Resume';
  if (s.includes('research')) return 'Web research';
  return source || 'Profile';
}

function buildFounderSignals(builder: any, projects: any[], match?: any, shortlistCandidate?: any): FounderSignal[] {
  const signals: FounderSignal[] = [];
  const seen = new Set<string>();
  const add = (signal: FounderSignal) => {
    const label = normalizeSignalText(signal.label, 48);
    const detail = normalizeSignalText(signal.detail, 190);
    if (!label || !detail) return;
    const key = signalKey(label, detail);
    if (seen.has(key)) return;
    seen.add(key);
    signals.push({ ...signal, label, detail });
  };

  const links = builder?.links || {};
  const experiences = Array.isArray(builder?.experiences) ? builder.experiences : [];
  const highlights = Array.isArray(builder?.enrichmentInsights?.founderHighlights)
    ? builder.enrichmentInsights.founderHighlights
    : [];
  const textBlob = [
    builder?.headline,
    builder?.bio,
    builder?.universityOrCompany,
    ...experiences.flatMap((exp: any) => [exp?.title, exp?.company, exp?.description]),
    ...highlights.flatMap((h: any) => [h?.title, h?.detail]),
    ...projects.flatMap((project: any) => [project?.projectName, project?.description, project?.problemSolved, project?.builderContribution]),
    match?.reasoning,
    shortlistCandidate?.proofSummary,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const highlight of highlights.slice(0, 8)) {
    const title = String(highlight?.title || '').trim();
    const detail = String(highlight?.detail || '').trim();
    if (!title || !detail) continue;
    const lower = `${title} ${detail}`.toLowerCase();
    const category: FounderSignal['category'] =
      /community|founder|founded|runs|lead|organizer|president|club|devlabs/.test(lower)
        ? 'leadership'
        : /twitter|x\/|public voice|posts/.test(lower)
          ? 'public_presence'
          : /hackathon|devpost|winner|won/.test(lower)
            ? 'hackathon'
            : /github|repo|shipped|built|project|stack/.test(lower)
              ? 'shipping'
              : /work|intern|experience|company/.test(lower)
                ? 'work'
                : 'proof';
    add({
      label: title,
      detail,
      category,
      source: sourceLabel(highlight.source || category),
      confidence: 'high',
    });
  }

  const githubShowcase = builder?.enrichmentInsights?.githubShowcase || {};
  const scanned = Number(githubShowcase.reposScanned || 0);
  const additional = Number(githubShowcase.additionalProjectCount || 0);
  const projectProofCount = projects.filter((p: any) => p?.links?.github || p?.links?.demo || p?.links?.devpost).length;
  if (projectProofCount || links.github) {
    add({
      label: 'Ships public work',
      detail:
        scanned > 0
          ? `GitHub scan found ${scanned} repos; ${projects.length} projects are featured for founder review${additional > 0 ? `, with ${additional} more in reserve` : ''}.`
          : `${projects.length || projectProofCount || 1} project${(projects.length || projectProofCount || 1) === 1 ? '' : 's'} with public proof links or repo evidence.`,
      category: 'shipping',
      source: 'GitHub',
      confidence: links.github ? 'high' : 'medium',
    });
  }

  const leadershipExp = experiences.find((exp: any) =>
    /founder|co-?founder|president|lead|organizer|captain|community|devlabs/i.test(
      `${exp?.title || ''} ${exp?.company || ''} ${exp?.description || ''}`
    )
  );
  if (/community|founder|founded|runs|running|leadership|organizer|president|club|devlabs|500\+|builders/.test(textBlob)) {
    add({
      label: 'Leadership signal',
      detail: leadershipExp
        ? `${leadershipExp.title || 'Leadership role'} at ${leadershipExp.company || 'community/org'} shows they can organize people, not just write code.`
        : 'Public profile evidence points to community building or leadership work alongside technical projects.',
      category: 'leadership',
      source: leadershipExp?.source === 'linkedin' ? 'LinkedIn' : 'Web/profile',
      confidence: leadershipExp ? 'high' : 'medium',
    });
  }

  const current = experiences.find((exp: any) => exp?.isCurrent) || experiences[0];
  if (current?.title || current?.company) {
    add({
      label: 'Work credibility',
      detail: `${current.title || 'Role'}${current.company ? ` at ${current.company}` : ''}${current.dateRange ? ` (${current.dateRange})` : ''}.`,
      category: 'work',
      source: sourceLabel(current.source || 'profile'),
      confidence: current.source === 'linkedin' || current.source === 'resume' ? 'high' : 'medium',
    });
  }

  if (links.twitter || /twitter|x\/|tweet|public voice|posts/.test(textBlob)) {
    add({
      label: 'Public technical presence',
      detail: 'Has public writing or X/Twitter activity that helps founders judge communication, taste, and momentum.',
      category: 'public_presence',
      source: links.twitter ? 'X' : 'Web research',
      confidence: links.twitter ? 'high' : 'medium',
    });
  }

  if (links.devpost || /hackathon|devpost|winner|won\s+\d|\bwon\b/.test(textBlob)) {
    add({
      label: 'Hackathon proof',
      detail: 'Hackathon or Devpost evidence suggests they can build under time pressure and ship demos.',
      category: 'hackathon',
      source: links.devpost ? 'Devpost' : 'Profile/research',
      confidence: links.devpost ? 'high' : 'medium',
    });
  }

  if (links.portfolio || links.personalWebsite) {
    add({
      label: 'Portfolio signal',
      detail: 'Personal site gives founders a faster read on taste, communication, and shipped work.',
      category: 'communication',
      source: 'Portfolio',
      confidence: 'high',
    });
  }

  const matchReason = compactText(match?.reasoning || shortlistCandidate?.whyTheyMatch, 180);
  if (matchReason) {
    add({
      label: 'Role-fit evidence',
      detail: matchReason,
      category: 'proof',
      source: 'Role match',
      confidence: 'medium',
    });
  }

  const categoryRank: Record<FounderSignal['category'], number> = {
    leadership: 0,
    shipping: 1,
    work: 2,
    public_presence: 3,
    hackathon: 4,
    communication: 5,
    proof: 6,
  };
  const confidenceRank = { high: 0, medium: 1, low: 2 };

  return signals
    .sort((a, b) => {
      if (categoryRank[a.category] !== categoryRank[b.category]) return categoryRank[a.category] - categoryRank[b.category];
      return confidenceRank[a.confidence] - confidenceRank[b.confidence];
    })
    .slice(0, 6);
}

function safeString(value: unknown, fallback: string, maxChars: number) {
  return compactText(value, maxChars) || fallback;
}

const HIGHLIGHT_VERIFIED = new Set(['admin_verified', 'founder_verified', 'peer_confirmed', 'builder_confirmed']);
const MIN_PROJECT_HIGHLIGHT_SCORE = 5;

function projectHighlightScore(project: any) {
  let score = 0;
  if (project?.links?.github || project?.links?.demo || project?.links?.devpost) score += 2;
  const contribution = String(project?.builderContribution || '').trim();
  if (contribution.length >= 40) score += 3;
  else if (contribution.length >= 20) score += 1;
  if (/^(?:Architected|Built|Shipped|Implemented)\b/i.test(contribution)) score += 1;
  const description = String(project?.description || project?.problemSolved || '').trim();
  if (description.length >= 50) score += 1;
  const stack = Array.isArray(project?.techStack) ? project.techStack.filter(Boolean) : [];
  if (stack.length >= 3) score += 2;
  else if (stack.length >= 1) score += 1;
  if (HIGHLIGHT_VERIFIED.has(String(project?.verificationStatus || ''))) score += 1;
  return score;
}

function pickBestHighlightProject(projects: any[]) {
  const ranked = [...projects]
    .map((project) => ({
      project,
      score: projectHighlightScore(project),
      contributionLen: String(project?.builderContribution || '').length,
      stackLen: Array.isArray(project?.techStack) ? project.techStack.length : 0,
    }))
    .filter((entry) => entry.score >= MIN_PROJECT_HIGHLIGHT_SCORE)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.contributionLen !== a.contributionLen) return b.contributionLen - a.contributionLen;
      return b.stackLen - a.stackLen;
    });
  return ranked[0]?.project || null;
}

function formatTechSlice(techStack: string[]) {
  const picked = techStack.map((item) => String(item).trim()).filter(Boolean).slice(0, 4);
  if (!picked.length) return '';
  if (picked.length === 1) return picked[0];
  if (picked.length === 2) return `${picked[0]} and ${picked[1]}`;
  return `${picked.slice(0, -1).join(', ')}, and ${picked[picked.length - 1]}`;
}

function buildDeterministicProjectHighlight(project: any): string | null {
  if (projectHighlightScore(project) < MIN_PROJECT_HIGHLIGHT_SCORE) return null;
  const name = String(project.projectName || '').trim();
  const techPhrase = formatTechSlice(Array.isArray(project.techStack) ? project.techStack : []);
  if (!name || !techPhrase) return null;

  const contribution = String(project.builderContribution || '').replace(/\s+/g, ' ').trim();
  const problem = String(project.problemSolved || project.description || '').replace(/\s+/g, ' ').trim();

  if (problem.length >= 30) {
    const problemSlice = truncateAtWord(problem.replace(/\.$/, ''), 85);
    return truncateAtWord(`${name} — ${problemSlice}, using ${techPhrase}.`, 140);
  }

  if (contribution.length >= 40) {
    const lead = truncateAtWord(contribution, 90);
    return truncateAtWord(`${lead} (${name}, ${techPhrase}).`, 140);
  }

  return truncateAtWord(`Built ${name} with ${techPhrase}.`, 140);
}

function isGroundedProjectHighlight(highlight: string, project: any) {
  const lower = highlight.toLowerCase();
  const name = String(project.projectName || '').trim().toLowerCase();
  if (name.length >= 3 && lower.includes(name)) return true;
  const nameToken = name.split(/[\s/_-]+/).find((part) => part.length >= 4);
  if (nameToken && lower.includes(nameToken)) return true;
  const stack = (project.techStack || []).map((item: string) => String(item).trim().toLowerCase());
  const matchedTech = stack.filter((item: string) => item.length >= 3 && lower.includes(item));
  return matchedTech.length >= 2;
}

function attachProjectHighlight(
  trace: AgentTraceTeaserPayload,
  projects: any[],
  llmHighlight?: unknown
): AgentTraceTeaserPayload {
  const best = pickBestHighlightProject(projects);
  if (!best) return trace;

  const llm = typeof llmHighlight === 'string' ? llmHighlight.trim() : '';
  const deterministic = buildDeterministicProjectHighlight(best);
  const highlight =
    llm.length >= 20 && isGroundedProjectHighlight(llm, best)
      ? truncateAtWord(llm, 140)
      : deterministic;
  if (!highlight) return trace;
  return { ...trace, projectHighlight: highlight };
}

function buildProjectEvidenceLines(projects: any[]) {
  return projects
    .filter(Boolean)
    .sort((a, b) => projectHighlightScore(b) - projectHighlightScore(a))
    .flatMap((project) => {
      const name = String(project?.projectName || '').trim();
      const stack = formatTechSlice(Array.isArray(project?.techStack) ? project.techStack : []);
      const contribution = String(project?.builderContribution || '').replace(/\s+/g, ' ').trim();
      const description = String(project?.problemSolved || project?.description || '').replace(/\s+/g, ' ').trim();
      const verification = verificationLabelForStatus(project?.verificationStatus, 'project');
      return [
        name && stack ? `${name} uses ${stack}` : null,
        contribution ? `${name || 'Project'} contribution: ${truncateAtWord(contribution, 96)}` : null,
        description ? `${name || 'Project'} proof: ${truncateAtWord(description, 96)}` : null,
        name && verification !== 'Unverified' ? `${name} proof level: ${verification}` : null,
      ];
    });
}

function buildLockedTraceDetails(params: {
  report?: AgentWrappedReport | null;
  projects: any[];
  base: any;
  builder: any;
  match?: any;
  shortlistCandidate?: any;
}) {
  const { report, projects, base, builder, match, shortlistCandidate } = params;
  const roleFit = compactText(match?.reasoning || shortlistCandidate?.whyTheyMatch || base?.whyTheyMatch, 120);
  const proofSummary = compactText(shortlistCandidate?.proofSummary, 100);
  const findings = (match?.requirementFindings || shortlistCandidate?.requirementFindings || [])
    .map((finding: any) => {
      const text = compactText(finding?.text, 62);
      const evidence = compactText(finding?.evidence, 86);
      return text && evidence ? `${text}: ${evidence}` : evidence || text;
    });

  const reportLines = report
    ? [
        ...(report.evidenceHighlights || []).map((item) => `Agent evidence: ${truncateAtWord(item, 110)}`),
        ...(report.founderRead?.strengths || []).map((item) => `Strength: ${truncateAtWord(item, 100)}`),
        ...(report.founderRead?.riskFlags || []).map((item) => `Risk to validate: ${truncateAtWord(item, 96)}`),
        ...((report.buildprint?.earnedIdentities || []).map((item) => item.label) || []).map(
          (item) => `Earned identity: ${truncateAtWord(item, 82)}`
        ),
        report.validation?.buildTestLoops ? `${report.validation.buildTestLoops} build/test loops found in agent usage` : null,
        report.validation?.errorRecoveryLoops ? `${report.validation.errorRecoveryLoops} error-recovery loops found` : null,
        report.agentMaturity?.blindAcceptanceRisk
          ? `Blind-acceptance risk: ${report.agentMaturity.blindAcceptanceRisk}`
          : null,
      ]
    : [];

  const profileLines = [
    roleFit ? `Role-fit reasoning: ${roleFit}` : null,
    proofSummary ? `Proof summary: ${proofSummary}` : null,
    ...findings,
    ...buildProjectEvidenceLines(projects),
    builder?.availability?.availableNow ? 'Availability: open to work' : null,
  ];

  return uniqueStrings([...reportLines, ...profileLines], 4, 120);
}

function enrichAgentTrace(
  trace: AgentTraceTeaserPayload,
  params: {
    report?: AgentWrappedReport | null;
    opportunity: any;
    match?: any;
    shortlistCandidate?: any;
    projects: any[];
    locked: boolean;
    wrappedDoc?: any;
  }
): AgentTraceTeaserPayload {
  const { report, opportunity, match, shortlistCandidate, projects, locked, wrappedDoc } = params;
  const roleFitTrace = buildRoleFitTrace({ report, opportunity, match, shortlistCandidate, projects });
  const traceFreshness = buildTraceFreshness(report, wrappedDoc?.createdAt);
  const visibleRiskFlags = locked
    ? (report?.founderRead?.riskFlags || []).slice(0, 1)
    : (report?.founderRead?.riskFlags || []).slice(0, 3);
  const interviewProbes = roleFitTrace?.interviewProbes?.length
    ? roleFitTrace.interviewProbes
    : undefined;

  return {
    ...trace,
    roleFitTrace,
    traceFreshness,
    visibleRiskFlags: visibleRiskFlags.length ? visibleRiskFlags : undefined,
    interviewProbes,
  };
}

function buildAgentTraceFromWrapped(
  agentWrapped: { report?: AgentWrappedReport; doc?: any } | null | undefined,
  base: any,
  builder: any,
  projects: any[],
  shortlistCandidate: any,
  locked: boolean,
  opportunity?: any,
  match?: any
): AgentTraceTeaserPayload | null {
  const report = agentWrapped?.report;
  if (!report || report.source !== 'uploaded_agent_usage') return null;

  const agents = Array.isArray(report.sourceCoverage?.agents) ? report.sourceCoverage.agents : [];
  const profileBadges = [
    ...(builder.links?.github ? ['GitHub'] : []),
    ...(builder.links?.linkedin ? ['LinkedIn'] : []),
    ...(builder.links?.portfolio || builder.links?.personalWebsite ? ['Portfolio'] : []),
  ];
  const sourceBadges = [...new Set(['Buildprint', ...agents, ...profileBadges])].slice(0, 6);
  const publicIdentity =
    report.buildprint?.earnedIdentities?.find(
      (item) => item.id === (report.buildprint?.selectedPublicIdentityId || report.buildprint?.primaryIdentityId)
    )?.label || report.archetype;
  const evidenceStrength = report.buildprint?.evidenceStrength;

  const visibleInsight = firstSentence(
    report.buildprint?.earnedIdentities?.[0]?.proofStatement ||
      report.founderRead?.summary ||
      report.evidenceHighlights?.[0],
    `${publicIdentity || 'Builder'} — verified agent usage with ${agents.length || 'multiple'} agent source${agents.length === 1 ? '' : 's'}.`
  );

  const quantifiedSignals = [
    evidenceStrength ? `Evidence ${evidenceStrength}` : null,
    report.validation?.buildTestLoops ? `${report.validation.buildTestLoops} sessions with test/verify activity` : null,
    report.agentMaturity?.verificationScore != null
      ? `Verification signal ${Math.round(report.agentMaturity.verificationScore)}`
      : null,
    agents.length ? `${agents.length} agent tool${agents.length === 1 ? '' : 's'}` : null,
    `${Math.round(base.matchScore || 0)}% role match`,
  ]
    .filter(Boolean)
    .slice(0, 4) as string[];

  const earnedLabels = (report.buildprint?.earnedIdentities || []).map((item) => item.label).slice(0, 3);

  return enrichAgentTrace(
    {
      locked,
      label: publicIdentity || 'Buildprint uploaded',
      sourceBadges,
      visibleInsight,
      quantifiedSignals,
      redacted: locked
        ? buildLockedTraceDetails({ report, projects, base, builder, match, shortlistCandidate })
        : [],
      hasAgentWrapped: true,
      archetype: publicIdentity || null,
      wrappedScore: null,
      bestFitRoles: earnedLabels,
      evidenceStrength: evidenceStrength || null,
    },
    {
      report,
      opportunity: opportunity || {},
      match,
      shortlistCandidate,
      projects,
      locked,
      wrappedDoc: agentWrapped?.doc,
    }
  );
}

function mergeAgentTraceTeaser(
  primary: AgentTraceTeaserPayload,
  wrapped: AgentTraceTeaserPayload | null
): AgentTraceTeaserPayload {
  if (!wrapped) return primary;
  return {
    ...primary,
    label: wrapped.label,
    sourceBadges: [...new Set([...wrapped.sourceBadges, ...primary.sourceBadges])].slice(0, 6),
    visibleInsight: wrapped.visibleInsight,
    quantifiedSignals: wrapped.quantifiedSignals?.length ? wrapped.quantifiedSignals : primary.quantifiedSignals,
    hasAgentWrapped: true,
    archetype: wrapped.archetype,
    wrappedScore: wrapped.wrappedScore,
    bestFitRoles: wrapped.bestFitRoles?.length ? wrapped.bestFitRoles : primary.bestFitRoles,
    evidenceStrength: wrapped.evidenceStrength || primary.evidenceStrength || null,
    projectHighlight: primary.projectHighlight || wrapped.projectHighlight || null,
  };
}

function fallbackTeasers(
  base: any,
  builder: any,
  projects: any[],
  shortlistCandidate: any,
  agentWrapped?: { report?: AgentWrappedReport; doc?: any } | null,
  traceLocked = true,
  opportunity?: any,
  match?: any
) {
  const verifiedCount = projects.filter((p) => ['admin_verified', 'founder_verified', 'peer_confirmed'].includes(p.verificationStatus)).length;
  const insight = firstSentence(
    base.whyTheyMatch || shortlistCandidate?.proofSummary,
    `${Math.round(base.matchScore || 0)}% match across ${projects.length || 1} proof source${(projects.length || 1) === 1 ? '' : 's'}.`
  );
  const wrappedTrace = buildAgentTraceFromWrapped(
    agentWrapped,
    base,
    builder,
    projects,
    shortlistCandidate,
    traceLocked,
    opportunity,
    match
  );
  const profileTrace: AgentTraceTeaserPayload = {
    locked: traceLocked,
    label: wrappedTrace ? 'Verified coding trace' : 'How they ship',
    sourceBadges: [
      ...(builder.links?.github ? ['GitHub'] : []),
      ...(builder.links?.linkedin ? ['LinkedIn'] : []),
      ...(builder.links?.portfolio || builder.links?.personalWebsite ? ['Portfolio'] : []),
      ...(builder.links?.resume ? ['Resume'] : []),
      ...(projects.some((p) => p.links?.github) ? ['Repos'] : []),
    ].slice(0, 5),
    visibleInsight: insight,
    quantifiedSignals: [
      `${Math.round(base.matchScore || 0)}% match`,
      `${projects.length} project${projects.length === 1 ? '' : 's'} reviewed`,
      verifiedCount > 0 ? `${verifiedCount} verified` : null,
    ].filter(Boolean) as string[],
    redacted: traceLocked
      ? buildLockedTraceDetails({ report: agentWrapped?.report, projects, base, builder, match, shortlistCandidate })
      : [],
  };

  const mergedTrace = attachProjectHighlight(mergeAgentTraceTeaser(profileTrace, wrappedTrace), projects);
  return {
    agentTrace: enrichAgentTrace(mergedTrace, {
      report: agentWrapped?.report,
      opportunity: opportunity || {},
      match,
      shortlistCandidate,
      projects,
      locked: traceLocked,
      wrappedDoc: agentWrapped?.doc,
    }),
    introDraft: {
      locked: true,
      label: 'Open intro draft',
      visibleHook: firstSentence(`Hey ${String(builder.name || 'there').split(' ')[0]}, ${insight}`, insight),
      redactedBody: 'Role fit, specific ask, and follow-up stay locked.',
    },
    pipeline: {
      locked: true,
      label: 'Continue with this builder',
      steps: [
        { key: 'intro', label: 'Intro', locked: true },
        { key: 'call', label: 'Call', locked: true },
        { key: 'trial', label: 'Trial', locked: true },
        { key: 'hire', label: 'Hire', locked: true },
      ],
    },
    interviewQuestions: {
      locked: true,
      label: 'Unlock interview questions',
      visiblePreview: firstSentence(base.suggestedInterviewQuestions?.[0], 'Ask them to walk through the strongest proof source.'),
    },
    trialProject: {
      locked: true,
      label: 'Unlock trial scope',
      visiblePreview: firstSentence(base.suggestedTrialProject, 'Use a tight trial to verify shipping pace.'),
    },
  };
}

async function buildLlmTeasers(params: {
  base: any;
  builder: any;
  projects: any[];
  match: any;
  shortlistCandidate: any;
  opportunity: any;
  agentWrapped?: { report?: AgentWrappedReport; doc?: any } | null;
  traceLocked?: boolean;
}) {
  const { base, builder, projects, match, shortlistCandidate, opportunity, agentWrapped, traceLocked = true } = params;
  const fallback = fallbackTeasers(base, builder, projects, shortlistCandidate, agentWrapped, traceLocked, opportunity, match);
  const wrappedTrace = buildAgentTraceFromWrapped(
    agentWrapped,
    base,
    builder,
    projects,
    shortlistCandidate,
    traceLocked,
    opportunity,
    match
  );
  if (!hasOpenRouterConfig()) return fallback;

  const compactProjects = projects.slice(0, 4).map((project) => ({
    name: project.projectName,
    techStack: (project.techStack || []).slice(0, 6),
    verificationStatus: project.verificationStatus || null,
    contribution: compactText(project.builderContribution, 220),
    description: compactText(project.description || project.problemSolved, 180),
    sources: [
      project.links?.github ? 'GitHub' : null,
      project.links?.demo ? 'Demo' : null,
      project.links?.devpost ? 'Devpost' : null,
    ].filter(Boolean),
  }));

  try {
    const reply = await generateOpenRouterReply({
      responseFormat: 'json_object',
      temperature: 0.35,
      maxTokens: 650,
      systemPrompt: `You write premium locked-feature teasers for DevLabs founder hiring.
Generate concise, high-signal teaser copy from real builder evidence.
Tone: direct, sharp, proof-backed, builder-native. No hype, no generic sales copy, no filler.
The founder should quickly infer whether the builder is worth pursuing.
Quantify where possible using only supplied numbers. Do not invent companies, commits, scores, schools, or links.
Do not reveal full trace reasoning, full intro draft, full interview list, full trial scope, private links, or hidden evidence.
When agentWrapped.uploaded is true, the agentTrace teaser MUST foreground the uploaded Agent Wrapped report (archetype, agent tools, founder-fit score, validation loops) — not just GitHub/profile evidence.
For projectHighlight: return null unless a supplied project has strong proof (repo/demo link, substantive contribution or description, meaningful tech stack). When included, write one impressive <= 120 char line naming the real project and technologies from that project only — never invent projects, features, companies, or stacks. Skip it entirely if nothing genuinely stands out.
Return only JSON matching the requested shape.`,
      userPrompt: JSON.stringify({
        requestedShape: {
          agentTrace: {
            label: 'short action label',
            sourceBadges: ['2-5 evidence/source badges from supplied data'],
            visibleInsight: 'one sentence, <= 140 chars, with quantified signal when available',
            projectHighlight: 'optional string or null — one punchy project+tech line only when genuinely impressive; null otherwise',
            quantifiedSignals: ['2-4 short metrics, <= 42 chars each'],
            redacted: ['2-4 short names of locked details'],
          },
          introDraft: {
            label: 'short action label',
            visibleHook: 'one founder-to-builder opening line, <= 140 chars',
            redactedBody: 'one sentence explaining what is locked, <= 110 chars',
          },
          pipeline: {
            label: 'short action label',
            steps: [
              { key: 'intro', label: 'short founder-action label' },
              { key: 'call', label: 'short founder-action label' },
              { key: 'trial', label: 'short founder-action label' },
              { key: 'hire', label: 'short founder-action label' },
            ],
          },
          interviewQuestions: {
            label: 'short action label',
            visiblePreview: 'one tailored interview question, <= 150 chars',
          },
          trialProject: {
            label: 'short action label',
            visiblePreview: 'one tailored paid-trial teaser, <= 150 chars',
          },
        },
        role: {
          title: opportunity?.roleTitle || opportunity?.title || null,
          company: opportunity?.company || null,
          description: compactText(opportunity?.description || opportunity?.builderWillDo, 260),
          skillsNeeded: (opportunity?.skillsNeeded || []).slice(0, 8),
        },
        builder: {
          name: builder.name,
          headline: builder.headline || null,
          matchScore: base.matchScore,
          matchLabel: base.matchLabel,
          profileStrength: base.profileStrength,
          proofStrengthLabel: base.proofStrengthLabel,
          founderClarityLabel: base.founderClarityLabel,
          topSkills: (base.topSkills || []).slice(0, 8),
          availability: base.availability,
          sourceAvailability: {
            github: Boolean(builder.links?.github),
            linkedin: Boolean(builder.links?.linkedin),
            portfolio: Boolean(builder.links?.portfolio || builder.links?.personalWebsite),
            resume: Boolean(builder.links?.resume),
          },
        },
        matchEvidence: {
          reasoning: compactText(match?.reasoning || shortlistCandidate?.whyTheyMatch, 260),
          proofSummary: compactText(shortlistCandidate?.proofSummary, 220),
          riskCount: Array.isArray(match?.riskFlags) ? match.riskFlags.length : 0,
          requirementFindings: (match?.requirementFindings || shortlistCandidate?.requirementFindings || [])
            .slice(0, 4)
            .map((r: any) => ({
              text: compactText(r?.text, 120),
              met: r?.met || null,
              evidence: compactText(r?.evidence, 160),
            })),
        },
        projects: compactProjects,
        agentWrapped: agentWrapped?.report
          ? {
              uploaded: true,
              archetype: agentWrapped.report.archetype,
              score: agentWrapped.report.score,
              confidence: agentWrapped.report.confidence,
              agents: agentWrapped.report.sourceCoverage?.agents || [],
              founderReadSummary: compactText(agentWrapped.report.founderRead?.summary, 220),
              bestFitRoles: (agentWrapped.report.founderRead?.bestFitRoles || []).slice(0, 3),
              evidenceHighlights: (agentWrapped.report.evidenceHighlights || []).slice(0, 3),
              validation: agentWrapped.report.validation,
              agentMaturity: agentWrapped.report.agentMaturity,
            }
          : { uploaded: false },
      }),
    });
    const parsed = parseJsonObject(reply);
    if (!parsed) return fallback;

    const steps = Array.isArray(parsed.pipeline?.steps) ? parsed.pipeline.steps : [];
    const llmTrace: AgentTraceTeaserPayload = {
      locked: traceLocked,
      label: safeString(parsed.agentTrace?.label, fallback.agentTrace.label, 32),
      sourceBadges: listStrings(parsed.agentTrace?.sourceBadges, 6, 24),
      visibleInsight: safeString(parsed.agentTrace?.visibleInsight, fallback.agentTrace.visibleInsight, 160),
      quantifiedSignals: listStrings(parsed.agentTrace?.quantifiedSignals, 4, 48),
      redacted: traceLocked
        ? buildLockedTraceDetails({
            report: agentWrapped?.report,
            projects,
            base,
            builder,
            match,
            shortlistCandidate,
          })
        : [],
    };
    return {
      agentTrace: enrichAgentTrace(
        attachProjectHighlight(
          mergeAgentTraceTeaser(llmTrace, wrappedTrace),
          projects,
          parsed.agentTrace?.projectHighlight
        ),
        {
          report: agentWrapped?.report,
          opportunity,
          match,
          shortlistCandidate,
          projects,
          locked: traceLocked,
          wrappedDoc: agentWrapped?.doc,
        }
      ),
      introDraft: {
        locked: true,
        label: safeString(parsed.introDraft?.label, fallback.introDraft.label, 32),
        visibleHook: safeString(parsed.introDraft?.visibleHook, fallback.introDraft.visibleHook, 160),
        redactedBody: safeString(parsed.introDraft?.redactedBody, fallback.introDraft.redactedBody, 130),
      },
      pipeline: {
        locked: true,
        label: safeString(parsed.pipeline?.label, fallback.pipeline.label, 32),
        steps: ['intro', 'call', 'trial', 'hire'].map((key, index) => ({
          key,
          label: safeString(steps[index]?.label, fallback.pipeline.steps[index].label, 42),
          locked: true,
        })),
      },
      interviewQuestions: {
        locked: true,
        label: safeString(parsed.interviewQuestions?.label, fallback.interviewQuestions.label, 36),
        visiblePreview: safeString(parsed.interviewQuestions?.visiblePreview, fallback.interviewQuestions.visiblePreview, 170),
      },
      trialProject: {
        locked: true,
        label: safeString(parsed.trialProject?.label, fallback.trialProject.label, 36),
        visiblePreview: safeString(parsed.trialProject?.visiblePreview, fallback.trialProject.visiblePreview, 170),
      },
    };
  } catch (error) {
    console.warn('[founderCandidate] LLM teaser generation failed', error instanceof Error ? error.message : error);
    return fallback;
  }
}

function pickBuilderLinks(builder: any) {
  const links = builder?.links || {};
  return {
    github: links.github || null,
    linkedin: links.linkedin || null,
    portfolio: links.portfolio || links.personalWebsite || null,
    devpost: links.devpost || null,
    resume: links.resume || null,
  };
}

function mapProjectForFounder(project: any) {
  const links = project?.links || {};
  return {
    _id: String(project._id),
    projectName: project.projectName,
    description: project.description || null,
    problemSolved: project.problemSolved || null,
    builderContribution: project.builderContribution || null,
    techStack: project.techStack || [],
    verificationLabel: verificationLabelForStatus(project.verificationStatus, 'project'),
    links: {
      github: links.github || null,
      devpost: links.devpost || null,
      demo: links.demo || null,
    },
  };
}

export async function buildFullCandidateCard(params: {
  builder: any;
  projects: any[];
  match: any;
  shortlistCandidate: any;
  opportunity: any;
  hidden?: boolean;
  agentWrapped?: { report?: AgentWrappedReport; doc?: any } | null;
  threadId?: string | null;
  builderEmail?: string | null;
  hasBuilderReply?: boolean;
  lastEmailPreview?: string | null;
}) {
  const {
    builder,
    projects,
    match,
    shortlistCandidate,
    opportunity,
    hidden,
    agentWrapped,
    threadId = null,
    builderEmail = null,
    hasBuilderReply = false,
    lastEmailPreview = null,
  } = params;
  const teaserMode = opportunity?.visibilityMode === 'teaser' || opportunity?.traceAccess === 'teaser' || opportunity?.introAccess === 'locked';
  const traceLocked = opportunity?.traceAccess !== 'full';
  const availability = builder.availability || {};
  const sortedProjects = [...projects].sort((a, b) => {
    const rank = (s: string) =>
      ['admin_verified', 'founder_verified', 'peer_confirmed', 'builder_confirmed'].indexOf(s);
    return rank(b.verificationStatus || '') - rank(a.verificationStatus || '');
  });
  const roleTiers = buildRoleSkillTiers(opportunity);
  const domainSkillsMatched = matchedSkills(
    roleTiers.primarySkills,
    collectBuilderSkillTokens(builder, sortedProjects)
  ).slice(0, 6);

  const relevantProjects = sortedProjects.slice(0, 4).map(mapProjectForFounder);
  const founderSignals = buildFounderSignals(builder, sortedProjects, match, shortlistCandidate);
  const founderHighlights = (builder.enrichmentInsights?.founderHighlights || [])
    .slice(0, 6)
    .map((item: any) => ({
      title: compactText(item?.title, 60),
      detail: compactText(item?.detail, 220),
      source: sourceLabel(item?.source || 'profile'),
    }))
    .filter((item: any) => item.title && item.detail);
  const riskFlags = Array.isArray(match?.riskFlags) ? match.riskFlags.filter(Boolean) : [];
  if (
    relevantProjects.length > 0 &&
    !relevantProjects.some((p) => p.verificationLabel !== 'Builder Claimed' && p.verificationLabel !== 'Unverified')
  ) {
    if (!riskFlags.includes('Proof is mostly builder-claimed — validate in intro')) {
      riskFlags.push('Proof is mostly builder-claimed — validate in intro');
    }
  }

  const base = {
    builderId: String(builder._id),
    matchRecordId: match?._id ? String(match._id) : shortlistCandidate?.matchRecordId
      ? String(shortlistCandidate.matchRecordId)
      : null,
    anonymousLabel: shortlistCandidate?.anonymousLabel || null,
    matchScore: match?.matchScore ?? shortlistCandidate?.matchScore ?? 0,
    profileStrength: match?.profileStrength ?? shortlistCandidate?.profileStrength ?? builder?.profileQuality?.overallScore ?? 0,
    matchLabel: match?.matchLabel ?? shortlistCandidate?.matchLabel ?? 'Possible Match',
    name: builder.name,
    headline: builder.headline || null,
    bio: builder.bio || null,
    avatarUrl: builder.avatarUrl || null,
    location: builder.location || null,
    availability: {
      availableNow: Boolean(availability.availableNow),
      remotePreference: availability.remotePreference || null,
      desiredCompensation: availability.desiredCompensation || null,
    },
    workTypes: Array.isArray(builder.preferredWorkType) ? builder.preferredWorkType : [],
    experiences: normalizeFounderFacingExperiences(builder.experiences, 8),
    topSkills: domainSkillsMatched.length
      ? domainSkillsMatched
      : shortlistCandidate?.topSkills?.length
        ? shortlistCandidate.topSkills
        : [
            ...(builder.rolePreference || []),
            ...projects.flatMap((p: any) => p.techStack || []).slice(0, 4),
          ].slice(0, 8),
    domainSkillsMatched,
    availabilityNote: availability.availableNow ? 'Available now' : 'Availability not confirmed',
    founderClarityLabel: founderClarityLabel(builder),
    proofStrengthLabel: proofStrengthLabel(builder),
    builderVerificationLabel: verificationLabelForStatus(builder.verificationStatus, 'builder'),
    founderSignals,
    founderHighlights,
    whyTheyMatch: match?.reasoning || shortlistCandidate?.whyTheyMatch || null,
    riskFlags,
    recommendedNextStep: buildRecommendedNextStep(builder, projects, match),
    projects: relevantProjects,
    links: pickBuilderLinks(builder),
    matchStatus: match?.status || 'generated',
    saved: match?.status === 'approved',
    introRequested:
      match?.status === 'intro_requested' ||
      ['builder_interested', 'interviewing', 'trial', 'offer', 'hired'].includes(match?.status),
    hidden: Boolean(hidden),
    suggestedInterviewQuestions: buildSuggestedInterviewQuestions(opportunity, builder, projects),
    suggestedTrialProject: buildSuggestedTrialProject(opportunity),
    trialProject: mapTrialProjectFromMatch(match?.trialProject),
    callCompletedAt: match?.callCompletedAt
      ? new Date(match.callCompletedAt).toISOString()
      : null,
    threadId,
    builderEmail,
    hasBuilderReply,
    lastEmailPreview,
  };

  if (!teaserMode) {
    const wrappedTrace = buildAgentTraceFromWrapped(
      agentWrapped,
      base,
      builder,
      projects,
      shortlistCandidate,
      traceLocked,
      opportunity,
      match
    );
    const agentTrace = wrappedTrace || fallbackTeasers(
      base,
      builder,
      projects,
      shortlistCandidate,
      agentWrapped,
      false,
      opportunity,
      match
    ).agentTrace;
    return {
      ...base,
      visibilityMode: 'full',
      traceAccess: opportunity?.traceAccess || 'full',
      ...(agentTrace ? { teasers: { agentTrace } } : {}),
    };
  }
  const teasers = await buildLlmTeasers({
    base,
    builder,
    projects,
    match,
    shortlistCandidate,
    opportunity,
    agentWrapped,
    traceLocked,
  });

  return {
    ...base,
    visibilityMode: 'teaser',
    traceAccess: 'teaser',
    introAccess: 'locked',
    outreachAccess: 'locked',
    lifecycleAccess: 'locked',
    whyTheyMatch: firstSentence(base.whyTheyMatch, shortlistCandidate?.proofSummary || 'Strong role signal found.'),
    riskFlags: [],
    suggestedInterviewQuestions: [],
    suggestedTrialProject: '',
    trialProject: null,
    teasers,
  };
}

export function mapTrialProjectForClient(match: any) {
  return mapTrialProjectFromMatch(match?.trialProject);
}

export function suggestedTrialFromDraft(
  opportunity: any,
  trialProject: ReturnType<typeof normalizeTrialProject>
) {
  if (trialProject) return trialProjectToSummary(trialProject);
  return buildSuggestedTrialProject(opportunity);
}

export async function buildFullCandidatesForShortlist(
  shortlist: any,
  opportunity: any,
  deps: {
    BuilderProfile: any;
    ProjectRecord: any;
    MatchRecord: any;
  },
  options: {
    entitlements?: Pick<
      FounderEntitlements,
      'visibilityMode' | 'traceAccess' | 'introAccess' | 'outreachAccess' | 'lifecycleAccess'
    >;
  } = {}
) {
  const hiddenSet = new Set((shortlist.hiddenBuilderIds || []).map(String));
  const candidateEntries = shortlist.candidates || [];
  const builderIds = candidateEntries.map((c: any) => c.builderId);

  const [builders, projects, matches, threads] = await Promise.all([
    deps.BuilderProfile.find({ _id: { $in: builderIds } }).lean(),
    deps.ProjectRecord.find({ builderId: { $in: builderIds } }).lean(),
    deps.MatchRecord.find({
      opportunityId: shortlist.opportunityId,
      builderId: { $in: builderIds },
    }).lean(),
    MessageThread.find({
      opportunityId: shortlist.opportunityId,
      builderId: { $in: builderIds },
    })
      .select('_id builderId lastMessageAt lastMessagePreview')
      .lean(),
  ]);

  const builderById = new Map(builders.map((b: any) => [String(b._id), b]));
  const projectsByBuilder = new Map<string, any[]>();
  for (const p of projects) {
    const key = String(p.builderId);
    if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
    projectsByBuilder.get(key)!.push(p);
  }
  const matchByBuilder = new Map(matches.map((m: any) => [String(m.builderId), m]));
  const threadByBuilder = new Map(threads.map((t: any) => [String(t.builderId), t]));
  const threadIds = threads.map((t: any) => t._id);
  const builderReplyCounts = threadIds.length
    ? await Message.aggregate([
        {
          $match: {
            threadId: { $in: threadIds },
            senderType: 'builder',
          },
        },
        { $group: { _id: '$threadId', count: { $sum: 1 } } },
      ])
    : [];
  const builderRepliesByThread = new Map(
    builderReplyCounts.map((row: any) => [String(row._id), row.count as number])
  );
  const entitlementAccess = options?.entitlements;

  const wrappedDocs = builderIds.length
    ? await AgentWrappedReportModel.find({ builderId: { $in: builderIds }, source: 'uploaded_agent_usage' })
        .sort({ createdAt: -1 })
        .lean()
    : [];
  const wrappedByBuilder = new Map<string, any>();
  for (const doc of wrappedDocs) {
    const key = String(doc.builderId);
    if (!wrappedByBuilder.has(key)) wrappedByBuilder.set(key, doc);
  }

  const cards = await Promise.all(candidateEntries
    .map(async (sc: any) => {
      const builderId = String(sc.builderId);
      const builder = builderById.get(builderId);
      if (!builder) return null;
      const wrappedDoc = wrappedByBuilder.get(builderId);
      const thread = threadByBuilder.get(builderId);
      const threadId = thread?._id ? String(thread._id) : null;
      const builderReplyCount = threadId ? builderRepliesByThread.get(threadId) || 0 : 0;
      return buildFullCandidateCard({
        builder,
        projects: projectsByBuilder.get(builderId) || [],
        match: matchByBuilder.get(builderId),
        shortlistCandidate: sc,
        opportunity: {
          ...opportunity,
          visibilityMode: entitlementAccess?.visibilityMode || shortlist.visibilityMode || 'full',
          traceAccess: entitlementAccess?.traceAccess || shortlist.traceAccess || 'full',
          introAccess: entitlementAccess?.introAccess || shortlist.introAccess || 'enabled',
          outreachAccess: entitlementAccess?.outreachAccess,
          lifecycleAccess: entitlementAccess?.lifecycleAccess,
        },
        hidden: hiddenSet.has(builderId),
        agentWrapped: wrappedDoc?.report
          ? { report: wrappedDoc.report as AgentWrappedReport, doc: wrappedDoc }
          : null,
        threadId,
        builderEmail: (builder as { email?: string | null }).email || null,
        hasBuilderReply: builderReplyCount > 0,
        lastEmailPreview: thread?.lastMessagePreview || null,
      });
    }));

  return cards.filter(Boolean);
}
