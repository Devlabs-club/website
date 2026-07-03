import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, getFounderJobs, okJson, errorJson } from '@/lib/founderAgent/service';
import CompanyProfile from '@/models/founder/CompanyProfile';
import JobPosting from '@/models/founder/JobPosting';
import {
  canCreateRole,
  currentPeriodKey,
  entitlementErrorResponse,
  entitlementSnapshot,
  recordUsageEvent,
} from '@/lib/billing/entitlements';

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/** List the founder's roles (used by /founder/home for returning founders). */
export const GET: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);
  return okJson(await getFounderJobs(identity));
};

/** Create a draft role from the 3 home questions (role / tech stack / compensation). */
export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  const roleAccess = await canCreateRole(identity);
  if (!roleAccess.ok) {
    return new Response(JSON.stringify({ success: false, ...entitlementErrorResponse(roleAccess) }), {
      status: roleAccess.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const roleTitle = str(body.role) || str(body.roleTitle) || 'Builder role';
  const skills = list(body.techStack ?? body.skills);
  const salary = str(body.compensation) || str(body.salary);

  await connectAdminDB();

  const company = await CompanyProfile.findOne({
    $or: [{ founderId: identity.founderId }, { founderEmail: identity.email }],
  }).lean();

  const job = await JobPosting.create({
    founderId: identity.founderId,
    founderEmail: identity.email,
    founderName: identity.founderName,
    companyId: (company as any)?._id || null,
    title: roleTitle,
    roleTitle,
    company: (company as any)?.name || identity.founderName || 'My company',
    startupSummary: (company as any)?.description || null,
    industry: (company as any)?.industry || null,
    location: (company as any)?.location || null,
    skillsNeeded: skills,
    originalSkillsNeeded: skills,
    salary,
    budget: salary,
    equity: 'No',
    equityConfirmed: false,
    visa: 'Yes',
    visaConfirmed: false,
    billingPeriodKey: currentPeriodKey(),
    planAtCreation: roleAccess.entitlements.plan,
    entitlementSnapshot: entitlementSnapshot(roleAccess.entitlements),
    profileLimitApplied: roleAccess.entitlements.profileLimitPerRole,
    managedByDevLabs: roleAccess.entitlements.managedHiring,
    status: 'draft',
  });

  await recordUsageEvent({
    identity,
    eventType: 'role_created',
    opportunityId: String(job._id),
    planAtEvent: roleAccess.entitlements.plan,
    metadata: { source: 'quick_role_intake' },
  });

  return okJson({ jobId: String(job._id), next: `/founder/roles/${String(job._id)}` });
};

export const prerender = false;
