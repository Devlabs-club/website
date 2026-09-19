import crypto from 'node:crypto';
import { isValidEmail } from '@/lib/auth';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

/** RFC 2606 / special-use domains that can never receive real mail. */
const RESERVED_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example.edu',
  'invalid',
  'localhost',
  'local',
  'test',
]);

const RESERVED_TLDS = new Set(['example', 'invalid', 'localhost', 'local', 'test', 'onion']);

/** Common disposable / throwaway inboxes. Verification still required for everything else. */
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'mailinator.com',
  'mailinator.net',
  'tempmail.com',
  'temp-mail.org',
  'throwaway.email',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'fakeinbox.com',
  'moakt.com',
  'dispostable.com',
  'mailnesia.com',
]);

export type EmailVerificationAccount = {
  emailVerified?: boolean | null;
  oauthProvider?: string | null;
  role?: string | null;
};

export function hashVerificationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createEmailVerificationToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashVerificationToken(raw) };
}

export function isAccountEmailVerified(user: EmailVerificationAccount): boolean {
  if (user.emailVerified === true) return true;
  if (user.oauthProvider) return true;
  if (user.role === 'admin') return true;
  return false;
}

export function signupEmailRejection(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) return 'Please provide a valid email address';

  const domain = trimmed.split('@')[1] || '';
  const parts = domain.split('.').filter(Boolean);
  const tld = parts[parts.length - 1] || '';

  if (!domain || parts.length < 2) return 'Please provide a valid email address';
  if (RESERVED_DOMAINS.has(domain) || RESERVED_TLDS.has(tld)) {
    return 'Please use a real email address you can access';
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return 'Disposable email addresses are not allowed';
  }
  return null;
}

export function isResendCoolingDown(sentAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!sentAt) return false;
  const then = sentAt instanceof Date ? sentAt.getTime() : new Date(sentAt).getTime();
  if (!Number.isFinite(then)) return false;
  return now - then < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS;
}

export function authPublicOrigin(request: Request, runtime?: RuntimeEnv): string {
  const configured = readEnv('WEBSITE_ROOT', runtime) || readEnv('PUBLIC_URL', runtime);
  if (configured) return configured.replace(/\/$/, '');
  return new URL(request.url).origin;
}

export function verificationPageUrl(origin: string, rawToken: string, redirect?: string | null): string {
  const url = new URL('/auth/verify-email', `${origin.replace(/\/$/, '')}/`);
  url.searchParams.set('token', rawToken);
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    url.searchParams.set('redirect', redirect);
  }
  return url.toString();
}
