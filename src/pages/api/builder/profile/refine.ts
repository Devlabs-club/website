import type { APIRoute } from 'astro';
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

function skillsFrom(text: string) {
  const known = ['React', 'Next.js', 'TypeScript', 'Python', 'Node.js', 'MongoDB', 'Postgres', 'OpenAI', 'LLM', 'RAG', 'Tailwind', 'Swift', 'React Native'];
  return known.filter((skill) => text.toLowerCase().includes(skill.toLowerCase()));
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!token) return json({ success: false, error: 'Please log in to continue.' }, 401);
  const decoded = verifyToken(token, runtime);
  if (!decoded) return json({ success: false, error: 'Session expired.' }, 401);
  const user = await findUserById(decoded.userId, runtime);
  if (!user) return json({ success: false, error: 'User not found.' }, 404);

  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const intent = typeof body.intent === 'string' ? body.intent : 'something';
  if (!message) return json({ success: false, error: 'message is required' }, 400);

  await connectAdminDB();
  const profile = await BuilderProfile.findOne({ $or: [{ userId: user._id }, { email: user.email }] });
  if (!profile) return json({ success: false, error: 'Create your profile first.' }, 404);

  const skills = skillsFrom(message);
  if (intent === 'project') {
    await ProjectRecord.create({
      builderId: profile._id,
      projectName: message.split(/[.!?]/)[0].slice(0, 80) || 'New project',
      description: message,
      techStack: skills,
      builderContribution: message,
      source: 'manual',
      sourceId: `refine-${Date.now()}`,
      verificationStatus: 'builder_confirmed',
    });
  } else if (intent === 'experience') {
    profile.experiences.push({
      title: 'Builder',
      company: profile.universityOrCompany || 'Independent',
      description: message,
      skills,
      source: 'manual',
      sourceId: `refine-${Date.now()}`,
      importedAt: new Date(),
    });
  } else if (intent === 'skills') {
    profile.rolePreference = [...new Set([...(profile.rolePreference || []), ...skills, ...message.split(',').map((s) => s.trim()).filter(Boolean)])];
  } else {
    profile.bio = profile.bio ? `${profile.bio}\n\n${message}` : message;
  }
  await profile.save();

  const projects = await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean();
  return json({
    success: true,
    message: 'Updated your profile preview.',
    profile: {
      id: String(profile._id),
      name: profile.name,
      headline: profile.headline,
      bio: profile.bio,
      location: profile.location,
      rolePreference: profile.rolePreference || [],
      preferredWorkType: profile.preferredWorkType || [],
      experiences: profile.experiences || [],
      projects: projects.map((project) => ({
        id: String(project._id),
        projectName: project.projectName,
        description: project.description,
        techStack: project.techStack || [],
      })),
    },
  });
};

export const prerender = false;
