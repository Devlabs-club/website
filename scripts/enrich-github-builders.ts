#!/usr/bin/env tsx
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import { enrichFromGithub } from '../src/lib/talent/builderEnrichment/githubEnricher';
import {
  applyProfileDraft,
  refreshBuilderScores,
  upsertEnrichedProjects,
} from '../src/lib/talent/builderEnrichment/apply';

const GITHUB_FIXES: Array<{ email?: string; githubMatch?: string; github: string }> = [
  { email: 'smehta74@asu.edu', github: 'https://github.com/myselfsiddharth' },
  { email: 'mmahesh9@asu.edu', github: 'https://github.com/mitanshm680' },
  { email: 'sjain300@asu.edu', github: 'https://github.com/sanyam-jain30' },
  { email: 'bpraneet@asu.edu', github: 'https://github.com/bpraneet' },
  { email: 'nkemme54@gmail.com', github: 'https://github.com/trackerjo' },
  { email: 'boty@wisc.edu', github: 'https://github.com/zahabiyah' },
  { email: 'phongvn215@gmail.com', github: 'https://github.com/PDuong9' },
  { email: 'mdeshmu6@asu.edu', github: 'https://github.com/MaitreyeeDeshmukh' },
  { email: 'claguduv@asu.edu', github: 'https://github.com/charusnehalr' },
  { email: 'sbhamar2@asu.edu', github: 'https://github.com/shreerajbhamare' },
  { email: 'bsondaga@asu.edu', github: 'https://github.com/bsondaga' },
  { email: 'hkolluru@asu.edu', github: 'https://github.com/HiteshKolluru-asu' },
  { email: 'nnarra3@asu.edu', github: 'https://github.com/NAGANITHIN23' },
  { email: 'work.utkarshdwivedi@gmail.com', github: 'https://github.com/MXmaster2s' },
  { email: 'jayrao0107@gmail.com', github: 'https://github.com/FluentFlier' },
  { email: 'anushka.18ar@gmail.com', github: 'https://github.com/WillBlair' },
  { githubMatch: 'chhavikirtani2000', github: 'https://github.com/chhavikirtani2000' },
  { email: 'prajeinck@gmail.com', github: 'https://github.com/prajein' },
];

