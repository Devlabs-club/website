/**
 * Re-run enrichment on the last 10 builders in the remaining pool and compare
 * against current MongoDB state to verify prior queue runs were complete/idempotent.
 *
 *   bun run scripts/verify-enrichment-last10.ts
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import { listRemainingBuilderIds } from './lib/enrichment-queue-targets';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.dev.vars'), override: true });

type Snapshot = {
  headline: string | null;
  bio: string | null;
  rolePreference: string[];
  universityOrCompany: string | null;
  graduationYear: number | null;
  links: Record<string, string | null>;
  projectCount: number;
  projectFingerprint: string;
  updatedAt: string | null;
};

function normalizeLinks(links: Record<string, unknown> | undefined | null) {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(links || {})) {
    out[k] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return out;
}

async function snapshotBuilder(builderId: string): Promise<Snapshot> {
  const builder = await BuilderProfile.findById(builderId).lean();
  if (!builder) throw new Error(`Missing builder ${builderId}`);

  const projects = await ProjectRecord.find({ builderId })
    .select('projectName description techStack builderContribution links source sourceId')
    .sort({ projectName: 1 })
    .lean();

  const fingerprint = projects.map((p) =>
    JSON.stringify({
      name: p.projectName,
      desc: p.description,
      stack: p.techStack,
      contrib: p.builderContribution,
      links: p.links,
      source: p.source,
      sourceId: p.sourceId,
    })
  );

  return {
    headline: builder.headline?.trim() || null,
    bio: builder.bio?.trim() || null,
    rolePreference: [...(builder.rolePreference || [])].map(String).sort(),
    universityOrCompany: builder.universityOrCompany?.trim() || null,
    graduationYear: builder.graduationYear ?? null,
    links: normalizeLinks(builder.links as Record<string, unknown>),
    projectCount: projects.length,
    projectFingerprint: fingerprint.join('|'),
    updatedAt: builder.updatedAt ? new Date(builder.updatedAt).toISOString() : null,
  };
}

function diffSnapshots(before: Snapshot, after: Snapshot) {
  const changed: string[] = [];
  const fields: (keyof Snapshot)[] = [
    'headline',
    'bio',
    'rolePreference',
    'universityOrCompany',
    'graduationYear',
    'links',
    'projectCount',
    'projectFingerprint',
  ];

  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    const same =
      field === 'rolePreference' || field === 'links'
        ? JSON.stringify(a) === JSON.stringify(b)
        : a === b;
    if (!same) changed.push(field);
  }

  return changed;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const { connectDB } = await import('../src/lib/mongodb');
  const { enrichBuilderProfile } = await import('../src/lib/talent/builderEnrichment');
  await connectDB();

  const remaining = await listRemainingBuilderIds({ rootDir: join(__dirname, '..') });
  const last10 = remaining.slice(-10);

  console.log(`[verify] re-enriching last ${last10.length} of ${remaining.length} remaining builders\n`);

  const results: Array<{
    id: string;
    name: string;
    email: string;
    match: boolean;
    changedFields: string[];
    enrichResult: {
      projectsCreated: number;
      projectsUpdated: number;
      profileFieldsUpdated: string[];
      sourceErrors: string[];
    };
    before: Snapshot;
    after: Snapshot;
  }> = [];

  for (const target of last10) {
    const before = await snapshotBuilder(target.id);
    const enrich = await enrichBuilderProfile({
      builderId: target.id,
      sources: ['resume', 'github', 'devpost', 'linkedin', 'portfolio'],
      dryRun: false,
    });
    const after = await snapshotBuilder(target.id);
    const changedFields = diffSnapshots(before, after);

    results.push({
      id: target.id,
      name: target.name,
      email: target.email,
      match: changedFields.length === 0,
      changedFields,
      enrichResult: {
        projectsCreated: enrich.projectsCreated,
        projectsUpdated: enrich.projectsUpdated,
        profileFieldsUpdated: enrich.profileFieldsUpdated,
        sourceErrors: enrich.sources.flatMap((s) => s.errors || []),
      },
      before,
      after,
    });
  }

  const matched = results.filter((r) => r.match).length;
  console.log(`\n=== Summary: ${matched}/${results.length} unchanged after re-enrichment ===\n`);

  for (const r of results) {
    console.log(`${r.match ? '✓' : '✗'} ${r.name} <${r.email}>`);
    console.log(`  id: ${r.id}`);
    if (!r.match) {
      console.log(`  changed: ${r.changedFields.join(', ')}`);
    }
    console.log(
      `  enrich run: projects +${r.enrichResult.projectsCreated}/~${r.enrichResult.projectsUpdated}, fields=${r.enrichResult.profileFieldsUpdated.join(',') || 'none'}`
    );
    if (r.enrichResult.sourceErrors.length) {
      console.log(`  source errors: ${r.enrichResult.sourceErrors.slice(0, 3).join(' | ')}`);
    }
    console.log(
      `  snapshot: headline=${Boolean(r.before.headline)} bio=${Boolean(r.before.bio)} skills=${r.before.rolePreference.length} projects=${r.before.projectCount}`
    );
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
