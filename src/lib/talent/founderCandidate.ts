import { mapTrialProjectFromMatch, normalizeTrialProject, trialProjectToSummary } from '@/lib/talent/founderTrialProject';

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
  if (opportunity?.successIn30Days) {
    questions.push(`Our 30-day success bar is: “${opportunity.successIn30Days}” — how would you approach that?`);
  }
  return questions.slice(0, 5);
}

export function buildSuggestedTrialProject(opportunity: any): string {
  if (opportunity?.successIn30Days) {
    return `Paid sprint aligned to: ${opportunity.successIn30Days}`;
  }
  if (opportunity?.builderWillDo) {
    return `Scope a 1–2 week trial around: ${opportunity.builderWillDo}`;
  }
  return 'Define a small paid sprint (5–10 hrs) with a concrete deliverable before a longer engagement.';
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

export function buildFullCandidateCard(params: {
  builder: any;
  projects: any[];
  match: any;
  shortlistCandidate: any;
  opportunity: any;
  hidden?: boolean;
}) {
  const { builder, projects, match, shortlistCandidate, opportunity, hidden } = params;
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

  return {
    builderId: String(builder._id),
    matchRecordId: match?._id ? String(match._id) : shortlistCandidate?.matchRecordId
      ? String(shortlistCandidate.matchRecordId)
      : null,
    anonymousLabel: shortlistCandidate?.anonymousLabel || null,
    matchScore: match?.matchScore ?? shortlistCandidate?.matchScore ?? 0,
    matchLabel: match?.matchLabel ?? shortlistCandidate?.matchLabel ?? 'Possible Match',
    name: builder.name,
    headline: builder.headline || null,
    bio: builder.bio || null,
    location: builder.location || null,
    availability: {
      availableNow: Boolean(availability.availableNow),
      hoursPerWeek: availability.hoursPerWeek ?? null,
      remotePreference: availability.remotePreference || null,
      desiredCompensation: availability.desiredCompensation || null,
    },
    workTypes: Array.isArray(builder.preferredWorkType) ? builder.preferredWorkType : [],
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

  return candidateEntries
    .map((sc: any) => {
      const builderId = String(sc.builderId);
      const builder = builderById.get(builderId);
      if (!builder) return null;
      return buildFullCandidateCard({
        builder,
        projects: projectsByBuilder.get(builderId) || [],
        match: matchByBuilder.get(builderId),
        shortlistCandidate: sc,
        opportunity,
        hidden: hiddenSet.has(builderId),
      });
    })
    .filter(Boolean);
}
