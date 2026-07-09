import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import TalentEmailDelivery from '@/models/talent/TalentEmailDelivery';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function isAuthorized(request: Request, locals: App.Locals) {
  const secret = process.env.EMAIL_STATS_SECRET?.trim();
  const provided = request.headers.get('x-devlabs-email-stats-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (secret && provided === secret) return true;

  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  const decoded = token ? verifyToken(token, runtime) : null;
  if (!decoded) return false;
  const user = await findUserById(decoded.userId, runtime);
  return user?.role === 'admin';
}

export const GET: APIRoute = async ({ request, locals, url }) => {
  if (!(await isAuthorized(request, locals))) return json({ success: false, error: 'Unauthorized' }, 401);

  await connectAdminDB();
  const sinceDays = Math.min(365, Math.max(1, Number(url.searchParams.get('days') || 30)));
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await TalentEmailDelivery.aggregate([
    { $match: { sentAt: { $gte: since } } },
    {
      $group: {
        _id: '$emailType',
        sent: { $sum: 1 },
        delivered: { $sum: '$eventCounts.delivered' },
        opened: { $sum: '$eventCounts.open' },
        clicked: { $sum: '$eventCounts.click' },
        actionTaken: { $sum: '$eventCounts.action' },
        bounced: { $sum: '$eventCounts.bounce' },
        dropped: { $sum: '$eventCounts.dropped' },
      },
    },
    { $sort: { sent: -1 } },
  ]);

  return json({
    success: true,
    since: since.toISOString(),
    totals: rows.map((row: any) => {
      const { _id, ...counts } = row;
      return { emailType: _id || 'unknown', ...counts };
    }),
  });
};
