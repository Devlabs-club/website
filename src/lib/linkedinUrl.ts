/** Normalize LinkedIn profile URLs so /in/Foo and /in/foo/ compare equal. */
export function normalizeLinkedInProfileKey(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim().replace(/^@+/, '');

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.hostname.includes('linkedin.com')) {
      const match = url.pathname.match(/\/in\/([^/?#]+)/i);
      if (!match?.[1]) return null;
      return decodeURIComponent(match[1]).toLowerCase();
    }
  } catch {
    // Fall through to vanity-name handling.
  }

  const slug = raw
    .replace(/^linkedin\.com\/in\//i, '')
    .replace(/^www\.linkedin\.com\/in\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/^\/+|\/+$/g, '');

  if (!/^[A-Za-z0-9-_%]+$/.test(slug)) return null;
  try {
    return decodeURIComponent(slug).toLowerCase();
  } catch {
    return slug.toLowerCase();
  }
}

export function linkedInProfilesMatch(a: unknown, b: unknown): boolean {
  const left = normalizeLinkedInProfileKey(a);
  const right = normalizeLinkedInProfileKey(b);
  return Boolean(left && right && left === right);
}
