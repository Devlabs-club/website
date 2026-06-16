/**
 * Enrich all builders except those already processed in the pilot.
 *
 *   EXCLUDE_BUILDER_IDS=id1,id2,... bun run scripts/enrich-remaining-builders.ts
 *   ENRICH_RESUME_LOG=logs/enrich-migration-....log ENRICH_RESUME_BEFORE=299 bun run scripts/enrich-remaining-builders.ts
 *   ENRICH_SKIP_LOG=logs/enrich-local-....log bun run scripts/enrich-remaining-builders.ts
 *   ENRICH_RESUME=1 bun run scripts/enrich-remaining-builders.ts   # auto-skip latest local log
 *   ENRICH_ONLY_UNENRICHED=1 bun run scripts/enrich-remaining-builders.ts   # empty profiles only
 *   ENRICH_ONLY_UNENRICHED=1 ENRICH_SOURCES_FIRST=1 bun run scripts/enrich-remaining-builders.ts
 */

import mongoose from 'mongoose';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import { enrichBuilderProfile } from '../src/lib/talent/builderEnrichment';
import {
  parseCompletedEmailsFromLog,
  isUnenrichedProfile,
  hasEnrichmentSources,
} from './lib/enrichment-queue-targets';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.dev.vars'), override: true });

const EXCLUDE = new Set(
  (process.env.EXCLUDE_BUILDER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function parseResumeExcludeEmails(logPath: string, beforeIndex: number): Set<string> {
  const emails = new Set<string>();
  const content = readFileSync(logPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\[(\d+)\/\d+\] .+ <([^>]+)>/);
    if (match && Number(match[1]) < beforeIndex) {
      emails.add(match[2].toLowerCase().trim());
    }
  }
  return emails;
}

function findLatestEnrichLog(): string | null {
  const logsDir = join(ROOT, 'logs');
  if (!existsSync(logsDir)) return null;

  const candidates = readdirSync(logsDir)
    .filter((name) => /^enrich-(local|migration|unenriched)/.test(name) && name.endsWith('.log'))
    .map((name) => join(logsDir, name))
    .sort()
    .reverse();

  return candidates[0] ?? null;
}

const RESUME_LOG = process.env.ENRICH_RESUME_LOG?.trim();
const RESUME_BEFORE = Number(process.env.ENRICH_RESUME_BEFORE || 0);
const SKIP_LOG = (() => {
  const explicit = process.env.ENRICH_SKIP_LOG?.trim();
  if (explicit) {
    return explicit.startsWith('/') ? explicit : join(process.cwd(), explicit);
  }
  if (process.env.ENRICH_RESUME === '1' || process.env.ENRICH_RESUME === 'true') {
    return findLatestEnrichLog();
  }
  return null;
})();

const EXCLUDE_EMAILS = (() => {
  const merged = new Set(
    (process.env.EXCLUDE_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  if (SKIP_LOG && existsSync(SKIP_LOG)) {
    for (const email of parseCompletedEmailsFromLog(SKIP_LOG)) merged.add(email);
  } else if (RESUME_LOG && RESUME_BEFORE > 0 && existsSync(RESUME_LOG)) {
    const path = RESUME_LOG.startsWith('/') ? RESUME_LOG : join(process.cwd(), RESUME_LOG);
    for (const email of parseResumeExcludeEmails(path, RESUME_BEFORE)) merged.add(email);
  }

  return merged;
})();

const SOURCES = ['resume', 'github', 'devpost', 'linkedin', 'portfolio'] as const;
const SLEEP_MS = Number(process.env.ENRICH_SLEEP_MS || 1200);
const ONLY_UNENRICHED =
  process.env.ENRICH_ONLY_UNENRICHED === '1' || process.env.ENRICH_ONLY_UNENRICHED === 'true';
const ONLY_WITH_RESUME =
  process.env.ENRICH_ONLY_WITH_RESUME === '1' || process.env.ENRICH_ONLY_WITH_RESUME === 'true';
const SOURCES_FIRST =
  process.env.ENRICH_SOURCES_FIRST === '1' ||
  process.env.ENRICH_SOURCES_FIRST === 'true' ||
  ONLY_UNENRICHED;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type BuilderRow = {
  _id: unknown;
  name?: string | null;
  email?: string | null;
  headline?: string | null;
  bio?: string | null;
  rolePreference?: string[] | null;
  links?: Record<string, string | null | undefined> | null;
  updatedAt?: Date | null;
};

function sortQueue(rows: BuilderRow[]): BuilderRow[] {
  if (!SOURCES_FIRST) return rows;

  return [...rows].sort((a, b) => {
    const aHas = hasEnrichmentSources(a) ? 0 : 1;
    const bHas = hasEnrichmentSources(b) ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return aTime - bTime;
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const all = await BuilderProfile.find({ verificationStatus: { $ne: 'rejected' } })
    .select('_id name email headline bio rolePreference links updatedAt')
    .sort({ updatedAt: 1 })
    .lean();

  let queue = all.filter((b) => {
    const id = String(b._id);
    if (EXCLUDE.has(id)) return false;
    if (EXCLUDE_EMAILS.size && EXCLUDE_EMAILS.has(String(b.email || '').toLowerCase().trim())) {
      return false;
    }
    if (ONLY_UNENRICHED && !isUnenrichedProfile(b)) return false;
    if (ONLY_WITH_RESUME && !String(b.links?.resume || '').trim()) return false;
    return true;
  }) as BuilderRow[];

  queue = sortQueue(queue);

  const withSources = queue.filter((b) => hasEnrichmentSources(b)).length;

  console.log(
    `[enrich-remaining] ${queue.length} builders (${EXCLUDE.size} ids excluded, ${EXCLUDE_EMAILS.size} emails excluded)`
  );
  if (ONLY_UNENRICHED) {
    console.log(`[enrich-remaining] mode=unenriched-only (${withSources} have source URLs)`);
  }
  if (ONLY_WITH_RESUME) {
    console.log(`[enrich-remaining] mode=with-resume-only`);
  }
  if (SOURCES_FIRST && queue.length) {
    const first = queue[0];
    console.log(
      `[enrich-remaining] starting with ${first.name} <${first.email}> sources=${hasEnrichmentSources(first) ? 'yes' : 'no'}`
    );
  }
  if (SKIP_LOG) {
    console.log(`[enrich-remaining] skipping completed entries from ${SKIP_LOG}`);
  }
  if (RESUME_LOG && RESUME_BEFORE > 0) {
    console.log(`[enrich-remaining] resuming from log index ${RESUME_BEFORE}+ (${RESUME_LOG})`);
  }

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < queue.length; i++) {
    const builder = queue[i];
    const builderId = String(builder._id);
    console.log(`\n[${i + 1}/${queue.length}] ${builder.name} <${builder.email}>`);
    try {
      const result = await enrichBuilderProfile({
        builderId,
        sources: [...SOURCES],
        dryRun: false,
      });
      console.log(
        `  ok fields=${result.profileFieldsUpdated.join(',') || 'none'} projects=+${result.projectsCreated}/~${result.projectsUpdated}`
      );
      const resumeErrors = result.sources.find((s) => s.source === 'resume')?.errors;
      if (resumeErrors?.length) console.log(`  resume: ${resumeErrors.join(', ')}`);
      const sourceErrors = result.sources.flatMap((s) =>
        (s.errors || []).map((e) => `${s.source}:${e}`)
      );
      if (sourceErrors.length) {
        console.log(`  source errors: ${sourceErrors.join('; ')}`);
      }
      ok += 1;
    } catch (err) {
      console.error(`  fail`, err instanceof Error ? err.message : err);
      fail += 1;
    }
    if (SLEEP_MS > 0) await sleep(SLEEP_MS);
  }

  console.log(`\n[enrich-remaining] complete ok=${ok} fail=${fail}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
