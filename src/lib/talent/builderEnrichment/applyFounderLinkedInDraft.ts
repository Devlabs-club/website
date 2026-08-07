import { updateUserAccount } from '@/lib/adminMongo';
import type { RuntimeEnv } from '@/lib/workosEnv';
import FounderProfile from '@/models/talent/FounderProfile';
import { experienceIsCurrent, sortExperiencesByRecency } from '@/lib/talent/experienceNormalize';
import type { EnrichedProfileDraft } from './types';

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Apply a LinkedIn profile draft (from Apify) onto the founder onboarding draft.
 */
export async function applyLinkedInDraftToFounder(params: {
  userId: string;
  email?: string | null;
  name?: string | null;
  linkedInUrl: string;
  profile: EnrichedProfileDraft;
  batchId?: string | null;
  runtime?: RuntimeEnv;
}) {
  const experiences = sortExperiencesByRecency(
    (params.profile.experiences || [])
      .map((experience) => {
        const dateRange = clean(experience?.dateRange);
        return {
          title: clean(experience?.title),
          company: clean(experience?.company),
          companyUsername: null as string | null,
          companyLinkedInUrl: clean(experience?.companyLinkedInUrl),
          companyLogoUrl: clean(experience?.companyLogoUrl),
          employmentType: clean(experience?.employmentType),
          location: clean(experience?.location),
          dateRange,
          isCurrent: experienceIsCurrent({
            isCurrent: Boolean(experience?.isCurrent),
            dateRange,
          }),
        };
      })
      .filter((experience) => experience.company)
  ).slice(0, 12);

  const current = experiences.find((experience) => experience.isCurrent) || experiences[0] || null;
  const companyName = current?.company || 'My company';
  const title = current?.title || clean(params.profile.headline);
  const photoUrl = clean(params.profile.avatarUrl);
  const enrichmentStatus = experiences.length || params.profile.headline ? 'complete' : 'partial';

  const existing = await FounderProfile.findOne({ userId: params.userId }).lean();
  const prevMeta = ((existing as any)?.metadata || {}) as Record<string, unknown>;

  const founder = await FounderProfile.findOneAndUpdate(
    { userId: params.userId },
    {
      $set: {
        userId: params.userId,
        founderEmail: params.email || (existing as any)?.founderEmail || null,
        founderName: params.name || (existing as any)?.founderName || null,
        linkedin: params.linkedInUrl,
        company: companyName,
        founderBio: clean(params.profile.bio) || clean(params.profile.headline),
        logoUrl: photoUrl,
        enrichmentStatus,
        enrichmentSources: ['linkedin'],
        enrichedAt: new Date(),
        metadata: {
          onboardingDraft: true,
          enrichmentEpoch: prevMeta.enrichmentEpoch ?? null,
          enrichmentBatchId: params.batchId || prevMeta.enrichmentBatchId || null,
          enrichmentLinkedInUrl: params.linkedInUrl,
          enrichmentProvider: 'apify',
          title,
          currentCompanyName: companyName,
          currentCompanyLinkedInUrl: current?.companyLinkedInUrl || null,
          currentCompanyLogoUrl: current?.companyLogoUrl || null,
          experiences,
          education: params.profile.education || [],
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await updateUserAccount(
    params.userId,
    {
      role: 'founder',
      accountType: 'founder',
      onboardingStatus: 'profile',
      ...(founder?.logoUrl ? { avatarUrl: founder.logoUrl } : {}),
    },
    params.runtime
  );

  return {
    founderId: String(founder?._id || ''),
    enrichmentStatus,
    company: companyName,
    title,
  };
}
