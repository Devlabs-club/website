const DOMAIN_OVERRIDES: Record<string, string> = {
  google: 'google.com',
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
};

function compactCompanyKey(company: string) {
  return company.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function domainFromLinkedInUrl(companyLinkedInUrl?: string | null) {
  if (!companyLinkedInUrl) return null;
  try {
    const url = new URL(companyLinkedInUrl);
    const slug = url.pathname.match(/\/company\/([^/]+)/i)?.[1];
    if (!slug) return null;
    return `${slug.replace(/-/g, '')}.com`;
  } catch {
    return null;
  }
}

/** Best-effort logo for display when enrichment did not persist a company image URL. */
export function resolveCompanyLogoUrl(
  company: string,
  storedLogoUrl?: string | null,
  companyLinkedInUrl?: string | null
) {
  if (typeof storedLogoUrl === 'string' && storedLogoUrl.trim()) return storedLogoUrl.trim();

  const linkedInDomain = domainFromLinkedInUrl(companyLinkedInUrl);
  const key = compactCompanyKey(company);
  const domain = linkedInDomain || (key ? DOMAIN_OVERRIDES[key] || `${key}.com` : null);
  if (!domain) return null;

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}
