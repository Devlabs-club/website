import 'dotenv/config';
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';
import sgMail from '@sendgrid/mail';

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const exactIndex = process.argv.indexOf(`--${name}`);
  if (exactIndex !== -1 && process.argv[exactIndex + 1]) return process.argv[exactIndex + 1];
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

const email = normalizeEmail(argValue('email'));
const baseUrl = (argValue('base-url', process.env.WEBSITE_ROOT || 'https://devlabs.club') || 'https://devlabs.club').replace(/\/$/, '');
const from = argValue('from', process.env.SENDGRID_FROM_EMAIL || 'people@devlabs.club');
const mongoUri = process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;

if (!email) throw new Error('Usage: node scripts/send-builder-claim-email.mjs --email builder@example.com');
if (!mongoUri) throw new Error('ADMIN_MONGO_URI or MONGODB_URI is required');
if (!process.env.SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY is required');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const client = new MongoClient(mongoUri);
await client.connect();
const db = client.db();

const builder = await db.collection('builderprofiles').findOne(
  { email },
  { projection: { _id: 1, email: 1, name: 1, headline: 1 } }
);

const token = createToken();
const claimUrl = `${baseUrl}/builder/claim/${encodeURIComponent(token)}`;
const now = new Date();
const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

const result = await db.collection('builderprofileclaims').insertOne({
  builderId: builder?._id || null,
  builderEmail: email,
  tokenHash: hashSecret(token),
  status: 'email_sent',
  phone: null,
  phoneVerifiedAt: null,
  phoneVerificationCodeHash: null,
  phoneVerificationExpiresAt: null,
  phoneVerificationAttempts: 0,
  conversationQuestionIndex: 0,
  conversationFailures: [],
  messages: [],
  expiresAt,
  completedAt: null,
  lastMessageAt: null,
  metadata: {
    source: 'claim_email_script',
    builderName: builder?.name || null,
    sentTo: email,
  },
  createdAt: now,
  updatedAt: now,
});

const displayName = builder?.name || email.split('@')[0];

await sgMail.send({
  to: email,
  from,
  subject: 'Claim your DevLabs builder profile',
  text: `Hi ${displayName},

Your DevLabs builder profile is ready to claim.

Use this private claim link:
${claimUrl}

This link is tied to ${email}. After you verify your phone number, the DevLabs agent will continue the profile claim and verification in Messages.

Thanks,
DevLabs`,
  trackingSettings: {
    clickTracking: {
      enable: false,
      enableText: false,
    },
  },
});

console.log(JSON.stringify({
  sent: true,
  claimId: String(result.insertedId),
  builderId: builder?._id ? String(builder._id) : null,
  email,
  claimUrl,
}, null, 2));

await client.close();
