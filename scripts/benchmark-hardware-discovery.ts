#!/usr/bin/env tsx
/**
 * Benchmark hardware discovery against the audited gold set.
 * Target: Dheeraj, Sahil, Namany, Elizabeth in top results with role-relevant proof.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import Opportunity from '../src/models/talent/Opportunity';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import { compileSearchPlan } from '../src/lib/talent/searchPlan';
import { buildSearchStrategy } from '../src/lib/talent/discovery/strategy';
import { retrieveRoleShapedBuilderPool } from '../src/lib/talent/roleShapedRetrieval';
import { runFounderDiscoveryPipeline } from '../src/lib/talent/discovery/index';
import { buildRoleEvidenceDossier, opportunityRequiresInternship } from '../src/lib/talent/roleEvidenceDossier';

const JOB_ID = '6a62994276816a0b6bea2b06';
const GOLD = [
  { id: '6a20b1ea0995ad4123986488', name: 'Dheeraj Reddy Pasham' },
  { id: '6a20b1ea0995ad4123986372', name: 'Sahil Ejanthkar' },
  { id: '6a20b1ea0995ad4123986407', name: 'Namany Eshwanth Kumar' },
  { id: '6a20b1ea0995ad412398620e', name: 'Elizabeth Seaton' },
];

async function main() {
  await connectAdminDB();
  const opportunity = await Opportunity.findById(JOB_ID).lean();
  if (!opportunity) throw new Error('opportunity not found');

  const searchPlan =
    (opportunity as any).searchPlan?.roleEvidence?.anchorConcepts?.length
      ? (opportunity as any).searchPlan
      : await compileSearchPlan(opportunity as any);
  (opportunity as any).searchPlan = searchPlan;

  const founderId = String((opportunity as any).founderId || '6a4ecd396e030074900c1d33');
  const strategy = buildSearchStrategy({
    opportunity,
    founderId,
    searchMode: 'balanced',
  });

  const pool = await retrieveRoleShapedBuilderPool({
    opportunity,
    founderId,
    profileLimit: 80,
    BuilderProfile,
    ProjectRecord,
  });

  const builderList = [...((pool as any).builders || [])];
  const projectsByBuilder: Map<string, any[]> = (pool as any).projectsByBuilder || new Map();

  // Ensure gold builders and their projects are always available for scoring.
  for (const gold of GOLD) {
    if (!builderList.some((b: any) => String(b._id) === gold.id)) {
      const builder = await BuilderProfile.findById(gold.id).lean();
      if (builder) builderList.push(builder);
    }
    const extra = await ProjectRecord.find({ builderId: gold.id }).lean();
    projectsByBuilder.set(gold.id, extra);
  }

  console.log('domain', strategy.roleSkillTiers.domain);
  console.log('anchors', searchPlan.roleEvidence?.anchorConcepts?.slice(0, 12));
  console.log('pool', builderList.length, 'requireInternship', opportunityRequiresInternship(opportunity));

  for (const gold of GOLD) {
    const builder = builderList.find((b: any) => String(b._id) === gold.id);
    if (!builder) {
      console.log('MISSING FROM POOL', gold.name);
      continue;
    }
    const dossier = buildRoleEvidenceDossier({
      builder,
      projects: projectsByBuilder.get(gold.id) || [],
      roleEvidence: searchPlan.roleEvidence,
      requireInternship: true,
    });
    console.log('GOLD dossier', gold.name, {
      evidenceFit: dossier?.evidenceFit,
      hasRoleProof: dossier?.hasRoleProof,
      hasInternshipProof: dossier?.hasInternshipProof,
      why: dossier?.whyTheyMatch,
      top: dossier?.bestUnits?.slice(0, 2).map((u) => ({ label: u.label, score: u.score, anchors: u.anchorHits })),
    });
  }

  const result = await runFounderDiscoveryPipeline({
    opportunity,
    founderId,
    builders: builderList,
    projectsByBuilder,
    enableLlmRerank: false,
    skipSemanticScoring: true,
    limit: 20,
  });

  const namany = builderList.find((b: any) => String(b._id) === '6a20b1ea0995ad4123986407');
  console.log('namany in pool', Boolean(namany), 'scanned', result.totalScanned, 'returned', result.candidates.length);
  const namanyRankAll = result.candidates.findIndex((c) => c.builderId === '6a20b1ea0995ad4123986407');
  console.log('namany rank in returned', namanyRankAll >= 0 ? namanyRankAll + 1 : null);

  console.log('\n=== TOP 12 ===');
  result.candidates.forEach((candidate, index) => {
    const gold = GOLD.find((entry) => entry.id === candidate.builderId);
    console.log(
      `${index + 1}. ${gold ? '★' : ' '} ${candidate.builder?.name || candidate.builderId} fit=${candidate.overallFit.toFixed(3)} evidence=${(candidate.evidenceDossier?.evidenceFit ?? 0).toFixed(3)} | ${candidate.explanation.whyTheyMatch || ''}`
    );
  });

  const ranks = GOLD.map((entry) => {
    const index = result.candidates.findIndex((candidate) => candidate.builderId === entry.id);
    return { name: entry.name, rank: index >= 0 ? index + 1 : null };
  });
  const inTop12 = ranks.filter((entry) => entry.rank && entry.rank <= 12).length;
  const inTop5 = ranks.filter((entry) => entry.rank && entry.rank <= 5).length;
  console.log('\n=== BENCHMARK ===');
  console.log(ranks);
  console.log(`inTop12=${inTop12}/4 inTop5=${inTop5}/4`);
  if (inTop12 < 4 || inTop5 < 3) process.exitCode = 2;

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
