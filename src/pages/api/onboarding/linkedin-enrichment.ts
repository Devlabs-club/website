import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import {
  requireRemoteLinkedInScraperConfig,
  runRequiredRemoteLinkedInScraperScript,
} from '@/lib/remoteLinkedInScraper';
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

function compactKey(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
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

async function runCdpScript(
  scriptName: string,
  args: string[],
  runtime?: Record<string, string | undefined>
) {
  return runRequiredRemoteLinkedInScraperScript(scriptName, args, runtime);
}

function applyableUpdate(artifact: any, linkedInUrl: string) {
  const proposed = artifact?.proposedMongoUpdate || {};
  const update: Record<string, any> = {
    $set: {
      ...(proposed.$set || {}),
      'links.linkedin': linkedInUrl,
      updatedAt: new Date(),
    },
  };
  if (proposed.$addToSet && Object.keys(proposed.$addToSet).length) update.$addToSet = proposed.$addToSet;
  if (proposed.$push && Object.keys(proposed.$push).length) update.$push = proposed.$push;
  return update;
}

async function enrichBuilder(user: any, linkedInUrl: string, cdpUrl: string, runtime?: Record<string, string | undefined>) {
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

  const { summary, artifact } = await runCdpScript('enrich-builder-linkedin-cdp.mjs', [
    '--builderId',
    String(builder._id),
    '--cdp-url',
    cdpUrl,
    '--wait-ms',
    '12000',
  ], runtime);

  if (artifact?.proposedMongoUpdate) {
    await BuilderProfile.updateOne({ _id: builder._id }, applyableUpdate(artifact, linkedInUrl));
  }

  await updateUserAccount(String(user._id), {
    role: 'builder',
    accountType: 'builder',
    onboardingStatus: 'profile',
  }, runtime);

  return {
    next: '/builder/onboarding/profile',
    profileId: String(builder._id),
    summary,
    artifact,
  };
}

async function enrichFounder(user: any, linkedInUrl: string, cdpUrl: string, runtime?: Record<string, string | undefined>) {
  const outputKey = `founder-${String(user._id)}-${compactKey(linkedInUrl)}`;
  const { summary, artifact } = await runCdpScript('enrich-builder-linkedin-cdp.mjs', [
    '--linkedin-url',
    linkedInUrl,
    '--name',
    user.name || user.email.split('@')[0],
    '--email',
    user.email,
    '--output-key',
    outputKey,
    '--cdp-url',
    cdpUrl,
    '--wait-ms',
    '12000',
  ], runtime);

  const extracted = artifact?.extracted || {};
  const allExperiences = Array.isArray(extracted.experiences) ? extracted.experiences : [];
  // Persist a trimmed list of experiences so the company step can let the founder
  // pick which one to enrich. Current roles first.
  const experiences = allExperiences
    .map((experience: any) => ({
      title: cleanString(experience?.title),
      company: cleanString(experience?.company),
      companyUsername: cleanString(experience?.companyUsername),
      companyLinkedInUrl: cleanString(experience?.companyLinkedInUrl),
      companyLogoUrl: cleanString(experience?.companyLogoUrl),
      employmentType: cleanString(experience?.employmentType),
      location: cleanString(experience?.location),
      dateRange: cleanString(experience?.dateRange),
      isCurrent: Boolean(experience?.isCurrent),
    }))
    .filter((experience: any) => experience.company)
    .sort((a: any, b: any) => Number(b.isCurrent) - Number(a.isCurrent))
    .slice(0, 12);
  const currentExperience =
    allExperiences.find((experience: any) => experience?.isCurrent) || allExperiences[0] || null;
  const companyName = cleanString(currentExperience?.company) || 'My company';
  const title = cleanString(currentExperience?.title) || cleanString(extracted.headline);
  const photoUrl = cleanString(extracted.cdpExtraction?.photo?.imageUrl);

  await FounderProfile.findOneAndUpdate(
    { userId: String(user._id) },
    {
      $set: {
        userId: String(user._id),
        founderEmail: user.email,
        founderName: user.name || user.email.split('@')[0],
        company: companyName,
        linkedin: linkedInUrl,
        founderBio: cleanString(extracted.about) || cleanString(extracted.headline),
        logoUrl: photoUrl,
        enrichmentStatus: artifact?.extracted?.warnings?.length ? 'partial' : 'complete',
        enrichmentSources: ['linkedin'],
        enrichedAt: new Date(),
        metadata: {
          title,
          currentCompanyName: companyName,
          currentCompanyLinkedInUrl: cleanString(currentExperience?.companyLinkedInUrl),
          currentCompanyLogoUrl: cleanString(currentExperience?.companyLogoUrl),
          experiences,
          linkedInArtifactPath: summary.outputPath,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await updateUserAccount(String(user._id), {
    role: 'founder',
    accountType: 'founder',
    onboardingStatus: 'profile',
    ...(photoUrl ? { avatarUrl: photoUrl } : {}),
  }, runtime);

  return {
    next: '/founder/onboarding/profile',
    summary,
    artifact,
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
    const cdpUrl = 'http://127.0.0.1:9222';
    const remoteScraper = requireRemoteLinkedInScraperConfig(runtime);
    const cdp = { started: false, remote: true, url: remoteScraper.url };
    const result =
      accountType === 'founder'
        ? await enrichFounder(user, linkedInUrl, cdpUrl, runtime)
        : await enrichBuilder(user, linkedInUrl, cdpUrl, runtime);

    return json({
      success: true,
      accountType,
      linkedInUrl,
      cdp,
      ...result,
    });
  } catch (error) {
    console.error('[linkedin-onboarding] enrichment failed', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'LinkedIn enrichment failed.',
    }, 500);
  }
};
