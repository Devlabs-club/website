/**
 * Backfill builderProfiles from Momentum applications (bio, links, startup project).
 *
 *   bun run backfill:momentum
 *   bun run scripts/backfill-from-momentum.ts -- --dry-run --limit 5
 *   bun run scripts/backfill-from-momentum.ts -- --all
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import { connectMomentumDB } from '../src/lib/mongodb';
import { getMomentumApplicationModel } from '../src/models/momentumApplication';
import {
  profileDraftFromMomentumApplication,
  projectDraftFromMomentumApplication,
} from '../src/lib/talent/momentumProfileBackfill';
import { applyProfileDraft, refreshBuilderScores, upsertEnrichedProjects } from '../src/lib/talent/builderEnrichment/apply';
import { recomputeAndStore } from '../src/lib/talent/talentDatabaseStats';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.dev.vars'), override: true });

function parseArgs(argv: string[]) {
  const limitIdx = argv.indexOf('--limit');
  return {
    all: argv.includes('--all'),
    dryRun: argv.includes('--dry-run'),
    limit: limitIdx >= 0 ? Number(argv[limitIdx + 1] || 10) : 10,
  };
}

function normEmail(email: string | null | undefined): string {
  return String(email || '').toLowerCase().trim();
}

async function main() {
  const { all, dryRun, limit } = parseArgs(process.argv.slice(2));
  await mongoose.connect(process.env.MONGODB_URI!);
  const momentumConn = await connectMomentumDB();
  const MomentumApplication = getMomentumApplicationModel(momentumConn);

  const applications = await MomentumApplication.find({}).lean();
  const builders = await BuilderProfile.find({ verificationStatus: { $ne: 'rejected' } })
    .select('_id name email headline bio rolePreference links')
    .lean();

  const builderByEmail = new Map(builders.map((b) => [normEmail(b.email), b]));
  const targets = applications
    .map((app) => ({ app, builder: builderByEmail.get(normEmail(app.email)) }))
    .filter((row): row is { app: (typeof applications)[number]; builder: (typeof builders)[number] } =>
      Boolean(row.builder)
    );

  const slice = all ? targets : targets.slice(0, limit);
  console.log(
    `[backfill:momentum] ${slice.length}/${targets.length} momentum applicants with builderProfiles${dryRun ? ' (dry-run)' : ''}`
  );

  let profilesUpdated = 0;
  let projectsCreated = 0;
  let projectsUpdated = 0;

  for (const { app, builder } of slice) {
    const label = `${builder.name} <${builder.email}>`;
    const profileDraft = profileDraftFromMomentumApplication(app);
    const projectDraft = projectDraftFromMomentumApplication(app, String(app._id));

    if (!profileDraft && !projectDraft) {
      console.log(`  skip ${label} — no usable momentum fields`);
      continue;
    }

    const fields: string[] = [];
    if (profileDraft) {
      fields.push(
        ...[
          profileDraft.headline && 'headline',
          profileDraft.bio && 'bio',
          profileDraft.rolePreference?.length && 'rolePreference',
          profileDraft.links?.github && 'github',
          profileDraft.links?.linkedin && 'linkedin',
          profileDraft.links?.portfolio && 'portfolio',
        ].filter(Boolean) as string[]
      );
    }
    if (projectDraft) fields.push(`project:${projectDraft.projectName}`);

    console.log(`  ${label} → ${fields.join(', ') || 'project only'}`);

    if (dryRun) continue;

    const doc = await BuilderProfile.findById(builder._id);
    if (!doc) continue;

    if (profileDraft) {
      await applyProfileDraft(doc, profileDraft);
      await doc.save();
      profilesUpdated += 1;
    }

    if (projectDraft) {
      const counts = await upsertEnrichedProjects(doc._id, [projectDraft], { overwriteImported: false });
      projectsCreated += counts.created;
      projectsUpdated += counts.updated;
    }

    await refreshBuilderScores(doc._id, {
      skipQuality: true,
      skipStatsRefresh: true,
      skipEmbeddings: true,
    });
  }

  if (!dryRun && (profilesUpdated > 0 || projectsCreated > 0 || projectsUpdated > 0)) {
    console.log('\n[backfill:momentum] refreshing talent pool stats once…');
    await recomputeAndStore();
  }

  console.log(
    `\n[backfill:momentum] done profilesUpdated=${profilesUpdated} projects=+${projectsCreated}/~${projectsUpdated}`
  );

  await momentumConn.close();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
