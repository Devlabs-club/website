#!/usr/bin/env tsx
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import { upsertTalentSearchIndexForBuilder } from '../src/lib/talent/searchIndex';
import { evaluateFounderRequirement, collectBuilderSearchProfile } from '../src/lib/talent/searchTokens';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import TalentSearchKey from '../src/models/talent/TalentSearchKey';
import JobPosting from '../src/models/founder/JobPosting';
import { runFounderDiscoveryPipeline } from '../src/lib/talent/discovery/index';
import { buildSearchStrategy } from '../src/lib/talent/discovery/strategy';
import { retrieveRoleShapedBuilderPool } from '../src/lib/talent/roleShapedRetrieval';
import { getFounderEntitlements } from '../src/lib/billing/entitlements';

const BUILDER_ID = process.argv[2] || '6a4ebd616e030074900c1b07';
const JOB_ID = process.argv[3] || '6a4ef65c05bfa88f3f29610b';
const FOUNDER_EMAIL = process.argv[4] || 'dkalaise@asu.edu';

async function main() {
  await connectAdminDB();

  const builder = await BuilderProfile.findById(BUILDER_ID).lean();
  const projects = await ProjectRecord.find({ builderId: BUILDER_ID }).lean();
  const job = await JobPosting.findById(JOB_ID).lean();
  if (!builder || !job) throw new Error('builder or job not found');

  await upsertTalentSearchIndexForBuilder(BUILDER_ID);

  const googleKeys = await TalentSearchKey.find({ builderId: BUILDER_ID, term: /google/ }).lean();
  const profile = collectBuilderSearchProfile(builder, projects);
  const req = evaluateFounderRequirement('worked at Google', builder, projects);

  console.log('--- quick verify ---');
  console.log('google keys:', googleKeys.map((k) => k.term));
  console.log('profile companies:', profile.experienceCompanies);
  console.log('skills:', profile.skills.slice(0, 8));
  console.log('bio keywords:', profile.bioKeywords);
  console.log('enrichment:', profile.enrichmentTitles);
  console.log('requirement worked at Google:', req);

  const user = await mongoose.connection.db!.collection('users').findOne({ email: FOUNDER_EMAIL.toLowerCase() });
  if (!user?._id) throw new Error(`Founder not found: ${FOUNDER_EMAIL}`);

  const { entitlements } = await getFounderEntitlements({
    founderId: String(user._id),
    email: FOUNDER_EMAIL,
    name: user.name,
  } as any);

  const strategy = buildSearchStrategy(job);
  const pool = await retrieveRoleShapedBuilderPool({
    opportunity: job,
    strategy,
    profileLimit: entitlements.profileLimit,
  });
  const discovery = await runFounderDiscoveryPipeline({
    opportunity: job,
    strategy,
    builders: pool.builders,
    projectsByBuilder: pool.projectsByBuilder,
    entitlements,
  });

  const rank = discovery.candidates.findIndex((c) => String(c.builderId) === BUILDER_ID);
  const hit = rank >= 0 ? discovery.candidates[rank] : null;
  console.log('shortlist rank:', rank >= 0 ? rank + 1 : 'not ranked', 'of', discovery.candidates.length);
  if (hit) {
    console.log('score:', hit.overallFit, 'founderPref:', hit.components.founderPreferenceFit);
    console.log('requirement findings:', hit.explanation.requirementFindings);
  }
  console.log(
    'top 3:',
    discovery.candidates.slice(0, 3).map((c) => ({
      id: c.builderId,
      fit: c.overallFit,
      pref: c.components.founderPreferenceFit,
    }))
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
