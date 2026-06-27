import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { recomputeAndStore } from '@/lib/talent/talentDatabaseStats';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = extractTokenFromHeader(authHeader) || extractTokenFromCookies(cookieHeader);

  if (token) {
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 });
    }
  } else {
    // Allow unauthenticated access from internal services via secret header
    const secret = request.headers.get('X-Internal-Secret');
    const expected = process.env.INTERNAL_API_SECRET;
    if (!expected || secret !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  try {
    await connectAdminDB();
    const t0 = Date.now();
    const stats = await recomputeAndStore();
    const elapsed = Date.now() - t0;

    return new Response(
      JSON.stringify({
        success: true,
        computedAt: stats.computedAt,
        totalBuilders: stats.totalBuilders,
        availableNow: stats.availableNow,
        topSkills: stats.topSkills.slice(0, 10).map((s) => `${s.skill} (${s.count})`),
        elapsedMs: elapsed,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Refresh failed' }),
      { status: 500 }
    );
  }
};

// Also support POST for webhook-style triggers (e.g. from deployment scripts)
export const POST: APIRoute = GET;
