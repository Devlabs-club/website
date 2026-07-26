import type { AgentWrappedReport } from '@/lib/agentWrapped/types';

export type RoleFitTracePayload = {
  alignmentScore: number;
  confidence: 'low' | 'moderate' | 'high';
  relevantSignals: string[];
  gaps: string[];
  interviewProbes: string[];
  roleSummary: string;
};

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function normalizeSkillTerm(input: string): string {
  return norm(input).replace(/\s+/g, ' ');
}

function roleSkills(opportunity: any): string[] {
  return [
    ...(opportunity?.skillsNeeded || []),
    ...(opportunity?.niceToHaveSkills || []),
    ...(opportunity?.roleType || []),
  ]
    .map((s: string) => normalizeSkillTerm(String(s)))
    .filter(Boolean);
}

function reportSkills(report: AgentWrappedReport): Set<string> {
  const skills = new Set<string>();
  for (const lang of report.languages || []) {
    if (lang.name) skills.add(normalizeSkillTerm(lang.name));
  }
  for (const fw of report.frameworks || []) {
    if (fw.name) skills.add(normalizeSkillTerm(fw.name));
  }
  return skills;
}

function skillOverlap(required: string[], reportSkillSet: Set<string>): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const req of required) {
    const hit = [...reportSkillSet].some((skill) => skill === req || skill.includes(req) || req.includes(skill));
    if (hit) matched.push(req);
    else missing.push(req);
  }
  return { matched, missing };
}

