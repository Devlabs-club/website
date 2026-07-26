import type { APIRoute } from 'astro';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import { resolveAuthedBuilder, jsonResponse } from '@/lib/events/builderAuth';

export const prerender = false;

export const PATCH: APIRoute = async ({ request }) => {
  const auth = await resolveAuthedBuilder(request);
  if ('error' in auth) return jsonResponse(auth.status, { ok: false, error: auth.error });

  let body: { identityId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'bad_json' });
  }

  const identityId = String(body.identityId || '').trim();
  if (!identityId) return jsonResponse(400, { ok: false, error: 'missing_identity' });

  const doc = await AgentWrappedReportModel.findOne({
    builderId: auth.builder._id,
    source: 'uploaded_agent_usage',
  }).sort({ createdAt: -1 });

  if (!doc?.report) return jsonResponse(404, { ok: false, error: 'report_not_found' });

  const report = doc.report as any;
  const earned = report.buildprint?.earnedIdentities || [];
  const allowed = earned.find((item: any) => item.id === identityId && item.qualified !== false);
  if (!allowed) return jsonResponse(403, { ok: false, error: 'identity_not_earned' });

  report.buildprint = {
    ...report.buildprint,
    selectedPublicIdentityId: identityId,
    publicCardLine: allowed.cardLine || report.buildprint?.publicCardLine,
  };
  report.archetype = allowed.label;
  report.identities = earned.map((item: any) => ({
    name: item.label,
    tagline: item.cardLine,
    score: item.score,
  }));

  doc.report = report;
  doc.selectedPublicIdentityId = identityId;
  doc.markModified('report');
  await doc.save();

  return jsonResponse(200, { ok: true, selectedPublicIdentityId: identityId });
};
