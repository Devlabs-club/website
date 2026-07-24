import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ params }) => {
  const builderId = params.builderId || '';
  if (!mongoose.Types.ObjectId.isValid(builderId)) {
    return json({ ok: false, error: 'invalid_builder_id' }, 400);
  }

  await connectAdminDB();
  const profile = await BuilderProfile.findById(builderId).select('_id').lean();
  if (!profile) return json({ ok: false, error: 'builder_not_found' }, 404);

  const uploaded = (await AgentWrappedReportModel.findOne({
    builderId,
    source: 'uploaded_agent_usage',
  })
    .sort({ createdAt: -1 })
    .lean()) as { report?: unknown } | null;

  if (!uploaded?.report) {
    return json(
      {
        ok: false,
        error: 'no_uploaded_report',
        message: 'Agent Wrapped is only available after you run the local command and approve the upload.',
      },
      404
    );
  }

  return json({ ok: true, report: uploaded.report, source: 'uploaded_agent_usage' });
};