function parseGithubUsername(githubUrl: string | null | undefined): string | null {
  if (!githubUrl) return null;
  const raw = githubUrl.trim();
  const githubIo = raw.match(/(?:https?:\/\/)?([a-zA-Z0-9-]+)\.github\.io/i);
  if (githubIo?.[1]) return githubIo[1];

  try {
    let url = raw;
    if (!url.startsWith('http')) url = `https://${url}`;
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes('github.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    if (parts[0] === 'orgs' || parts[0] === 'users') return parts[1] || null;
    if (['settings', 'notifications', 'marketplace', 'explore', 'topics', 'trending', 'login', 'signup'].includes(parts[0])) {
      return null;
    }
    return parts[0];
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]) {
  const args = {
    limit: undefined as number | undefined,
    offset: 0,
    delayMs: 2000,
    fixOnly: false,
    queueOnly: false,
    skipFixes: false,
    untilEmpty: false,
    batchSize: 50,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--offset') args.offset = Number(argv[++i]);
    else if (arg.startsWith('--offset=')) args.offset = Number(arg.slice('--offset='.length));
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++i]);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number(arg.slice('--delay-ms='.length));
    else if (arg === '--batch-size') args.batchSize = Number(argv[++i]);
    else if (arg.startsWith('--batch-size=')) args.batchSize = Number(arg.slice('--batch-size='.length));
    else if (arg === '--fix-only') args.fixOnly = true;
    else if (arg === '--queue-only') args.queueOnly = true;
    else if (arg === '--skip-fixes') args.skipFixes = true;
    else if (arg === '--until-empty') args.untilEmpty = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

async function applyGithubFixes() {
  let updated = 0;
  let missing = 0;
  for (const fix of GITHUB_FIXES) {
    const query = fix.email
      ? { email: fix.email.toLowerCase() }
      : fix.githubMatch
        ? { 'links.github': new RegExp(fix.githubMatch, 'i') }
        : null;
    if (!query) continue;
    const builder = await BuilderProfile.findOne(query);
    if (!builder) {
      missing += 1;
      log('fix:missing', { email: fix.email, githubMatch: fix.githubMatch, github: fix.github });
      continue;
    }
    const before = builder.links?.github || null;
    builder.links = builder.links || {};
    builder.links.github = fix.github;
    await builder.save();
    updated += 1;
    log('fix:applied', {
      builderId: String(builder._id),
      email: builder.email,
      before,
      after: fix.github,
    });
  }
  return { updated, missing, total: GITHUB_FIXES.length };
}

async function getEnrichmentQueue() {
  const enrichedBuilderIds = await ProjectRecord.distinct('builderId', {
    source: 'github_profile_enrichment',
  });
  const enrichedSet = new Set(enrichedBuilderIds.map(String));

  const builders = await BuilderProfile.find({
    'links.github': { $exists: true, $nin: [null, ''] },
  })
    .select('_id name email links.github')
    .lean();

  const queue = builders
    .map((b) => ({
      id: String(b._id),
      name: b.name,
      email: b.email,
      github: b.links?.github as string,
      username: parseGithubUsername(b.links?.github as string),
    }))
    .filter((b) => b.username && !enrichedSet.has(b.id));

  return { queue, alreadyEnriched: enrichedSet.size, withGithub: builders.length };
}

async function markGithubScanComplete(builderId: any, username: string, reposEnriched: number) {
  await ProjectRecord.findOneAndUpdate(
    { builderId, source: 'github_profile_enrichment', sourceId: `github:scan:${username}` },
    {
      $set: {
        projectName: reposEnriched > 0 ? 'GitHub profile enriched' : 'GitHub profile scanned',
        description:
          reposEnriched > 0
            ? `Imported ${reposEnriched} qualifying repositories from GitHub.`
            : 'GitHub profile scanned; no qualifying repositories matched enrichment filters.',
        source: 'github_profile_enrichment',
        sourceId: `github:scan:${username}`,
        verificationStatus: 'imported_unverified',
        confidence: 0.2,
      },
      $setOnInsert: { builderId },
    },
    { upsert: true }
  );
}

async function enrichOne(builderId: string, delayMs: number) {
  const builder = await BuilderProfile.findById(builderId);
  if (!builder) throw new Error(`Builder not found: ${builderId}`);

  const result = await enrichFromGithub(builder);
  let projectsCreated = 0;
  let projectsUpdated = 0;

  if (result.profile) {
    await applyProfileDraft(builder, result.profile, { overwriteBasics: false });
  }

  if (result.projects?.length) {
    const counts = await upsertEnrichedProjects(builder._id, result.projects, {
      overwriteImported: true,
    });
    projectsCreated = counts.created;
    projectsUpdated = counts.updated;
  }

  await builder.save();

  if (!result.errors.length) {
    const username = (result.meta as any)?.username;
    const reposEnriched = (result.meta as any)?.reposEnriched ?? 0;
    if (username) {
      await markGithubScanComplete(builder._id, username, reposEnriched);
    }
  }

  await refreshBuilderScores(builder._id, {
    skipQuality: true,
    skipStatsRefresh: true,
    skipEmbeddings: true,
  });

  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

  return {
    errors: result.errors || [],
    projectsCreated,
    projectsUpdated,
    reposEnriched: (result.meta as any)?.reposEnriched ?? 0,
    username: (result.meta as any)?.username ?? null,
  };
}

const startedAt = Date.now();
const args = parseArgs(process.argv.slice(2));

try {
  await connectAdminDB();

  const fixResult = args.skipFixes ? { updated: 0, missing: 0, total: 0, skipped: true } : await applyGithubFixes();
  if (!args.skipFixes) log('fix:summary', fixResult);

  if (args.fixOnly) {
    process.exit(0);
  }

  const initial = await getEnrichmentQueue();
  const { queue, alreadyEnriched, withGithub } = initial;

  if (args.queueOnly) {
    log('queue:ready', {
      withGithub,
      alreadyEnriched,
      pending: queue.length,
      running: queue.length,
      offset: 0,
      limit: null,
    });
    process.exit(0);
  }

  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalSkippedNoProjects = 0;
  let totalProjectsCreated = 0;
  let totalProcessed = 0;
  let round = 0;

  while (true) {
    round += 1;
    const currentQueue = round === 1 && !args.untilEmpty ? queue : (await getEnrichmentQueue()).queue;
    const slice = currentQueue.slice(
      args.untilEmpty ? 0 : args.offset,
      args.untilEmpty
        ? args.batchSize
        : args.limit
          ? args.offset + args.limit
          : undefined
    );

    if (round === 1) {
      log('queue:ready', {
        withGithub,
        alreadyEnriched,
        pending: currentQueue.length,
        running: slice.length,
        offset: args.untilEmpty ? 0 : args.offset,
        limit: args.untilEmpty ? args.batchSize : args.limit ?? null,
        untilEmpty: args.untilEmpty,
      });
    }

    if (!slice.length) break;

    let succeeded = 0;
    let failed = 0;
    let skippedNoProjects = 0;
    let projectsCreated = 0;

    for (let i = 0; i < slice.length; i += 1) {
      const item = slice[i];
      try {
        const result = await enrichOne(item.id, args.delayMs);
        if (result.errors.length) {
          failed += 1;
          log('enrich:failed', {
            round,
            index: i + 1,
            total: slice.length,
            ...item,
            errors: result.errors,
          });
        } else if (result.projectsCreated + result.projectsUpdated === 0) {
          skippedNoProjects += 1;
          log('enrich:no_projects', {
            round,
            index: i + 1,
            total: slice.length,
            ...item,
            reposEnriched: result.reposEnriched,
          });
        } else {
          succeeded += 1;
          projectsCreated += result.projectsCreated;
          log('enrich:ok', {
            round,
            index: i + 1,
            total: slice.length,
            ...item,
            projectsCreated: result.projectsCreated,
            projectsUpdated: result.projectsUpdated,
            reposEnriched: result.reposEnriched,
          });
        }
      } catch (err) {
        failed += 1;
        log('enrich:error', {
          round,
          index: i + 1,
          total: slice.length,
          ...item,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    totalSucceeded += succeeded;
    totalFailed += failed;
    totalSkippedNoProjects += skippedNoProjects;
    totalProjectsCreated += projectsCreated;
    totalProcessed += slice.length;

    log('round:done', {
      round,
      processed: slice.length,
      succeeded,
      failed,
      skippedNoProjects,
      projectsCreated,
      remaining: (await getEnrichmentQueue()).queue.length,
    });

    if (!args.untilEmpty) break;
    if (slice.length < args.batchSize) break;
  }

  log('batch:done', {
      durationMs: Date.now() - startedAt,
      fixResult,
      withGithub,
      alreadyEnriched,
      rounds: round,
      processed: totalProcessed,
      succeeded: totalSucceeded,
      failed: totalFailed,
      skippedNoProjects: totalSkippedNoProjects,
      totalProjectsCreated,
      remaining: (await getEnrichmentQueue()).queue.length,
  });
} catch (error) {
  console.error('[github-enrichment] fatal', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
