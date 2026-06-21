import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
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

export const PUT: APIRoute = async ({ request, locals }) => {
  const { user, runtime } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

  const body = await request.json().catch(() => ({}));
  await connectAdminDB();

  const existing = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: user.email }],
  });

  const links = body.links && typeof body.links === 'object' ? body.links : {};
  const experiences = Array.isArray(body.experiences)
    ? body.experiences.map((exp: any, index: number) => ({
        title: str(exp.title) || 'Builder',
        company: str(exp.company) || str(body.universityOrCompany) || 'Independent',
        dateRange: str(exp.dateRange),
        description: str(exp.description),
        skills: list(exp.skills),
        source: exp.source || 'manual',
        sourceId: exp.sourceId || `manual-${index}-${Date.now()}`,
      }))
    : existing?.experiences || [];

  const profile = await BuilderProfile.findOneAndUpdate(
    { _id: existing?._id || new mongoose.Types.ObjectId() },
    {
      $set: {
        userId: user._id,
        name: str(body.name) || user.name,
        email: user.email,
        headline: str(body.headline),
        bio: str(body.bio),
        location: str(body.location),
        universityOrCompany: str(body.universityOrCompany),
        rolePreference: list(body.rolePreference),
        preferredWorkType: list(body.preferredWorkType),
        experiences,
        links: {
          linkedin: str((links as any).linkedin),
          github: str((links as any).github),
          portfolio: str((links as any).portfolio),
          personalWebsite: str((links as any).personalWebsite),
          devpost: str((links as any).devpost),
          resume: str((links as any).resume),
        },
        availability: {
          availableNow: Boolean(body.availability?.availableNow),
          hoursPerWeek: Number(body.availability?.hoursPerWeek) || null,
          desiredCompensation: str(body.availability?.desiredCompensation),
          remotePreference: str(body.availability?.remotePreference) || 'unspecified',
          refreshedAt: new Date(),
        },
        verificationStatus: existing?.verificationStatus || 'builder_confirmed',
        visibilityStatus: existing?.visibilityStatus || 'matched_only',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (Array.isArray(body.projects)) {
    const keptProjectIds: any[] = [];

    for (const [index, project] of body.projects.entries()) {
      const projectName = str(project.projectName);
      if (!projectName) continue;

      const existingProjectId =
        str(project.id) && mongoose.Types.ObjectId.isValid(str(project.id)!)
          ? new mongoose.Types.ObjectId(str(project.id)!)
          : null;
      const source = str(project.source) || 'manual';
      const sourceId = str(project.sourceId) || `manual-${index}`;
      const query = existingProjectId
        ? { _id: existingProjectId, builderId: profile._id }
        : { builderId: profile._id, source, sourceId };

      const saved = await ProjectRecord.findOneAndUpdate(
        query,
        {
          $set: {
            builderId: profile._id,
            projectName,
            description: str(project.description),
            problemSolved: str(project.problemSolved),
            builderContribution: str(project.builderContribution),
            techStack: list(project.techStack),
            links: project.links || {},
            source,
            sourceId,
            verificationStatus: 'builder_confirmed',
          },
        },
        { upsert: true, new: true }
      );
      if (saved?._id) keptProjectIds.push(saved._id);
    }

    await ProjectRecord.deleteMany({
      builderId: profile._id,
      _id: { $nin: keptProjectIds },
    });
  }

  await updateUserAccount(String(user._id), {
    role: 'builder',
    accountType: 'builder',
    onboardingStatus: 'refine',
    name: profile.name,
  }, runtime);

  const projects = await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean();
  return json({ success: true, profile: serializeProfile(profile.toObject(), projects), next: '/builder/home' });
};

export const prerender = false;
