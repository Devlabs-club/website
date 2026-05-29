import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';

export type TrialProjectDraft = {
  title: string;
  goal: string;
  deliverables: string[];
  timeline: string;
  suggestedPayRange: string;
  successCriteria: string[];
};

export function normalizeTrialProject(input: Partial<TrialProjectDraft> | null | undefined): TrialProjectDraft | null {
  if (!input?.title?.trim()) return null;
  const deliverables = Array.isArray(input.deliverables)
    ? input.deliverables.map((d) => String(d).trim()).filter(Boolean)
    : [];
  const successCriteria = Array.isArray(input.successCriteria)
    ? input.successCriteria.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (deliverables.length === 0 || successCriteria.length === 0) return null;

  const rejectionNotes = Array.isArray(input.rejectionNotes)
    ? input.rejectionNotes
        .map((r) => ({
          note: String(r?.note || '').trim(),
          rejectedAt: r?.rejectedAt ? String(r.rejectedAt) : null,
        }))
        .filter((r) => r.note)
    : [];

  return {
    title: String(input.title).trim(),
    goal: String(input.goal || '').trim(),
    deliverables,
    timeline: String(input.timeline || '1 week').trim(),
    suggestedPayRange: String(input.suggestedPayRange || '').trim(),
    successCriteria,
    updatedAt: input.updatedAt ? String(input.updatedAt) : null,
    status: input.status || 'draft',
    sentAt: input.sentAt ? String(input.sentAt) : null,
    submittedAt: input.submittedAt ? String(input.submittedAt) : null,
    submission: input.submission
      ? {
          demoUrl: input.submission.demoUrl || null,
          githubUrl: input.submission.githubUrl || null,
          notes: input.submission.notes || null,
          submittedAt: input.submission.submittedAt ? String(input.submission.submittedAt) : null,
        }
      : null,
    rejectionNotes,
    rejectionCount: typeof input.rejectionCount === 'number' ? input.rejectionCount : 0,
  };
}

export function mapTrialProjectFromMatch(trialProject: any): TrialProjectDraft | null {
  if (!trialProject) return null;
  const normalized = normalizeTrialProject({
    title: trialProject.title,
    goal: trialProject.goal,
    deliverables: trialProject.deliverables,
    timeline: trialProject.timeline,
    suggestedPayRange: trialProject.suggestedPayRange,
    successCriteria: trialProject.successCriteria,
    updatedAt: trialProject.updatedAt ? new Date(trialProject.updatedAt).toISOString() : null,
    status: trialProject.status,
    sentAt: trialProject.sentAt ? new Date(trialProject.sentAt).toISOString() : null,
    submittedAt: trialProject.submittedAt ? new Date(trialProject.submittedAt).toISOString() : null,
    submission: trialProject.submission
      ? {
          demoUrl: trialProject.submission.demoUrl || null,
          githubUrl: trialProject.submission.githubUrl || null,
          notes: trialProject.submission.notes || null,
          submittedAt: trialProject.submission.submittedAt
            ? new Date(trialProject.submission.submittedAt).toISOString()
            : null,
        }
      : null,
    rejectionNotes: (trialProject.rejectionNotes || []).map((r: any) => ({
      note: r.note,
      rejectedAt: r.rejectedAt ? new Date(r.rejectedAt).toISOString() : null,
    })),
    rejectionCount: trialProject.rejectionCount || 0,
  });
  return normalized;
}

function parseTimelineWeeks(timeline?: string | null): number {
  if (!timeline) return 1;
  const lower = timeline.toLowerCase();
  if (lower.includes('2 week')) return 2;
  if (lower.includes('3 week')) return 3;
  if (lower.includes('month')) return 4;
  return 1;
}

function budgetToPayRange(budget?: string | null, weeks = 1): string {
  const b = String(budget || '').toLowerCase();
  if (b.includes('500') || b.includes('1k') || b.includes('1000')) return '$500–$1,000';
  if (b.includes('2k') || b.includes('2000')) return '$1,000–$2,000';
  if (b.includes('5k') || b.includes('5000')) return '$2,500–$5,000';
  if (weeks >= 2) return '$1,000–$2,500';
  return '$500–$1,500';
}

