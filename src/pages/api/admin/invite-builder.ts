import type { APIRoute } from 'astro';
import sgMail from '@sendgrid/mail';
import { connectAdminDB } from '@/lib/mongodb';
import { requireAdmin, jsonResponse } from '@/lib/events/adminAuth';
import { runtimeEnvFromLocals, readEnv } from '@/lib/workosEnv';
import {
  createBuilderClaimForEmail,
  normalizeClaimEmail,
  claimBaseUrl,
} from '@/lib/builderClaim';
import { createClaimToken as createSignedClaimToken } from '@/lib/messaging/claimToken';
import { buildBuilderWelcomeEmail } from '@/lib/talent/builderWelcomeEmail';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import TalentEmailDelivery from '@/models/talent/TalentEmailDelivery';

function firstNameFrom(name: string | null | undefined, email: string) {
  const trimmed = (name || '').trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  const local = email.split('@')[0] || 'there';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'there';
}

/** POST — send a landing-themed builder welcome/invite email. Admin only. */
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const runtime = runtimeEnvFromLocals(locals);

  let body: { email?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { success: false, message: 'Invalid JSON body' });
  }

  const email = normalizeClaimEmail(String(body.email || ''));
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { success: false, message: 'A valid email is required' });
  }
  const providedName = typeof body.name === 'string' ? body.name.trim() : '';

  const apiKey = readEnv('SENDGRID_API_KEY', runtime);
  if (!apiKey) {
    return jsonResponse(500, { success: false, message: 'Email is not configured (missing SENDGRID_API_KEY)' });
  }

  await connectAdminDB();

  // Tracked claim row (status: email_sent), also resolves any pre-built BuilderProfile.
  const { claim, builder } = await createBuilderClaimForEmail(email, runtime);
  const builderDoc = builder as { _id?: unknown; name?: string } | null;

  const builderId = builderDoc?._id ? String(builderDoc._id) : undefined;
  const name = providedName || builderDoc?.name || '';
  const firstName = firstNameFrom(name, email);

  // Signed, stateless identity token for the web onboarding link (encodes email).
  const signedToken = createSignedClaimToken(
    { email, name: name || undefined, builderId },
    30,
    runtime
  );

  const websiteRoot = claimBaseUrl(runtime);
  const { subject, html, text, claimUrl } = buildBuilderWelcomeEmail({
    firstName,
    token: signedToken,
    websiteRoot,
    ref: 'email-invite',
  });

  const from =
    readEnv('SENDGRID_FROM_EMAIL', runtime) ||
    readEnv('CLAIM_FROM', runtime) ||
    readEnv('MAIL_FROM', runtime) ||
    'people@devlabs.club';

  sgMail.setApiKey(apiKey);

  let providerMessageId: string | null = null;
  try {
    const [response] = await sgMail.send({
      to: email,
      from,
      subject,
      html,
      text,
      // Keep query params (ref/utm/token) intact in the CTA links.
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
      },
    });
    providerMessageId = (response?.headers?.['x-message-id'] as string) || null;
  } catch (error) {
    console.error('[admin/invite-builder] send failed', error);
    return jsonResponse(502, { success: false, message: 'Failed to send invite email' });
  }

  try {
    await TalentEmailDelivery.create({
      to: email,
      from,
      subject,
      emailType: 'builder_welcome_invite',
      builderId: (builderDoc?._id as any) || null,
      provider: 'sendgrid',
      providerMessageId,
      status: 'sent',
      metadata: {
        claimId: String(claim._id),
        invitedName: name || null,
        ref: 'email-invite',
      },
    });
  } catch (error) {
    // Delivery already succeeded; logging failure shouldn't fail the request.
    console.error('[admin/invite-builder] delivery log failed', error);
  }

  return jsonResponse(200, {
    success: true,
    email,
    claimId: String(claim._id),
    builderId: builderId || null,
    claimUrl,
  });
};

/** GET — recent builder invites for the admin panel status list. */
export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  await connectAdminDB();

  const claims = await BuilderProfileClaim.find({})
    .sort({ createdAt: -1 })
    .limit(50)
    .select('builderEmail status createdAt updatedAt completedAt metadata')
    .lean();

  const invites = claims.map((c: any) => ({
    email: c.builderEmail,
    status: c.status,
    name: c.metadata?.builderName || c.metadata?.invitedName || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    completedAt: c.completedAt || null,
  }));

  return jsonResponse(200, { success: true, invites });
};

export const prerender = false;
