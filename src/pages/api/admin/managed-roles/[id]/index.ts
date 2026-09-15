import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/events/adminAuth';
import { getManagedRole, updateManagedRole } from '@/lib/talent/managedRoleService';

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const role = await getManagedRole(params.id || '');
  if (!role) return jsonResponse(404, { success: false, message: 'Managed role not found.' });
  return jsonResponse(200, { success: true, role });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await updateManagedRole(params.id || '', body, auth.user);
  if ('error' in result) return jsonResponse(result.status || 400, { success: false, message: result.error });
  return jsonResponse(200, { success: true, ...result });
};

export const prerender = false;
