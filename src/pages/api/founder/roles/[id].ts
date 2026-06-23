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
  };
}

async function loadJob(identity: { email: string }, id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return JobPosting.findOne({ _id: id, founderEmail: identity.email });
}

async function loadRecommendations(job: any) {
  const shortlist = await Shortlist.findOne({ opportunityId: String(job._id) }).lean();
  if (!shortlist) return [];
  const candidates = await buildFullCandidatesForShortlist(shortlist, job, {
    BuilderProfile,
    ProjectRecord,
    MatchRecord,
  });
  return candidates.filter((c: any) => !c.hidden);
}

export const GET: APIRoute = async ({ request, locals, params }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  await connectAdminDB();
  const job = await loadJob(identity, params.id!);
  if (!job) return errorJson('Role not found.', 404);

  const recommendations = await loadRecommendations(job);
  return okJson({ job: serializeJob(job), recommendations });
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
  if (title) { set.title = title; set.roleTitle = title; }
  const description = str(body.description);
  if (description !== null) { set.description = description; set.builderWillDo = description; }
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
  if (resp) { set.responsibilities = resp; set.deliverables = resp; }

  Object.assign(job, set);
  await job.save();

  return okJson({ job: serializeJob(job) });
};

export const prerender = false;
