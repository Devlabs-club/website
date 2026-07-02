import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import { generateFallbackAgentWrappedReport } from '@/lib/agentWrapped/generateFallbackReport';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ params, url }) => {
  const builderId = params.builderId || '';
  if (!mongoose.Types.ObjectId.isValid(builderId)) {
    return json({ ok: false, error: 'invalid_builder_id' }, 400);
  }

  await connectAdminDB();
  const profile = await BuilderProfile.findById(builderId).lean() as any;
  if (!profile) return json({ ok: false, error: 'builder_not_found' }, 404);

  const uploaded = await AgentWrappedReportModel.findOne({ builderId })
    .sort({ createdAt: -1 })
    .lean() as any;
  if (uploaded?.report) {
    return json({ ok: true, report: uploaded.report, source: 'uploaded_agent_usage' });
  }

  const projects = await ProjectRecord.find({ builderId }).sort({ updatedAt: -1 }).limit(20).lean();
  const rootUrl = `${url.protocol}//${url.host}`;
  const report = generateFallbackAgentWrappedReport({ profile, projects, rootUrl });
  return json({ ok: true, report, source: 'profile_fallback' });
};
