import { normalizeLinkedInProfileKey } from '@/lib/linkedinUrl';

function parseGithubUsername(githubUrl: string | null | undefined): string | null {
  if (!githubUrl) return null;
  try {
    const parsed = new URL(githubUrl.startsWith('http') ? githubUrl : `https://${githubUrl}`);
    if (!parsed.hostname.toLowerCase().includes('github.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === 'orgs' || parts[0] === 'users') return parts[1] || null;
    if (['settings', 'notifications', 'marketplace'].includes(parts[0])) return null;
    return parts[0];
  } catch {
    return null;
  }
}

const PLACEHOLDER_VALUES = new Set([
  'linkedin',
  'linked-in',
  'linkedin profile',
  'linkedinprofile',
  'github',
  'git hub',
  'portfolio',
  'website',
  'personal website',
  'personal blog',
  'web portfolio',
  'resume',
  'devpost',
  'twitter',
  'x',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'nil',
  '-',
  '—',
]);

const LINK_KEYS = ['github', 'linkedin', 'portfolio', 'personalWebsite', 'resume', 'devpost', 'twitter'] as const;

export type BuilderLinkKey = (typeof LINK_KEYS)[number];

export type SanitizedBuilderLinks = {
  github: string | null;
  linkedin: string | null;
  portfolio: string | null;
  personalWebsite: string | null;
  resume: string | null;
  devpost: string | null;
  twitter: string | null;
};

const LINK_LABELS: Record<string, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  devpost: 'Devpost',
  portfolio: 'Portfolio',
  personalWebsite: 'Website',
  twitter: 'X',
  resume: 'Resume',
};

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.has(value.trim().toLowerCase());
}

/** Turn a stored string into an absolute http(s) URL, or null if it would 404 on DevLabs. */
export function toExternalHttpUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let trimmed = input.trim();
  if (!trimmed || isPlaceholder(trimmed)) return null;
  if (/^(mailto|javascript|data):/i.test(trimmed)) return null;
  if (trimmed.includes('@') && !/^https?:\/\//i.test(trimmed) && !trimmed.includes('/')) return null;

  if (trimmed.startsWith('//')) trimmed = `https:${trimmed}`;
  else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    if (trimmed.startsWith('/')) return null;
    if (!/^(www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) return null;
    trimmed = `https://${trimmed}`;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null;
    if (['na', 'n-a', 'example.com', 'test.com', 'localhost'].includes(host)) return null;
    if (url.pathname === '/../' || url.pathname.includes('/../')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function linkedInProfileHref(input: unknown): string | null {
  if (typeof input === 'string' && isPlaceholder(input)) return null;
  const vanity = normalizeLinkedInProfileKey(input);
  if (!vanity || isPlaceholder(vanity)) return null;
  return `https://www.linkedin.com/in/${encodeURIComponent(vanity)}/`;
}

export function githubProfileHref(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || isPlaceholder(trimmed)) return null;

  const username = parseGithubUsername(trimmed);
  if (username && !isPlaceholder(username)) {
    const absolute = toExternalHttpUrl(trimmed.startsWith('http') || trimmed.includes('github.com') ? trimmed : `github.com/${trimmed}`);
    if (absolute) {
      try {
        const parsed = new URL(absolute);
        if (parsed.hostname.replace(/^www\./i, '').toLowerCase() === 'github.com') {
          const path = parsed.pathname.replace(/\/+$/, '') || `/${username}`;
          return `https://github.com${path}`;
        }
      } catch {
        // Fall through to username URL.
      }
    }
    return `https://github.com/${username}`;
  }

  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(trimmed) && !isPlaceholder(trimmed)) {
    return `https://github.com/${trimmed}`;
  }
  return null;
}

export function websiteHref(input: unknown): string | null {
  return toExternalHttpUrl(input);
}

function hostHref(input: unknown, hosts: string[]): string | null {
  const url = toExternalHttpUrl(input);
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return hosts.some((expected) => host === expected || host.endsWith(`.${expected}`)) ? url : null;
  } catch {
    return null;
  }
}

export function hrefForProfileField(key: string, value: unknown): string | null {
  if (key === 'linkedin') return linkedInProfileHref(value);
  if (key === 'github') return githubProfileHref(value);
  if (key === 'devpost') return hostHref(value, ['devpost.com']);
  if (key === 'twitter') return hostHref(value, ['twitter.com', 'x.com']);
  if (key === 'portfolio' || key === 'personalWebsite') return websiteHref(value);
  if (key === 'resume') return toExternalHttpUrl(value);
  return toExternalHttpUrl(value);
}

export function sanitizeBuilderProfileLinks(links: unknown): SanitizedBuilderLinks {
  const raw = links && typeof links === 'object' ? (links as Record<string, unknown>) : {};
  return {
    github: githubProfileHref(raw.github),
    linkedin: linkedInProfileHref(raw.linkedin),
    portfolio: websiteHref(raw.portfolio),
    personalWebsite: websiteHref(raw.personalWebsite),
    resume: toExternalHttpUrl(raw.resume),
    devpost: hostHref(raw.devpost, ['devpost.com']),
    twitter: hostHref(raw.twitter, ['twitter.com', 'x.com']),
  };
}

export function builderLinkLabel(key: string): string {
  return LINK_LABELS[key] || key;
}

export function visibleBuilderLinkEntries(
  links: unknown,
  builderId?: string | null
): Array<{ key: string; href: string; label: string }> {
  const sanitized = sanitizeBuilderProfileLinks(links);
  const entries: Array<{ key: string; href: string; label: string }> = [];
  const seen = new Set<string>();
  for (const key of LINK_KEYS) {
    const href = sanitized[key];
    if (!href) continue;
    const nextHref =
      key === 'resume' && String(builderId || '').trim()
        ? `/api/builders/${encodeURIComponent(String(builderId).trim())}/resume`
        : href;
    const dedupeKey = nextHref.replace(/\/+$/, '').toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push({ key, href: nextHref, label: builderLinkLabel(key) });
  }
  return entries;
}
