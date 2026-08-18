export type BuilderLocationSource = 'profile' | 'current_experience' | 'experience' | null;

export type ResolvedBuilderLocation = {
  text: string | null;
  source: BuilderLocationSource;
};

const REGION_ALIASES: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  america: 'united states',
  uk: 'united kingdom',
  britain: 'united kingdom',
  england: 'united kingdom',
  bengaluru: 'bangalore',
  banglore: 'bangalore',
  bombay: 'mumbai',
  calcutta: 'kolkata',
  madras: 'chennai',
  nyc: 'new york',
  sf: 'san francisco',
  'bay area': 'san francisco',
  az: 'arizona',
  ca: 'california',
  ny: 'new york',
  tx: 'texas',
  wa: 'washington',
};

const CITY_TO_REGION: Record<string, string> = {
  mumbai: 'india',
  pune: 'india',
  bangalore: 'india',
  hyderabad: 'india',
  chennai: 'india',
  delhi: 'india',
  noida: 'india',
  gurgaon: 'india',
  gurugram: 'india',
  kolkata: 'india',
  ahmedabad: 'india',
  jaipur: 'india',
  tempe: 'united states',
  phoenix: 'united states',
  seattle: 'united states',
  austin: 'united states',
  'san francisco': 'united states',
  'new york': 'united states',
  chicago: 'united states',
  boston: 'united states',
  london: 'united kingdom',
  toronto: 'canada',
  vancouver: 'canada',
  berlin: 'germany',
  singapore: 'singapore',
};

const WORK_MODE_TOKENS = new Set([
  'remote',
  'hybrid',
  'onsite',
  'on-site',
  'office',
  'anywhere',
  'worldwide',
  'global',
  'distributed',
]);

const GEO_STOP_TOKENS = new Set([
  ...WORK_MODE_TOKENS,
  'based',
  'fully',
  'only',
  'needed',
  'preference',
  'preferred',
  'timezone',
  'timezones',
  'able',
  'work',
  'from',
]);

const JUNK_LOCATION_PATTERNS = [
  /^\[object object\]$/i,
  /california privacy choices/i,
  /your privacy choices/i,
  /linkedin\.com/i,
  /^https?:/i,
  /cookie/i,
  /sign in to/i,
];

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isPlausibleLocation(value: unknown): boolean {
  const text = clean(value);
  if (!text) return false;
  if (text.length < 2 || text.length > 160) return false;
  if (!/[a-z]/i.test(text)) return false;
  return !JUNK_LOCATION_PATTERNS.some((pattern) => pattern.test(text));
}

function splitLocationParts(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[|/]/g, ',')
    .split(/[,·•]+/)
    .map((part) => part.replace(/\b(area|region|metropolitan|metro)\b/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 2);
}

export function normalizeLocationTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const tokens = new Set<string>();
  for (const part of splitLocationParts(text)) {
    const alias = REGION_ALIASES[part] || part;
    tokens.add(alias);
    const region = CITY_TO_REGION[alias];
    if (region) tokens.add(region);
    for (const word of alias.split(/\s+/)) {
      if (word.length >= 3 && !['the', 'and', 'for'].includes(word)) tokens.add(REGION_ALIASES[word] || word);
    }
  }
  return [...tokens];
}

function isUsefulGeoToken(token: string): boolean {
  if (GEO_STOP_TOKENS.has(token) || token.length < 3) return false;
  if (CITY_TO_REGION[token]) return true;
  if (Object.values(CITY_TO_REGION).includes(token)) return true;
  if (REGION_ALIASES[token]) return true;
  if (Object.values(REGION_ALIASES).includes(token)) return true;
  if (token.includes(' ')) return false;
  return /^[a-z][a-z.-]+$/.test(token);
}

function geoTokensFromText(text: string | null | undefined): string[] {
  return normalizeLocationTokens(text).filter(isUsefulGeoToken);
}

