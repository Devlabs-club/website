#!/usr/bin/env tsx
/**
 * Persist a fresh Hardware Engineer shortlist using evidence-dossier ranking.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import Opportunity from '../src/models/talent/Opportunity';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import { retrieveRoleShapedBuilderPool } from '../src/lib/talent/roleShapedRetrieval';
import { runFounderDiscoveryPipeline } from '../src/lib/talent/discovery/index';
import { persistDiscoveryCandidates } from '../src/lib/talent/founderSearchPersist';

const JOB_ID = '6a62994276816a0b6bea2b06';

async function main() {
  await connectAdminDB();
  const opportunity = await Opportunity.findById(JOB_ID).lean();
  if (!opportunity) throw new Error('opportunity not found');

  const founderId = String((opportunity as any).founderId || '6a4ecd396e030074900c1d33');
  const founderEmail = String((opportunity as any).founderEmail || 'dkalaise@asu.edu');
  const pool = await retrieveRoleShapedBuilderPool({
    opportunity,
    founderId,
    profileLimit: 80,
    BuilderProfile,
    ProjectRecord,
  });

  const result = await runFounderDiscoveryPipeline({
    opportunity,
    founderId,
    builders: pool.builders,
    projectsByBuilder: pool.projectsByBuilder,
    enableLlmRerank: false,
    skipSemanticScoring: true,
    limit: 12,
  });

  await persistDiscoveryCandidates({
    result,
    opportunityId: JOB_ID,
    opportunity,
    founderEmail,
    unlockShortlist: true,
  });

  console.log(
    result.candidates.map((candidate, index) => ({
      rank: index + 1,
      name: candidate.builder?.name,
      why: candidate.explanation.whyTheyMatch,
      evidenceFit: candidate.evidenceDossier?.evidenceFit,
    }))
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
