import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import ProjectRecord from '@/models/talent/ProjectRecord';
import { buildAgentWrappedCommand, generateAgentWrappedUploadToken } from '@/lib/agentWrapped/uploadToken';

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

function serializeProfile(profile: any, projects: any[] = []) {
  if (!profile) return null;
  return {
    id: String(profile._id),
    name: profile.name,
    email: profile.email || null,
    avatarUrl: profile.avatarUrl || null,
    headline: profile.headline || null,
    bio: profile.bio || null,
    location: profile.location || null,
    universityOrCompany: profile.universityOrCompany || null,
    education: profile.education || [],
    experiences: profile.experiences || [],
    rolePreference: profile.rolePreference || [],
    preferredWorkType: profile.preferredWorkType || [],
    links: profile.links || {},
    availability: profile.availability || {},
    verificationStatus: profile.verificationStatus || 'imported_unverified',
    visibilityStatus: profile.visibilityStatus || 'matched_only',
    projects: projects.map((project) => ({
      id: String(project._id),
      projectName: project.projectName,
      description: project.description || null,
      problemSolved: project.problemSolved || null,
      builderContribution: project.builderContribution || null,
      techStack: project.techStack || [],
      links: project.links || {},
      source: project.source || 'manual',
      sourceId: project.sourceId || null,
      verificationStatus: project.verificationStatus,
    })),
  };
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

export const GET: APIRoute = async ({ request, locals, url }) => {
  await connectAdminDB();

  const id = url.searchParams.get('id');
  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return json({ success: false, error: 'Invalid builder id.' }, 400);
    const profile = await BuilderProfile.findById(id).lean() as any;
    const projects = profile ? await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean() : [];
    return json({ success: Boolean(profile), profile: serializeProfile(profile, projects) });
  }

  const { user, runtime } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

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
  const phoneVerificationPending = !phoneVerified && claim?.status === 'phone_pending' && Boolean(claim?.phone);
  const uploadToken =
    wrappedBuilderId && phoneVerified
      ? generateAgentWrappedUploadToken({ builderId: wrappedBuilderId, email: wrappedEmail }, runtime)
      : null;

  return json({
    success: true,
    basics: {
      name: user.name,
      email: userEmail,
      avatarUrl: user.avatarUrl || null,
    },
    phone: profile?.phone || claim?.phone || user.phone || null,
    phoneVerified,
    phoneVerificationPending,
    agentWrapped: uploadToken
      ? {
          builderId: wrappedBuilderId,
          uploadToken,
          command: buildAgentWrappedCommand(uploadToken, runtime),
          publicUrl: `/builder/wrapped/${wrappedBuilderId}`,
          messageDelivery: claimMessageDelivery(claim),
        }
      : null,
    profile: serializeProfile(profile, projects),
  });
};

export const prerender = false;
