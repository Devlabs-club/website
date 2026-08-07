import { createHash } from 'node:crypto';
import { enrichmentOrgSlug } from '@/lib/talent/enrichmentCloudinary';

const COMPANY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Stable cache key for company research (LinkedIn slug > domain > name). */
export function companyResearchCacheKey(params: {
  name?: string | null;
  website?: string | null;
  linkedInUrl?: string | null;
}): string | null {
  const linkedInSlug = enrichmentOrgSlug(params.linkedInUrl || '');
  if (linkedInSlug && /linkedin\.com\/(company|school)\//i.test(String(params.linkedInUrl || ''))) {
    return `li:${linkedInSlug}`;
  }

  const website = String(params.website || '').trim();
  if (website) {
    try {
      const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
        .hostname.toLowerCase()
        .replace(/^www\./, '');
      if (host) return `web:${host}`;
    } catch {
      // fall through
    }
  }

  const nameSlug = enrichmentOrgSlug(params.name || '');
  return nameSlug ? `name:${nameSlug}` : null;
}

export function isCompanyResearchFresh(researchedAt: Date | string | null | undefined, ttlMs = COMPANY_CACHE_TTL_MS) {
  if (!researchedAt) return false;
  const at = researchedAt instanceof Date ? researchedAt.getTime() : new Date(researchedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < ttlMs;
}

/**
 * Compact identity fingerprint for skipping repeat Exa people searches.
 * Hash only — never store raw PII-heavy dumps in logs.
 */
export function hashBuilderExaFingerprint(fingerprintText: string) {
  return createHash('sha256').update(fingerprintText).digest('hex').slice(0, 32);
}

export function buildBuilderExaFingerprint(builder: any, projects: any[] = []) {
  const lines: string[] = [];
  if (builder?.name) lines.push(`Name: ${builder.name}`);
  if (builder?.location) lines.push(`Location: ${builder.location}`);
  if (builder?.universityOrCompany) lines.push(`School/Company: ${builder.universityOrCompany}`);
  if (builder?.headline) lines.push(`Headline: ${builder.headline}`);
  if (builder?.links?.github) lines.push(`GitHub: ${builder.links.github}`);
  if (builder?.links?.linkedin) lines.push(`LinkedIn: ${builder.links.linkedin}`);
  if (builder?.links?.portfolio) lines.push(`Portfolio: ${builder.links.portfolio}`);
  if (builder?.links?.personalWebsite) lines.push(`Website: ${builder.links.personalWebsite}`);
  if (builder?.links?.devpost) lines.push(`Devpost: ${builder.links.devpost}`);
  if (builder?.links?.twitter) lines.push(`Twitter: ${builder.links.twitter}`);
  const exps = (builder?.experiences || [])
    .slice(0, 4)
    .map((e: any) => `${e.title || ''} @ ${e.company || ''}`);
  if (exps.length) lines.push(`Experience: ${exps.join('; ')}`);
  const projs = projects.slice(0, 5).map((p: any) => p.projectName).filter(Boolean);
  if (projs.length) lines.push(`Projects: ${projs.join('; ')}`);
  const text = lines.join('\n');
  return { text, hash: hashBuilderExaFingerprint(text) };
}

export { COMPANY_CACHE_TTL_MS };