export function collectBuilderLocationTexts(builder: any): string[] {
  const texts: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    if (!isPlausibleLocation(value)) return;
    const text = String(value).trim();
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    texts.push(text);
  };

  push(builder?.location);
  const experiences = Array.isArray(builder?.experiences) ? builder.experiences : [];
  for (const entry of experiences) push(entry?.location);
  return texts;
}

export function builderLocationSearchTerms(builder: any): string[] {
  const tokens = new Set<string>();
  for (const text of collectBuilderLocationTexts(builder)) {
    for (const token of geoTokensFromText(text)) tokens.add(token);
  }
  return [...tokens];
}

export function resolveBuilderBaseLocation(builder: any): ResolvedBuilderLocation {
  const profile = isPlausibleLocation(builder?.location) ? clean(builder.location) : null;
  if (profile) return { text: profile, source: 'profile' };

  const experiences = Array.isArray(builder?.experiences) ? builder.experiences : [];
  const current = experiences.find((entry: any) => entry?.isCurrent && isPlausibleLocation(entry?.location));
  if (current) return { text: clean(current.location), source: 'current_experience' };

  const withLocation = experiences.find((entry: any) => isPlausibleLocation(entry?.location));
  if (withLocation) return { text: clean(withLocation.location), source: 'experience' };

  return { text: null, source: null };
}

export function roleLocationText(opportunity: any): string {
  return [
    opportunity?.locationPreference,
    opportunity?.location,
    opportunity?.workMode,
    opportunity?.availabilityNeeded,
  ]
    .map(clean)
    .filter(Boolean)
    .join(', ');
}

export function roleGeoSearchTerms(opportunity: any): string[] {
  const tokens = new Set<string>();
  const add = (value: unknown) => {
    for (const token of geoTokensFromText(String(value || ''))) tokens.add(token);
  };

  add(roleLocationText(opportunity));
  const requirements = Array.isArray(opportunity?.searchPlan?.requirements)
    ? opportunity.searchPlan.requirements
    : Array.isArray(opportunity?.searchRequirements)
      ? opportunity.searchRequirements
      : [];
  for (const requirement of requirements) {
    const text = String(requirement?.text || '');
    if (!looksLikeGeoRequirement(text)) continue;
    add(text);
  }
  return [...tokens];
}

export function locationQueryNeedles(terms: string[]): string[] {
  const needles = new Set<string>();
  for (const term of terms) {
    const token = String(term || '').trim().toLowerCase();
    if (token.length < 3 || GEO_STOP_TOKENS.has(token)) continue;
    needles.add(token);
    for (const [alias, canonical] of Object.entries(REGION_ALIASES)) {
      if (canonical === token || alias === token) {
        needles.add(alias);
        needles.add(canonical);
      }
    }
  }
  return [...needles];
}

export function locationMatchRegex(terms: string[]): RegExp | null {
  const needles = locationQueryNeedles(terms)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean);
  if (!needles.length) return null;
  return new RegExp(`(?:^|[^a-z])(?:${needles.join('|')})(?:[^a-z]|$)`, 'i');
}

export function looksLikeGeoRequirement(text: string): boolean {
  const cleaned = String(text || '').trim();
  if (!cleaned) return false;
  if (!/\b(based|located|location|remote|onsite|on-site|hybrid|timezone|time zone)\b/i.test(cleaned)) {
    return geoTokensFromText(cleaned).some((token) => Boolean(CITY_TO_REGION[token]));
  }
  return geoTokensFromText(cleaned).length > 0;
}

export function roleWantsRemote(opportunity: any): boolean {
  return /remote|anywhere|distributed/i.test(roleLocationText(opportunity) || '');
}

/**
 * 0–1 geographic fit. Unknown builder location stays neutral.
 * Remote-only roles without a country/city stay high.
 */
