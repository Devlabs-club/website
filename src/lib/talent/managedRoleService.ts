import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { siteOrigin } from '@/lib/billing/stripe';
import type { RuntimeEnv } from '@/lib/workosEnv';
import { handleJobAction, type FounderIdentity } from '@/lib/founderAgent/service';
import { buildFullCandidatesForShortlist } from '@/lib/talent/founderCandidate';
import {
  BUILDER_SHARE_CONSENT_STATUSES,
  MANAGED_ROLE_DRAFT_STATUSES,
  MANAGED_ROLE_MATCH_REVIEW_STATUSES,
  type BuilderShareConsentStatus,
  type ManagedRoleDraftStatus,
  type ManagedRoleMatchReviewStatus,
} from '@/lib/talent/managedRoleConstants';
import JobPosting from '@/models/founder/JobPosting';
import FounderRoleClaim from '@/models/talent/FounderRoleClaim';
import Shortlist from '@/models/talent/Shortlist';
import MatchRecord from '@/models/talent/MatchRecord';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import BuilderShareConsent from '@/models/talent/BuilderShareConsent';
import ManagedRoleOutreachDraft from '@/models/talent/ManagedRoleOutreachDraft';

type AdminUserLike = {
  _id?: unknown;
  email?: string;
  name?: string;
};

