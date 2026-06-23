import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';

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
  if (!token) return null;
  const decoded = verifyToken(token, runtime);
  if (!decoded) return null;
  return findUserById(decoded.userId, runtime);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

  const body = await request.json().catch(() => ({}));
  const linkedin = typeof body.linkedin === 'string' ? body.linkedin.trim() : '';
  const github = typeof body.github === 'string' ? body.github.trim() : '';
  const devpost = typeof body.devpost === 'string' ? body.devpost.trim() : '';

  await connectAdminDB();

  const profile = await BuilderProfile.findOne({
    $or: [
      { userId: user._id },
      { email: user.email },
      ...(linkedin ? [{ 'links.linkedin': linkedin }] : []),
      ...(github ? [{ 'links.github': github }] : []),
      ...(devpost ? [{ 'links.devpost': devpost }] : []),
    ],
  }).lean();

  return json({
    success: true,
    found: Boolean(profile),
    profileId: profile?._id ? String(profile._id) : null,
    next: profile ? '/builder/onboarding/profile' : '/builder/onboarding/profile?mode=create',
  });
};

export const prerender = false;
