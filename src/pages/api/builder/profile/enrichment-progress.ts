import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import {
  clearEnrichmentProgress,
  isEnrichmentProgressStale,
  readEnrichmentProgress,
} from '@/lib/talent/builderEnrichment/progress';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  await connectAdminDB();

  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!token) return json({ success: false, active: false, error: 'unauthorized' }, 401);

  const payload = verifyToken(token, runtime);
  if (!payload?.userId) return json({ success: false, active: false, error: 'unauthorized' }, 401);

  const user = await findUserById(payload.userId, runtime);
  if (!user?.email) return json({ success: false, active: false, error: 'unauthorized' }, 401);

  const userEmail = String(user.email).toLowerCase().trim();
  const profile = (await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: userEmail }],
  }).lean()) as any;

  if (!profile) {
    return json({
      success: true,
      active: false,
      stage: null,
      label: null,
      detail: null,
      brief: null,
      log: [],
    });
  }

  const progress = readEnrichmentProgress(profile);
  if (!progress || progress.stage === 'done') {
    return json({
      success: true,
      active: false,
      stage: null,
      label: null,
      detail: null,
      brief: null,
      log: [],
    });
  }

  if (isEnrichmentProgressStale(progress)) {
    await clearEnrichmentProgress(String(profile._id)).catch(() => {});
    return json({
      success: true,
      active: false,
      stage: null,
      label: null,
      detail: null,
      brief: null,
      log: [],
      stale: true,
    });
  }

  return json({
    success: true,
    active: true,
    stage: progress.stage,
    label: progress.label,
    detail: progress.detail,
    brief: progress.brief || progress.detail || null,
    log: progress.log || [],
    updatedAt: progress.updatedAt,
  });
};

export const prerender = false;
