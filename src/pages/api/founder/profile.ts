import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, okJson, errorJson } from '@/lib/founderAgent/service';
import { updateUserAccount, findUserById } from '@/lib/adminMongo';
import FounderProfile from '@/models/talent/FounderProfile';
import CompanyProfile from '@/models/founder/CompanyProfile';

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Normalize and validate a founder scheduling link. We only accept Cal.com or
 * Calendly URLs — that link is sent to builders over iMessage to book interviews,
 * so it must be a real booking page. Returns the normalized URL or null if invalid.
 */
function normalizeSchedulingLink(v: unknown): string | null {
  const raw = str(v);
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const isAllowed =
    host === 'cal.com' ||
    host.endsWith('.cal.com') ||
    host === 'calendly.com' ||
    host.endsWith('.calendly.com');
  if (!isAllowed) return null;
  return url.toString();
}

/** Prefill data for the founder onboarding review screens. */
export const GET: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  await connectAdminDB();
  const [user, founderProfile, company] = await Promise.all([
    findUserById(identity.founderId).catch(() => null),
    FounderProfile.findOne({ userId: identity.founderId }).lean(),
    CompanyProfile.findOne({
      $or: [{ founderId: identity.founderId }, { founderEmail: identity.email }],
    }).lean(),
  ]);

  return okJson({
    profile: {
      name: (founderProfile as any)?.founderName || identity.founderName,
      email: identity.email,
      avatarUrl: (user as any)?.avatarUrl ?? (founderProfile as any)?.logoUrl ?? null,
      title: (founderProfile as any)?.metadata?.title ?? null,
      company: (founderProfile as any)?.company ?? (company as any)?.name ?? null,
      bio: (founderProfile as any)?.founderBio ?? null,
      schedulingLink: (founderProfile as any)?.schedulingLink ?? null,
      linkedin: (founderProfile as any)?.linkedin ?? null,
    },
    enrichmentStatus: (founderProfile as any)?.enrichmentStatus ?? null,
    enrichmentBatchId: (founderProfile as any)?.metadata?.enrichmentBatchId ?? null,
    company: company
      ? {
          name: (company as any).name,
          website: (company as any).website,
          location: (company as any).location,
          description: (company as any).description,
          logoUrl: (company as any).metadata?.logoUrl ?? null,
        }
      : null,
    experiences: ((founderProfile as any)?.metadata?.experiences ?? []) as any[],
  });
};

/** Save reviewed founder basic details (Step 1 of onboarding). */
export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = str(body.name) || identity.founderName;
  const company = str(body.company) || 'My company';

  // Required: a Cal.com / Calendly link so builders can book interviews directly
  // from the intro request we send them over iMessage.
  if (!str(body.schedulingLink)) {
    return errorJson('A Cal.com or Calendly link is required.', 400);
  }
  const schedulingLink = normalizeSchedulingLink(body.schedulingLink);
  if (!schedulingLink) {
    return errorJson('Enter a valid Cal.com or Calendly link (e.g. https://cal.com/yourname).', 400);
  }

  await connectAdminDB();

  await FounderProfile.findOneAndUpdate(
    { userId: identity.founderId },
    {
      $set: {
        userId: identity.founderId,
        founderEmail: identity.email,
        founderName: name,
        company,
        schedulingLink,
        founderBio: str(body.bio),
        ...(str(body.avatarUrl) ? { logoUrl: str(body.avatarUrl) } : {}),
        // Merge into metadata with dot-notation so we don't clobber the experiences
        // list (and other signals) saved during LinkedIn enrichment.
        'metadata.title': str(body.title),
        'metadata.workEmail': str(body.workEmail),
        'metadata.onboardingDraft': false,
        enrichmentStatus: 'complete',
      },
      $unset: {
        'metadata.enrichmentDiscardedAt': 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Keep user.name / avatar in sync with the reviewed details.
  await updateUserAccount(identity.founderId, {
    name,
    onboardingStatus: 'company',
    ...(str(body.avatarUrl) ? { avatarUrl: str(body.avatarUrl) } : {}),
  });

  return okJson({ next: '/founder/onboarding/company' });
};

export const prerender = false;
