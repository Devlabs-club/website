const DOMAIN_OVERRIDES: Record<string, string> = {
  google: 'google.com',
  dropbox: 'dropbox.com',
  cloudflare: 'cloudflare.com',
  meta: 'meta.com',
  facebook: 'meta.com',
  amazon: 'amazon.com',
  microsoft: 'microsoft.com',
  apple: 'apple.com',
  netflix: 'netflix.com',
  stripe: 'stripe.com',
  openai: 'openai.com',
  anthropic: 'anthropic.com',
  headstarter: 'headstarter.co',
  headstarterai: 'headstarter.co',
  arizonastateuniversity: 'asu.edu',
  asu: 'asu.edu',
  fultonschoolsofengineeringtutoringcentersasu: 'asu.edu',
};

/** Strip legal suffixes so "Dropbox, Inc." → "dropbox", not "dropboxinc". */
function compactCompanyKey(company: string) {
  return company
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(co\.?|company|inc\.?|incorporated|llc|ltd\.?|limited|corp\.?|corporation|plc)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function domainFromLinkedInUrl(companyLinkedInUrl?: string | null) {
  if (!companyLinkedInUrl) return null;
  try {
    const url = new URL(companyLinkedInUrl);
    const slug = url.pathname.match(/\/company\/([^/]+)/i)?.[1];
    // Numeric slugs are LinkedIn company IDs, not domains ("/company/1441" is Google).
    if (!slug || /^\d+$/.test(slug)) return null;
    const normalized = slug.toLowerCase().replace(/-/g, '');
    return DOMAIN_OVERRIDES[normalized] || `${normalized}.com`;
  } catch {
    return null;
  }
}

/** Best-effort logo for display when enrichment did not persist a company image URL. */
export function isUnreliableCompanyLogoUrl(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) return true;
  // LinkedIn CDN signed URLs expire and commonly 403 in production UIs.
  return /media\.licdn\.com|static\.licdn\.com/i.test(value);
}

export function resolveCompanyLogoUrl(
  company: string,
  storedLogoUrl?: string | null,
  companyLinkedInUrl?: string | null
) {
  if (typeof storedLogoUrl === 'string' && storedLogoUrl.trim() && !isUnreliableCompanyLogoUrl(storedLogoUrl)) {
    return storedLogoUrl.trim();
  }

  const linkedInDomain = domainFromLinkedInUrl(companyLinkedInUrl);
  const key = compactCompanyKey(company);
  const domain = linkedInDomain || (key ? DOMAIN_OVERRIDES[key] || `${key}.com` : null);
  if (!domain) return null;

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}
