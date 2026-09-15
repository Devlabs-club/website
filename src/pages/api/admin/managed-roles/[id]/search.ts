import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/events/adminAuth';
import { runManagedRoleSearch } from '@/lib/talent/managedRoleService';

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const result = await runManagedRoleSearch(params.id || '', auth.user);
  if ('error' in result) return jsonResponse(result.status || 400, { success: false, message: result.error });
  return jsonResponse(200, { success: true, ...result });
};

export const prerender = false;
