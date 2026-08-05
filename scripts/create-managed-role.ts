#!/usr/bin/env tsx
/**
 * Create a DevLabs-managed role for a cold-sourced founder, build its shortlist
 * with the native discovery pipeline, and mint a one-time claim link.
 *
 * Dry-run by default (prints the claim URL). Pass --send to also email it.
 *
 * Example:
 *   tsx scripts/create-managed-role.ts \
 *     --email founder@startup.com --company "River" --role "Founding Engineer" \
 *     --skills "WebRTC,TypeScript,Python,LLM" \
 *     --must "Real-time voice/WebRTC experience;Ships production backend" \
 *     --summary "AI voice agent that demos and closes B2B deals" --funding "Pre-seed"
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import { handleJobAction, type FounderIdentity } from '../src/lib/founderAgent/service';
import JobPosting from '../src/models/founder/JobPosting';
import FounderRoleClaim from '../src/models/talent/FounderRoleClaim';

function arg(name: string, fallback = ''): string {
  const exact = process.argv.indexOf(`--${name}`);
  if (exact !== -1 && process.argv[exact + 1] && !process.argv[exact + 1].startsWith('--')) {
    return process.argv[exact + 1];
  }
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(`--${name}=`.length) : fallback;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function csv(value: string): string[] {
  return value.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

const email = arg('email').toLowerCase().trim();
const company = arg('company');
const roleTitle = arg('role');
const skills = csv(arg('skills'));
const musts = csv(arg('must'));
const summary = arg('summary') || null;
const funding = arg('funding') || null;
const location = arg('location') || null;
const baseUrl = (arg('base-url', process.env.WEBSITE_ROOT || 'https://devlabs.club')).replace(/\/$/, '');
const send = hasFlag('send');

if (!email || !company || !roleTitle) {
  console.error('Usage: tsx scripts/create-managed-role.ts --email <e> --company <c> --role <r> [--skills a,b] [--must "x;y"] [--summary ..] [--funding ..] [--location ..] [--send]');
  process.exit(1);
}

async function main() {
  await connectAdminDB();

  // 1. Create the managed role. founderEmail/founderId are placeholders bound to the
  //    real account at claim time; keying on the target email keeps it discoverable.
  const job = await JobPosting.create({
    founderId: email,
    founderEmail: email,
    founderName: company,
    title: roleTitle,
    roleTitle,
    company,
    startupSummary: summary,
    fundingStage: funding,
    location,
    locationPreference: location,
    skillsNeeded: skills,
    originalSkillsNeeded: skills,
    searchRequirements: musts.map((text) => ({ text, importance: 'must' as const })),
    equity: 'No',
    visa: 'Yes',
    managedByDevLabs: true,
    status: 'draft',
  });
  console.info(`[managed-role] created opportunity ${job._id} — ${roleTitle} @ ${company}`);

  // 2. Build the shortlist via the native discovery pipeline (semantic + rerank).
  const identity: FounderIdentity = {
    founderId: email,
    email,
    founderName: company,
    accountType: 'founder',
    onboardingStatus: 'complete',
  };
  try {
    const result: any = await handleJobAction(identity, {
      action: 'rerun_job_search',
      payload: { jobId: String(job._id), searchMode: 'balanced' },
    });
    if (result?.needsFollowup) {
      console.warn(`[managed-role] search needs more detail: ${result.message || ''} — role created, shortlist pending.`);
    } else {
      await JobPosting.updateOne({ _id: job._id }, { $set: { status: 'shortlisted' } });
      console.info('[managed-role] shortlist generated, status → shortlisted');
    }
  } catch (err) {
    console.warn('[managed-role] shortlist generation failed (role + link still valid):', (err as Error).message);
  }

  // 3. Mint a one-time claim token (raw token only lives in the URL).
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await FounderRoleClaim.create({
    opportunityIds: [job._id],
    targetEmail: email,
    company,
    tokenHash,
    status: 'email_sent',
    expiresAt,
  });
  const claimUrl = `${baseUrl}/founder/claim/${encodeURIComponent(rawToken)}`;

  console.info('\n=== CLAIM LINK (valid 14 days) ===');
  console.info(claimUrl);
  console.info('==================================\n');

  // 4. Optional: send the claim email (gated — never sends without --send).
  if (send) {
    await sendClaimEmail({ email, company, roleTitle, claimUrl });
    console.info(`[managed-role] claim email sent to ${email}`);
  } else {
    console.info('[managed-role] dry-run: no email sent. Re-run with --send to email the founder.');
  }

  await mongoose.connection.close();
}

async function sendClaimEmail(opts: { email: string; company: string; roleTitle: string; claimUrl: string }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL || 'people@devlabs.club';
  if (!apiKey) throw new Error('SENDGRID_API_KEY required to --send');
  const sgMail = (await import('@sendgrid/mail')).default;
  sgMail.setApiKey(apiKey);

  const text = `Hey,

Saw you're hiring a ${opts.roleTitle} at ${opts.company}. DevLabs runs a builder community out of hackathons and hack houses, and we've already pulled a shortlist of builders who've shipped real work in exactly what you need.

See your shortlist (no setup, just log in):
${opts.claimUrl}

The role and the matched builders are already waiting inside. Log in and they're there.

Best,
Dhanush`;

  await sgMail.send({
    to: opts.email,
    from,
    subject: `Your ${opts.roleTitle} shortlist at ${opts.company} — from DevLabs`,
    text,
  });
}

main().catch((err) => {
  console.error('[managed-role] fatal:', err);
  process.exit(1);
});
