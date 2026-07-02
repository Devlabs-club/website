import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import { validateSafeAgentWrappedReport } from '@/lib/agentWrapped/privacy';
import { verifyAgentWrappedUploadToken } from '@/lib/agentWrapped/uploadToken';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import type { UploadAgentWrappedReportRequest } from '@/lib/agentWrapped/types';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function extractBearer(request: Request) {
  const header = request.headers.get('Authorization') || '';
  const [type, token] = header.split(' ');
  return type === 'Bearer' && token ? token : null;
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const tokenPayload = verifyAgentWrappedUploadToken(extractBearer(request), runtime);
  if (!tokenPayload) return json({ ok: false, error: 'invalid_upload_token' }, 401);

  let body: UploadAgentWrappedReportRequest;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  if (!mongoose.Types.ObjectId.isValid(body.builderId) || body.builderId !== tokenPayload.builderId) {
    return json({ ok: false, error: 'builder_mismatch' }, 403);
  }
  if (body.consent?.rawContentUploaded !== false) {
    return json({ ok: false, error: 'raw_content_not_allowed' }, 400);
  }
  if (!body.consent?.approvedAt) {
    return json({ ok: false, error: 'missing_consent' }, 400);
  }

  const report = {
    ...body.report,
    builderId: body.builderId,
    source: 'uploaded_agent_usage' as const,
    share: {
      ...body.report.share,
      publicUrl: body.report.share?.publicUrl || `${url.protocol}//${url.host}/builder/wrapped/${body.builderId}`,
    },
  };
  const validation = validateSafeAgentWrappedReport(report);
  if (!validation.ok) {
    return json({ ok: false, error: 'unsafe_report', issues: validation.issues }, 400);
  }

  await connectAdminDB();
  const builder = await BuilderProfile.findById(body.builderId).select('_id email').lean() as any;
  if (!builder) return json({ ok: false, error: 'builder_not_found' }, 404);
  if (String(builder.email || '').toLowerCase() !== tokenPayload.email.toLowerCase()) {
    return json({ ok: false, error: 'builder_mismatch' }, 403);
  }

  const saved = await AgentWrappedReportModel.findOneAndUpdate(
    { builderId: body.builderId, reportId: report.reportId },
    {
      $set: {
        builderId: body.builderId,
        reportId: report.reportId,
        report,
        localAnalysisVersion: body.localAnalysisVersion || null,
        source: 'uploaded_agent_usage',
        sourceCoverage: report.sourceCoverage || {},
        consent: {
          approvedAt: new Date(body.consent.approvedAt),
          rawContentUploaded: false,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return json({
    ok: true,
    reportId: saved.reportId,
    publicUrl: `/builder/wrapped/${body.builderId}`,
  });
};
