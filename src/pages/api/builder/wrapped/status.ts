import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import { verifyAgentWrappedUploadToken } from '@/lib/agentWrapped/uploadToken';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const tokenPayload = verifyAgentWrappedUploadToken(url.searchParams.get('token'), runtime);
  const builderId = tokenPayload?.builderId || url.searchParams.get('builderId') || '';
  if (!mongoose.Types.ObjectId.isValid(builderId)) {
    return json({ ok: false, error: 'invalid_builder_id' }, 400);
  }

  await connectAdminDB();
  const report = await AgentWrappedReportModel.findOne({
    builderId,
    source: 'uploaded_agent_usage',
  })
    .sort({ createdAt: -1 })
    .select('reportId createdAt')
    .lean() as any;
  return json({
    ok: true,
    uploaded: Boolean(report),
    reportId: report?.reportId || null,
    publicUrl: report ? `/builder/wrapped/${builderId}` : null,
    createdAt: report?.createdAt ? new Date(report.createdAt).toISOString() : null,
  });
};
