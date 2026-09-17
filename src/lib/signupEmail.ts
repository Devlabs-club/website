/** Same format rule as the User schema and login (`isValidEmail`). */
const EMAIL_FORMAT_RE = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;

export const SIGNUP_EMAIL_REJECT_MESSAGE =
  'Use a real email address we can reach. Disposable and fake domains are not allowed.';

/**
 * Throwaway / Freenom-style TLDs that almost never host real inboxes
 * and are a common source of fake signups.
 */
const BLOCKED_SIGNUP_TLDS = new Set([
  'cf',
  'ck',
  'click',
  'country',
  'ga',
  'gdn',
  'gq',
  'ml',
  'mov',
  'tk',
  'zip',
]);

/**
 * Common disposable inbox hosts. Matched against the email domain and any
 * parent suffix (so `foo.mailinator.com` is blocked too).
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '0-mail.com',
  '10minutemail.com',
  '10minutemail.net',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.de',
  'pokemail.net',
  'spam4.me',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'maildrop.cc',
  'mailnesia.com',
  'mailcatch.com',
  'mailnull.com',
  'getnada.com',
  'nada.email',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'tempail.com',
  'tempinbox.com',
  'throwaway.email',
  'throwawaymail.com',
  'trashmail.com',
  'trashmailer.com',
  'trashymail.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'nospam.ze.tc',
  'nomail.xl.cx',
  'mega.zik.dj',
  'speed.1s.fr',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'dispostable.com',
  'fakeinbox.com',
  'fakeinbox.net',
  'emailondeck.com',
  'getairmail.com',
  'inboxbear.com',
  'inboxalias.com',
  'moakt.com',
  'mytemp.email',
  'mintemail.com',
  'minutemail.com',
  'emailfake.com',
  'emailtemporario.com.br',
  'guerrillamail.info',
  'spamgourmet.com',
  'spamgourmet.net',
  'spamgourmet.org',
  'discard.email',
  'discardmail.com',
  'discardmail.de',
  'spambog.com',
  'spambog.de',
  'spambog.ru',
  'spamobox.com',
  'mailforspam.com',
  'trash-mail.com',
  'wegwerfemail.de',
  'einrot.com',
  'armyspy.com',
  'cuvox.de',
  'dayrep.com',
  'einrot.de',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'teleworm.us',
  'sharklasers.com',
]);

export type SignupEmailRejection = {
  ok: false;
  reason: 'format' | 'disposable' | 'blocked_tld';
  message: string;
};

export type SignupEmailSyncResult = { ok: true; email: string; domain: string } | SignupEmailRejection;

function parentDomainCandidates(domain: string): string[] {
  const parts = domain.split('.').filter(Boolean);
  const candidates: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
    candidates.push(parts.slice(i).join('.'));
  }
  return candidates;
}

export function normalizeSignupEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_FORMAT_RE.test(email.trim());
}

export function parseSignupEmail(email: string): { local: string; domain: string; tld: string } | null {
  const normalized = normalizeSignupEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const tld = domain.split('.').pop() || '';
  if (!local || !domain || !tld) return null;
  return { local, domain, tld };
}

export function isDisposableSignupDomain(domain: string): boolean {
  return parentDomainCandidates(domain.toLowerCase()).some((candidate) =>
    DISPOSABLE_EMAIL_DOMAINS.has(candidate)
  );
}

export function isBlockedSignupTld(tld: string): boolean {
  return BLOCKED_SIGNUP_TLDS.has(tld.toLowerCase());
}

/**
 * Instant signup checks that can run in the browser and on the server.
 * Deliverability (MX) is a separate server-only step.
 */
export function evaluateSignupEmailSync(email: string): SignupEmailSyncResult {
  const normalized = normalizeSignupEmail(email);
  if (!isValidEmailFormat(normalized)) {
    return { ok: false, reason: 'format', message: 'Please provide a valid email address' };
  }

  const parsed = parseSignupEmail(normalized);
  if (!parsed) {
    return { ok: false, reason: 'format', message: 'Please provide a valid email address' };
  }

  if (isBlockedSignupTld(parsed.tld)) {
    return { ok: false, reason: 'blocked_tld', message: SIGNUP_EMAIL_REJECT_MESSAGE };
  }

  if (isDisposableSignupDomain(parsed.domain)) {
    return { ok: false, reason: 'disposable', message: SIGNUP_EMAIL_REJECT_MESSAGE };
  }

  return { ok: true, email: normalized, domain: parsed.domain };
}
