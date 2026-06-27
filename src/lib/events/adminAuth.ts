import { getAuthenticatedUser } from '../momentumRequestAuth';

export function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user) {
    return { ok: false as const, response: jsonResponse(auth.status, { success: false, message: auth.error }) };
  }
  if (auth.user.role !== 'admin') {
    return { ok: false as const, response: jsonResponse(403, { success: false, message: 'Forbidden' }) };
  }
  return { ok: true as const, user: auth.user };
}
