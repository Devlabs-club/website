#!/usr/bin/env tsx
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import JobPosting from '../src/models/founder/JobPosting';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import { buildSearchStrategy } from '../src/lib/talent/discovery/strategy';
import { runFounderDiscoveryPipeline } from '../src/lib/talent/discovery/index';
import { retrieveRoleShapedBuilderPool } from '../src/lib/talent/roleShapedRetrieval';
import { getFounderEntitlements } from '../src/lib/billing/entitlements';

const JOB_ID = '6a4ef65c05bfa88f3f29610b';
const DHANUSH_EMAIL = 'dhanush.kalaiselvan@gmail.com';

async function main() {
  await connectAdminDB();
  const job = await JobPosting.findById(JOB_ID).lean();
  if (!job) throw new Error('job not found');

  const dhanush = await BuilderProfile.findOne({ email: DHANUSH_EMAIL }).lean();
  if (!dhanush) throw new Error('dhanush not found');

  const founderEmail = String(job.founderEmail);
  const user = await mongoose.connection.db!.collection('users').findOne({ email: founderEmail.toLowerCase() });
  const identity = { founderId: String(user?._id), email: founderEmail, name: user?.name };
  const { entitlements } = await getFounderEntitlements(identity as any);

  const strategy = buildSearchStrategy({
    opportunity: job,
    founderId: identity.founderId,
    searchMode: 'balanced',
  });

  const pool = await retrieveRoleShapedBuilderPool({
    opportunity: job,
    founderId: identity.founderId,
    profileLimit: 20,
    BuilderProfile,
    ProjectRecord,
  });

  const inPool = pool.builders.some((b: any) => String(b._id) === String(dhanush._id));
  console.log('Dhanush in retrieval pool:', inPool, 'pool size:', pool.builders.length);

  const result = await runFounderDiscoveryPipeline({
    opportunity: job,
    founderId: identity.founderId,
    builders: pool.builders,
    projectsByBuilder: pool.projectsByBuilder,
    searchMode: 'balanced',
    skipSemanticScoring: true,
    limit: pool.builders.length,
  });

  const dhanushId = String(dhanush._id);
  const rank = result.candidates.findIndex((c) => c.builderId === dhanushId);
  const hit = rank >= 0 ? result.candidates[rank] : null;

  console.log('Rank:', rank >= 0 ? rank + 1 : 'NOT RANKED', '/', result.candidates.length);
  if (hit) {
    console.log('Score:', hit.overallFit, 'label:', hit.matchLabel);
    console.log('Components:', hit.components);
    console.log('Requirements:', hit.explanation.requirementFindings);
  }

  console.log(
    'Top 5:',
    result.candidates.slice(0, 5).map((c, i) => ({
      rank: i + 1,
      name: c.builder?.name,
      id: c.builderId,
      score: Number(c.overallFit.toFixed(3)),
      pref: Number(c.components.founderPreferenceFit.toFixed(3)),
      skills: Number(c.components.deterministicSkillFit.toFixed(3)),
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
