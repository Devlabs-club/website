/** Normalize LinkedIn profile URLs so /in/Foo and /in/foo/ compare equal. */

const PLACEHOLDERS = new Set([
  'linkedin',
  'linked-in',
  'linkedin profile',
  'linkedinprofile',
  'profile',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
]);

const RESERVED_PATHS = new Set([
  'feed',
  'company',
  'school',
  'jobs',
  'login',
  'signup',
  'in',
  'pub',
  'mwlite',
  'posts',
  'pulse',
  'learning',
  'groups',
  'messaging',
  'checkpoint',
  'authwall',
]);

function isVanitySlug(slug: string, allowDot = false): boolean {
  const value = slug.trim();
  if (!value || PLACEHOLDERS.has(value.toLowerCase())) return false;
  const pattern = allowDot
    ? /^[A-Za-z0-9][A-Za-z0-9._%-]{0,99}$/
    : /^[A-Za-z0-9][A-Za-z0-9_%-]{0,99}$/;
  return pattern.test(value);
}

function decodeSlug(slug: string): string | null {
  try {
    return decodeURIComponent(slug).toLowerCase();
  } catch {
    return slug.toLowerCase();
  }
}

export function normalizeLinkedInProfileKey(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim().replace(/^@+/, '');
  if (PLACEHOLDERS.has(raw.toLowerCase())) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : raw.startsWith('//') ? `https:${raw}` : `https://${raw}`);
    if (url.hostname.toLowerCase().includes('linkedin.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const inIdx = parts.findIndex((part) => part.toLowerCase() === 'in');
      if (inIdx >= 0 && parts[inIdx + 1] && isVanitySlug(decodeURIComponent(parts[inIdx + 1]), true)) {
        return decodeSlug(parts[inIdx + 1]);
      }
      if (parts.length === 1 && !RESERVED_PATHS.has(parts[0].toLowerCase()) && isVanitySlug(parts[0])) {
        return decodeSlug(parts[0]);
      }
      return null;
    }
  } catch {
    // Fall through to vanity-name handling.
  }

  const withoutScheme = raw.replace(/^https?:\/\//i, '').replace(/^\/\//, '');
  const withoutHost = withoutScheme
    .replace(/^(www\.)?linkedin\.com\/?/i, '')
    .replace(/^linkedin\/?/i, '')
    .replace(/^\/+/, '');
  const parts = withoutHost.split(/[/?#]/).filter(Boolean);

  if (parts[0]?.toLowerCase() === 'in' && parts[1] && isVanitySlug(parts[1], true)) {
    return decodeSlug(parts[1]);
  }
  if (parts.length === 1 && isVanitySlug(parts[0])) {
    return decodeSlug(parts[0]);
  }
  return null;
}

export function linkedInProfilesMatch(a: unknown, b: unknown): boolean {
  const left = normalizeLinkedInProfileKey(a);
  const right = normalizeLinkedInProfileKey(b);
  return Boolean(left && right && left === right);
}
