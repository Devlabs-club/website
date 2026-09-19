import { connectAdminDB } from '@/lib/mongodb';
import User from '@/models/user.tsx';
import { sendEmailVerificationEmail } from '@/lib/authVerificationEmail';
import {
  EMAIL_VERIFICATION_TTL_MS,
  authPublicOrigin,
  createEmailVerificationToken,
  hashVerificationToken,
  isAccountEmailVerified,
  isResendCoolingDown,
  verificationPageUrl,
} from '@/lib/emailVerification';
import type { RuntimeEnv } from '@/lib/workosEnv';

type LeanUser = {
  _id: unknown;
  email: string;
  name?: string | null;
  emailVerified?: boolean | null;
  oauthProvider?: string | null;
  role?: string | null;
  emailVerificationSentAt?: Date | null;
};

function firstNameFrom(name: string | null | undefined, email: string) {
  const trimmed = (name || '').trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  const local = email.split('@')[0] || 'there';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'there';
}

function safeRedirect(redirect?: string | null): string | null {
  if (!redirect) return null;
  const trimmed = redirect.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
}

export async function sendVerificationForUser(params: {
  user: LeanUser;
  request: Request;
  runtime?: RuntimeEnv;
  redirect?: string | null;
  force?: boolean;
}): Promise<{ sent: boolean; skipped?: 'already_verified' | 'cooldown'; verifyUrl: string | null }> {
  await connectAdminDB();
  const user = await User.findById(params.user._id);
  if (!user) return { sent: false, verifyUrl: null };
  if (isAccountEmailVerified(user)) {
    return { sent: false, skipped: 'already_verified', verifyUrl: null };
  }

  if (!params.force && isResendCoolingDown(user.emailVerificationSentAt)) {
    return { sent: false, skipped: 'cooldown', verifyUrl: null };
  }

  const { raw, hash } = createEmailVerificationToken();
  const origin = authPublicOrigin(params.request, params.runtime);
  const redirect = safeRedirect(params.redirect);
  const verifyUrl = verificationPageUrl(origin, raw, redirect);

  user.emailVerified = false;
  user.emailVerificationTokenHash = hash;
  user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  user.emailVerificationSentAt = new Date();
  user.emailVerificationNext = redirect;
  await user.save();

  const result = await sendEmailVerificationEmail({
    to: user.email,
    firstName: firstNameFrom(user.name, user.email),
    verifyUrl,
    runtime: params.runtime,
  });

  if (!result.sent) {
    console.info('[emailVerification] verify url (email not delivered)', {
      email: user.email,
      verifyUrl,
      reason: result.reason,
    });
  }

  return { sent: result.sent, verifyUrl };
}

export async function consumeEmailVerificationToken(rawToken: string): Promise<{
  user: LeanUser & { emailVerificationNext?: string | null };
  next: string | null;
} | null> {
  const token = String(rawToken || '').trim();
  if (!token) return null;

  await connectAdminDB();
  const hash = hashVerificationToken(token);
  const user = await User.findOne({
    emailVerificationTokenHash: hash,
    emailVerificationExpiresAt: { $gt: new Date() },
  });
  if (!user) return null;

  const next = safeRedirect(user.emailVerificationNext);
  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpiresAt = null;
  user.emailVerificationSentAt = null;
  user.emailVerificationNext = null;
  await user.save();

  return {
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      emailVerified: true,
      oauthProvider: user.oauthProvider ?? null,
      role: user.role,
      emailVerificationNext: next,
    },
    next,
  };
}
