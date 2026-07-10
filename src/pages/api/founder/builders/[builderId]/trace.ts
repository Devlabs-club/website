import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, okJson, errorJson } from '@/lib/founderAgent/service';
import { getFounderEntitlements } from '@/lib/billing/entitlements';
import JobPosting from '@/models/founder/JobPosting';
import Shortlist from '@/models/talent/Shortlist';
import MatchRecord from '@/models/talent/MatchRecord';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { buildRoleFitTrace } from '@/lib/talent/roleFitTrace';

export const GET: APIRoute = async ({ request, locals, params, url }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  const builderId = params.builderId;
  const roleId = url.searchParams.get('roleId');
  if (!builderId || !mongoose.Types.ObjectId.isValid(builderId)) {
    return errorJson('Invalid builder id.', 400);
  }
  if (!roleId || !mongoose.Types.ObjectId.isValid(roleId)) {
    return errorJson('roleId query parameter is required.', 400);
  }

  await connectAdminDB();

  const job = await JobPosting.findOne({ _id: roleId, founderEmail: identity.email }).lean();
  if (!job) return errorJson('Role not found.', 404);

  const shortlist = (await Shortlist.findOne({ opportunityId: roleId }).lean()) as any;
  const isMatched = shortlist?.candidates?.some((c: any) => String(c.builderId) === builderId);
  if (!isMatched) return errorJson('Builder is not in your recommendations for this role.', 403);

  const { entitlements } = await getFounderEntitlements(identity);
  const traceAccess = entitlements.traceAccess;

  const wrappedDoc = (await AgentWrappedReportModel.findOne({
    builderId,
    source: 'uploaded_agent_usage',
  })
    .sort({ createdAt: -1 })
    .lean()) as any;

  const match = await MatchRecord.findOne({ opportunityId: roleId, builderId }).lean();
  const shortlistCandidate = shortlist?.candidates?.find((c: any) => String(c.builderId) === builderId);

  const report = wrappedDoc?.report as AgentWrappedReport | undefined;
  const roleFitTrace = buildRoleFitTrace({
    report: report || null,
    opportunity: job,
    match,
    shortlistCandidate,
  });

  if (traceAccess !== 'full') {
    return okJson({
      traceAccess: 'teaser',
      hasAgentWrapped: Boolean(report),
      roleFitTrace,
      interviewProbes: roleFitTrace?.interviewProbes || [],
    });
  }

  if (!report) {
    return okJson({
      traceAccess: 'full',
      hasAgentWrapped: false,
      roleFitTrace,
      interviewProbes: roleFitTrace?.interviewProbes || [],
    });
  }

  return okJson({
    traceAccess: 'full',
    hasAgentWrapped: true,
    report,
    roleFitTrace,
    interviewProbes: roleFitTrace?.interviewProbes || [],
    uploadedAt: wrappedDoc?.createdAt ? new Date(wrappedDoc.createdAt).toISOString() : null,
  });
};