function inferRoleSurfaceNeeds(opportunity: any): { frontend: boolean; backend: boolean; database: boolean; infra: boolean; tests: boolean } {
  const text = [
    opportunity?.roleTitle,
    opportunity?.title,
    opportunity?.description,
    opportunity?.builderWillDo,
    ...(opportunity?.skillsNeeded || []),
    ...(opportunity?.responsibilities || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    frontend: /front|react|next|vue|ui|ux|design|css|tailwind|mobile|ios|android/.test(text),
    backend: /back|api|server|node|python|go|rust|java|django|fastapi|express/.test(text),
    database: /database|sql|postgres|mongo|redis|prisma|drizzle|data/.test(text),
    infra: /infra|devops|aws|gcp|azure|docker|k8s|kubernetes|deploy|ci\/cd|terraform/.test(text),
    tests: /test|qa|quality|jest|playwright|cypress|vitest/.test(text),
  };
}

function surfaceAlignment(report: AgentWrappedReport, needs: ReturnType<typeof inferRoleSurfaceNeeds>): string[] {
  const surface = report.buildSurface || { frontend: 0, backend: 0, database: 0, infra: 0, tests: 0 };
  const signals: string[] = [];
  const gaps: string[] = [];

  const check = (key: keyof typeof needs, label: string, value: number) => {
    if (!needs[key]) return;
    if (value >= 15) signals.push(`Strong ${label} evidence (${value}% of build surface)`);
    else if (value >= 8) signals.push(`Some ${label} work (${value}% of build surface)`);
    else gaps.push(`Limited ${label} evidence in agent trace`);
  };

  check('frontend', 'frontend', surface.frontend);
  check('backend', 'backend', surface.backend);
  check('database', 'database', surface.database);
  check('infra', 'infra', surface.infra);
  check('tests', 'test discipline', surface.tests);

  return [...signals, ...gaps.map((g) => `gap:${g}`)];
}

function buildInterviewProbes(params: {
  report?: AgentWrappedReport | null;
  opportunity: any;
  gaps: string[];
  match?: any;
}): string[] {
  const { report, opportunity, gaps, match } = params;
  const role = opportunity?.roleTitle || opportunity?.title || 'this role';
  const probes: string[] = [];

  for (const gap of gaps.slice(0, 2)) {
    probes.push(`Your trace shows ${gap.toLowerCase()} — walk me through relevant work for ${role}.`);
  }

  if (report?.agentMaturity?.blindAcceptanceRisk === 'high') {
    probes.push('How do you verify agent-generated code before shipping? Give a recent example.');
  }
  if (report?.validation?.testDisciplineScore != null && report.validation.testDisciplineScore < 50) {
    probes.push('Describe your testing approach when working with AI agents on production code.');
  }

  const unmet = (match?.requirementFindings || []).filter((f: any) => f?.met === 'no' || f?.met === 'partial');
  for (const finding of unmet.slice(0, 2)) {
    if (finding?.text) probes.push(`You may have a gap on "${finding.text}" — how would you close it in the first 2 weeks?`);
  }

  if (!probes.length) {
    probes.push(`What would you ship in the first 14 days on ${role}?`);
    probes.push('Walk me through your agent workflow for a typical feature from idea to deploy.');
  }

  return probes.slice(0, 4);
}

export function buildRoleFitTrace(params: {
  report?: AgentWrappedReport | null;
  opportunity: any;
  match?: any;
  shortlistCandidate?: any;
  projects?: any[];
}): RoleFitTracePayload | null {
  const { report, opportunity, match, shortlistCandidate, projects = [] } = params;
  const roleTitle = opportunity?.roleTitle || opportunity?.title || 'this role';
  const required = roleSkills(opportunity);

  if (!report && !required.length && !match) return null;

  const relevantSignals: string[] = [];
  const gaps: string[] = [];
  let alignmentScore = 50;

  if (report?.source === 'uploaded_agent_usage') {
    const reportSkillSet = reportSkills(report);
    const { matched, missing } = skillOverlap(required, reportSkillSet);
    if (matched.length) {
      relevantSignals.push(`Stack overlap: ${matched.slice(0, 4).join(', ')}`);
      alignmentScore += Math.min(25, matched.length * 8);
    }
    if (missing.length && required.length) {
      gaps.push(...missing.slice(0, 3).map((s) => `No trace evidence for ${s}`));
      alignmentScore -= Math.min(20, missing.length * 5);
    }

    const surfaceResults = surfaceAlignment(report, inferRoleSurfaceNeeds(opportunity));
    for (const item of surfaceResults) {
      if (item.startsWith('gap:')) gaps.push(item.slice(4));
      else relevantSignals.push(item);
    }

    if (report.validation?.buildTestLoops && report.validation.buildTestLoops >= 50) {
      relevantSignals.push(`${report.validation.buildTestLoops} build/test loops — ships with validation`);
      alignmentScore += 5;
    }
    if (report.agentMaturity?.verificationScore != null && report.agentMaturity.verificationScore >= 70) {
      relevantSignals.push('High agent verification discipline');
      alignmentScore += 5;
    }
    if (report.agentMaturity?.blindAcceptanceRisk === 'high') {
      gaps.push('High blind-acceptance risk — validate in intro');
      alignmentScore -= 10;
    }

    // Buildprint: use earned public identity label for soft signal only (no hardcoded-role bonus).
    const publicIdentity =
      report.buildprint?.earnedIdentities?.find(
        (item: any) => item.id === (report.buildprint?.selectedPublicIdentityId || report.buildprint?.primaryIdentityId)
      )?.label || report.archetype;
    if (publicIdentity && roleTitle) {
      const roleLower = norm(roleTitle);
      const identityLower = norm(publicIdentity);
      if (identityLower.includes(roleLower) || roleLower.includes(identityLower.split(' ')[0] || '')) {
        relevantSignals.push(`${publicIdentity} identity relates to ${roleTitle}`);
        alignmentScore += 4;
      }
    }
    if (report.buildprint?.evidenceStrength === 'verified' || report.buildprint?.evidenceStrength === 'exceptional') {
      relevantSignals.push(`Evidence strength: ${report.buildprint.evidenceStrength}`);
      alignmentScore += 3;
    }
  } else {
    const projectStack = new Set(
      projects.flatMap((p: any) => (p.techStack || []).map((s: string) => normalizeSkillTerm(s)))
    );
    const { matched, missing } = skillOverlap(required, projectStack);
    if (matched.length) relevantSignals.push(`Profile projects use ${matched.slice(0, 3).join(', ')}`);
    if (missing.length) gaps.push(...missing.slice(0, 2).map((s) => `Limited proof for ${s}`));
    alignmentScore = matched.length && required.length ? Math.round((matched.length / required.length) * 60) : 40;
    gaps.push('No verified agent trace — estimate from profile only');
  }

  const matchScore = match?.matchScore ?? shortlistCandidate?.matchScore;
  if (typeof matchScore === 'number') {
    alignmentScore = Math.round(alignmentScore * 0.6 + matchScore * 0.4);
  }

  alignmentScore = Math.max(0, Math.min(100, alignmentScore));

  const confidence: RoleFitTracePayload['confidence'] =
    report?.source === 'uploaded_agent_usage' && report.confidence === 'high'
      ? 'high'
      : report?.source === 'uploaded_agent_usage'
        ? 'moderate'
        : 'low';

  const roleSummary =
    relevantSignals.length > 0
      ? `For ${roleTitle}: ${relevantSignals[0]}${gaps.length ? `, but ${gaps[0].toLowerCase()}` : ''}.`
      : `For ${roleTitle}: limited trace signal — validate fit in intro.`;

  return {
    alignmentScore,
    confidence,
    relevantSignals: relevantSignals.slice(0, 4),
    gaps: gaps.slice(0, 3),
    interviewProbes: buildInterviewProbes({ report, opportunity, gaps, match }),
    roleSummary,
  };
}

export function buildTraceFreshness(report?: AgentWrappedReport | null, uploadedAt?: string | Date | null) {
  const created = uploadedAt
    ? new Date(uploadedAt)
    : report?.createdAt
      ? new Date(report.createdAt)
      : null;
  if (!created || Number.isNaN(created.getTime())) return null;

  const daysSinceUpload = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
  const sessionCount = report?.sourceCoverage?.sessionCount ?? report?.sourceSummary?.claudeSessions;
  const isFresh = daysSinceUpload <= 90;

  let label: string;
  if (daysSinceUpload === 0) label = 'Scanned today';
  else if (daysSinceUpload === 1) label = 'Scanned yesterday';
  else if (daysSinceUpload < 30) label = `Scanned ${daysSinceUpload} days ago`;
  else if (daysSinceUpload < 90) label = `Scanned ${daysSinceUpload} days ago`;
  else label = `Trace is ${daysSinceUpload} days old — may be stale`;

  return {
    daysSinceUpload,
    label,
    isFresh,
    sessionCount: typeof sessionCount === 'number' ? sessionCount : undefined,
  };
}