export function buildDeterministicTrialProject(params: {
  opportunity: {
    roleTitle?: string | null;
    company?: string | null;
    startupSummary?: string | null;
    builderWillDo?: string | null;
    timeline?: string | null;
    budget?: string | null;
    successIn30Days?: string | null;
    skillsNeeded?: string[];
  };
  builderName: string;
  topSkills: string[];
  projects: Array<{ projectName?: string; techStack?: string[]; builderContribution?: string | null }>;
}): TrialProjectDraft {
  const weeks = parseTimelineWeeks(params.opportunity.timeline);
  const weekLabel = weeks === 1 ? '1-week' : `${weeks}-week`;
  const role = params.opportunity.roleTitle || 'builder';
  const company = params.opportunity.company || 'your startup';
  const topProject = params.projects[0];
  const skillHint = params.topSkills.slice(0, 3).join(', ') || 'relevant stack';

  const goalFromBrief =
    params.opportunity.builderWillDo ||
    params.opportunity.startupSummary?.split('.')[0]?.trim() ||
    `Ship a focused slice of product work for ${company}.`;

  const deliverables: string[] = [];
  if (params.opportunity.builderWillDo) {
    deliverables.push(`Deliverable aligned to: ${params.opportunity.builderWillDo}`);
  }
  if (topProject?.projectName) {
    deliverables.push(`Leverage proof from “${topProject.projectName}” (${skillHint}) in the sprint scope`);
  }
  deliverables.push('Working demo or staging environment the founder can click through');
  deliverables.push('Code in a shared GitHub repo with a short README');
  deliverables.push('15-minute walkthrough + handoff notes');

  const successCriteria: string[] = [];
  if (params.opportunity.successIn30Days) {
    successCriteria.push(`Demonstrates progress toward: ${params.opportunity.successIn30Days}`);
  }
  successCriteria.push('Founder can test the core flow end-to-end without engineer assistance');
  successCriteria.push('Scope matches the agreed timeline — no surprise scope creep');
  successCriteria.push(`${params.builderName.split(' ')[0] || 'Builder'} documents setup and next steps`);

  return {
    title: `${weekLabel} ${role} sprint @ ${company}`,
    goal: goalFromBrief,
    deliverables: deliverables.slice(0, 6),
    timeline: params.opportunity.timeline || (weeks === 1 ? '1 week' : `${weeks} weeks`),
    suggestedPayRange: budgetToPayRange(params.opportunity.budget, weeks),
    successCriteria: successCriteria.slice(0, 5),
  };
}

function extractJsonObject(text: string): TrialProjectDraft | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const deliverables = Array.isArray(parsed.deliverables)
      ? parsed.deliverables
      : typeof parsed.deliverables === 'string'
        ? parsed.deliverables.split('\n').map((s: string) => s.replace(/^[-•*]\s*/, '').trim())
        : [];
    const successCriteria = Array.isArray(parsed.successCriteria)
      ? parsed.successCriteria
      : typeof parsed.successCriteria === 'string'
        ? parsed.successCriteria.split('\n').map((s: string) => s.replace(/^[-•*]\s*/, '').trim())
        : [];
    return normalizeTrialProject({
      title: parsed.title,
      goal: parsed.goal,
      deliverables,
      timeline: parsed.timeline,
      suggestedPayRange: parsed.suggestedPayRange || parsed.suggested_pay_range,
      successCriteria,
    });
  } catch {
    return null;
  }
}

export async function generateTrialProject(params: {
  opportunity: Record<string, unknown>;
  builderName: string;
  topSkills: string[];
  projects: Array<{ projectName?: string; techStack?: string[]; builderContribution?: string | null }>;
  matchReasoning?: string | null;
}): Promise<{ trialProject: TrialProjectDraft; source: 'llm' | 'template' }> {
  const fallback = buildDeterministicTrialProject({
    opportunity: params.opportunity as any,
    builderName: params.builderName,
    topSkills: params.topSkills,
    projects: params.projects,
  });

  if (!hasOpenRouterConfig()) {
    return { trialProject: fallback, source: 'template' };
  }

  const opp = params.opportunity;
  const projectLines = params.projects
    .slice(0, 3)
    .map(
      (p) =>
        `- ${p.projectName || 'Project'} (${(p.techStack || []).slice(0, 5).join(', ')})${p.builderContribution ? `: ${p.builderContribution}` : ''}`
    )
    .join('\n');

  const systemPrompt = `You help startup founders scope paid trial sprints for hiring builders.
Return ONLY valid JSON with keys: title, goal, deliverables (array of strings), timeline, suggestedPayRange, successCriteria (array of strings).
Keep it concrete, shippable in the stated timeline, and founder-friendly — not a generic job description.`;

  const userPrompt = `Role brief:
Company: ${opp.company || 'Startup'}
Role: ${opp.roleTitle || 'Builder'}
What they'll do: ${opp.builderWillDo || 'Not specified'}
Timeline: ${opp.timeline || '1 week'}
Budget hint: ${opp.budget || 'Not specified'}
30-day success: ${opp.successIn30Days || 'Not specified'}
Skills needed: ${(opp.skillsNeeded as string[] | undefined)?.join(', ') || 'Not specified'}

Candidate: ${params.builderName}
Skills: ${params.topSkills.join(', ') || 'See projects'}
Why they match: ${params.matchReasoning || 'Strong fit on proof and skills'}

Projects:
${projectLines || 'None listed'}

Example shape:
{
  "title": "1-week AI dashboard MVP sprint",
  "goal": "Build a working prototype for restaurant Instagram ad generation.",
  "deliverables": ["Authenticated dashboard", "Form for restaurant details", "AI-generated ad copy", "Basic campaign history"],
  "timeline": "1 week",
  "suggestedPayRange": "$500–$1,000",
  "successCriteria": ["Working deployed demo", "Code pushed to GitHub", "Founder can test end-to-end flow"]
}`;

  try {
    const raw = await generateOpenRouterReply({
      systemPrompt,
      userPrompt,
      temperature: 0.35,
      maxTokens: 700,
    });
    const parsed = extractJsonObject(raw);
    if (parsed) return { trialProject: parsed, source: 'llm' };
  } catch {
    /* use fallback */
  }

  return { trialProject: fallback, source: 'template' };
}

export function trialProjectToSummary(project: TrialProjectDraft): string {
  return [
    project.title,
    `Goal: ${project.goal}`,
    `Deliverables: ${project.deliverables.join('; ')}`,
    `Timeline: ${project.timeline}`,
    `Pay: ${project.suggestedPayRange}`,
    `Success: ${project.successCriteria.join('; ')}`,
  ].join('\n');
}
