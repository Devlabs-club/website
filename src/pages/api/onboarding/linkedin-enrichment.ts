import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { linkedInProfilesMatch, normalizeLinkedInProfileKey } from '@/lib/linkedinUrl';
import {
  queueRemoteLinkedInBuilderEnrichment,
  queueRemoteLinkedInFounderEnrichment,
  requireRemoteLinkedInScraperConfig,
} from '@/lib/remoteLinkedInScraper';
import {
  enrichLinkedInProfileViaApify,
  hasApifyConfig,
} from '@/lib/talent/builderEnrichment/apifyLinkedInProfile';
import { applyLinkedInDraftToFounder } from '@/lib/talent/builderEnrichment/applyFounderLinkedInDraft';
import { applyProfileDraft, refreshBuilderScores } from '@/lib/talent/builderEnrichment/apply';
import { upsertTalentSearchIndexForBuilder } from '@/lib/talent/searchIndex';
import BuilderProfile from '@/models/talent/BuilderProfile';
import FounderProfile from '@/models/talent/FounderProfile';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeLinkedInInput(input: unknown): string | null {
  const raw = cleanString(input);
  if (!raw) return null;
  const withoutAt = raw.replace(/^@+/, '').trim();

  try {
    const url = new URL(/^https?:\/\//i.test(withoutAt) ? withoutAt : `https://${withoutAt}`);
    if (url.hostname.includes('linkedin.com')) {
      const match = url.pathname.match(/\/in\/([^/?#]+)/i);
      if (!match?.[1]) return null;
      return `https://www.linkedin.com/in/${encodeURIComponent(decodeURIComponent(match[1]))}/`;
    }
  } catch {
    // Fall through to treating the value as a LinkedIn vanity name.
  }

  const slug = withoutAt
    .replace(/^linkedin\.com\/in\//i, '')
    .replace(/^www\.linkedin\.com\/in\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/^\/+|\/+$/g, '');

  if (!/^[A-Za-z0-9-_%]+$/.test(slug)) return null;
  return `https://www.linkedin.com/in/${encodeURIComponent(decodeURIComponent(slug))}/`;
}

async function resolveUser(request: Request, locals: App.Locals) {
  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!token) return { user: null, runtime };
  const decoded = verifyToken(token, runtime);
  if (!decoded) return { user: null, runtime };
  return { user: await findUserById(decoded.userId, runtime), runtime };
}

async function enrichBuilderViaApify(user: any, linkedInUrl: string, runtime?: Record<string, string | undefined>) {
  let builder = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: user.email }],
  });

  if (!builder) {
    builder = await BuilderProfile.create({
      userId: user._id,
      name: user.name || user.email.split('@')[0],
      email: user.email,
      links: { linkedin: linkedInUrl },
      verificationStatus: 'imported_unverified',
      visibilityStatus: 'matched_only',
    });
  } else {
    builder.userId = user._id;
    builder.email = builder.email || user.email;
    builder.name = builder.name || user.name || user.email.split('@')[0];
    builder.links = { ...(builder.links || {}), linkedin: linkedInUrl };
    await builder.save();
  }

  const scraped = await enrichLinkedInProfileViaApify(linkedInUrl, runtime);
  const updated = await applyProfileDraft(builder, scraped.profile, {
    overwriteBasics: true,
    writeBasics: true,
  });
  await builder.save();
  await refreshBuilderScores(builder._id);
  try {
    await upsertTalentSearchIndexForBuilder(String(builder._id));
  } catch (err) {
    console.warn('[linkedin-onboarding] search index refresh failed', err);
  }

  await updateUserAccount(
    String(user._id),
    {
      role: 'builder',
      accountType: 'builder',
      onboardingStatus: 'imessage_claim',
      ...(scraped.profile.avatarUrl ? { avatarUrl: scraped.profile.avatarUrl } : {}),
    },
    runtime
  );

  return {
    next: '/builder/home',
    profileId: String(builder._id),
    queued: false,
    provider: 'apify',
    profileFieldsUpdated: updated,
    runId: scraped.runId,
  };
}

