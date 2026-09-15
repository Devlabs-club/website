import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/events/adminAuth';
import { listManagedRoleMatches, reviewManagedRoleMatch } from '@/lib/talent/managedRoleService';

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  return jsonResponse(200, { success: true, matches: await listManagedRoleMatches(params.id || '') });
};

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await reviewManagedRoleMatch(params.id || '', body, auth.user);
  if ('error' in result) return jsonResponse(result.status || 400, { success: false, message: result.error });
  return jsonResponse(200, { success: true, ...result });
};

export const prerender = false;
