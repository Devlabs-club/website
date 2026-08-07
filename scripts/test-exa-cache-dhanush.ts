/**
 * Live test: company cache + builder Exa fingerprint for dhanush.kalaiselvan@gmail.com
 * Usage: bun run scripts/test-exa-cache-dhanush.ts
 */
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import CompanyResearchCache from '../src/models/talent/CompanyResearchCache';
import { enrichLinkedInProfileViaApify } from '../src/lib/talent/builderEnrichment/apifyLinkedInProfile';
import { applyProfileDraft, refreshBuilderScores } from '../src/lib/talent/builderEnrichment/apply';
import { deepResearchBuilder } from '../src/lib/talent/builderDeepResearch';
import { deepResearchCompany } from '../src/lib/talent/founderCompanyDeepResearch';
import { buildBuilderExaFingerprint } from '../src/lib/talent/exaResearchCache';

const email = 'dhanush.kalaiselvan@gmail.com';
const linkedInUrl = 'https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/';

await connectAdminDB();

console.log('\n=== 1) Ensure builder profile exists (Apify LinkedIn) ===');
let builder = await BuilderProfile.findOne({ email });
if (!builder) {
  builder = await BuilderProfile.create({
    name: 'Dhanush Vardhan',
    email,
    links: { linkedin: linkedInUrl },
    verificationStatus: 'imported_unverified',
    visibilityStatus: 'matched_only',
  });
}

const scraped = await enrichLinkedInProfileViaApify(linkedInUrl);
await applyProfileDraft(builder, scraped.profile, { overwriteBasics: true, writeBasics: true });
await builder.save();
await refreshBuilderScores(builder._id);
builder = await BuilderProfile.findById(builder._id);
console.log({
  builderId: String(builder!._id),
  headline: builder!.headline,
  experiences: (builder!.experiences || []).length,
  skills: (builder!.skills || []).length,
  avatarCloudinary: /cloudinary/.test(String(builder!.avatarUrl || '')),
});

console.log('\n=== 2) Company research cache (DevLabs) — first call (miss) then second (hit) ===');
const companyParams = {
  name: 'DevLabs',
  website: 'https://devlabs.club',
  linkedInUrl: 'https://www.linkedin.com/company/devlabsclub/',
};
const company1 = await deepResearchCompany(companyParams);
const company2 = await deepResearchCompany(companyParams);
const cacheDoc = await CompanyResearchCache.findOne({ cacheKey: company1.cacheKey }).lean();
console.log({
  first: {
    cacheHit: company1.cacheHit,
    cacheKey: company1.cacheKey,
    providers: company1.searchProviders,
    descriptionPreview: (company1.description || '').slice(0, 160),
    highlights: company1.highlights,
  },
  second: {
    cacheHit: company2.cacheHit,
    cacheKey: company2.cacheKey,
    descriptionSame: company2.description === company1.description,
  },
  mongo: {
    hitCount: cacheDoc?.hitCount,
    researchedAt: cacheDoc?.researchedAt,
  },
});

console.log('\n=== 3) Builder Exa fingerprint — first deep research then second (skip Exa) ===');
const projects: any[] = [];
const fp = buildBuilderExaFingerprint(builder, projects);
const research1 = await deepResearchBuilder({
  builder,
  projects,
  forceExa: true,
});
builder = await BuilderProfile.findById(builder!._id);
const research2 = await deepResearchBuilder({
  builder,
  projects,
});
console.log({
  fingerprint: fp.hash,
  storedFingerprint: builder?.enrichmentInsights?.exaResearch?.fingerprint || null,
  first: {
    exaSkipped: research1.exaSkipped,
    providers: research1.searchProviders,
    citations: research1.citations.length,
    summaryPreview: (research1.summary || '').slice(0, 180),
    proofPoints: research1.proofPoints.slice(0, 3),
  },
  second: {
    exaSkipped: research2.exaSkipped,
    providers: research2.searchProviders,
    citations: research2.citations.length,
    summaryPreview: (research2.summary || '').slice(0, 180),
  },
  exaResearchMeta: builder?.enrichmentInsights?.exaResearch || null,
});

console.log('\n=== DONE ===');
await mongoose.disconnect();
process.exit(0);
