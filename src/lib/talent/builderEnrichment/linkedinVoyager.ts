import { normalizeUrl } from './urlToMarkdown';
import { LinkedInCookieJar } from './linkedinSessionJar';
import type { LinkedInSessionConfig } from './linkedinTypes';

export type { LinkedInSessionConfig } from './linkedinTypes';

export type LinkedInVoyagerProfile = {
  vanityName: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  location?: string;
  skills: string[];
  positions: Array<{ title?: string; company?: string; description?: string }>;
  education: Array<{ school?: string; degree?: string; field?: string }>;
  rawText: string;
};

const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';

export function parseLinkedInVanityName(input: string): string | null {
  const normalized = normalizeUrl(input);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname.includes('linkedin.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const inIdx = parts.indexOf('in');
    if (inIdx >= 0 && parts[inIdx + 1]) {
      return parts[inIdx + 1].split('?')[0].toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated use LinkedInCookieJar.load() */
export function getLinkedInSessionConfig(): LinkedInSessionConfig | null {
  return LinkedInCookieJar.load()?.session ?? null;
}

function buildVoyagerHeaders(jar: LinkedInCookieJar, referer?: string): Record<string, string> {
  const csrf = jar.session.jsessionId.replace(/^"|"$/g, '');
  return {
    Cookie: jar.buildCookieHeader(),
    'csrf-token': csrf,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'application/vnd.linkedin.normalized+json+2.1',
    'Accept-Language': 'en-US,en;q=0.9',
    'x-li-lang': 'en_US',
    'x-restli-protocol-version': '2.0.0',
    'x-li-page-instance': 'urn:li:page:d_flagship3_profile_view_base;builderEnrichment',
    Referer: referer || 'https://www.linkedin.com/feed/',
  };
}

export class LinkedInSessionError extends Error {
  constructor(
    message: string,
    public code: 'missing_cookies' | 'session_expired' | 'not_found' | 'fetch_failed'
  ) {
    super(message);
    this.name = 'LinkedInSessionError';
  }
}

async function voyagerGet(path: string, jar: LinkedInCookieJar, referer?: string): Promise<Response> {
  const url = path.startsWith('http') ? path : `${VOYAGER_BASE}${path}`;
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: buildVoyagerHeaders(jar, referer),
      signal: AbortSignal.timeout(25000),
      redirect: 'manual',
    });
    const absorb = jar.absorbResponse(res);
    jar.persist();
    if (absorb === 'expired') {
      throw new LinkedInSessionError('LinkedIn session expired during request', 'session_expired');
    }
    if (res.status !== 302) return res;
    lastRes = res;
  }

  return lastRes!;
}

export async function validateLinkedInSession(jar?: LinkedInCookieJar): Promise<boolean> {
  const sessionJar = jar ?? LinkedInCookieJar.load();
  if (!sessionJar) return false;

  try {
    const res = await voyagerGet('/me', sessionJar);
    if (res.status === 302 || res.status === 401) return false;
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(
      data?.miniProfile ||
        data?.['*miniProfile'] ||
        data?.data?.plainId ||
        data?.plainId
    );
  } catch {
    return false;
  }
}

function collectStrings(node: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || node == null) return out;
  if (typeof node === 'string') {
    const s = node.trim();
    if (s.length > 1 && s.length < 500) out.push(s);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out, depth + 1);
    return out;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectStrings(value, out, depth + 1);
    }
  }
  return out;
}

function normalizeVanity(vanity: string): string {
  return vanity.toLowerCase().trim();
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getTypeName(node: Record<string, unknown>): string {
  return typeof node.$type === 'string' ? node.$type : '';
}

function indexIncluded(included: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of included) {
    const urn = item.entityUrn;
    if (typeof urn === 'string') map.set(urn, item);
  }
  return map;
}

function extractInnerProfileUrn(urn: string): string | null {
  const match = urn.match(/urn:li:fsd_profile:([^,)]+)/);
  return match ? `urn:li:fsd_profile:${match[1]}` : null;
}

function resolveProfileFromRef(
  ref: unknown,
  index: Map<string, Record<string, unknown>>
): Record<string, unknown> | null {
  if (typeof ref !== 'string' || !ref.startsWith('urn:')) return null;
  const direct = index.get(ref);
  if (direct) return direct;
  const inner = extractInnerProfileUrn(ref);
  if (inner) return index.get(inner) ?? null;
  for (const [urn, node] of index) {
    if (urn.includes(ref) || ref.includes(urn)) return node;
  }
  return null;
}

