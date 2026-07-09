/**
 * Create a vague founder-style role and run discovery end-to-end.
 *   npx tsx scripts/test-vague-job-search.ts [founderEmail]
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const VAGUE_JOB = {
  roleTitle: 'Early engineer to help ship our product',
  company: 'Stealth startup',
  description:
    'We are early and moving fast. Need someone technical who can figure things out, write code, talk to users sometimes, and help us get something real out the door. Does not need to be perfect.',
  builderWillDo: 'Build features, fix bugs, help us launch v1',
  skillsNeeded: ['React', 'coding'],
  requirements: ['Comfortable working in a small team', 'Can ship without a lot of hand-holding'],
};

function log(msg: string, t0: number) {
  process.stdout.write(`[${Date.now() - t0}ms] ${msg}\n`);
}

async function withTimeout<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function main() {
  const t0 = Date.now();
  const founderEmail = (process.argv[2] || 'dkalaise@asu.edu').toLowerCase();
  log('starting', t0);

  const uri = process.env.ADMIN_MONGO_URI;
  if (!uri) throw new Error('ADMIN_MONGO_URI not set');

  await withTimeout('mongo connect', 20000, () =>
    mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, bufferCommands: false })
  );
  log('mongo connected', t0);

  log('loading modules', t0);
  const [
    { default: JobPosting },
    { default: BuilderProfile },
    { default: ProjectRecord },
    { shapeJobForTalentPool },
    { buildSearchStrategy },
    { runFounderDiscoveryPipeline },
    { retrieveRoleShapedBuilderPool },
    { buildRoleSkillTiers, collectBuilderSkillTokens, matchedSkills },
    { getFounderEntitlements },
  ] = await withTimeout('module import', 60000, async () =>
    Promise.all([
      import('../src/models/founder/JobPosting'),
      import('../src/models/talent/BuilderProfile'),
      import('../src/models/talent/ProjectRecord'),
      import('../src/lib/founderAgent/jobShaping'),
      import('../src/lib/talent/discovery/strategy'),
      import('../src/lib/talent/discovery/index'),
      import('../src/lib/talent/roleShapedRetrieval'),
      import('../src/lib/talent/discovery/roleSkillTiers'),
      import('../src/lib/billing/entitlements'),
    ])
  );
  log('modules loaded', t0);

  const user = await mongoose.connection.db!.collection('users').findOne({ email: founderEmail });
  if (!user?._id) throw new Error(`Founder not found: ${founderEmail}`);

  const identity = { founderId: String(user._id), email: founderEmail, name: user.name };
  const { entitlements } = await getFounderEntitlements(identity as any);
  const profileLimit = entitlements.profileLimitPerRole ?? 5;
  log(`founder ok, limit=${profileLimit}`, t0);

  const job = await JobPosting.create({
    founderId: identity.founderId,
    founderEmail,
    founderName: user.name,
    ...VAGUE_JOB,
    status: 'draft',
    planAtCreation: entitlements.plan,
    profileLimitApplied: profileLimit,
  });
  log(`job created ${job._id}`, t0);

  const shaped = await shapeJobForTalentPool({
    title: VAGUE_JOB.roleTitle,
    description: VAGUE_JOB.description,
    builderWillDo: VAGUE_JOB.builderWillDo,
    skillsNeeded: VAGUE_JOB.skillsNeeded,
    requirements: VAGUE_JOB.requirements,
    companyContext: VAGUE_JOB.company,
  });
  log('job shaped', t0);

  const oppPlain = {
    ...job.toObject(),
    originalSkillsNeeded: shaped.originalSkillsNeeded,
    skillsNeeded: shaped.skillsNeeded,
    niceToHaveSkills: shaped.niceToHaveSkills,
    matchingSkills: shaped.matchingSkills,
    poolFitMetadata: shaped.poolFitMetadata,
  };

  const strategy = buildSearchStrategy({
    opportunity: oppPlain,
    founderId: identity.founderId,
    searchMode: 'balanced',
  });

  const { builders, projectsByBuilder } = await retrieveRoleShapedBuilderPool({
    opportunity: oppPlain,
    founderId: identity.founderId,
    profileLimit,
    BuilderProfile,
    ProjectRecord,
  });
  log(`pool retrieved (${builders.length} builders)`, t0);

  const result = await runFounderDiscoveryPipeline({
    opportunity: oppPlain,
    founderId: identity.founderId,
    builders,
    projectsByBuilder,
    searchMode: 'balanced',
    skipSemanticScoring: true,
    limit: profileLimit,
  });
  log(`ranked ${result.candidates.length}`, t0);

  const tiers = buildRoleSkillTiers(oppPlain);
  const output = {
    jobId: String(job._id),
    input: VAGUE_JOB,
    shaped: {
      skillsNeeded: shaped.skillsNeeded,
      niceToHaveSkills: shaped.niceToHaveSkills,
      originalSkillsNeeded: shaped.originalSkillsNeeded,
      poolConfidence: shaped.poolFitMetadata.confidence,
    },
    strategy: {
      domain: strategy.roleSkillTiers.domain,
      primarySkills: strategy.roleSkillTiers.primarySkills.slice(0, 8),
      primaryQuery: strategy.primaryQuery,
    },
    poolScanned: result.totalScanned,
    durationMs: Date.now() - t0,
    recommendations: result.candidates.slice(0, profileLimit).map((c) => {
      const projects = c.projects || [];
      const domainMatched = matchedSkills(
        tiers.primarySkills,
        collectBuilderSkillTokens(c.builder, projects)
      );
      const topProject = projects[0];
      return {
        name: c.builder?.name,
        headline: c.builder?.headline,
        matchScore: Math.round(c.overallFit * 100),
        matchLabel: c.matchLabel,
        domainSkillsMatched: domainMatched.slice(0, 5),
        rolePreferences: (c.builder?.rolePreference || []).slice(0, 6),
        proofProject: topProject?.projectName || null,
        proofStack: (topProject?.techStack || []).slice(0, 5),
        availableNow: Boolean(c.builder?.availability?.availableNow),
        whyTheyMatch: c.explanation.strongestSignals.slice(0, 2).join(' · '),
        skillFit: Number(c.components.deterministicSkillFit.toFixed(2)),
        proofStrength: Number(c.components.proofStrength.toFixed(2)),
      };
    }),
  };

  console.log('\n=== VAGUE JOB SEARCH RESULT ===\n');
  console.log(JSON.stringify(output, null, 2));

  job.status = 'shortlisted';
  job.lastSearchAt = new Date();
  job.skillsNeeded = shaped.skillsNeeded;
  job.matchingSkills = shaped.matchingSkills;
  job.originalSkillsNeeded = shaped.originalSkillsNeeded;
  await job.save();
  log('done', t0);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
