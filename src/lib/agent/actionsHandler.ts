import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import Opportunity from '@/models/talent/Opportunity';
import MatchRecord from '@/models/talent/MatchRecord';
import ProjectRecord from '@/models/talent/ProjectRecord';
import EventRecord from '@/models/talent/EventRecord';
import MomentumUpdate from '@/models/talent/MomentumUpdate';
import { computeProfileCompletion, computeBuilderScores } from '@/lib/talent/matching';
import { evaluateBuilderProfileQuality, evaluateDeterministicQuality } from '@/lib/talent/profileQuality';
import mongoose from 'mongoose';
import { generateOpenRouterReply, getOpenRouterChatModel, hasOpenRouterConfig } from '@/lib/openrouter';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { runtimeEnvFromLocals, type RuntimeEnv } from '@/lib/workosEnv';
import {
  toPublicShortlist,
} from '@/lib/talent/builderSearch';
import { buildFullCandidatesForShortlist } from '@/lib/talent/founderCandidate';
import {
  buildFounderPipeline,
  buildSuggestedIntroMessage,
  PIPELINE_TO_MATCH_STATUS,
  pipelineStatusLabel,
} from '@/lib/talent/founderPipeline';
import {
  generateTrialProject,
  normalizeTrialProject,
} from '@/lib/talent/founderTrialProject';
import Shortlist from '@/models/talent/Shortlist';
import IntroRequest from '@/models/talent/IntroRequest';
import CallSchedule from '@/models/talent/CallSchedule';
import User from '@/models/user.tsx';
import CandidateFeedback from '@/models/talent/CandidateFeedback';
import {
  countUnreadForBuilder,
  countUnreadForFounder,
  getNotificationsForBuilder,
  getNotificationsForFounder,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/talent/notifications';
import {
  deliverIntroRequest,
  getBuilderIntroInbox,
  respondToIntro,
} from '@/lib/talent/introFlow';
import {
  completeCallByFounder,
  confirmCallScheduleByFounder,
  getBuilderUpcomingCalls,
  getCallScheduleForMatch,
  respondCallScheduleByBuilder,
  scheduleCallByFounder,
} from '@/lib/talent/callSchedule';
import {
  getBuilderActiveTrials,
  hireBuilder,
  rejectBuilder,
  reviewTrialSubmission,
  sendTrialProjectToBuilder,
  submitTrialByBuilder,
} from '@/lib/talent/trialFlow';
import {
  getBuilderThreads,
  countUnreadFounderMessages,
  getFounderThreads,
  getOrCreateThread,
  getThreadMessages,
} from '@/lib/talent/messageFlow';
import { sendTalentEmail, dashboardDeepLink } from '@/lib/talent/talentEmail';
import {
  canUseLifecycle,
  entitlementErrorResponse,
  entitlementSnapshot,
  getFounderEntitlements,
  recordUsageEvent,
} from '@/lib/billing/entitlements';
import HiringLedger from '@/models/billing/HiringLedger';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, ...((data as object) || {}) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bad(error: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function billingBad(result: NonNullable<ReturnType<typeof canUseLifecycle>>) {
  return new Response(JSON.stringify({ success: false, ...entitlementErrorResponse(result) }), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function founderBillingIdentity(resolved: { decoded?: any; email: string }) {
  return {
    founderId: String(resolved.decoded?.userId || resolved.email),
    email: resolved.email,
  };
}

async function requireLifecycleAccess(resolved: { decoded?: any; email: string }) {
  const identity = founderBillingIdentity(resolved);
  const { entitlements } = await getFounderEntitlements(identity);
  const denied = canUseLifecycle(entitlements);
  return denied ? { ok: false as const, denied } : { ok: true as const, identity, entitlements };
}

function introHookFromCandidate(builderName: string, proof?: string | null) {
  const first = String(builderName || 'there').split(' ')[0];
  const cleanProof = String(proof || 'your proof-of-work stood out')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]$/, '');
  return `Hey ${first}, ${cleanProof}.`;
}

async function generateLockedIntroTeaser(params: {
  builderName: string;
  roleTitle?: string | null;
  company?: string | null;
  proof?: string | null;
  topSkills?: string[];
}) {
  const fallback = {
    label: 'Open intro draft',
    visibleHook: introHookFromCandidate(params.builderName, params.proof),
    redactedBody: 'Role fit, specific ask, and follow-up stay locked.',
  };
  if (!hasOpenRouterConfig()) return fallback;
  try {
    const reply = await generateOpenRouterReply({
      responseFormat: 'json_object',
      temperature: 0.35,
      maxTokens: 220,
      systemPrompt: `Write one locked intro teaser line for a founder reaching out to a builder.
Tone: direct, specific, builder-native, proof-backed. No hype and no sales copy.
Use only supplied facts. Do not invent details.
Return JSON only: {"label":"...","visibleHook":"...","redactedBody":"..."}.`,
      userPrompt: JSON.stringify({
        builderName: params.builderName,
        roleTitle: params.roleTitle || null,
        company: params.company || null,
        proof: params.proof || null,
        topSkills: params.topSkills || [],
        rules: [
          'label must be under 32 characters',
          'visibleHook must be one line under 140 characters and should make the founder want to unlock the full draft',
          'redactedBody must be under 110 characters and describe what stays locked without sales language',
        ],
      }),
    });
    const parsed = JSON.parse(reply);
    const hook = String(parsed.visibleHook || '').replace(/\s+/g, ' ').trim();
    return {
      label: String(parsed.label || fallback.label).replace(/\s+/g, ' ').trim().slice(0, 40) || fallback.label,
      visibleHook: hook ? hook.slice(0, 160) : fallback.visibleHook,
      redactedBody: String(parsed.redactedBody || fallback.redactedBody).replace(/\s+/g, ' ').trim().slice(0, 130) || fallback.redactedBody,
    };
  } catch {
    return fallback;
  }
}

async function updateBuilderScores(builder: any) {
  const [projects, events, momentum] = await Promise.all([
    ProjectRecord.find({ builderId: builder._id }).lean(),
    EventRecord.find({ builderId: builder._id }).lean(),
    MomentumUpdate.find({ builderId: builder._id }).lean(),
  ]);
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;

  try {
    const quality = await evaluateBuilderProfileQuality(builder, projects, events, momentum);
    builder.profileQuality = quality;
    builder.profileQuality.evaluatedAt = new Date();
  } catch (err) {
    console.error('[updateBuilderScores] Quality evaluation failed:', err);
  }

  await builder.save();
  return completion;
}

async function applyClaimProfile(builder: any, claimConfirmed: boolean) {
  if (claimConfirmed) builder.verificationStatus = 'builder_confirmed';
  return await updateBuilderScores(builder);
}

async function applyAvailabilityUpdate(
  builder: any,
  updates: { availableNow?: boolean; desiredCompensation?: string | null; remotePreference?: string | null }
) {
  builder.availability = {
    ...builder.availability,
    ...(typeof updates.availableNow === 'boolean' ? { availableNow: updates.availableNow } : {}),
    desiredCompensation: updates.desiredCompensation ?? builder.availability?.desiredCompensation ?? null,
    remotePreference: updates.remotePreference ?? builder.availability?.remotePreference ?? 'unspecified',
    refreshedAt: new Date(),
  };
  return await updateBuilderScores(builder);
}

async function applyLinksUpdate(
  builder: any,
  updates: { github?: string | null; linkedin?: string | null; resume?: string | null; portfolio?: string | null }
) {
  builder.links = {
    ...builder.links,
    ...(updates.github !== undefined ? { github: updates.github } : {}),
    ...(updates.linkedin !== undefined ? { linkedin: updates.linkedin } : {}),
    ...(updates.resume !== undefined ? { resume: updates.resume } : {}),
    ...(updates.portfolio !== undefined ? { portfolio: updates.portfolio } : {}),
  };

  return await updateBuilderScores(builder);
}

async function resolveAuthedFounder(request: Request, runtime?: RuntimeEnv) {
  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = extractTokenFromHeader(authHeader) || extractTokenFromCookies(cookieHeader);
  if (!token) {
    return { error: 'Please log in to continue.' as const };
  }

  const decoded = verifyToken(token, runtime);
  if (!decoded) {
    return { error: 'Session expired. Please log in again.' as const };
  }

  const email = (decoded.email || '').toLowerCase().trim();
  if (!email) {
    return { error: 'Authenticated email not available in session.' as const };
  }

  let founderName = email.split('@')[0];
  let role = decoded.role;
  try {
    await connectAdminDB();
    const user = await User.findById(decoded.userId).select('name role email').lean();
    if (user?.name) founderName = user.name;
    if (user?.role) role = String(user.role);
  } catch {
    // use JWT fallback
  }

  if (role !== 'founder') {
    return { error: 'Founder account required. Sign up as a founder to use hiring features.' as const };
  }

  return { decoded, email, founderName };
}

async function resolveAuthedBuilder(request: Request, runtime?: RuntimeEnv) {
  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = extractTokenFromHeader(authHeader) || extractTokenFromCookies(cookieHeader);
  if (!token) {
    return { error: 'Please log in to continue.' as const };
  }

  const decoded = verifyToken(token, runtime);
  if (!decoded) {
    return { error: 'Session expired. Please log in again.' as const };
  }

  const email = (decoded.email || '').toLowerCase().trim();
  if (!email) {
    return { error: 'Authenticated email not available in session.' as const };
  }

  let builder = await BuilderProfile.findOne({
    $or: [
      { userId: decoded.userId },
      { email },
    ],
  });

  if (!builder) {
    const fallbackName = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    builder = await BuilderProfile.create({
      userId: decoded.userId,
      email,
      name: fallbackName || 'Builder',
      verificationStatus: 'builder_confirmed',
      availability: {
        availableNow: true,
        remotePreference: 'unspecified',
        refreshedAt: new Date(),
      },
      hiringIntent: {
        optedIn: true,
        projectSprint: true,
      },
    });
  } else if (!builder.userId) {
    builder.userId = decoded.userId;
    await builder.save();
  }

  return { builder };
}

async function applyProfileBasicsUpdate(builder: any, updates: { headline?: string | null; bio?: string | null }) {
  if (updates.headline !== undefined) builder.headline = updates.headline?.trim() || null;
  if (updates.bio !== undefined) builder.bio = updates.bio?.trim() || null;
  await builder.save();
  return await updateBuilderScores(builder);
}

async function applyWorkPreferencesUpdate(
  builder: any,
  updates: { preferredWorkTypes?: string[]; availableNow?: boolean }
) {
  const nextTypes = Array.isArray(updates.preferredWorkTypes) ? updates.preferredWorkTypes : [];
  const existing = new Set<string>((builder.preferredWorkType || []).map((value: string) => value.trim()));
  nextTypes.forEach((workType) => existing.add(workType));
  builder.preferredWorkType = Array.from(existing);

  if (typeof updates.availableNow === 'boolean') {
    builder.availability = {
      ...builder.availability,
      availableNow: updates.availableNow,
      refreshedAt: new Date(),
    };
  }

  return await updateBuilderScores(builder);
}

export const postAgentAction: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  try {
    await connectAdminDB();
    const body = await request.json();
    const action = body?.action;
    const payload = body?.payload || {};
    console.log('[agent/actions] request', { action, hasPayload: Boolean(payload) });

    if (!action) return bad('action is required');

    if (action === 'claim_profile') {
      const { claimConfirmed } = payload;
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyClaimProfile(builder, claimConfirmed === true);
      const message = 'Profile claim updated.';

      return ok({
        message,
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'profile_completion',
            title: 'Your Builder Profile Strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ],
      });
    }

    if (action === 'update_availability') {
      const { availableNow, desiredCompensation, remotePreference } = payload;
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyAvailabilityUpdate(builder, {
        availableNow: typeof availableNow === 'boolean' ? availableNow : undefined,
        desiredCompensation,
        remotePreference,
      });
      const message = 'Availability updated.';

      return ok({
        message,
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'summary_card',
            title: 'Availability Updated',
            body: `Now marked ${builder.availability.availableNow ? 'available' : 'not available'}.`,
          },
        ],
      });
    }

    if (action === 'update_links') {
      const { github, linkedin, portfolio } = payload;
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyLinksUpdate(builder, { github, linkedin, portfolio });

      return ok({
        message: 'Links updated.',
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'summary_card',
            title: 'Links updated',
            body: `Your profile links have been saved.`,
          },
        ],
      });
    }

    if (action === 'update_profile_basics') {
      const { headline, bio } = payload;
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyProfileBasicsUpdate(builder, { headline, bio });

      return ok({
        message: 'Profile basics updated.',
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'summary_card',
            title: 'Profile updated',
            body: `Headline and bio saved.`,
          },
        ],
      });
    }

    if (action === 'update_work_preferences') {
      const { preferredWorkTypes, availableNow } = payload;
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const completion = await applyWorkPreferencesUpdate(builder, {
        preferredWorkTypes: Array.isArray(preferredWorkTypes) ? preferredWorkTypes.filter(Boolean) : [],
        availableNow: typeof availableNow === 'boolean' ? availableNow : undefined,
      });

      return ok({
        message: 'Work preferences updated.',
        builder,
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
        uiBlocks: [
          {
            type: 'summary_card',
            title: 'Work preferences updated',
            body: `Preferred work types: ${Array.isArray(builder.preferredWorkType) && builder.preferredWorkType.length ? builder.preferredWorkType.join(', ') : 'none'}`,
          },
          {
            type: 'profile_completion',
            title: 'Profile strength',
            score: completion.score,
            missingItems: completion.missingItems,
            eligibility: completion.eligibility,
          },
        ],
      });
    }

    if (action === 'evaluate_profile_quality') {
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
      const events = await EventRecord.find({ builderId: builder._id }).lean();
      const momentum = await MomentumUpdate.find({ builderId: builder._id }).lean();

      const quality = await evaluateBuilderProfileQuality(builder, projects, events, momentum);
      builder.profileQuality = quality;
      builder.profileQuality.evaluatedAt = new Date();
      await builder.save();

      return ok({
        message: 'Profile quality evaluated.',
        builder,
        profileQuality: quality
      });
    }

    if (action === 'suggest_intro_message') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email, founderName } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist?.unlocked) return bad('Unlock the shortlist before requesting intros.', 403);

      const [opportunity, builder, match] = await Promise.all([
        Opportunity.findOne({ _id: opportunityId, founderEmail: email }).lean(),
        BuilderProfile.findById(builderId).lean(),
        MatchRecord.findOne({ opportunityId, builderId }).lean(),
      ]);
      if (!opportunity || !builder) return bad('Candidate or search not found', 404);

      const projects = await ProjectRecord.find({ builderId })
        .select('projectName techStack builderContribution')
        .limit(3)
        .lean();
      const topProject = projects[0];
      const shortlistCandidate = (shortlist.candidates || []).find(
        (c: any) => String(c.builderId) === builderId
      );
      const topSkills =
        shortlistCandidate?.topSkills?.length > 0
          ? shortlistCandidate.topSkills
          : (topProject?.techStack || []).slice(0, 3);
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) {
        const introTeaser = await generateLockedIntroTeaser({
          builderName: builder.name,
          roleTitle: opportunity.roleTitle,
          company: opportunity.company,
          proof: shortlistCandidate?.proofSummary || shortlistCandidate?.whyTheyMatch || match?.reasoning,
          topSkills,
        });
        return ok({
          locked: true,
          code: lifecycle.denied.code,
          upgradeTarget: lifecycle.denied.upgradeTarget,
          entitlements: entitlementSnapshot(lifecycle.denied.entitlements),
          suggestedMessage: introTeaser.visibleHook,
          teaser: introTeaser,
        });
      }

      const suggestedMessage = buildSuggestedIntroMessage({
        founderName,
        builderName: builder.name,
        opportunity,
        matchReasoning: match?.reasoning,
        topSkills,
        projectHighlight: topProject?.projectName || null,
      });

      return ok({ suggestedMessage });
    }

    if (action === 'request_intro') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email, founderName } = resolved;
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const introMessage = String(payload?.introMessage || '').trim();

      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      if (!introMessage || introMessage.length < 20) {
        return bad('Please provide an intro message (at least 20 characters).');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist) return bad('Shortlist not found', 404);
      if (!shortlist.unlocked) return bad('Unlock the shortlist before requesting intros.', 403);

      const onShortlist = (shortlist.candidates || []).some(
        (c: any) => String(c.builderId) === builderId
      );
      if (!onShortlist) return bad('Candidate is not on this shortlist', 404);

      const match = await MatchRecord.findOne({ opportunityId, builderId });
      if (!match) return bad('Match not found', 404);

      const intro = await IntroRequest.findOneAndUpdate(
        { opportunityId, builderId },
        {
          $set: {
            opportunityId,
            builderId,
            matchRecordId: match._id,
            founderEmail: email,
            founderName,
            introMessage,
            status: 'requested',
          },
        },
        { upsert: true, new: true }
      );

      match.status = 'intro_requested';
      match.pipelineNextStep = 'Awaiting builder response';
      await match.save();

      const [builderDoc, opportunityDoc] = await Promise.all([
        BuilderProfile.findById(builderId).select('email name').lean(),
        Opportunity.findById(opportunityId).lean(),
      ]);

      let threadId: string | null = null;
      if (builderDoc?.email) {
        const thread = await deliverIntroRequest({
          intro,
          builderId,
          builderEmail: builderDoc.email,
          founderName: founderName || email.split('@')[0],
          founderEmail: email,
          roleTitle: opportunityDoc?.roleTitle || 'Role',
          company: opportunityDoc?.company || 'Startup',
          opportunityId,
        }).catch((err) => {
          console.error('[actionsHandler] deliver intro failed', err);
          return null;
        });
        threadId = thread ? String(thread._id) : null;
      }

      await recordUsageEvent({
        identity: lifecycle.identity,
        eventType: 'intro_requested',
        opportunityId,
        builderId,
        planAtEvent: lifecycle.entitlements.plan,
      });

      return ok({
        message: 'Intro request sent. The candidate will appear in your pipeline.',
        introRequest: {
          _id: String(intro._id),
          status: intro.status,
          introMessage: intro.introMessage,
        },
        matchStatus: match.status,
        threadId,
      });
    }

    if (action === 'update_candidate_status') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const pipelineStatus = String(payload?.status || payload?.pipelineStatus || '').trim();

      if (!opportunityId || !builderId || !pipelineStatus) {
        return bad('opportunityId, builderId, and status are required');
      }

      const matchStatus = PIPELINE_TO_MATCH_STATUS[pipelineStatus as keyof typeof PIPELINE_TO_MATCH_STATUS];
      if (!matchStatus) return bad('Invalid pipeline status');

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist?.unlocked) return bad('Unlock the shortlist first.', 403);

      const match = await MatchRecord.findOne({ opportunityId, builderId });
      if (!match) return bad('Match not found', 404);

      match.status = matchStatus;
      match.pipelineNextStep = null;
      await match.save();

      return ok({
        message: `Status updated to ${pipelineStatusLabel(pipelineStatus as any)}.`,
        matchStatus: match.status,
        pipelineStatus,
      });
    }

    if (action === 'unlock_shortlist') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);

      const opportunityId = String(payload?.opportunityId || payload?.searchId || '').trim();
      if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
        return bad('A valid opportunityId is required');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist) return bad('Shortlist not found. Run a builder search first.', 404);

      if (!shortlist.previewGeneratedAt) {
        return bad('Generate a preview search before unlocking.', 400);
      }

      shortlist.unlocked = true;
      shortlist.unlockedAt = new Date();
      await shortlist.save();

      const opportunity = await Opportunity.findById(opportunityId).lean();
      const fullCandidates = await buildFullCandidatesForShortlist(shortlist, opportunity, {
        BuilderProfile,
        ProjectRecord,
        MatchRecord,
      }, {
        entitlements: lifecycle.entitlements,
      });

      const opportunityDoc = await Opportunity.findById(opportunityId);
      if (opportunityDoc && opportunityDoc.status === 'preview') {
        opportunityDoc.status = 'shortlisted';
        await opportunityDoc.save();
      }

      const pub = toPublicShortlist(shortlist);

      return ok({
        message: 'Shortlist unlocked. You can now view full candidate profiles and request intros.',
        shortlist: { ...pub, fullCandidates },
        meta: { unlockMode: 'dev' },
      });
    }

    if (action === 'generate_trial_project') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);

      const opportunityId = String(
        payload?.opportunityId || payload?.searchId || ''
      ).trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) {
        return bad('opportunityId (or searchId) and builderId are required');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist?.unlocked) {
        return bad('Unlock the shortlist before generating a trial project.', 403);
      }

      const [opportunity, builder, match] = await Promise.all([
        Opportunity.findOne({ _id: opportunityId, founderEmail: email }).lean(),
        BuilderProfile.findById(builderId).lean(),
        MatchRecord.findOne({ opportunityId, builderId }),
      ]);
      if (!opportunity || !builder) return bad('Search or candidate not found', 404);
      if (!match) return bad('Match not found', 404);

      // RESTORE BEFORE GIT PUSH — intro call required before trial generation
      // if (!match.callCompletedAt) {
      //   return bad('Complete the intro call before generating a trial project.', 400);
      // }

      const existingStatus = match.trialProject?.status;
      if (existingStatus && !['draft', 'rejected'].includes(existingStatus)) {
        return bad('A trial has already been sent for this builder.', 400);
      }

      const projects = await ProjectRecord.find({ builderId })
        .select('projectName techStack builderContribution description')
        .limit(5)
        .lean();

      const shortlistCandidate = (shortlist.candidates || []).find(
        (c: any) => String(c.builderId) === builderId
      );
      const topSkills =
        shortlistCandidate?.topSkills?.length > 0
          ? shortlistCandidate.topSkills
          : [
              ...(builder.rolePreference || []),
              ...projects.flatMap((p: any) => p.techStack || []).slice(0, 4),
            ].slice(0, 8);

      const { trialProject, source } = await generateTrialProject({
        opportunity,
        builderName: builder.name,
        topSkills,
        projects,
        matchReasoning: match.reasoning,
      });

      match.trialProject = { ...trialProject, status: 'draft', updatedAt: new Date() };
      await match.save();

      return ok({
        message: 'Trial project draft generated.',
        trialProject,
        source,
        matchStatus: match.status,
      });
    }

    if (action === 'save_trial_project') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);

      const opportunityId = String(payload?.opportunityId || payload?.searchId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const draft = payload?.trialProject || payload?.draft;

      if (!opportunityId || !builderId) {
        return bad('opportunityId and builderId are required');
      }

      const normalized = normalizeTrialProject(draft);
      if (!normalized) {
        return bad('Invalid trial project — title, deliverables, and success criteria are required.');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist?.unlocked) return bad('Unlock the shortlist first.', 403);

      const match = await MatchRecord.findOne({ opportunityId, builderId });
      if (!match) return bad('Match not found', 404);

      match.trialProject = { ...normalized, status: match.trialProject?.status || 'draft', updatedAt: new Date() };
      await match.save();

      return ok({
        message: 'Trial project draft saved.',
        trialProject: { ...normalized, updatedAt: match.trialProject.updatedAt },
      });
    }

    if (action === 'founder_candidate_action') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const candidateAction = String(payload?.candidateAction || '').trim();

      if (!opportunityId || !builderId || !candidateAction) {
        return bad('opportunityId, builderId, and candidateAction are required');
      }

      const shortlist = await Shortlist.findOne({ opportunityId, founderEmail: email });
      if (!shortlist) return bad('Shortlist not found', 404);
      if (!shortlist.unlocked) return bad('Unlock the shortlist first.', 403);

      const match = await MatchRecord.findOne({ opportunityId, builderId });
      if (!match) return bad('Match not found', 404);

      if (candidateAction === 'request_intro') {
        return bad('Use suggest_intro_message and request_intro with an intro message.');
      }

      if (candidateAction === 'save') {
        match.status = 'approved';
        await match.save();
        return ok({ message: 'Candidate saved to your shortlist.', matchStatus: match.status, saved: true });
      }

      if (candidateAction === 'hide') {
        const hidden = new Set((shortlist.hiddenBuilderIds || []).map(String));
        hidden.add(builderId);
        shortlist.hiddenBuilderIds = Array.from(hidden);
        await shortlist.save();
        return ok({ message: 'Candidate hidden from this shortlist.', hidden: true });
      }

      return bad('Unknown candidateAction');
    }

    if (action === 'archive_opportunity') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      if (!opportunityId || !mongoose.Types.ObjectId.isValid(opportunityId)) {
        return bad('A valid opportunityId is required');
      }

      const opportunity = await Opportunity.findOne({ _id: opportunityId, founderEmail: email });
      if (!opportunity) return bad('Search not found', 404);

      opportunity.status = 'closed';
      await opportunity.save();

      return ok({ message: 'Search archived.', opportunity: opportunity.toObject() });
    }

    if (action === 'get_builder_dashboard') {
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { builder } = resolved;

      const [projects, rawMatches, events, rawMomentum, allProjectsForStats] = await Promise.all([
        ProjectRecord.find({ builderId: builder._id }).sort({ createdAt: -1 }).limit(6).lean(),
        MatchRecord.find({ builderId: builder._id }).sort({ updatedAt: -1 }).limit(6).populate('opportunityId').lean(),
        EventRecord.find({ builderId: builder._id }).sort({ date: -1 }).limit(3).lean(),
        MomentumUpdate.find({ builderId: builder._id }).sort({ date: -1 }).limit(5).lean(),
        ProjectRecord.find({ builderId: builder._id }).select('links source verificationStatus').lean(),
      ]);

      const matches = rawMatches.map((match: any) => {
        const opp = match.opportunityId || {};
        return {
          _id: match._id,
          matchScore: match.matchScore,
          status: match.status,
          reasoning: match.reasoning,
          evidence: match.evidence,
          riskFlags: match.riskFlags,
          missingProof: match.missingProof,
          company: opp.company,
          roleTitle: opp.roleTitle,
          workType: opp.workType,
          compensation: opp.budget || opp.compensation,
          timeline: opp.timeline,
          location: opp.location
        };
      });

      const momentum = rawMomentum.map((update: any) => ({
        _id: update._id,
        title: update.programName 
          ? `${update.programName} · Week ${update.week}` 
          : `Momentum Week ${update.week}`,
        content: update.weeklyUpdate,
        date: update.updatedAt || update.createdAt,
        status: update.status
      }));

      const projectStats = {
        total: allProjectsForStats.length,
        devpostImports: allProjectsForStats.filter((project: any) => Boolean(project.links?.devpost) || /devpost/i.test(project.source || '')).length,
        githubProjects: allProjectsForStats.filter((project: any) => Boolean(project.links?.github) || project.source === 'github_api').length,
        verifiedContributions: allProjectsForStats.filter((project: any) => ['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified'].includes(project.verificationStatus)).length,
      };

      const completion = computeBuilderScores(builder, allProjectsForStats);
      if (builder.profileCompletion?.score !== completion.score) {
        builder.profileCompletion = completion;
        await builder.save();
      }

      let profileQuality = builder.profileQuality;
      if (!profileQuality || !profileQuality.label || profileQuality.label === 'Needs Work' && !profileQuality.evaluatedAt) {
        profileQuality = evaluateDeterministicQuality(builder, allProjectsForStats);
        builder.profileQuality = profileQuality;
        builder.profileQuality.evaluatedAt = new Date();
        await builder.save();
      }

      return ok({
        message: 'Builder dashboard data loaded.',
        builder,
        completion,
        projects,
        matches,
        events,
        momentum,
        projectStats,
        introInbox: await getBuilderIntroInbox(String(builder._id)),
        activeTrials: await getBuilderActiveTrials(String(builder._id)),
        upcomingCalls: await getBuilderUpcomingCalls(String(builder._id)),
        notifications: await getNotificationsForBuilder(String(builder._id)),
        unreadNotificationCount: await countUnreadForBuilder(String(builder._id)),
        meta: { model: hasOpenRouterConfig() ? getOpenRouterChatModel() : 'deterministic-fallback' },
      });
    }

    if (action === 'get_notifications') {
      const founderResolved = await resolveAuthedFounder(request, runtime);
      if (!('error' in founderResolved)) {
        const notifications = await getNotificationsForFounder(founderResolved.email);
        const unreadCount = await countUnreadForFounder(founderResolved.email);
        return ok({ notifications, unreadCount, recipientType: 'founder' });
      }
      const builderResolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in builderResolved) return bad('Please log in to continue.', 401);
      const notifications = await getNotificationsForBuilder(String(builderResolved.builder._id));
      const unreadCount = await countUnreadForBuilder(String(builderResolved.builder._id));
      return ok({ notifications, unreadCount, recipientType: 'builder' });
    }

    if (action === 'mark_notification_read') {
      const notificationId = String(payload?.notificationId || '').trim();
      const markAll = payload?.all === true;
      const founderResolved = await resolveAuthedFounder(request, runtime);
      if (!('error' in founderResolved)) {
        if (markAll) {
          await markAllNotificationsRead({ type: 'founder', email: founderResolved.email });
          return ok({ message: 'All notifications marked read.' });
        }
        if (!notificationId) return bad('notificationId is required');
        const updated = await markNotificationRead(notificationId, {
          type: 'founder',
          email: founderResolved.email,
        });
        if (!updated) return bad('Notification not found', 404);
        return ok({ notification: updated });
      }
      const builderResolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in builderResolved) return bad('Please log in to continue.', 401);
      if (markAll) {
        await markAllNotificationsRead({
          type: 'builder',
          builderId: String(builderResolved.builder._id),
        });
        return ok({ message: 'All notifications marked read.' });
      }
      if (!notificationId) return bad('notificationId is required');
      const updated = await markNotificationRead(notificationId, {
        type: 'builder',
        builderId: String(builderResolved.builder._id),
      });
      if (!updated) return bad('Notification not found', 404);
      return ok({ notification: updated });
    }

    if (action === 'get_builder_intro_inbox') {
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const introInbox = await getBuilderIntroInbox(String(resolved.builder._id));
      return ok({ introInbox });
    }

    if (action === 'respond_intro') {
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const introRequestId = String(payload?.introRequestId || '').trim();
      const response = String(payload?.response || '').trim() as 'view' | 'accept' | 'decline';
      if (!introRequestId || !['view', 'accept', 'decline'].includes(response)) {
        return bad('introRequestId and response (view|accept|decline) are required');
      }
      const result = await respondToIntro({
        introRequestId,
        builderId: String(resolved.builder._id),
        response,
        note: payload?.note,
        declineReason: payload?.declineReason,
      });
      if ('error' in result && result.error) {
        return bad(result.error, result.status || 400);
      }
      return ok({
        message:
          response === 'accept'
            ? 'Intro accepted.'
            : response === 'decline'
              ? 'Intro declined.'
              : 'Intro marked as viewed.',
        introRequest: result.intro
          ? {
              _id: String(result.intro._id),
              status: result.intro.status,
              viewedAt: result.intro.viewedAt,
              respondedAt: result.intro.respondedAt,
            }
          : null,
        matchStatus: result.match?.status || null,
      });
    }

    if (action === 'schedule_call') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const slot = payload?.slot || payload?.proposedSlot;
      if (!opportunityId || !builderId || !slot) {
        return bad('opportunityId, builderId, and slot are required');
      }
      const result = await scheduleCallByFounder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        slot,
        meetingUrl: payload?.meetingUrl,
        notes: payload?.notes,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Call proposed to builder.',
        callSchedule: result.schedule,
        matchStatus: result.match?.status || null,
      });
    }

    if (action === 'respond_call_schedule') {
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const callScheduleId = String(payload?.callScheduleId || '').trim();
      const scheduleAction = String(payload?.scheduleAction || payload?.action || '').trim();
      if (!callScheduleId || !['accept', 'counter'].includes(scheduleAction)) {
        return bad('callScheduleId and scheduleAction (accept|counter) are required');
      }
      const result = await respondCallScheduleByBuilder({
        callScheduleId,
        builderId: String(resolved.builder._id),
        action: scheduleAction as 'accept' | 'counter',
        slot: payload?.slot,
        notes: payload?.notes,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: scheduleAction === 'accept' ? 'Call confirmed.' : 'Counter-proposal sent.',
        callSchedule: result.schedule,
      });
    }

    if (action === 'confirm_call_schedule') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);
      const callScheduleId = String(payload?.callScheduleId || '').trim();
      if (!callScheduleId) return bad('callScheduleId is required');
      const result = await confirmCallScheduleByFounder({
        callScheduleId,
        founderEmail: resolved.email,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({ message: 'Call confirmed.', callSchedule: result.schedule });
    }

    if (action === 'complete_call') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      const result = await completeCallByFounder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Call marked complete. You can hire or start a trial.',
        callSchedule: result.schedule,
        callCompletedAt: result.match?.callCompletedAt || null,
      });
    }

    if (action === 'get_call_schedule') {
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      const founderResolved = await resolveAuthedFounder(request, runtime);
      if (!('error' in founderResolved)) {
        const opp = await Opportunity.findOne({
          _id: opportunityId,
          founderEmail: founderResolved.email,
        }).lean();
        if (!opp) return bad('Not authorized', 403);
      } else {
        const builderResolved = await resolveAuthedBuilder(request, runtime);
        if ('error' in builderResolved) return bad('Please log in to continue.', 401);
        if (String(builderResolved.builder._id) !== builderId) return bad('Not authorized', 403);
      }
      const callSchedule = await getCallScheduleForMatch(opportunityId, builderId);
      return ok({ callSchedule });
    }

    if (action === 'send_trial_project') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const deadlineDate = String(payload?.deadlineDate || payload?.deadline || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      if (!deadlineDate) return bad('deadlineDate is required (YYYY-MM-DD)');
      const deadlineAt = new Date(deadlineDate);
      if (Number.isNaN(deadlineAt.getTime())) return bad('Invalid deadlineDate');
      deadlineAt.setHours(12, 0, 0, 0);
      const result = await sendTrialProjectToBuilder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        deadlineAt,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Trial project sent to builder.',
        trialProject: result.trialProject,
        matchStatus: result.matchStatus,
      });
    }

    if (action === 'submit_trial') {
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(resolved.builder._id);
      const videoUrl = String(payload?.videoUrl || payload?.demoUrl || '').trim();
      const githubUrl = String(payload?.githubUrl || '').trim();
      if (!opportunityId) return bad('opportunityId is required');
      const result = await submitTrialByBuilder({
        opportunityId,
        builderId,
        videoUrl,
        githubUrl,
        notes: payload?.notes,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: 'Trial submitted for founder review.',
        trialProject: result.trialProject,
        matchStatus: result.matchStatus,
      });
    }

    if (action === 'review_trial_submission') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const decision = String(payload?.decision || '').trim() as 'approve' | 'reject';
      if (!opportunityId || !builderId || !['approve', 'reject'].includes(decision)) {
        return bad('opportunityId, builderId, and decision (approve|reject) are required');
      }
      const result = await reviewTrialSubmission({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        decision,
        note: payload?.note,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({
        message: decision === 'approve' ? 'Trial approved.' : 'Trial rejected with feedback.',
        trialProject: result.trialProject,
        matchStatus: result.matchStatus,
      });
    }

    if (action === 'hire_builder') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      const result = await hireBuilder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        note: payload?.note,
        skipTrial: payload?.skipTrial === true,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      await recordUsageEvent({
        identity: lifecycle.identity,
        eventType: 'hire_marked',
        opportunityId,
        builderId,
        planAtEvent: lifecycle.entitlements.plan,
      });
      await HiringLedger.findOneAndUpdate(
        { opportunityId, builderId },
        {
          $setOnInsert: {
            founderId: lifecycle.identity.founderId,
            founderEmail: lifecycle.identity.email,
            opportunityId,
            builderId,
            planAtHire: lifecycle.entitlements.plan,
            depositAmountCents: 49900,
          },
          $set: {
            hireStatus: 'hired',
            hiredAt: new Date(),
            depositStatus: lifecycle.entitlements.plan === 'custom' ? 'credited' : 'not_required',
          },
        },
        { upsert: true, new: true }
      );
      return ok({
        message: 'Builder hired.',
        matchStatus: result.matchStatus,
        opportunityStatus: result.opportunityStatus,
      });
    }

    if (action === 'reject_builder') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const lifecycle = await requireLifecycleAccess(resolved);
      if (!lifecycle.ok) return billingBad(lifecycle.denied);
      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');
      const result = await rejectBuilder({
        opportunityId,
        builderId,
        founderEmail: resolved.email,
        note: payload?.note,
      });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok({ message: 'Candidate closed.', matchStatus: result.matchStatus });
    }

    if (action === 'get_founder_threads') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const [threads, unreadCount] = await Promise.all([
        getFounderThreads(resolved.email),
        countUnreadFounderMessages(resolved.email),
      ]);
      return ok({ threads, unreadCount });
    }

    if (action === 'get_builder_threads') {
      const resolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const threads = await getBuilderThreads(String(resolved.builder._id));
      return ok({ threads });
    }

    if (action === 'get_thread_messages') {
      const threadId = String(payload?.threadId || '').trim();
      if (!threadId) return bad('threadId is required');

      const founderResolved = await resolveAuthedFounder(request, runtime);
      if (!('error' in founderResolved)) {
        const result = await getThreadMessages(threadId, { type: 'founder', email: founderResolved.email });
        if ('error' in result && result.error) return bad(result.error, result.status || 400);
        return ok(result);
      }

      const builderResolved = await resolveAuthedBuilder(request, runtime);
      if ('error' in builderResolved) return bad('Please log in to continue.', 401);
      const result = await getThreadMessages(threadId, { type: 'builder', builderId: String(builderResolved.builder._id) });
      if ('error' in result && result.error) return bad(result.error, result.status || 400);
      return ok(result);
    }

    if (action === 'send_message') {
      return bad('In-app messaging is disabled. Reply in Gmail to continue the conversation.', 410);
    }

    // ── Phase 8: Candidate Feedback ──────────────────────────────────────────

    if (action === 'founder_save_candidate' || action === 'founder_reject_candidate') {
      const resolved = await resolveAuthedFounder(request, runtime);
      if ('error' in resolved) return bad(resolved.error || 'Please log in to continue.', 401);
      const { email, decoded } = resolved;

      const opportunityId = String(payload?.opportunityId || '').trim();
      const builderId = String(payload?.builderId || '').trim();
      const builderName = String(payload?.builderName || '').trim();
      const reasonCategory = String(payload?.reasonCategory || 'other').trim();
      const reasonText = String(payload?.reasonText || payload?.reason || '').trim();

      if (!opportunityId || !builderId) return bad('opportunityId and builderId are required');

      const founderId = decoded?.userId ? String(decoded.userId) : email;
      const feedbackAction = action === 'founder_save_candidate' ? 'saved' : 'rejected';

      await CandidateFeedback.findOneAndUpdate(
        { founderId, opportunityId, builderId, action: feedbackAction },
        {
          $set: {
            founderId,
            founderEmail: email,
            opportunityId,
            builderId,
            builderName,
            action: feedbackAction,
            reasonCategory,
            reasonText,
            shouldAffectRanking: true,
          },
        },
        { upsert: true }
      );


      // Update match record status
      const matchRecord = await MatchRecord.findOne({ builderId, opportunityId });
      if (matchRecord) {
        if (feedbackAction === 'rejected') {
          matchRecord.status = 'rejected';
        } else {
          matchRecord.status = 'saved';
        }
        await matchRecord.save();
      }

      return ok({
        message: feedbackAction === 'rejected' ? 'Candidate rejected.' : 'Candidate saved.',
        feedbackAction,
        builderId,
        opportunityId,
      });
    }

    return bad(`Unsupported action: ${action}`);
  } catch (error) {
    return bad(error instanceof Error ? error.message : 'Action failed', 500);
  }
};
