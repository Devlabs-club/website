/**
 * Re-run talent discovery for a founder job (local admin/debug).
 *   npx tsx scripts/rerun-job-search.ts <jobId> [founderEmail]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import JobPosting from '../src/models/founder/JobPosting';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import { buildSearchStrategy } from '../src/lib/talent/discovery/strategy';
import { runFounderDiscoveryPipeline } from '../src/lib/talent/discovery/index';
import { searchTalentSearchIndex } from '../src/lib/talent/searchIndex';
import { persistDiscoveryCandidates } from '../src/lib/talent/founderSearchPersist';
import { getFounderEntitlements } from '../src/lib/billing/entitlements';

async function main() {
  const jobId = process.argv[2];
  const founderEmail = process.argv[3] || 'dkalaise@asu.edu';
  if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
    console.error('Usage: npx tsx scripts/rerun-job-search.ts <jobId> [founderEmail]');
    process.exit(1);
  }

  await connectAdminDB();
  const job = await JobPosting.findById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (String(job.founderEmail).toLowerCase() !== founderEmail.toLowerCase()) {
    throw new Error(`Job founder mismatch: ${job.founderEmail}`);
  }

  const user = await mongoose.connection.db!.collection('users').findOne({ email: founderEmail.toLowerCase() });
  if (!user?._id) throw new Error(`Founder user not found: ${founderEmail}`);

  const identity = { founderId: String(user._id), email: founderEmail, name: user.name };
  const { entitlements } = await getFounderEntitlements(identity as any);
  const oppPlain = job.toObject();
  const strategy = buildSearchStrategy({
    opportunity: oppPlain,
    founderId: identity.founderId,
    searchMode: 'balanced',
  });

  const indexTerms = [
    strategy.primaryQuery,
    ...strategy.expandedQueries,
    ...(oppPlain.searchRequirements || []).map((r: any) => r.text),
    ...(oppPlain.matchingSkills || []),
  ];

  const indexResult = await searchTalentSearchIndex({ terms: indexTerms, limit: 80 });
  let builders = indexResult.builders;
  let projectsByBuilder = indexResult.projectsByBuilder;

  if (!builders.length) {
    builders = await BuilderProfile.find({
      verificationStatus: { $ne: 'rejected' },
      visibilityStatus: { $ne: 'hidden' },
    })
      .limit(350)
      .lean();
    const builderIds = builders.map((b: any) => b._id);
    const projects = builderIds.length
      ? await ProjectRecord.find({ builderId: { $in: builderIds } }).limit(1200).lean()
      : [];
    projectsByBuilder = new Map<string, any[]>();
    for (const project of projects) {
      const key = String(project.builderId);
      if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
      projectsByBuilder.get(key)!.push(project);
    }
  }

  const result = await runFounderDiscoveryPipeline({
    opportunity: oppPlain,
    founderId: identity.founderId,
    builders,
    projectsByBuilder,
    searchMode: 'balanced',
    limit: entitlements.profileLimitPerRole ?? 50,
  });

  const limitedCandidates = result.candidates.slice(0, entitlements.profileLimitPerRole ?? 5);
  const limitedResult = { ...result, candidates: limitedCandidates };

  await persistDiscoveryCandidates({
    result: limitedResult,
    opportunityId: String(job._id),
    founderEmail,
    entitlements,
  });

  job.status = 'shortlisted';
  job.lastSearchAt = new Date();
  await job.save();

  console.log(
    'Top matches:',
    limitedCandidates.map((c) => ({
      builderId: c.builderId,
      name: c.builder?.name,
      score: Math.round(c.overallFit * 100),
      label: c.matchLabel,
    }))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
