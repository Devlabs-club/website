import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { proxyToNodeBackend, shouldUseApiProxy } from '@/lib/apiProxy';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { connectAdminDB } from '@/lib/mongodb';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';

export const prerender = false;

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
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

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'resume';
}

async function streamResume(builderId: string, request: Request, locals: App.Locals) {
  if (!mongoose.Types.ObjectId.isValid(builderId)) {
    return errorJson('Invalid builder id.', 400);
  }

  const user = await resolveUser(request, locals);
  if (!user) return errorJson('Please log in to continue.', 401);

  const role = String(user.role || '');
  await connectAdminDB();

  const profile = (await BuilderProfile.findById(builderId)
    .select('name email userId links.resume')
    .lean()) as any;
  if (!profile) return errorJson('Builder not found.', 404);

  const resumeUrl = typeof profile.links?.resume === 'string' ? profile.links.resume.trim() : '';
  if (!resumeUrl) return errorJson('No resume on this profile.', 404);

  const userEmail = String(user.email || '')
    .toLowerCase()
    .trim();
  const isOwner =
    role === 'builder' &&
    (String(profile.userId || '') === String(user._id || '') ||
      String(profile.email || '')
        .toLowerCase()
        .trim() === userEmail);
  const canView = role === 'founder' || role === 'admin' || isOwner;
  if (!canView) return errorJson('You do not have access to this resume.', 403);

  const upstream = await fetch(resumeUrl, {
    signal: AbortSignal.timeout(30000),
    headers: { Accept: 'application/pdf,*/*' },
  });
  if (!upstream.ok) {
    return errorJson(`Could not load resume (${upstream.status}).`, 502);
  }

  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (bytes.length < 5 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return errorJson('Stored resume is not a PDF.', 502);
  }

  const filename = `${safeFilename(String(profile.name || 'builder'))}-resume.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const GET: APIRoute = async (context) => {
  if (shouldUseApiProxy(context.locals)) {
    return proxyToNodeBackend(context.request, context.locals);
  }
  return streamResume(String(context.params.builderId || ''), context.request, context.locals);
};