function findProfileByVanity(
  data: Record<string, unknown>,
  vanityName: string
): Record<string, unknown> | null {
  const vanity = normalizeVanity(vanityName);
  const included = asArray(data.included as Record<string, unknown>[] | undefined);
  const index = indexIncluded(included);

  const byPublicId = included.find(
    (item) =>
      typeof item.publicIdentifier === 'string' &&
      normalizeVanity(item.publicIdentifier) === vanity
  );
  if (byPublicId) return byPublicId;

  const elements = asArray(
    (data.data as Record<string, unknown> | undefined)?.elements ?? data.elements
  );
  for (const element of elements) {
    if (!element || typeof element !== 'object') continue;
    const el = element as Record<string, unknown>;
    const refs = [
      el.entityUrn,
      el['*profile'],
      el.profileUrn,
      el['*miniProfile'],
    ];
    for (const ref of refs) {
      const resolved = resolveProfileFromRef(ref, index);
      if (
        resolved &&
        typeof resolved.publicIdentifier === 'string' &&
        normalizeVanity(resolved.publicIdentifier) === vanity
      ) {
        return resolved;
      }
    }
  }

  return null;
}

function readLocalized(
  node: Record<string, unknown>,
  field: string,
  localizedField?: string
): string | undefined {
  const direct = node[field];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const localized = node[localizedField || `multiLocale${field[0].toUpperCase()}${field.slice(1)}`];
  if (Array.isArray(localized)) {
    const first = localized.find((x) => typeof x?.value === 'string');
    if (first?.value) return String(first.value).trim();
  }
  return undefined;
}

function isViewerIdentityNode(node: Record<string, unknown>, vanityName: string): boolean {
  const vanity = normalizeVanity(vanityName);
  const pub = node.publicIdentifier;
  if (typeof pub === 'string' && normalizeVanity(pub) !== vanity) {
    const type = getTypeName(node);
    if (type.includes('MiniProfile') || type.includes('Profile')) return true;
  }
  return false;
}

function referencesProfileUrn(node: Record<string, unknown>, profileUrn: string): boolean {
  return JSON.stringify(node).includes(profileUrn);
}

function pickProfileFields(data: any, vanityName: string): Partial<LinkedInVoyagerProfile> {
  const included = asArray<Record<string, unknown>>(data?.included);
  const profile = findProfileByVanity(data, vanityName);

  if (!profile) {
    return {};
  }

  const profileUrn = typeof profile.entityUrn === 'string' ? profile.entityUrn : null;
  const firstName = readLocalized(profile, 'firstName');
  const lastName = readLocalized(profile, 'lastName');
  const headline =
    readLocalized(profile, 'headline') ||
    (typeof profile.occupation === 'string' ? profile.occupation : undefined);
  const summary = readLocalized(profile, 'summary');
  const location =
    (typeof profile.geoLocationName === 'string' && profile.geoLocationName) ||
    (typeof profile.locationName === 'string' && profile.locationName) ||
    undefined;

  const skills: string[] = [];
  const positions: LinkedInVoyagerProfile['positions'] = [];
  const education: LinkedInVoyagerProfile['education'] = [];

  for (const node of included) {
    if (isViewerIdentityNode(node, vanityName)) continue;

    const type = getTypeName(node);
    const linkedToProfile =
      !profileUrn ||
      referencesProfileUrn(node, profileUrn) ||
      !type.includes('Profile') ||
      normalizeVanity(String(node.publicIdentifier || '')) === normalizeVanity(vanityName);

    if (!linkedToProfile && (type.includes('Skill') || type.includes('Position') || type.includes('Education'))) {
      continue;
    }

    if (type.includes('Skill') || (typeof node.name === 'string' && node.endorsementCount !== undefined)) {
      skills.push(String(node.name));
      continue;
    }

    if (type.includes('Position') || (typeof node.title === 'string' && node.companyName !== undefined)) {
      positions.push({
        title: readLocalized(node, 'title'),
        company:
          (typeof node.companyName === 'string' && node.companyName) ||
          (typeof (node.company as Record<string, unknown>)?.name === 'string'
            ? String((node.company as Record<string, unknown>).name)
            : undefined),
        description: readLocalized(node, 'description'),
      });
      continue;
    }

    if (type.includes('Education') || (typeof node.schoolName === 'string' && node.degreeName !== undefined)) {
      education.push({
        school:
          (typeof node.schoolName === 'string' && node.schoolName) ||
          (typeof (node.school as Record<string, unknown>)?.name === 'string'
            ? String((node.school as Record<string, unknown>).name)
            : undefined),
        degree: typeof node.degreeName === 'string' ? node.degreeName : undefined,
        field: typeof node.fieldOfStudy === 'string' ? node.fieldOfStudy : undefined,
      });
    }
  }

  return {
    firstName,
    lastName,
    headline,
    summary,
    location,
    skills: [...new Set(skills.filter(Boolean))],
    positions: positions.filter((p) => p.title || p.company),
    education: education.filter((e) => e.school || e.degree),
  };
}

