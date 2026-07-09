/**
 * Medium-specificity founder job search test.
 *   bun run scripts/test-medium-job-search.ts [founderEmail]
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MEDIUM_JOB = {
  roleTitle: 'Full-stack engineer for our fintech MVP',
  company: 'Payflow',
  description:
    'We are building a B2B payments dashboard for small businesses. Need someone who can own the web app — user auth, a clean dashboard, and hooking up Stripe. Some backend API work too. React experience is important.',
  builderWillDo:
    'Build the founder dashboard, set up auth, integrate Stripe payments, and help us ship a beta in the next couple months',
  skillsNeeded: ['React', 'Node.js', 'TypeScript', 'Stripe'],
  requirements: [
    'Has shipped at least one real web app before',
    'Comfortable with APIs and databases',
    'Can work independently on features end-to-end',
  ],
  workMode: 'Remote',
  jobType: 'Contract',
};

function log(msg: string, t0: number) {
  process.stdout.write(`[${Date.now() - t0}ms] ${msg}\n`);
}

async function main() {
  const t0 = Date.now();
  const founderEmail = (process.argv[2] || 'dkalaise@asu.edu').toLowerCase();
  log('starting', t0);

  const uri = process.env.ADMIN_MONGO_URI;
  if (!uri) throw new Error('ADMIN_MONGO_URI not set');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, bufferCommands: false });
  log('mongo connected', t0);

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
  ] = await Promise.all([
    import('../src/models/founder/JobPosting'),
    import('../src/models/talent/BuilderProfile'),
    import('../src/models/talent/ProjectRecord'),
    import('../src/lib/founderAgent/jobShaping'),
    import('../src/lib/talent/discovery/strategy'),
    import('../src/lib/talent/discovery/index'),
    import('../src/lib/talent/roleShapedRetrieval'),
    import('../src/lib/talent/discovery/roleSkillTiers'),
    import('../src/lib/billing/entitlements'),
  ]);
  log('modules loaded', t0);

  const user = await mongoose.connection.db!.collection('users').findOne({ email: founderEmail });
  if (!user?._id) throw new Error(`Founder not found: ${founderEmail}`);

  const identity = { founderId: String(user._id), email: founderEmail, name: user.name };
  const { entitlements } = await getFounderEntitlements(identity as any);
  const profileLimit = Math.min(entitlements.profileLimitPerRole ?? 5, 10);

  const job = await JobPosting.create({
    founderId: identity.founderId,
    founderEmail,
    founderName: user.name,
    ...MEDIUM_JOB,
    status: 'draft',
    planAtCreation: entitlements.plan,
    profileLimitApplied: profileLimit,
  });
  log(`job created ${job._id}`, t0);

  const shaped = await shapeJobForTalentPool({
    title: MEDIUM_JOB.roleTitle,
    description: MEDIUM_JOB.description,
    builderWillDo: MEDIUM_JOB.builderWillDo,
    skillsNeeded: MEDIUM_JOB.skillsNeeded,
    requirements: MEDIUM_JOB.requirements,
    companyContext: `${MEDIUM_JOB.company} fintech payments`,
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
    input: MEDIUM_JOB,
    shaped: {
      skillsNeeded: shaped.skillsNeeded,
      niceToHaveSkills: shaped.niceToHaveSkills,
      originalSkillsNeeded: shaped.originalSkillsNeeded,
      poolConfidence: shaped.poolFitMetadata.confidence,
    },
    strategy: {
      domain: strategy.roleSkillTiers.domain,
      primarySkills: strategy.roleSkillTiers.primarySkills.slice(0, 10),
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
        domainSkillsMatched: domainMatched.slice(0, 6),
        rolePreferences: (c.builder?.rolePreference || []).slice(0, 6),
        proofProject: topProject?.projectName || null,
        proofStack: (topProject?.techStack || []).slice(0, 6),
        availableNow: Boolean(c.builder?.availability?.availableNow),
        whyTheyMatch: c.explanation.strongestSignals.slice(0, 2).join(' · '),
        skillFit: Number(c.components.deterministicSkillFit.toFixed(2)),
        proofStrength: Number(c.components.proofStrength.toFixed(2)),
      };
    }),
  };

  console.log('\n=== MEDIUM-SPECIFIC JOB SEARCH RESULT ===\n');
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