export function scoreLocationFit(builder: any, opportunity: any): number {
  const geoTokens = roleGeoSearchTerms(opportunity);
  if (geoTokens.length === 0) {
    return roleWantsRemote(opportunity) ? 0.85 : 0.7;
  }

  const resolved = resolveBuilderBaseLocation(builder);
  const currentTokens = new Set(normalizeLocationTokens(resolved.text));
  const roleCities = geoTokens.filter((token) => CITY_TO_REGION[token]);
  const cityOverlap = roleCities.filter((token) => currentTokens.has(token));
  if (cityOverlap.length > 0) return 1;

  if (roleCities.length > 0) {
    const sameCountry = roleCities.some((city) => {
      const region = CITY_TO_REGION[city];
      return region && currentTokens.has(region);
    });
    if (sameCountry) return 0.62;
  } else {
    const regionOverlap = geoTokens.filter((token) => currentTokens.has(token));
    if (regionOverlap.length > 0) return 0.82;
  }

  const corpusTokens = new Set(builderLocationSearchTerms(builder));
  const pastCityHit = roleCities.some((token) => corpusTokens.has(token));
  if (pastCityHit) return 0.62;
  const pastOverlap = geoTokens.filter((token) => corpusTokens.has(token));
  if (pastOverlap.length > 0) return 0.5;

  if (!currentTokens.size && corpusTokens.size === 0) return 0.48;
  return roleWantsRemote(opportunity) ? 0.35 : 0.18;
}

export function locationFitLabel(builder: any, opportunity: any): string | null {
  const resolved = resolveBuilderBaseLocation(builder);
  if (!resolved.text) return null;
  const fit = scoreLocationFit(builder, opportunity);
  if (fit >= 0.8) return `Based in ${resolved.text}`;
  if (fit <= 0.35 && roleLocationText(opportunity)) {
    return `Based in ${resolved.text} — may not match ${roleLocationText(opportunity)}`;
  }
  return `Based in ${resolved.text}`;
}

export type ShortlistLocationBucket = 'requested_city' | 'requested_country' | 'other' | 'unknown';

export type ShortlistLocationRow = {
  name: string;
  location: string | null;
  bucket: ShortlistLocationBucket;
};

export type ShortlistLocationMix = {
  requested: string | null;
  requestedCities: string[];
  requestedCountries: string[];
  requestedCityCount: number;
  requestedCountryCount: number;
  otherCount: number;
  unknownCount: number;
  builders: ShortlistLocationRow[];
  summary: string | null;
};

