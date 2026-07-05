/**
 * One-off sender for the builder profile-claim email (SendGrid).
 *   CLAIM_TO=dhanush.kalaiselvan@gmail.com npx tsx scripts/send-claim-email.ts
 *
 * Reads SENDGRID_API_KEY + CLAIM_FROM from env. Prints a preview if no key.
 */
import 'dotenv/config';
import sgMail from '@sendgrid/mail';
import { buildClaimEmail } from '../src/lib/talent/claimEmail';
import { createClaimToken } from '../src/lib/messaging/claimToken';

const to = process.env.CLAIM_TO || 'dhanush.kalaiselvan@gmail.com';
const firstName = process.env.CLAIM_FIRST_NAME || 'Dhanush';
const from = process.env.CLAIM_FROM || 'people@devlabs.club';
const websiteRoot = process.env.WEBSITE_ROOT_PUBLIC || 'https://devlabs.club';

// Signed token ties the verify link to this recipient's email (and builderId if known).
const token = createClaimToken({ email: to, name: firstName, builderId: process.env.CLAIM_BUILDER_ID });
const { subject, html, text } = buildClaimEmail({ firstName, token, websiteRoot });

async function main() {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    console.log('--- NO SENDGRID_API_KEY: preview only ---');
    console.log('From:', from, '\nTo:', to, '\nSubject:', subject, '\n\n', text);
    return;
  }
  sgMail.setApiKey(key);
  try {
    const [res] = await sgMail.send({ to, from: { email: from, name: 'DevLabs' }, subject, html, text });
    console.log(`Sent → ${to} | status ${res.statusCode} | msgId ${res.headers['x-message-id'] || 'n/a'}`);
  } catch (err: any) {
    console.error('SendGrid error:', err?.code, JSON.stringify(err?.response?.body?.errors || err?.message, null, 2));
    process.exit(1);
  }
}

main();
