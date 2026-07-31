import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { isBuilderImessageEnabled } from '@/lib/featureFlags';
import BuilderProfile from '@/models/talent/BuilderProfile';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import ProjectRecord from '@/models/talent/ProjectRecord';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import { buildAgentWrappedCommand, generateAgentWrappedUploadToken } from '@/lib/agentWrapped/uploadToken';
import { serializeBuilderProfile } from '@/lib/talent/serializeBuilderProfile';
import { uploadBuilderAvatarToCloudinary, uploadResumeToCloudinary } from '@/lib/cloudinary';
import { parseAndExtractResume } from '@/lib/talent/resumeParser';
import { refreshBuilderScores } from '@/lib/talent/builderEnrichment/apply';
import { upsertTalentSearchIndexForBuilder } from '@/lib/talent/searchIndex';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function resolveUser(request: Request, locals: App.Locals) {
  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!token) return { user: null, runtime };
  const decoded = verifyToken(token, runtime);
  if (!decoded) return { user: null, runtime };
  return { user: await findUserById(decoded.userId, runtime), runtime };
}

function claimMessageDelivery(claim: any) {
  if (!claim?.phoneVerifiedAt) return null;
  const outboundSent = (claim.messages || []).some(
    (message: any) => message.direction === 'outbound' && message.providerMessageId
  );
  if (claim.status === 'conversation_started' || claim.status === 'completed' || outboundSent) {
    return { status: 'sent' as const };
  }
  if ((claim.conversationFailures || []).length > 0) {
    return {
      status: 'delivery_failed' as const,
      error: 'The previous iMessage send attempt failed. You can retry it here.',
    };
  }
  return null;
}