function titleCaseGeo(token: string): string {
  return token
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function uniquePlaces(rows: ShortlistLocationRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const place = String(row.location || '').trim();
    if (!place) continue;
    const key = place.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}

function renderLocationMixSummary(mix: Omit<ShortlistLocationMix, 'summary'>): string | null {
  if (!mix.builders.length) return null;
  const cityLabel = mix.requestedCities.map(titleCaseGeo).join('/');
  const countryLabel = mix.requestedCountries.map(titleCaseGeo).join('/');

  if (!mix.requestedCities.length && !mix.requestedCountries.length) {
    const known = mix.builders.filter((row) => row.location);
    if (!known.length) return null;
    return `Locations: ${known.map((row) => `${row.name} (${row.location})`).join('; ')}.`;
  }

  const parts: string[] = [];
  if (mix.requestedCities.length) {
    if (mix.requestedCityCount === 0) {
      parts.push(`None of the ${mix.builders.length} builders are currently in ${cityLabel}.`);
    } else if (mix.requestedCityCount === 1) {
      const who = mix.builders.find((row) => row.bucket === 'requested_city');
      parts.push(`We found 1 builder in ${cityLabel}${who?.name ? ` (${who.name})` : ''}.`);
    } else {
      parts.push(`We found ${mix.requestedCityCount} builders in ${cityLabel}.`);
    }
  }

  if (mix.requestedCountryCount > 0) {
    const rest = mix.builders.filter((row) => row.bucket === 'requested_country');
    const places = uniquePlaces(rest);
    const placeSuffix = places.length ? ` (${places.join(', ')})` : '';
    if (mix.requestedCities.length) {
      const n = mix.requestedCountryCount;
      parts.push(
        n === 1
          ? `The other 1 is elsewhere in ${countryLabel}${placeSuffix}.`
          : `The rest are from other parts of ${countryLabel}${placeSuffix}.`
      );
    } else if (mix.requestedCountryCount === mix.builders.length) {
      parts.push(`All ${mix.builders.length} builders are in ${countryLabel}.`);
    } else {
      parts.push(`${mix.requestedCountryCount} builders are in ${countryLabel}${placeSuffix}.`);
    }
  }

  if (mix.otherCount > 0) {
    parts.push(`${mix.otherCount} ${mix.otherCount === 1 ? 'is' : 'are'} outside ${countryLabel || cityLabel || 'the requested location'}.`);
  }
  if (mix.unknownCount > 0) {
    parts.push(`${mix.unknownCount} ${mix.unknownCount === 1 ? 'has' : 'have'} no usable location on file.`);
  }

  return parts.join(' ') || null;
}

export function summarizeShortlistLocations(
  builders: Array<{ name?: string | null; location?: unknown; experiences?: any[] }>,
  opportunity: any
): ShortlistLocationMix {
  const requested = roleLocationText(opportunity) || null;
  const geoTokens = roleGeoSearchTerms(opportunity);
  const requestedCities = geoTokens.filter((token) => CITY_TO_REGION[token]);
  const requestedCountries = [...new Set([
    ...geoTokens.filter((token) => Object.values(CITY_TO_REGION).includes(token)),
    ...requestedCities.map((city) => CITY_TO_REGION[city]).filter(Boolean),
  ])];

  const rows: ShortlistLocationRow[] = builders.map((builder) => {
    const resolved = resolveBuilderBaseLocation(builder);
    const tokens = new Set(normalizeLocationTokens(resolved.text));
    let bucket: ShortlistLocationBucket = 'unknown';
    if (!resolved.text) bucket = 'unknown';
    else if (requestedCities.some((city) => tokens.has(city))) bucket = 'requested_city';
    else if (requestedCountries.some((country) => tokens.has(country))) bucket = 'requested_country';
    else bucket = 'other';
    return {
      name: String(builder?.name || 'Builder'),
      location: resolved.text,
      bucket,
    };
  });

  const mix = {
    requested,
    requestedCities,
    requestedCountries,
    requestedCityCount: rows.filter((row) => row.bucket === 'requested_city').length,
    requestedCountryCount: rows.filter((row) => row.bucket === 'requested_country').length,
    otherCount: rows.filter((row) => row.bucket === 'other').length,
    unknownCount: rows.filter((row) => row.bucket === 'unknown').length,
    builders: rows,
  };

  return { ...mix, summary: renderLocationMixSummary(mix) };
}

export function reserveGeoShortlistSeats<T extends { builder?: any; builderId?: unknown }>(
  ranked: T[],
  opportunity: any,
  limit: number
): T[] {
  if (!roleGeoSearchTerms(opportunity).length || ranked.length <= limit || limit <= 0) {
    return ranked;
  }

  const isGeo = (entry: T) => scoreLocationFit(entry.builder, opportunity) >= 0.8;
  const geoCount = ranked.filter(isGeo).length;
  if (!geoCount) return ranked;

  const reserved = Math.min(geoCount, Math.max(1, Math.ceil(limit * 0.4)));
  const result: T[] = [];
  let geoTaken = 0;

  for (const entry of ranked) {
    if (result.length >= limit) break;
    const geo = isGeo(entry);
    const geoStillNeeded = reserved - geoTaken;
    const seatsLeft = limit - result.length;
    if (!geo && seatsLeft <= geoStillNeeded) continue;
    result.push(entry);
    if (geo) geoTaken += 1;
  }

  if (result.length < limit) {
    const seen = new Set(result);
    for (const entry of ranked) {
      if (result.length >= limit) break;
      if (seen.has(entry)) continue;
      result.push(entry);
    }
  }

  return result;
}
