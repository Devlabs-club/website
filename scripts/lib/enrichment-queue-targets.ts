import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import BuilderProfile from '../../src/models/talent/BuilderProfile';

export function hasEnrichmentSources(profile: {
  links?: Record<string, string | null | undefined> | null;
}): boolean {
  const links = profile.links || {};
  return [
    links.resume,
    links.github,
    links.linkedin,
    links.portfolio,
    links.personalWebsite,
    links.devpost,
  ].some((url) => typeof url === 'string' && url.trim());
}

export function isUnenrichedProfile(profile: {
  headline?: string | null;
  bio?: string | null;
  rolePreference?: string[] | null;
}): boolean {
  const hasHeadline = Boolean(profile.headline?.trim());
  const hasBio = Boolean(profile.bio?.trim());
  const hasSkills = Array.isArray(profile.rolePreference) && profile.rolePreference.length > 0;
  return !hasHeadline && !hasBio && !hasSkills;
}

export const PILOT_BUILDER_IDS = [
  '6a20b1ea0995ad412398610f',
  '6a20b1ea0995ad412398611e',
  '6a20b1ea0995ad4123986114',
  '6a20b1ea0995ad4123986119',
  '6a20b1ea0995ad4123986123',
  '6a20b1ea0995ad412398612d',
  '6a20b1ea0995ad4123986128',
  '6a20b1ea0995ad412398613c',
  '6a20b1ea0995ad4123986137',
  '6a20b1ea0995ad4123986132',
];

export function parseProcessedEmailsFromLog(logPath: string, beforeIndex = 0): Set<string> {
  const emails = new Set<string>();
  if (!existsSync(logPath)) return emails;

  const content = readFileSync(logPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\[(\d+)\/\d+\] .+ <([^>]+)>/);
    if (!match) continue;
    const index = Number(match[1]);
    if (beforeIndex > 0 && index >= beforeIndex) continue;
    emails.add(match[2].toLowerCase().trim());
  }
  return emails;
}

/** Emails whose log block ended with `ok` (in-progress / failed entries are retried). */
export function parseCompletedEmailsFromLog(logPath: string): Set<string> {
  const emails = new Set<string>();
  if (!existsSync(logPath)) return emails;

  let pendingEmail: string | null = null;
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    const start = line.match(/^\[\d+\/\d+\] .+ <([^>]+)>/);
    if (start) {
      pendingEmail = start[1].toLowerCase().trim();
      continue;
    }
    if (pendingEmail && /^\s+ok\b/.test(line)) {
      emails.add(pendingEmail);
      pendingEmail = null;
    }
    if (/^\s+fail\b/.test(line)) {
      pendingEmail = null;
    }
  }
  return emails;
}

export function collectExcludeEmails(rootDir: string): Set<string> {
  const excluded = new Set<string>();

  const firstLog = join(rootDir, 'logs/enrich-migration-20260615-143136.log');
  for (const email of parseProcessedEmailsFromLog(firstLog, 299)) {
    excluded.add(email);
  }

  const resumeLog = join(rootDir, 'logs/enrich-migration-resume-20260615-173003.log');
  for (const email of parseProcessedEmailsFromLog(resumeLog, 0)) {
    excluded.add(email);
  }

  return excluded;
}

export async function listRemainingBuilderIds(options?: {
  rootDir?: string;
  extraExcludeIds?: string[];
}): Promise<Array<{ id: string; name: string; email: string }>> {
  const rootDir = options?.rootDir || process.cwd();
  const excludeIds = new Set([...PILOT_BUILDER_IDS, ...(options?.extraExcludeIds || [])]);
  const excludeEmails = collectExcludeEmails(rootDir);

  const all = await BuilderProfile.find({ verificationStatus: { $ne: 'rejected' } })
    .select('_id name email')
    .sort({ _id: 1 })
    .lean();

  return all
    .filter((b) => {
      const id = String(b._id);
      if (excludeIds.has(id)) return false;
      const email = String(b.email || '').toLowerCase().trim();
      if (email && excludeEmails.has(email)) return false;
      return true;
    })
    .map((b) => ({
      id: String(b._id),
      name: String(b.name || ''),
      email: String(b.email || ''),
    }));
}
