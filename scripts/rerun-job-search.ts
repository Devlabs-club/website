/**
 * Re-run talent discovery for a founder job (local admin/debug).
 *   npx tsx scripts/rerun-job-search.ts <jobId> [founderEmail]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import JobPosting from '../src/models/founder/JobPosting';
import { buildSearchStrategy } from '../src/lib/talent/discovery/strategy';
import { runFounderDiscoveryPipeline } from '../src/lib/talent/discovery/index';
import { persistDiscoveryCandidates } from '../src/lib/talent/founderSearchPersist';
import { getFounderEntitlements } from '../src/lib/billing/entitlements';
import { shapeJobForTalentPool } from '../src/lib/founderAgent/jobShaping';
import { retrieveRoleShapedBuilderPool } from '../src/lib/talent/roleShapedRetrieval';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';

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

  const shaped = await shapeJobForTalentPool({
    title: oppPlain.title || oppPlain.roleTitle,
    description: oppPlain.description,
    builderWillDo: oppPlain.builderWillDo,
    skillsNeeded: oppPlain.skillsNeeded,
    niceToHaveSkills: oppPlain.niceToHaveSkills,
    requirements: [...(oppPlain.requirements || [])],
    responsibilities: oppPlain.responsibilities || oppPlain.deliverables,
    companyContext: [oppPlain.company, oppPlain.industry].filter(Boolean).join(' '),
  });

  Object.assign(job, {
    originalSkillsNeeded: shaped.originalSkillsNeeded,
    skillsNeeded: shaped.skillsNeeded,
    niceToHaveSkills: shaped.niceToHaveSkills,
    matchingSkills: shaped.matchingSkills,
    poolFitMetadata: shaped.poolFitMetadata,
  });
  Object.assign(oppPlain, {
    originalSkillsNeeded: shaped.originalSkillsNeeded,
    skillsNeeded: shaped.skillsNeeded,
    niceToHaveSkills: shaped.niceToHaveSkills,
    matchingSkills: shaped.matchingSkills,
    poolFitMetadata: shaped.poolFitMetadata,
  });

  const profileLimit = oppPlain.profileLimitApplied ?? entitlements.profileLimitPerRole ?? 5;
  const strategy = buildSearchStrategy({
    opportunity: oppPlain,
    founderId: identity.founderId,
    searchMode: 'balanced',
  });

  console.log('Role domain strategy:', {
    primaryQuery: strategy.primaryQuery,
    roleSkillTiers: strategy.roleSkillTiers,
    skillsNeeded: oppPlain.skillsNeeded,
    originalSkillsNeeded: oppPlain.originalSkillsNeeded,
  });

  const { builders, projectsByBuilder } = await retrieveRoleShapedBuilderPool({
    opportunity: oppPlain,
    founderId: identity.founderId,
    profileLimit,
    BuilderProfile,
    ProjectRecord,
  });

  const result = await runFounderDiscoveryPipeline({
    opportunity: oppPlain,
    founderId: identity.founderId,
    builders,
    projectsByBuilder,
    searchMode: 'balanced',
    skipSemanticScoring: true,
    limit: profileLimit,
  });

  const limitedCandidates = result.candidates.slice(0, profileLimit);
  const limitedResult = { ...result, candidates: limitedCandidates };

  await persistDiscoveryCandidates({
    result: limitedResult,
    opportunityId: String(job._id),
    opportunity: oppPlain,
    founderEmail,
    entitlements,
  });

  job.status = 'shortlisted';
  job.lastSearchAt = new Date();
  job.profileLimitApplied = profileLimit;
  await job.save();

  console.log(
    'Top matches:',
    limitedCandidates.map((c) => ({
      builderId: c.builderId,
      name: c.builder?.name,
      score: Math.round(c.overallFit * 100),
      label: c.matchLabel,
      skillFit: Number(c.components.deterministicSkillFit.toFixed(3)),
      proof: Number(c.components.proofStrength.toFixed(3)),
      rolePrefs: (c.builder?.rolePreference || []).slice(0, 5),
    }))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
