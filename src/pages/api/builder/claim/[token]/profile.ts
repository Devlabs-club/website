import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { findClaimByViewToken } from '@/lib/builderClaim';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Resolve a builder's PRIVATE profile-view token (sent only over their verified
 * iMessage) into the same profile shape the dashboard renders. Token-gated, so
 * only that builder can open their own page.
 */
export const GET: APIRoute = async ({ params }) => {
  const token = String(params.token || '');
  if (!token) return json({ success: false, error: 'Missing token.' }, 400);

  await connectAdminDB();
  const claim = await findClaimByViewToken(token);
  if (!claim || !claim.builderId) return json({ success: false, error: 'Profile not found.' }, 404);

  const profile = (await BuilderProfile.findById(claim.builderId).lean()) as any;
  if (!profile) return json({ success: false, error: 'Profile not found.' }, 404);

  const projects = await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean();

  return json({
    success: true,
    profile: {
      id: String(profile._id),
      name: profile.name,
      email: profile.email || null,
      avatarUrl: profile.avatarUrl || null,
      headline: profile.headline || null,
      bio: profile.bio || null,
      location: profile.location || null,
      universityOrCompany: profile.universityOrCompany || null,
      rolePreference: profile.rolePreference || [],
      preferredWorkType: profile.preferredWorkType || [],
      experiences: profile.experiences || [],
      links: profile.links || {},
      verificationStatus: profile.verificationStatus || 'imported_unverified',
      projects: projects.map((project: any) => ({
        id: String(project._id),
        projectName: project.projectName,
        description: project.description || null,
        problemSolved: project.problemSolved || null,
        builderContribution: project.builderContribution || null,
        techStack: project.techStack || [],
        links: project.links || {},
        source: project.source || 'manual',
        sourceId: project.sourceId || null,
      })),
    },
  });
};

export const prerender = false;