function profileToRawText(profile: LinkedInVoyagerProfile): string {
  const lines: string[] = [];
  lines.push(`Name: ${[profile.firstName, profile.lastName].filter(Boolean).join(' ')}`);
  if (profile.headline) lines.push(`Headline: ${profile.headline}`);
  if (profile.summary) lines.push(`Summary: ${profile.summary}`);
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.skills.length) lines.push(`Skills: ${profile.skills.join(', ')}`);
  for (const p of profile.positions) {
    lines.push(
      `Experience: ${[p.title, p.company].filter(Boolean).join(' at ')}${p.description ? ` — ${p.description.slice(0, 200)}` : ''}`
    );
  }
  for (const e of profile.education) {
    lines.push(`Education: ${[e.school, e.degree, e.field].filter(Boolean).join(' — ')}`);
  }
  return lines.join('\n').slice(0, 8000);
}

export { pickProfileFields, findProfileByVanity };

export async function fetchLinkedInProfileViaVoyager(
  linkedinUrl: string
): Promise<LinkedInVoyagerProfile> {
  const jar = LinkedInCookieJar.load();
  if (!jar) {
    throw new LinkedInSessionError('LinkedIn cookies not configured', 'missing_cookies');
  }

  const valid = await validateLinkedInSession(jar);
  if (!valid) {
    throw new LinkedInSessionError(
      'LinkedIn session expired or invalid — copy a fresh Cookie header from a voyager/api request in DevTools (li_at + JSESSIONID must be from the same request), update .dev.vars, delete .linkedin-session.json',
      'session_expired'
    );
  }

  const vanityName = parseLinkedInVanityName(linkedinUrl);
  if (!vanityName) {
    throw new LinkedInSessionError('Invalid LinkedIn profile URL', 'not_found');
  }

  const decoration =
    'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-91';
  const path = `/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(vanityName)}&decorationId=${decoration}`;
  const profileReferer = `https://www.linkedin.com/in/${vanityName}/`;

  const res = await voyagerGet(path, jar, profileReferer);
  if (res.status === 302 || res.status === 401) {
    throw new LinkedInSessionError('LinkedIn session rejected by API', 'session_expired');
  }
  if (res.status === 404) {
    throw new LinkedInSessionError('LinkedIn profile not found', 'not_found');
  }
  if (!res.ok) {
    throw new LinkedInSessionError(`LinkedIn API HTTP ${res.status}`, 'fetch_failed');
  }

  const data = await res.json();
  const picked = pickProfileFields(data, vanityName);

  const profile: LinkedInVoyagerProfile = {
    vanityName,
    firstName: picked.firstName,
    lastName: picked.lastName,
    headline: picked.headline,
    summary: picked.summary,
    location: picked.location,
    skills: picked.skills || [],
    positions: (picked.positions || []).slice(0, 6),
    education: (picked.education || []).slice(0, 4),
    rawText: '',
  };

  if (!profile.firstName && !profile.headline && profile.skills.length === 0) {
    profile.rawText = collectStrings(data).slice(0, 200).join('\n').slice(0, 6000);
  } else {
    profile.rawText = profileToRawText(profile);
  }

  if (!profile.rawText.trim()) {
    throw new LinkedInSessionError('LinkedIn profile returned empty payload', 'fetch_failed');
  }

  return profile;
}
