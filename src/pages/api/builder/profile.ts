import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';

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

export const GET: APIRoute = async ({ request, locals, url }) => {
  await connectAdminDB();

  const id = url.searchParams.get('id');
  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return json({ success: false, error: 'Invalid builder id.' }, 400);
    const profile = await BuilderProfile.findById(id).lean() as any;
    const projects = profile ? await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean() : [];
    return json({ success: Boolean(profile), profile: serializeProfile(profile, projects) });
  }

  const { user } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

  const profile = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: user.email }],
  }).lean() as any;
  const projects = profile ? await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean() : [];

  return json({
    success: true,
    basics: {
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl || null,
    },
    profile: serializeProfile(profile, projects),
  });
};

export const prerender = false;
