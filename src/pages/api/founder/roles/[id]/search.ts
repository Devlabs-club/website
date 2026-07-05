import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, handleJobAction, okJson, errorJson } from '@/lib/founderAgent/service';
import JobPosting from '@/models/founder/JobPosting';
import Shortlist from '@/models/talent/Shortlist';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import MatchRecord from '@/models/talent/MatchRecord';
import { buildFullCandidatesForShortlist } from '@/lib/talent/founderCandidate';
import { getFounderEntitlements } from '@/lib/billing/entitlements';

/** Run the talent discovery pipeline for a role and return ranked builders. */
export const POST: APIRoute = async ({ request, locals, params }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  const id = params.id!;
  if (!mongoose.Types.ObjectId.isValid(id)) return errorJson('Invalid role id.', 400);

  await connectAdminDB();

  // Reuse the founder agent's search/persist pipeline (semantic + vector + rerank).
  const result = (await handleJobAction(identity, {
    action: 'rerun_job_search',
    payload: { jobId: id, searchMode: 'balanced' },
  })) as any;
  if (result?.needsFollowup) {
    return okJson({
      needsFollowup: true,
      message: result.message || 'Role needs more detail before search.',
      job: result.job || null,
      recommendations: [],
    });
  }

  const job = await JobPosting.findOne({ _id: id, founderEmail: identity.email });
  const shortlist = await Shortlist.findOne({ opportunityId: id }).lean();
  const { entitlements } = await getFounderEntitlements(identity);
  const recommendations = shortlist
    ? (await buildFullCandidatesForShortlist(shortlist, job, {
        BuilderProfile,
        ProjectRecord,
        MatchRecord,
      }, {
        entitlements,
      })).filter((c: any) => !c.hidden)
    : [];

  return okJson({
    search: result?.search ?? null,
    message: result?.message ?? null,
    recommendations,
  });
};

export const prerender = false;