function adminUserId(user: AdminUserLike) {
  return String(user._id || user.email || '').trim();
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function parseDate(value: unknown) {
  const text = cleanString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hashClaimToken(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createClaimToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function managedRoleBuilderEligibilityProblem(builder: any) {
  if (!builder) return 'Builder profile was not found.';
  if (builder.visibilityStatus === 'hidden') return 'Hidden builders cannot be used for founder outreach.';
  if (!builder.availability?.availableNow) return 'Builder availability must be confirmed before founder outreach.';
  if (builder.hiringIntent && builder.hiringIntent.optedIn === false) return 'Builder must opt into hiring before founder outreach.';
  if (builder.profileCompletion?.eligibility === 'not_eligible') return 'Builder profile must be eligible before founder outreach.';
  return null;
}

function publicBuilderProfile(builder: any, projects: any[], fitReason?: string | null) {
  const safeLinks: Record<string, string> = {};
  for (const key of ['github', 'linkedin', 'portfolio', 'personalWebsite', 'devpost', 'twitter'] as const) {
    const value = builder?.links?.[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) safeLinks[key] = value;
  }
  return {
    id: String(builder._id),
    name: builder.name,
    headline: builder.headline || null,
    bio: builder.bio || null,
    avatarUrl: builder.avatarUrl || null,
    location: builder.location || null,
    rolePreference: Array.isArray(builder.rolePreference) ? builder.rolePreference.slice(0, 5) : [],
    skills: Array.isArray(builder.skills) ? builder.skills.slice(0, 10) : [],
    links: safeLinks,
    founderHighlights: Array.isArray(builder.enrichmentInsights?.founderHighlights)
      ? builder.enrichmentInsights.founderHighlights.slice(0, 5).map((item: any) => ({
          title: item?.title || '',
          detail: item?.detail || '',
          source: item?.source || 'Profile',
        }))
      : [],
    fitReason: fitReason || null,
    projects: projects.slice(0, 4).map((project) => ({
      id: String(project._id),
      projectName: project.projectName,
      description: project.description || project.problemSolved || null,
      builderContribution: project.builderContribution || null,
      techStack: Array.isArray(project.techStack) ? project.techStack.slice(0, 8) : [],
      links: {
        github: project.links?.github || null,
        demo: project.links?.demo || null,
        devpost: project.links?.devpost || null,
        videoDemo: project.links?.videoDemo || null,
      },
      verificationStatus: project.verificationStatus || null,
    })),
  };
}

export function serializeManagedRole(job: any, extras: Record<string, any> = {}) {
  return {
    id: String(job._id),
    founderEmail: job.founderEmail,
    founderName: job.founderName || '',
    company: job.company,
    roleTitle: job.roleTitle || job.title,
    startupSummary: job.startupSummary || '',
    fundingStage: job.fundingStage || '',
    location: job.location || job.locationPreference || '',
    skillsNeeded: job.skillsNeeded || [],
    searchRequirements: job.searchRequirements || [],
    salary: job.salary || job.budget || '',
    visa: job.visa || '',
    status: job.status,
    managedRole: job.managedRole || {},
    lastSearchAt: job.lastSearchAt ? new Date(job.lastSearchAt).toISOString() : null,
    createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
    ...extras,
  };
}

export async function listManagedRoles() {
  await connectAdminDB();
  const jobs = await JobPosting.find({ managedByDevLabs: true })
    .sort({ 'managedRole.followUpAt': 1, updatedAt: -1 })
    .limit(100)
    .lean();
  const jobIds = jobs.map((job: any) => job._id);
  const [claims, shortlists, drafts] = await Promise.all([
    FounderRoleClaim.find({ opportunityIds: { $in: jobIds } }).sort({ createdAt: -1 }).lean(),
    Shortlist.find({ opportunityId: { $in: jobIds } }).select('opportunityId totalMatches strongMatchCount previewGeneratedAt unlocked').lean(),
    ManagedRoleOutreachDraft.find({ opportunityId: { $in: jobIds } }).sort({ createdAt: -1 }).lean(),
  ]);
  const claimByJob = new Map<string, any>();
  for (const claim of claims as any[]) {
    for (const id of claim.opportunityIds || []) {
      const key = String(id);
      if (!claimByJob.has(key)) claimByJob.set(key, claim);
    }
  }
  const shortlistByJob = new Map((shortlists as any[]).map((sl) => [String(sl.opportunityId), sl]));
  const draftByJob = new Map<string, any>();
  for (const draft of drafts as any[]) {
    const key = String(draft.opportunityId);
    if (!draftByJob.has(key)) draftByJob.set(key, draft);
  }
  return jobs.map((job: any) => {
    const id = String(job._id);
    const claim = claimByJob.get(id);
    const shortlist = shortlistByJob.get(id);
    const draft = draftByJob.get(id);
    return serializeManagedRole(job, {
      claim: claim
        ? {
            id: String(claim._id),
            targetEmail: claim.targetEmail,
            status: claim.status,
            expiresAt: claim.expiresAt ? new Date(claim.expiresAt).toISOString() : null,
          }
        : null,
      shortlist: shortlist
        ? {
            totalMatches: shortlist.totalMatches || 0,
            strongMatchCount: shortlist.strongMatchCount || 0,
            previewGeneratedAt: shortlist.previewGeneratedAt ? new Date(shortlist.previewGeneratedAt).toISOString() : null,
            unlocked: Boolean(shortlist.unlocked),
          }
        : null,
      latestDraft: draft ? serializeDraft(draft) : null,
    });
  });
}

export async function getManagedRole(id: string) {
  await connectAdminDB();
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const job = await JobPosting.findOne({ _id: id, managedByDevLabs: true }).lean();
  if (!job) return null;
  const [claim, shortlist, drafts, matches] = await Promise.all([
    FounderRoleClaim.findOne({ opportunityIds: id }).sort({ createdAt: -1 }).lean(),
    Shortlist.findOne({ opportunityId: id }).lean(),
    ManagedRoleOutreachDraft.find({ opportunityId: id }).sort({ createdAt: -1 }).lean(),
    listManagedRoleMatches(id),
  ]);
  return serializeManagedRole(job, {
    claim: claim
      ? {
          id: String((claim as any)._id),
          targetEmail: (claim as any).targetEmail,
          status: (claim as any).status,
          expiresAt: (claim as any).expiresAt ? new Date((claim as any).expiresAt).toISOString() : null,
          consumedAt: (claim as any).consumedAt ? new Date((claim as any).consumedAt).toISOString() : null,
        }
      : null,
    shortlist: shortlist
      ? {
          totalMatches: (shortlist as any).totalMatches || 0,
          strongMatchCount: (shortlist as any).strongMatchCount || 0,
          previewGeneratedAt: (shortlist as any).previewGeneratedAt ? new Date((shortlist as any).previewGeneratedAt).toISOString() : null,
          unlocked: Boolean((shortlist as any).unlocked),
        }
      : null,
    drafts: drafts.map(serializeDraft),
    matches,
  });
}

export async function createManagedRole(body: Record<string, unknown>, user: AdminUserLike, request: Request, runtime?: RuntimeEnv) {
  await connectAdminDB();
  const targetEmail = cleanString(body.targetEmail || body.founderEmail)?.toLowerCase();
  const company = cleanString(body.company);
  const roleTitle = cleanString(body.roleTitle || body.role);
  if (!targetEmail || !company || !roleTitle) {
    return { error: 'targetEmail, company, and roleTitle are required.', status: 400 as const };
  }

  const job = await JobPosting.create({
    founderId: targetEmail,
    founderEmail: targetEmail,
    founderName: cleanString(body.founderName) || company,
    title: roleTitle,
    roleTitle,
    company,
    startupSummary: cleanString(body.startupSummary || body.summary),
    fundingStage: cleanString(body.fundingStage),
    location: cleanString(body.location),
    locationPreference: cleanString(body.location),
    salary: cleanString(body.salary),
    budget: cleanString(body.salary),
    skillsNeeded: cleanList(body.skillsNeeded || body.skills),
    originalSkillsNeeded: cleanList(body.skillsNeeded || body.skills),
    searchRequirements: cleanList(body.must || body.searchRequirements).map((text) => ({ text, importance: 'must' })),
    equity: cleanString(body.equity) || 'No',
    visa: cleanString(body.visa) || 'Yes',
    managedByDevLabs: true,
    managedRole: {
      sourceUrl: cleanString(body.sourceUrl || body.roleUrl),
      sourceLabel: cleanString(body.sourceLabel || body.leadSource) || 'manual',
      ownerUserId: adminUserId(user),
      pipelineStage: 'sourced',
      nextAction: 'Review matches and request builder consent',
      followUpAt: parseDate(body.followUpAt),
      searchSprintStatus: 'not_proposed',
    },
    status: 'draft',
  });

  const { rawToken } = await createOrRotateClaimToken(String(job._id), targetEmail, company);
  const origin = siteOrigin(request, runtime);
  return {
    role: serializeManagedRole(job),
    claimUrl: `${origin}/founder/claim/${encodeURIComponent(rawToken)}`,
    previewUrl: `${origin}/shortlists/${encodeURIComponent(rawToken)}`,
  };
}

export async function updateManagedRole(id: string, body: Record<string, unknown>, user: AdminUserLike) {
  await connectAdminDB();
  if (!mongoose.Types.ObjectId.isValid(id)) return { error: 'Invalid role id.', status: 400 as const };
  const job = await JobPosting.findOne({ _id: id, managedByDevLabs: true });
  if (!job) return { error: 'Managed role not found.', status: 404 as const };
  const set: Record<string, unknown> = {};
  for (const key of ['roleTitle', 'company', 'startupSummary', 'fundingStage', 'location', 'salary', 'visa', 'status'] as const) {
    const value = cleanString(body[key]);
    if (value !== null) set[key] = value;
  }
  if (set.roleTitle) set.title = set.roleTitle;
  if (set.salary) set.budget = set.salary;
  const skills = cleanList(body.skillsNeeded);
  if (skills.length) {
    set.skillsNeeded = skills;
    set.originalSkillsNeeded = skills;
  }
  const managed = job.managedRole || {};
  job.managedRole = {
    ...managed,
    ...(cleanString(body.sourceUrl) !== null ? { sourceUrl: cleanString(body.sourceUrl) } : {}),
    ...(cleanString(body.sourceLabel) !== null ? { sourceLabel: cleanString(body.sourceLabel) } : {}),
    ...(cleanString(body.pipelineStage) !== null ? { pipelineStage: cleanString(body.pipelineStage) } : {}),
    ...(cleanString(body.nextAction) !== null ? { nextAction: cleanString(body.nextAction) } : {}),
    ...(cleanString(body.ownerUserId) !== null ? { ownerUserId: cleanString(body.ownerUserId) } : {}),
    ...(cleanString(body.searchSprintStatus) !== null ? { searchSprintStatus: cleanString(body.searchSprintStatus) } : {}),
    ...(parseDate(body.followUpAt) ? { followUpAt: parseDate(body.followUpAt) } : {}),
    ...(body.markContacted === true ? { lastContactAt: new Date(), pipelineStage: 'contacted' } : {}),
    updatedByUserId: adminUserId(user),
  };
  Object.assign(job, set);
  await job.save();
  return { role: await getManagedRole(id) };
}

export async function runManagedRoleSearch(id: string, user: AdminUserLike) {
  await connectAdminDB();
  const job = await JobPosting.findOne({ _id: id, managedByDevLabs: true });
  if (!job) return { error: 'Managed role not found.', status: 404 as const };
  const identity: FounderIdentity = {
    founderId: String(job.founderId || job.founderEmail),
    email: job.founderEmail,
    founderName: job.founderName || job.company,
    accountType: 'founder',
    onboardingStatus: 'complete',
  };
  const result: any = await handleJobAction(identity, {
    action: 'rerun_job_search',
    payload: { jobId: String(job._id), searchMode: 'balanced' },
  });
  job.status = result?.needsFollowup ? 'draft' : 'shortlisted';
  job.managedRole = {
    ...(job.managedRole || {}),
    pipelineStage: result?.needsFollowup ? 'sourced' : 'matched',
    nextAction: result?.needsFollowup ? 'Add role detail before search' : 'Review matches and request builder consent',
    updatedByUserId: adminUserId(user),
  };
  await job.save();
  return { search: result, role: await getManagedRole(id) };
}

export async function listManagedRoleMatches(id: string) {
  await connectAdminDB();
  const job = await JobPosting.findOne({ _id: id, managedByDevLabs: true }).lean();
  if (!job) return [];
  const shortlist = await Shortlist.findOne({ opportunityId: id }).lean();
  if (!shortlist) return [];
  const [candidates, consents] = await Promise.all([
    buildFullCandidatesForShortlist(shortlist, job, { BuilderProfile, ProjectRecord, MatchRecord }, { entitlements: { visibilityMode: 'full', traceAccess: 'teaser', introAccess: 'locked', outreachAccess: 'locked', lifecycleAccess: 'locked' } as any }),
    BuilderShareConsent.find({ opportunityId: id }).lean(),
  ]);
  const consentByBuilder = new Map((consents as any[]).map((consent) => [String(consent.builderId), consent]));
  return candidates.filter((candidate: any) => !candidate.hidden).slice(0, 25).map((candidate: any) => {
    const consent = consentByBuilder.get(String(candidate.builderId));
    return {
      builderId: candidate.builderId,
      name: candidate.name,
      headline: candidate.headline || '',
      location: candidate.location || '',
      matchScore: candidate.matchScore || 0,
      matchLabel: candidate.matchLabel || '',
      whyTheyMatch: candidate.whyTheyMatch || '',
      availability: candidate.availability || null,
      reviewStatus: candidate.match?.reviewStatus || 'needs_review',
      matchStatus: candidate.matchStatus || 'generated',
      consentStatus: consent?.status || null,
      consentId: consent?._id ? String(consent._id) : null,
    };
  });
}

export async function reviewManagedRoleMatch(id: string, body: Record<string, unknown>, user: AdminUserLike) {
  await connectAdminDB();
  const builderId = cleanString(body.builderId);
  const reviewStatus = cleanString(body.reviewStatus) as ManagedRoleMatchReviewStatus | null;
  if (!mongoose.Types.ObjectId.isValid(id) || !builderId || !mongoose.Types.ObjectId.isValid(builderId)) {
    return { error: 'Valid role id and builder id are required.', status: 400 as const };
  }
  if (!reviewStatus || !MANAGED_ROLE_MATCH_REVIEW_STATUSES.includes(reviewStatus)) {
    return { error: 'Valid reviewStatus is required.', status: 400 as const };
  }
  const [job, builder, match] = await Promise.all([
    JobPosting.findOne({ _id: id, managedByDevLabs: true }),
    BuilderProfile.findById(builderId).lean() as any,
    MatchRecord.findOne({ opportunityId: id, builderId }),
  ]);
  if (!job || !match) return { error: 'Role or match not found.', status: 404 as const };
  const eligibilityProblem = managedRoleBuilderEligibilityProblem(builder);
  if (reviewStatus === 'approved_for_outreach' && eligibilityProblem) {
    return { error: eligibilityProblem, status: 400 as const };
  }
  match.reviewStatus = reviewStatus;
  match.founderFacingFitReason = cleanString(body.founderFacingFitReason) || match.reasoning || null;
  match.teamReviewNote = cleanString(body.teamReviewNote);
  if (reviewStatus === 'approved_for_outreach') {
    match.approvedByUserId = adminUserId(user);
    match.approvedAt = new Date();
  }
  if (reviewStatus === 'rejected_by_team') {
    match.rejectedByUserId = adminUserId(user);
    match.rejectedAt = new Date();
  }
  await match.save();
  return { matches: await listManagedRoleMatches(id) };
}

export async function upsertBuilderShareConsent(id: string, body: Record<string, unknown>, user: AdminUserLike) {
  await connectAdminDB();
  const builderId = cleanString(body.builderId);
  const status = cleanString(body.status) as BuilderShareConsentStatus | null;
  if (!mongoose.Types.ObjectId.isValid(id) || !builderId || !mongoose.Types.ObjectId.isValid(builderId)) {
    return { error: 'Valid role id and builder id are required.', status: 400 as const };
  }
  if (!status || !BUILDER_SHARE_CONSENT_STATUSES.includes(status)) {
    return { error: 'Valid consent status is required.', status: 400 as const };
  }
  const [job, match] = await Promise.all([
    JobPosting.findOne({ _id: id, managedByDevLabs: true }).lean(),
    MatchRecord.findOne({ opportunityId: id, builderId }),
  ]);
  if (!job || !match) return { error: 'Role or match not found.', status: 404 as const };
  const now = new Date();
  const consent = await BuilderShareConsent.findOneAndUpdate(
    { opportunityId: id, builderId, scope: 'profile' },
    {
      $set: {
        matchRecordId: match._id,
        company: (job as any).company,
        roleTitle: (job as any).roleTitle || (job as any).title,
        status,
        note: cleanString(body.note),
        ...(status === 'pending' ? { requestedByUserId: adminUserId(user), requestedAt: now } : {}),
        ...(status !== 'pending' ? { respondedByUserId: adminUserId(user), respondedAt: now } : {}),
      },
      $setOnInsert: { requestedByUserId: adminUserId(user), requestedAt: now },
    },
    { upsert: true, new: true }
  );
  match.builderConsentId = consent._id;
  match.reviewStatus = status === 'granted' ? 'builder_consented' : status === 'pending' ? 'pending_builder_consent' : 'needs_review';
  await match.save();
  return { consent: serializeConsent(consent), matches: await listManagedRoleMatches(id) };
}

async function createOrRotateClaimToken(opportunityId: string, targetEmail: string, company: string) {
  const rawToken = createClaimToken();
  const claim = await FounderRoleClaim.findOneAndUpdate(
    { opportunityIds: opportunityId, targetEmail },
    {
      $set: {
        opportunityIds: [opportunityId],
        targetEmail,
        company,
        tokenHash: hashClaimToken(rawToken),
        status: 'email_sent',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true, new: true }
  );
  return { rawToken, claim };
}

export async function rotateManagedRoleClaim(id: string, request: Request, runtime?: RuntimeEnv) {
  await connectAdminDB();
  const job = await JobPosting.findOne({ _id: id, managedByDevLabs: true }).lean();
  if (!job) return { error: 'Managed role not found.', status: 404 as const };
  const { rawToken } = await createOrRotateClaimToken(id, (job as any).founderEmail, (job as any).company);
  const origin = siteOrigin(request, runtime);
  return {
    claimUrl: `${origin}/founder/claim/${encodeURIComponent(rawToken)}`,
    previewUrl: `${origin}/shortlists/${encodeURIComponent(rawToken)}`,
  };
}

export async function createManagedRoleDraft(id: string, body: Record<string, unknown>, user: AdminUserLike, request: Request, runtime?: RuntimeEnv) {
  await connectAdminDB();
  const builderId = cleanString(body.builderId);
  if (!builderId || !mongoose.Types.ObjectId.isValid(builderId)) return { error: 'builderId is required.', status: 400 as const };
  const [job, builder, consent] = await Promise.all([
    JobPosting.findOne({ _id: id, managedByDevLabs: true }),
    BuilderProfile.findById(builderId).lean() as any,
    BuilderShareConsent.findOne({ opportunityId: id, builderId, scope: 'profile', status: 'granted' }).lean(),
  ]);
  if (!job || !builder) return { error: 'Role or builder not found.', status: 404 as const };
  const eligibilityProblem = managedRoleBuilderEligibilityProblem(builder);
  if (eligibilityProblem) return { error: eligibilityProblem, status: 400 as const };
  if (!consent) return { error: 'Builder consent must be granted before drafting founder outreach.', status: 400 as const };

  let rawToken = cleanString(body.claimToken);
  let claim: any = null;
  if (rawToken) {
    claim = await FounderRoleClaim.findOne({ tokenHash: hashClaimToken(rawToken), opportunityIds: id }).lean();
  }
  if (!claim || claim.status !== 'email_sent' || (claim.expiresAt && new Date(claim.expiresAt).getTime() < Date.now())) {
    const rotated = await createOrRotateClaimToken(id, job.founderEmail, job.company);
    rawToken = rotated.rawToken;
    claim = rotated.claim;
  }
  const origin = siteOrigin(request, runtime);
  const previewUrl = rawToken ? `${origin}/shortlists/${encodeURIComponent(rawToken)}` : null;
  const claimUrl = rawToken ? `${origin}/founder/claim/${encodeURIComponent(rawToken)}` : null;
  const subject = `${job.roleTitle || job.title} shortlist for ${job.company}`;
  const bodyText = [
    `Hey ${job.founderName && job.founderName !== job.company ? job.founderName.split(' ')[0] : 'there'},`,
    '',
    `Saw ${job.company} is hiring a ${job.roleTitle || job.title}. DevLabs matched the role against builders with real shipped proof.`,
    '',
    `${builder.name} stood out first: ${cleanString(body.fitReason) || builder.headline || 'their profile has relevant proof for this role'}.`,
    '',
    previewUrl ? `You can see the first builder here before any setup: ${previewUrl}` : null,
    claimUrl ? `If it is relevant, claim the shortlist here: ${claimUrl}` : null,
    '',
    'We can run a 7-day DevLabs Search Sprint: first shortlist within 72 hours, three qualified builders within seven days. The deposit is $499 and is credited toward the success fee.',
  ].filter(Boolean).join('\n');

  const draft = await ManagedRoleOutreachDraft.create({
    opportunityId: id,
    founderRoleClaimId: (claim as any)?._id || null,
    selectedBuilderId: builderId,
    targetEmail: job.founderEmail,
    targetName: job.founderName || null,
    channel: cleanString(body.channel) === 'linkedin' ? 'linkedin' : 'email',
    subject,
    body: bodyText,
    publicPreviewUrl: previewUrl,
    status: 'draft',
    createdByUserId: adminUserId(user),
  });
  job.managedRole = { ...(job.managedRole || {}), pipelineStage: 'draft_ready', nextAction: 'Manually approve and send outreach draft' };
  await job.save();
  return { draft: serializeDraft(draft), previewUrl, claimUrl };
}

export async function updateManagedRoleDraft(id: string, body: Record<string, unknown>, user: AdminUserLike) {
  await connectAdminDB();
  if (!mongoose.Types.ObjectId.isValid(id)) return { error: 'Invalid draft id.', status: 400 as const };
  const status = cleanString(body.status) as ManagedRoleDraftStatus | null;
  if (!status || !MANAGED_ROLE_DRAFT_STATUSES.includes(status)) return { error: 'Valid status is required.', status: 400 as const };
  const draft = await ManagedRoleOutreachDraft.findById(id);
  if (!draft) return { error: 'Draft not found.', status: 404 as const };
  draft.status = status;
  if (status === 'approved') {
    draft.approvedByUserId = adminUserId(user);
    draft.approvedAt = new Date();
  }
  if (status === 'sent_manually') {
    draft.sentManuallyByUserId = adminUserId(user);
    draft.sentManuallyAt = new Date();
    await JobPosting.updateOne({ _id: draft.opportunityId }, { $set: { 'managedRole.pipelineStage': 'contacted', 'managedRole.lastContactAt': new Date(), 'managedRole.nextAction': 'Watch for founder reply' } });
  }
  await draft.save();
  return { draft: serializeDraft(draft) };
}

export async function loadPublicManagedRolePreview(rawToken: string) {
  await connectAdminDB();
  const claim = rawToken ? await FounderRoleClaim.findOne({ tokenHash: hashClaimToken(rawToken) }).lean() : null;
  if (!claim || (claim as any).status !== 'email_sent') return null;
  if ((claim as any).expiresAt && new Date((claim as any).expiresAt).getTime() < Date.now()) return null;
  const opportunityId = String((claim as any).opportunityIds?.[0] || '');
  if (!mongoose.Types.ObjectId.isValid(opportunityId)) return null;
  const [job, shortlist, consents] = await Promise.all([
    JobPosting.findOne({ _id: opportunityId, managedByDevLabs: true }).lean(),
    Shortlist.findOne({ opportunityId }).lean(),
    BuilderShareConsent.find({ opportunityId, scope: 'profile', status: 'granted' }).lean(),
  ]);
  if (!job || !shortlist || !(consents as any[]).length) return null;
  const consentBuilderIds = new Set((consents as any[]).map((c) => String(c.builderId)));
  const match = await MatchRecord.findOne({
    opportunityId,
    builderId: { $in: [...consentBuilderIds].map((id) => new mongoose.Types.ObjectId(id)) },
    reviewStatus: { $in: ['approved_for_outreach', 'pending_builder_consent', 'builder_consented'] },
  }).sort({ matchScore: -1 }).lean() as any;
  if (!match) return null;
  const [builder, projects] = await Promise.all([
    BuilderProfile.findById(match.builderId).lean() as any,
    ProjectRecord.find({ builderId: match.builderId }).sort({ updatedAt: -1 }).limit(6).lean(),
  ]);
  if (managedRoleBuilderEligibilityProblem(builder)) return null;
  return {
    claimPath: `/founder/claim/${encodeURIComponent(rawToken)}`,
    role: {
      company: (job as any).company,
      roleTitle: (job as any).roleTitle || (job as any).title,
      startupSummary: (job as any).startupSummary || null,
      fundingStage: (job as any).fundingStage || null,
      location: (job as any).location || null,
      skillsNeeded: (job as any).skillsNeeded || [],
      expiresAt: (claim as any).expiresAt ? new Date((claim as any).expiresAt).toISOString() : null,
    },
    builder: publicBuilderProfile(builder, projects, match.founderFacingFitReason || match.reasoning),
    lockedCount: Math.max(0, Number((shortlist as any).totalMatches || 0) - 1),
  };
}

function serializeConsent(consent: any) {
  return {
    id: String(consent._id),
    builderId: String(consent.builderId),
    opportunityId: String(consent.opportunityId),
    status: consent.status,
    scope: consent.scope,
    requestedAt: consent.requestedAt ? new Date(consent.requestedAt).toISOString() : null,
    respondedAt: consent.respondedAt ? new Date(consent.respondedAt).toISOString() : null,
    note: consent.note || '',
  };
}

function serializeDraft(draft: any) {
  return {
    id: String(draft._id),
    opportunityId: String(draft.opportunityId),
    selectedBuilderId: draft.selectedBuilderId ? String(draft.selectedBuilderId) : null,
    targetEmail: draft.targetEmail,
    channel: draft.channel,
    subject: draft.subject || '',
    body: draft.body,
    publicPreviewUrl: draft.publicPreviewUrl || null,
    status: draft.status,
    createdAt: draft.createdAt ? new Date(draft.createdAt).toISOString() : null,
    approvedAt: draft.approvedAt ? new Date(draft.approvedAt).toISOString() : null,
    sentManuallyAt: draft.sentManuallyAt ? new Date(draft.sentManuallyAt).toISOString() : null,
  };
}