async function enrichBuilder(user: any, linkedInUrl: string, runtime?: Record<string, string | undefined>) {
  if (hasApifyConfig(runtime)) {
    try {
      return await enrichBuilderViaApify(user, linkedInUrl, runtime);
    } catch (err) {
      console.warn('[linkedin-onboarding] Apify builder enrich failed, falling back to Railway', err);
    }
  }

  let builder = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: user.email }],
  });

  if (!builder) {
    builder = await BuilderProfile.create({
      userId: user._id,
      name: user.name || user.email.split('@')[0],
      email: user.email,
      links: { linkedin: linkedInUrl },
      verificationStatus: 'imported_unverified',
      visibilityStatus: 'matched_only',
    });
  } else {
    builder.userId = user._id;
    builder.email = builder.email || user.email;
    builder.name = builder.name || user.name || user.email.split('@')[0];
    builder.links = { ...(builder.links || {}), linkedin: linkedInUrl };
    await builder.save();
  }

  const queued = await queueRemoteLinkedInBuilderEnrichment(
    {
      id: String(builder._id),
      name: String(builder.name || user.name || user.email.split('@')[0]),
      linkedInUrl,
    },
    runtime
  );
  if (!queued) throw new Error('LinkedIn enrichment is not configured (APIFY_API_TOKEN or Railway scraper).');

  await updateUserAccount(
    String(user._id),
    {
      role: 'builder',
      accountType: 'builder',
      onboardingStatus: 'imessage_claim',
    },
    runtime
  );

  return {
    next: '/builder/home',
    profileId: String(builder._id),
    queued: true,
    provider: 'railway',
    batchId: queued.batchId,
    statusUrl: queued.statusUrl,
  };
}

function founderLooksScraped(profile: any): boolean {
  const company = typeof profile?.company === 'string' ? profile.company.trim() : '';
  const hasCompany = Boolean(company) && company !== 'My company';
  const title = profile?.metadata?.title;
  const bio = profile?.founderBio;
  const experiences = Array.isArray(profile?.metadata?.experiences) ? profile.metadata.experiences : [];
  return hasCompany && (Boolean(title) || Boolean(bio) || experiences.length > 0 || Boolean(profile?.logoUrl));
}

