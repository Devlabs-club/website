import { mapTrialProjectFromMatch, normalizeTrialProject, trialProjectToSummary } from '@/lib/talent/founderTrialProject';
import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';

export type VerificationLabel =
  | 'Builder Claimed'
  | 'DevLabs Verified'
  | 'Founder Verified'
  | 'Peer Confirmed'
  | 'Unverified';

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

function safeString(value: unknown, fallback: string, maxChars: number) {
  return compactText(value, maxChars) || fallback;
}

function fallbackTeasers(base: any, builder: any, projects: any[], shortlistCandidate: any) {
  const verifiedCount = projects.filter((p) => ['admin_verified', 'founder_verified', 'peer_confirmed'].includes(p.verificationStatus)).length;
  const insight = firstSentence(
    base.whyTheyMatch || shortlistCandidate?.proofSummary,
    `${Math.round(base.matchScore || 0)}% match across ${projects.length || 1} proof source${(projects.length || 1) === 1 ? '' : 's'}.`
  );
  return {
    agentTrace: {
      locked: true,
      label: 'Unlock full trace',
      sourceBadges: [
        ...(builder.links?.github ? ['GitHub'] : []),
        ...(builder.links?.linkedin ? ['LinkedIn'] : []),
        ...(builder.links?.portfolio || builder.links?.personalWebsite ? ['Portfolio'] : []),
        ...(projects.some((p) => p.links?.github) ? ['Repo evidence'] : []),
      ].slice(0, 5),
      visibleInsight: insight,
      quantifiedSignals: [
        `${Math.round(base.matchScore || 0)}% match`,
        `${projects.length} project${projects.length === 1 ? '' : 's'} reviewed`,
        `${verifiedCount} verified signal${verifiedCount === 1 ? '' : 's'}`,
      ],
      redacted: ['Evidence chain', 'Comparison notes', 'Confidence breakdown'],
    },
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
}) {
  const { base, builder, projects, match, shortlistCandidate, opportunity } = params;
  const fallback = fallbackTeasers(base, builder, projects, shortlistCandidate);
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
Return only JSON matching the requested shape.`,
      userPrompt: JSON.stringify({
        requestedShape: {
          agentTrace: {
            label: 'short action label',
            sourceBadges: ['2-5 evidence/source badges from supplied data'],
            visibleInsight: 'one sentence, <= 140 chars, with quantified signal when available',
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
      }),
    });
    const parsed = parseJsonObject(reply);
    if (!parsed) return fallback;

    const steps = Array.isArray(parsed.pipeline?.steps) ? parsed.pipeline.steps : [];
    return {
      agentTrace: {
        locked: true,
        label: safeString(parsed.agentTrace?.label, fallback.agentTrace.label, 32),
        sourceBadges: listStrings(parsed.agentTrace?.sourceBadges, 5, 24),
        visibleInsight: safeString(parsed.agentTrace?.visibleInsight, fallback.agentTrace.visibleInsight, 160),
        quantifiedSignals: listStrings(parsed.agentTrace?.quantifiedSignals, 4, 48),
        redacted: listStrings(parsed.agentTrace?.redacted, 4, 48),
      },
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
}) {
  const { builder, projects, match, shortlistCandidate, opportunity, hidden } = params;
  const teaserMode = opportunity?.visibilityMode === 'teaser' || opportunity?.traceAccess === 'teaser' || opportunity?.introAccess === 'locked';
  const availability = builder.availability || {};
  const sortedProjects = [...projects].sort((a, b) => {
    const rank = (s: string) =>
      ['admin_verified', 'founder_verified', 'peer_confirmed', 'builder_confirmed'].indexOf(s);
    return rank(b.verificationStatus || '') - rank(a.verificationStatus || '');
  });

  const relevantProjects = sortedProjects.slice(0, 4).map(mapProjectForFounder);
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
      hoursPerWeek: availability.hoursPerWeek ?? null,
      remotePreference: availability.remotePreference || null,
      desiredCompensation: availability.desiredCompensation || null,
    },
    workTypes: Array.isArray(builder.preferredWorkType) ? builder.preferredWorkType : [],
    experiences: Array.isArray(builder.experiences) ? builder.experiences.slice(0, 5) : [],
    topSkills: shortlistCandidate?.topSkills?.length
      ? shortlistCandidate.topSkills
      : [
          ...(builder.rolePreference || []),
          ...projects.flatMap((p: any) => p.techStack || []).slice(0, 4),
        ].slice(0, 8),
    founderClarityLabel: founderClarityLabel(builder),
    proofStrengthLabel: proofStrengthLabel(builder),
    builderVerificationLabel: verificationLabelForStatus(builder.verificationStatus, 'builder'),
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
  };

  if (!teaserMode) return { ...base, visibilityMode: 'full' };
  const teasers = await buildLlmTeasers({ base, builder, projects, match, shortlistCandidate, opportunity });

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

export type AdminCandidate = Awaited<ReturnType<typeof buildFullCandidateCard>> & {
  email: string | null;
  universityOrCompany: string | null;
  signalScores: Record<string, unknown> | null;
};

export async function buildAdminCandidatesForShortlist(
  shortlist: any,
  opportunity: any,
  deps: {
    BuilderProfile: any;
    ProjectRecord: any;
    MatchRecord: any;
  }
): Promise<AdminCandidate[]> {
  const base = await buildFullCandidatesForShortlist(shortlist, opportunity, deps);
  const builderIds = base.map((c: any) => c.builderId);
  const builders = await deps.BuilderProfile.find({ _id: { $in: builderIds } })
    .select('email universityOrCompany')
    .lean();
  const builderMeta = new Map<string, { email: string | null; universityOrCompany: string | null }>(
    builders.map((b: any) => [
      String(b._id),
      { email: b.email || null, universityOrCompany: b.universityOrCompany || null },
    ])
  );
  const matches = await deps.MatchRecord.find({
    opportunityId: shortlist.opportunityId,
    builderId: { $in: builderIds },
  })
    .select('builderId signalScores')
    .lean();
  const signalByBuilder = new Map(
    matches.map((m: any) => [String(m.builderId), m.signalScores || null])
  );

  return base.map((c: any) => ({
    ...c,
    email: builderMeta.get(c.builderId)?.email ?? null,
    universityOrCompany: builderMeta.get(c.builderId)?.universityOrCompany ?? null,
    signalScores: signalByBuilder.get(c.builderId) ?? null,
  }));
}

export async function buildFullCandidatesForShortlist(
  shortlist: any,
  opportunity: any,
  deps: {
    BuilderProfile: any;
    ProjectRecord: any;
    MatchRecord: any;
  }
) {
  const hiddenSet = new Set((shortlist.hiddenBuilderIds || []).map(String));
  const candidateEntries = shortlist.candidates || [];
  const builderIds = candidateEntries.map((c: any) => c.builderId);

  const [builders, projects, matches] = await Promise.all([
    deps.BuilderProfile.find({ _id: { $in: builderIds } }).lean(),
    deps.ProjectRecord.find({ builderId: { $in: builderIds } }).lean(),
    deps.MatchRecord.find({
      opportunityId: shortlist.opportunityId,
      builderId: { $in: builderIds },
    }).lean(),
  ]);

  const builderById = new Map(builders.map((b: any) => [String(b._id), b]));
  const projectsByBuilder = new Map<string, any[]>();
  for (const p of projects) {
    const key = String(p.builderId);
    if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
    projectsByBuilder.get(key)!.push(p);
  }
  const matchByBuilder = new Map(matches.map((m: any) => [String(m.builderId), m]));

  const cards = await Promise.all(candidateEntries
    .map(async (sc: any) => {
      const builderId = String(sc.builderId);
      const builder = builderById.get(builderId);
      if (!builder) return null;
      return buildFullCandidateCard({
        builder,
        projects: projectsByBuilder.get(builderId) || [],
        match: matchByBuilder.get(builderId),
        shortlistCandidate: sc,
        opportunity: {
          ...opportunity,
          visibilityMode: shortlist.visibilityMode || 'full',
          traceAccess: shortlist.traceAccess || 'full',
          introAccess: shortlist.introAccess || 'enabled',
        },
        hidden: hiddenSet.has(builderId),
      });
    }));

  return cards.filter(Boolean);
}
