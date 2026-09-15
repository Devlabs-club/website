import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/events/adminAuth';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { createManagedRoleDraft } from '@/lib/talent/managedRoleService';

export const POST: APIRoute = async ({ request, locals, params }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createManagedRoleDraft(params.id || '', body, auth.user, request, runtimeEnvFromLocals(locals));
  if ('error' in result) return jsonResponse(result.status || 400, { success: false, message: result.error });
  return jsonResponse(200, { success: true, ...result });
};

export const prerender = false;
