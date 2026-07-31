import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, okJson, errorJson } from '@/lib/founderAgent/service';
import JobPosting from '@/models/founder/JobPosting';
import Shortlist from '@/models/talent/Shortlist';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import MatchRecord from '@/models/talent/MatchRecord';
import { buildFullCandidatesForShortlist } from '@/lib/talent/founderCandidate';
import { getFounderEntitlements } from '@/lib/billing/entitlements';
import { pruneInvalidShortlistBuilders } from '@/lib/talent/shortlistRepair';
import { getTtlCache, setTtlCache, invalidateTtlCachePrefix } from '@/lib/talent/ttlCache';

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function list(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}

function serializeJob(job: any) {
  return {
    id: String(job._id),
    title: job.title || job.roleTitle,
    roleTitle: job.roleTitle || job.title,
    description: job.description || job.builderWillDo || '',
    company: job.company || null,
    jobType: job.jobType || job.workType || null,
    workMode: job.workMode || null,
    location: job.location || null,
    salary: job.salary || job.budget || null,
    equity: job.equity || null,
    equityConfirmed: job.equityConfirmed === true,
    visa: job.visa || 'Yes',
    visaConfirmed: job.visaConfirmed === true,
    openings: job.openings || 1,
    skillsNeeded: job.skillsNeeded || [],
    niceToHaveSkills: job.niceToHaveSkills || [],
    responsibilities: job.responsibilities || job.deliverables || [],
    status: job.status,
    createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
  };
}

async function loadJob(identity: { email: string }, id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return JobPosting.findOne({ _id: id, founderEmail: identity.email });
}

async function loadRecommendations(
  job: any,
  entitlements: Awaited<ReturnType<typeof getFounderEntitlements>>['entitlements'],
) {
  const opportunityId = String(job._id);
  let shortlist = await Shortlist.findOne({ opportunityId }).lean();
  if (!shortlist) return [];

  const expectedLimit = job.profileLimitApplied ?? entitlements.profileLimitPerRole;
  if (expectedLimit !== null && expectedLimit !== undefined) {
    // Page loads must stay fast — prune dead IDs only. Never rediscover here.
    shortlist = await pruneInvalidShortlistBuilders({
      shortlist,
      opportunity: job,
      entitlements,
      BuilderProfile,
    });
  }

  const cacheKey = [
    'role-recs',
    opportunityId,
    String((shortlist as any)?.updatedAt || (shortlist as any)?.candidates?.length || 0),
    entitlements.visibilityMode,
    entitlements.traceAccess,
    entitlements.introAccess,
  ].join(':');
  const cached = getTtlCache<any[]>(cacheKey);
  if (cached) return cached;

  const candidates = await buildFullCandidatesForShortlist(
    shortlist,
    job,
    {
      BuilderProfile,
      ProjectRecord,
      MatchRecord,
    },
    {
      entitlements,
    }
  );
  const visible = candidates.filter((c: any) => !c.hidden);
  setTtlCache(cacheKey, visible, 45_000);
  return visible;
}

export const GET: APIRoute = async ({ request, locals, params }) => {
  const started = Date.now();
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  await connectAdminDB();
  const job = await loadJob(identity, params.id!);
  if (!job) return errorJson('Role not found.', 404);

  const url = new URL(request.url);
  const lite = url.searchParams.get('lite') === '1';
  const include = url.searchParams.get('include') || (lite ? 'job' : 'job,recommendations');

  const { entitlements } = await getFounderEntitlements(identity);
  const payload: Record<string, unknown> = {
    job: serializeJob(job),
  };

  if (include.includes('recommendations')) {
    payload.recommendations = await loadRecommendations(job, entitlements);
  } else {
    payload.recommendations = [];
  }

  console.log('[founder/roles:GET]', {
    jobId: params.id,
    lite,
    include,
    durationMs: Date.now() - started,
    recommendationCount: Array.isArray(payload.recommendations) ? payload.recommendations.length : 0,
  });

  return okJson(payload);
};

/** Manual edits from the right-pane job editor. */
export const PUT: APIRoute = async ({ request, locals, params }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  await connectAdminDB();
  const job = await loadJob(identity, params.id!);
  if (!job) return errorJson('Role not found.', 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const set: Record<string, unknown> = {};
  const title = str(body.title) || str(body.roleTitle);
  if (title) {
    set.title = title;
    set.roleTitle = title;
  }
  const description = str(body.description);
  if (description !== null) {
    set.description = description;
    set.builderWillDo = description;
  }
  for (const key of ['company', 'location', 'salary', 'equity', 'visa', 'workMode', 'jobType'] as const) {
    const v = str(body[key]);
    if (v !== null) set[key] = v;
  }
  if (str(body.salary)) set.budget = str(body.salary);
  const equity = str(body.equity);
  if (equity && equity.toLowerCase() !== 'no') set.equityConfirmed = true;
  const visa = str(body.visa);
  if (visa && visa.toLowerCase() !== 'yes') set.visaConfirmed = true;
  if (typeof body.openings === 'number') set.openings = body.openings;
  const skills = list(body.skillsNeeded);
  if (skills) set.skillsNeeded = skills;
  const nice = list(body.niceToHaveSkills);
  if (nice) set.niceToHaveSkills = nice;
  const resp = list(body.responsibilities);
  if (resp) {
    set.responsibilities = resp;
    set.deliverables = resp;
  }

  Object.assign(job, set);
  await job.save();
  invalidateTtlCachePrefix(`role-recs:${String(job._id)}`);

  return okJson({ job: serializeJob(job) });
};

export const prerender = false;
