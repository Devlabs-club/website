import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/events/adminAuth';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { createManagedRole, listManagedRoles } from '@/lib/talent/managedRoleService';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  return jsonResponse(200, { success: true, roles: await listManagedRoles() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createManagedRole(body, auth.user, request, runtimeEnvFromLocals(locals));
  if ('error' in result) return jsonResponse(result.status || 400, { success: false, message: result.error });
  return jsonResponse(200, { success: true, ...result });
};

export const prerender = false;