function cleanString(value: unknown, max = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function normalizeUrl(value: unknown) {
  const raw = cleanString(value, 500);
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeExperience(raw: any, index: number) {
  const title = cleanString(raw?.title, 160);
  const company = cleanString(raw?.company, 160);
  if (!title && !company) return null;
  const sourceId = cleanString(raw?.sourceId, 240) || `builder-form:${index}:${title || 'role'}:${company || 'company'}`;
  return {
    title: title || 'Builder',
    company: company || 'Independent',
    companyLogoUrl: normalizeUrl(raw?.companyLogoUrl),
    companyLinkedInUrl: normalizeUrl(raw?.companyLinkedInUrl),
    dateRange: cleanString(raw?.dateRange, 120),
    description: cleanString(raw?.description, 2000),
    employmentType: cleanString(raw?.employmentType, 80),
    location: cleanString(raw?.location, 120),
    skills: Array.isArray(raw?.skills) ? raw.skills.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 12) : [],
    isCurrent: Boolean(raw?.isCurrent),
    source: cleanString(raw?.source, 80) || 'builder_form',
    sourceId,
    importedAt: raw?.importedAt || new Date(),
  };
}

async function bestEffortEnrichment(
  builderId: string,
  builderEmail: string,
  sources: Array<'resume' | 'github' | 'devpost' | 'linkedin' | 'portfolio'>,
  runtime?: ReturnType<typeof runtimeEnvFromLocals>,
  options?: { research?: boolean }
) {
  const uniqueSources = [...new Set(sources)];
  if (!uniqueSources.length) return null;
  try {
    await import('@/lib/workerPolyfills');
    const { runEnrichmentPipeline } = await import('@/lib/talent/builderEnrichment/orchestrator');
    return await runEnrichmentPipeline({
      builderId,
      memRef: { builderId, builderEmail },
      sources: uniqueSources,
      research: options?.research ?? false,
      runtime,
      deferExperiences: false,
    });
  } catch (error) {
    console.error('[builder/profile] enrichment failed', { builderId, error });
    return { error: error instanceof Error ? error.message : 'enrichment_failed' };
  }
}

type ProfileEnrichmentSource = 'resume' | 'github' | 'devpost' | 'linkedin' | 'portfolio';

function readNormalizedProofLinks(links: Record<string, unknown> | null | undefined) {
  const raw = links || {};
  return {
    linkedin: normalizeUrl(raw.linkedin),
    github: normalizeUrl(raw.github),
    devpost: normalizeUrl(raw.devpost),
    portfolio: normalizeUrl(raw.portfolio ?? raw.personalWebsite),
  };
}

function enrichmentSourcesForSave(params: {
  previousLinks: ReturnType<typeof readNormalizedProofLinks>;
  nextLinks: ReturnType<typeof readNormalizedProofLinks>;
  resumeUploaded: boolean;
  isInitialProfile: boolean;
}): ProfileEnrichmentSource[] {
  if (params.isInitialProfile) {
    const sources: ProfileEnrichmentSource[] = [];
    if (params.nextLinks.linkedin) sources.push('linkedin');
    if (params.nextLinks.github) sources.push('github');
    if (params.nextLinks.devpost) sources.push('devpost');
    if (params.nextLinks.portfolio) sources.push('portfolio');
    if (params.resumeUploaded) sources.push('resume');
    return sources;
  }

  const sources: ProfileEnrichmentSource[] = [];
  if (params.resumeUploaded) sources.push('resume');
  if (params.nextLinks.linkedin && params.nextLinks.linkedin !== params.previousLinks.linkedin) sources.push('linkedin');
  if (params.nextLinks.github && params.nextLinks.github !== params.previousLinks.github) sources.push('github');
  if (params.nextLinks.devpost && params.nextLinks.devpost !== params.previousLinks.devpost) sources.push('devpost');
  if (params.nextLinks.portfolio && params.nextLinks.portfolio !== params.previousLinks.portfolio) sources.push('portfolio');
  return [...new Set(sources)];
}

export const GET: APIRoute = async ({ request, locals, url }) => {
  await connectAdminDB();

  const id = url.searchParams.get('id');
  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return json({ success: false, error: 'Invalid builder id.' }, 400);
    const { user } = await resolveUser(request, locals);
    if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);
    const role = String(user.role || '');
    if (role !== 'founder' && role !== 'admin') {
      return json({ success: false, error: 'You do not have access to this profile.' }, 403);
    }
    const profile = await BuilderProfile.findById(id).lean() as any;
    const projects = profile ? await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean() : [];
    return json({ success: Boolean(profile), profile: serializeBuilderProfile(profile, projects) });
  }

  const { user, runtime } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);
  if (String(user.role || '') !== 'builder' && String(user.role || '') !== 'admin') {
    return json({ success: false, error: 'Builder account required.' }, 403);
  }

  const userEmail = String(user.email || '').toLowerCase().trim();
  const profile = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: userEmail }],
  }).lean() as any;
  const projects = profile ? await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean() : [];
  const claim = await BuilderProfileClaim.findOne({
    builderEmail: userEmail,
    status: { $ne: 'expired' },
  }).sort({ updatedAt: -1 }).lean() as any;
  const wrappedBuilderId = profile?._id ? String(profile._id) : claim?.builderId ? String(claim.builderId) : null;
  const wrappedEmail = String(profile?.email || claim?.builderEmail || userEmail).toLowerCase().trim();
  const phoneVerified = Boolean(profile?.phoneVerifiedAt || claim?.phoneVerifiedAt);
  const imessageEnabled = isBuilderImessageEnabled(runtime);
  const builderVerified = imessageEnabled ? phoneVerified : true;
  const phoneVerificationPending = !phoneVerified && claim?.status === 'phone_pending' && Boolean(claim?.phone);
  const uploadToken =
    wrappedBuilderId && builderVerified
      ? generateAgentWrappedUploadToken({ builderId: wrappedBuilderId, email: wrappedEmail }, runtime)
      : null;
  const uploadedWrapped = wrappedBuilderId
    ? ((await AgentWrappedReportModel.findOne({ builderId: wrappedBuilderId, source: 'uploaded_agent_usage' })
        .sort({ createdAt: -1 })
        .select('reportId report.archetype report.score report.sourceCoverage')
        .lean()) as any)
    : null;

  return json({
    success: true,
    basics: {
      name: user.name,
      email: userEmail,
      avatarUrl: user.avatarUrl || null,
    },
    phone: profile?.phone || claim?.phone || user.phone || null,
    phoneVerified: builderVerified,
    imessageEnabled,
    imessagePhoneVerified: phoneVerified,
    phoneVerificationPending,
    agentWrapped: uploadToken
      ? {
          builderId: wrappedBuilderId,
          uploadToken,
          command: buildAgentWrappedCommand(uploadToken, runtime),
          publicUrl: uploadedWrapped ? `/builder/wrapped/${wrappedBuilderId}` : null,
          messageDelivery: claimMessageDelivery(claim),
          uploaded: Boolean(uploadedWrapped),
          reportId: uploadedWrapped?.reportId || null,
          archetype: uploadedWrapped?.report?.archetype || null,
          score: typeof uploadedWrapped?.report?.score === 'number' ? uploadedWrapped.report.score : null,
          agents: uploadedWrapped?.report?.sourceCoverage?.agents || [],
        }
      : null,
    profile: serializeBuilderProfile(profile, projects),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  await connectAdminDB();

  const { user } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

  const userEmail = String(user.email || '').toLowerCase().trim();
  if (!userEmail) return json({ success: false, error: 'Missing account email.' }, 400);

  const contentType = request.headers.get('content-type') || '';
  let body: Record<string, any> = {};
  let resumeFile: File | null = null;
  let avatarFile: File | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (key === 'resume' && value instanceof File && value.size > 0) resumeFile = value;
      else if (key === 'avatar' && value instanceof File && value.size > 0) avatarFile = value;
      else if (typeof value === 'string') body[key] = value;
    }
  } else {
    body = (await request.json().catch(() => ({}))) as Record<string, any>;
  }

  let profile = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: userEmail }],
  });
  const existingProfile = Boolean(profile);

  if (!existingProfile) {
    const missing: string[] = [];
    if (!normalizeUrl(body.linkedin ?? body.linkedIn)) missing.push('LinkedIn');
    if (!normalizeUrl(body.github)) missing.push('GitHub');
    if (!normalizeUrl(body.devpost)) missing.push('Devpost');
    if (!normalizeUrl(body.portfolio ?? body.personalWebsite)) missing.push('portfolio website');
    if (!resumeFile) missing.push('resume PDF');
    if (missing.length) {
      return json({ success: false, error: `Required fields missing: ${missing.join(', ')}.` }, 400);
    }
  }

  if (!profile) {
    profile = await BuilderProfile.create({
      userId: user._id,
      name: user.name || userEmail.split('@')[0],
      email: userEmail,
      verificationStatus: 'builder_confirmed',
      visibilityStatus: body.active === false || body.active === 'false' ? 'hidden' : 'public',
      availability: { availableNow: body.active !== false && body.active !== 'false', refreshedAt: new Date() },
    });
  }

  profile.userId = user._id;
  profile.email = profile.email || userEmail;
  profile.name = cleanString(body.name, 160) || profile.name || user.name || userEmail.split('@')[0];
  if (cleanString(body.headline, 160)) profile.headline = cleanString(body.headline, 160);
  if (cleanString(body.bio, 2000)) profile.bio = cleanString(body.bio, 2000);
  if (cleanString(body.location, 160)) profile.location = cleanString(body.location, 160);
  const avatarUrl = normalizeUrl(body.avatarUrl);
  if (avatarUrl) {
    profile.avatarUrl = avatarUrl;
    await updateUserAccount(String(user._id), { avatarUrl }, runtimeEnvFromLocals(locals)).catch((error) =>
      console.error('[builder/profile] user avatar URL sync failed', error)
    );
  }
  let rawSkills = body.skills;
  if (typeof body.skills === 'string') {
    try {
      rawSkills = JSON.parse(body.skills || '[]');
    } catch {
      rawSkills = body.skills.split(',');
    }
  }
  if (Array.isArray(rawSkills)) {
    const skills = rawSkills.map(String).map((skill) => skill.trim()).filter(Boolean).slice(0, 30);
    if (skills.length) profile.skills = skills;
  }

  profile.links = profile.links || {};
  const previousProofLinks = readNormalizedProofLinks(profile.links);
  const linkUpdates: Record<string, string | null> = {
    linkedin: normalizeUrl(body.linkedin ?? body.linkedIn),
    github: normalizeUrl(body.github),
    devpost: normalizeUrl(body.devpost),
    portfolio: normalizeUrl(body.portfolio ?? body.personalWebsite),
  };
  for (const [key, value] of Object.entries(linkUpdates)) {
    if (value) profile.links[key] = value;
  }

  const visaStatus = cleanString(body.visaStatus ?? body.workAuthorization, 500);
  if (visaStatus) profile.workAuthorization = visaStatus;

  const active =
    typeof body.active === 'boolean'
      ? body.active
      : typeof body.active === 'string'
        ? body.active !== 'false'
        : profile.visibilityStatus !== 'hidden';
  profile.visibilityStatus = active ? 'public' : 'hidden';
  profile.availability = {
    ...(profile.availability || {}),
    availableNow: active,
    refreshedAt: new Date(),
  };
  profile.hiringIntent = {
    ...(profile.hiringIntent || {}),
    optedIn: active,
    projectSprint: active,
  };
  profile.verificationStatus = profile.verificationStatus === 'imported_unverified' ? 'builder_confirmed' : profile.verificationStatus;

  let rawExperiences = body.experiences;
  if (typeof body.experiences === 'string') {
    try {
      rawExperiences = JSON.parse(body.experiences || '[]');
    } catch {
      rawExperiences = [];
    }
  }
  if (Array.isArray(rawExperiences)) {
    const experiences = rawExperiences
      .map((experience: any, index: number) => normalizeExperience(experience, index))
      .filter(Boolean);
    if (experiences.length) profile.experiences = experiences;
  }

  const nextProofLinks = readNormalizedProofLinks(profile.links);
  let enrichmentSources = enrichmentSourcesForSave({
    previousLinks: previousProofLinks,
    nextLinks: nextProofLinks,
    resumeUploaded: false,
    isInitialProfile: !existingProfile,
  });

  if (resumeFile) {
    if (resumeFile.type !== 'application/pdf') {
      return json({ success: false, error: 'Resume upload must be a PDF.' }, 400);
    }
    if (resumeFile.size > 10 * 1024 * 1024) {
      return json({ success: false, error: 'Resume upload must be under 10MB.' }, 400);
    }
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    try {
      const resumeUrl = await uploadResumeToCloudinary(buffer, `${profile._id}-${Date.now()}`);
      profile.links.resume = resumeUrl;
      if (!enrichmentSources.includes('resume')) enrichmentSources.push('resume');
      await profile.save();
      await parseAndExtractResume(buffer, String(profile._id));
    } catch (error) {
      console.error('[builder/profile] resume upload failed', error);
      return json({ success: false, error: 'Could not upload or parse resume.' }, 500);
    }
  }

  if (avatarFile) {
    if (!avatarFile.type.startsWith('image/')) {
      return json({ success: false, error: 'Profile picture must be an image.' }, 400);
    }
    if (avatarFile.size > 5 * 1024 * 1024) {
      return json({ success: false, error: 'Profile picture must be under 5MB.' }, 400);
    }
    const buffer = Buffer.from(await avatarFile.arrayBuffer());
    try {
      const uploadedAvatarUrl = await uploadBuilderAvatarToCloudinary(buffer, `${profile._id}-${Date.now()}`);
      profile.avatarUrl = uploadedAvatarUrl;
      await updateUserAccount(String(user._id), { avatarUrl: uploadedAvatarUrl }, runtimeEnvFromLocals(locals)).catch((error) =>
        console.error('[builder/profile] user avatar upload sync failed', error)
      );
    } catch (error) {
      console.error('[builder/profile] avatar upload failed', error);
      return json({ success: false, error: 'Could not upload profile picture.' }, 500);
    }
  }

  await profile.save();
  const enrichment = enrichmentSources.length
    ? await bestEffortEnrichment(
        String(profile._id),
        userEmail,
        enrichmentSources,
        runtimeEnvFromLocals(locals),
        { research: !existingProfile }
      )
    : null;
  await refreshBuilderScores(profile._id, { skipEmbeddings: true }).catch((error) =>
    console.error('[builder/profile] score refresh failed', error)
  );
  await upsertTalentSearchIndexForBuilder(profile._id).catch((error) =>
    console.error('[builder/profile] search index refresh failed', error)
  );

  const refreshed = await BuilderProfile.findById(profile._id).lean() as any;
  const projects = refreshed ? await ProjectRecord.find({ builderId: refreshed._id }).sort({ updatedAt: -1 }).limit(20).lean() : [];
  return json({
    success: true,
    profile: serializeBuilderProfile(refreshed, projects),
    enrichment,
  });
};

export const prerender = false;