async function enrichFounderViaApify(
  user: any,
  linkedInUrl: string,
  runtime?: Record<string, string | undefined>
) {
  const userId = String(user._id);
  const existing = await FounderProfile.findOne({ userId }).lean();
  const prevEpoch =
    typeof existing?.metadata?.enrichmentEpoch === 'number' ? existing.metadata.enrichmentEpoch : 0;
  const batchId = `apify_${Date.now().toString(36)}`;

  await FounderProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        founderEmail: user.email,
        founderName: user.name || user.email.split('@')[0],
        linkedin: linkedInUrl,
        company: 'My company',
        founderBio: null,
        logoUrl: null,
        enrichmentStatus: 'pending',
        enrichmentSources: ['linkedin'],
        enrichedAt: null,
        metadata: {
          onboardingDraft: true,
          enrichmentEpoch: prevEpoch + 1,
          enrichmentBatchId: batchId,
          enrichmentLinkedInUrl: linkedInUrl,
          enrichmentLinkedInKey: normalizeLinkedInProfileKey(linkedInUrl),
          enrichmentQueuedAt: new Date().toISOString(),
          enrichmentProvider: 'apify',
          title: null,
          experiences: [],
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const scraped = await enrichLinkedInProfileViaApify(linkedInUrl, runtime);
  const applied = await applyLinkedInDraftToFounder({
    userId,
    email: user.email,
    name: user.name || user.email.split('@')[0],
    linkedInUrl,
    profile: scraped.profile,
    batchId,
    runtime,
  });

  return {
    next: '/founder/onboarding/profile?step=profile',
    queued: false,
    provider: 'apify',
    batchId,
    runId: scraped.runId,
    enrichmentStatus: applied.enrichmentStatus,
  };
}

async function enrichFounder(user: any, linkedInUrl: string, _cdpUrl: string, runtime?: Record<string, string | undefined>) {
  const userId = String(user._id);
  const existing = await FounderProfile.findOne({ userId }).lean();
  const sameUrl = linkedInProfilesMatch(existing?.linkedin, linkedInUrl);
  const status = existing?.enrichmentStatus || null;

  // Same URL already scraped — do not re-queue or flip status back to pending.
  if (
    sameUrl &&
    (status === 'complete' || status === 'partial') &&
    founderLooksScraped(existing) &&
    !(existing as any)?.metadata?.enrichmentDiscardedAt
  ) {
    await updateUserAccount(
      userId,
      {
        role: 'founder',
        accountType: 'founder',
        onboardingStatus: 'profile',
      },
      runtime
    );
    return {
      next: '/founder/onboarding/profile?step=profile',
      queued: false,
      alreadyEnriched: true,
      batchId: existing?.metadata?.enrichmentBatchId || null,
    };
  }

  // Same URL already in-flight on Railway — reuse pending job.
  if (
    sameUrl &&
    status === 'pending' &&
    existing?.metadata?.enrichmentBatchId &&
    existing?.metadata?.enrichmentProvider !== 'apify'
  ) {
    await updateUserAccount(
      userId,
      {
        role: 'founder',
        accountType: 'founder',
        onboardingStatus: 'profile',
      },
      runtime
    );
    return {
      next: '/founder/onboarding/profile?step=profile',
      queued: true,
      alreadyQueued: true,
      batchId: existing.metadata.enrichmentBatchId,
      statusUrl: `/batches/${existing.metadata.enrichmentBatchId}`,
    };
  }

  if (hasApifyConfig(runtime)) {
    try {
      return await enrichFounderViaApify(user, linkedInUrl, runtime);
    } catch (err) {
      console.warn('[linkedin-onboarding] Apify founder enrich failed, falling back to Railway', err);
    }
  }

  const queued = await queueRemoteLinkedInFounderEnrichment(
    {
      id: userId,
      name: String(user.name || user.email.split('@')[0]),
      email: String(user.email),
      linkedInUrl,
    },
    runtime
  );
  if (!queued) throw new Error('LinkedIn enrichment is not configured (APIFY_API_TOKEN or Railway scraper).');

  const prevEpoch =
    typeof existing?.metadata?.enrichmentEpoch === 'number' ? existing.metadata.enrichmentEpoch : 0;

  await FounderProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        founderEmail: user.email,
        founderName: user.name || user.email.split('@')[0],
        linkedin: linkedInUrl,
        company: 'My company',
        founderBio: null,
        logoUrl: null,
        enrichmentStatus: 'pending',
        enrichmentSources: ['linkedin'],
        enrichedAt: null,
        metadata: {
          onboardingDraft: true,
          enrichmentEpoch: prevEpoch + 1,
          enrichmentBatchId: queued.batchId,
          enrichmentLinkedInUrl: linkedInUrl,
          enrichmentLinkedInKey: normalizeLinkedInProfileKey(linkedInUrl),
          enrichmentQueuedAt: new Date().toISOString(),
          enrichmentProvider: 'railway',
          title: null,
          experiences: [],
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await updateUserAccount(
    userId,
    {
      role: 'founder',
      accountType: 'founder',
      onboardingStatus: 'profile',
    },
    runtime
  );

  return {
    next: '/founder/onboarding/profile?step=profile',
    queued: true,
    provider: 'railway',
    batchId: queued.batchId,
    statusUrl: queued.statusUrl,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, runtime } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const linkedInUrl = normalizeLinkedInInput(body.linkedin || body.linkedInUrl || body.username);
  if (!linkedInUrl) {
    return json({ success: false, error: 'Enter a valid LinkedIn profile URL or username.' }, 400);
  }

  const requestedType = cleanString(body.accountType);
  const accountType =
    requestedType === 'founder' || requestedType === 'builder'
      ? requestedType
      : user.accountType || (user.role === 'founder' || user.role === 'builder' ? user.role : null);
  if (accountType !== 'founder' && accountType !== 'builder') {
    return json({ success: false, error: 'Choose founder or builder before enriching LinkedIn.' }, 400);
  }

  if (!mongoose.Types.ObjectId.isValid(String(user._id))) {
    return json({ success: false, error: 'Invalid user session.' }, 401);
  }

  try {
    await connectAdminDB();
    const usingApify = hasApifyConfig(runtime);
    // Railway config only required when Apify is unavailable.
    let remoteScraper: { url: string } | null = null;
    if (!usingApify) {
      remoteScraper = requireRemoteLinkedInScraperConfig(runtime);
    }
    const cdp = {
      started: false,
      remote: Boolean(remoteScraper),
      url: remoteScraper?.url || null,
      provider: usingApify ? 'apify' : 'railway',
    };
    const result =
      accountType === 'founder'
        ? await enrichFounder(user, linkedInUrl, 'http://127.0.0.1:9222', runtime)
        : await enrichBuilder(user, linkedInUrl, runtime);

    return json({
      success: true,
      accountType,
      linkedInUrl,
      cdp,
      ...result,
    });
  } catch (error) {
    console.error('[linkedin-onboarding] enrichment failed', error);
    const message = error instanceof Error ? error.message : 'LinkedIn enrichment failed.';
    const timedOut = /aborted|timed out|timeout/i.test(message);
    return json(
      {
        success: false,
        error: timedOut
          ? 'LinkedIn enrichment took too long. Please try again in a moment.'
          : message,
      },
      timedOut ? 504 : 500
    );
  }
};
