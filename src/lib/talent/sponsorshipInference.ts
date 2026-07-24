/**
 * Infer whether a builder likely needs US work-visa sponsorship.
 * Prefer explicit workAuthorization; fall back to education heuristics.
 * Never invent citizenship — unknown stays unknown.
 */

export type SponsorshipNeed = 'needs_sponsorship' | 'authorized' | 'unknown';

export type SponsorshipInference = {
  need: SponsorshipNeed;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
};

const AUTHORIZED_PATTERNS =
  /\b(us\s*citizen|u\.?s\.?\s*citizen|green\s*card|permanent\s*resident|authorized\s*to\s*work|no\s*sponsorship\s*needed|does\s*not\s*need\s*sponsorship|citizen|gc)\b/i;

const NEEDS_PATTERNS =
  /\b(needs?\s*sponsorship|require[sd]?\s*sponsorship|h-?1b|f-?1|opt|cpt|stem\s*opt|visa\s*required|work\s*authorization\s*needed|sponsorship\s*required)\b/i;

const NON_US_BOARD_PATTERNS =
  /\b(cbse|icse|isc|hsc|ssc|matriculation|a-?\s*levels?|gcse|igcse|waec|neco|kebs|hscbd|intermediate\s*college)\b/i;

const NON_US_COUNTRY_PATTERNS =
  /\b(india|china|nigeria|pakistan|bangladesh|vietnam|philippines|korea|taiwan|brazil|mexico|colombia|egypt|turkey|indonesia|malaysia|singapore|uae|saudi|nepal|sri\s*lanka|ghana|kenya|ethiopia|ukraine|russia|poland|romania|iran|iraq|lebanon|jordan|morocco|tunisia|algeria|peru|chile|argentina|venezuela|ecuador|bolivia|thailand|cambodia|myanmar|laos|mongolia)\b/i;

const US_SCHOOL_HINTS =
  /\b(university|college|institute|school)\b.+\b(usa|u\.s\.a?|united\s*states|california|texas|new\s*york|massachusetts|arizona|florida|illinois|washington|georgia|ohio|michigan|pennsylvania|colorado|virginia|north\s*carolina)\b|\b(asu|mit|stanford|berkeley|ucla|nyu|cmu|gatech|uiuc|umich|harvard|yale|princeton|columbia|cornell|caltech|ut\s*austin|georgia\s*tech)\b/i;

const HIGH_SCHOOL_HINTS =
  /\b(high\s*school|secondary\s*school|senior\s*secondary|higher\s*secondary|class\s*xii|12th\s*grade|prep\s*school)\b/i;

function compact(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function educationBlob(builder: any): string {
  const rows = Array.isArray(builder?.education) ? builder.education : [];
  const parts = rows.flatMap((entry: any) => [
    entry?.school,
    entry?.degree,
    entry?.field,
    entry?.dateRange,
    entry?.location,
    entry?.country,
  ]);
  if (builder?.universityOrCompany) parts.push(builder.universityOrCompany);
  if (builder?.location) parts.push(builder.location);
  return compact(parts.filter(Boolean).join(' | '));
}

export function inferSponsorshipNeed(builder: any): SponsorshipInference {
  const explicit = compact(builder?.workAuthorization);
  if (explicit) {
    if (AUTHORIZED_PATTERNS.test(explicit) && !NEEDS_PATTERNS.test(explicit)) {
      return { need: 'authorized', confidence: 'high', evidence: `workAuthorization: ${explicit.slice(0, 120)}` };
    }
    if (NEEDS_PATTERNS.test(explicit)) {
      return { need: 'needs_sponsorship', confidence: 'high', evidence: `workAuthorization: ${explicit.slice(0, 120)}` };
    }
  }

  const edu = educationBlob(builder);
  if (!edu) {
    return { need: 'unknown', confidence: 'low', evidence: 'No work authorization or education signals' };
  }

  const hasNonUsBoard = NON_US_BOARD_PATTERNS.test(edu);
  const hasNonUsCountry = NON_US_COUNTRY_PATTERNS.test(edu);
  const hasHighSchool = HIGH_SCHOOL_HINTS.test(edu);
  const hasUsSchool = US_SCHOOL_HINTS.test(edu);

  // Foreign high school / secondary board is a strong sponsorship signal.
  if (hasHighSchool && (hasNonUsBoard || hasNonUsCountry) && !hasUsSchool) {
    return {
      need: 'needs_sponsorship',
      confidence: 'high',
      evidence: 'Education suggests secondary schooling outside the US',
    };
  }

  if ((hasNonUsBoard || (hasNonUsCountry && hasHighSchool)) && hasUsSchool) {
    return {
      need: 'needs_sponsorship',
      confidence: 'medium',
      evidence: 'Non-US secondary education with later US undergrad',
    };
  }

  if (hasNonUsCountry && !hasUsSchool && !hasHighSchool) {
    return {
      need: 'needs_sponsorship',
      confidence: 'medium',
      evidence: 'Education/location mentions a non-US country without US school signal',
    };
  }

  if (hasUsSchool && !hasNonUsBoard && !hasNonUsCountry) {
    return {
      need: 'authorized',
      confidence: 'low',
      evidence: 'US school signals only — authorization still unconfirmed',
    };
  }

  return { need: 'unknown', confidence: 'low', evidence: 'Insufficient sponsorship signals' };
}

export function opportunityDoesNotSponsor(opportunity: any): boolean {
  const visa = compact(opportunity?.visa || opportunity?.visaSponsorship || opportunity?.sponsorship);
  return visa === 'no' || visa === 'false' || /\bno\b/.test(visa);
}

/** Soft ranking component when job visa=No. */
export function scoreSponsorshipFit(
  inference: SponsorshipInference,
  jobDoesNotSponsor: boolean
): number {
  if (!jobDoesNotSponsor) return 0.7;
  if (inference.need === 'authorized') {
    return inference.confidence === 'high' ? 1 : inference.confidence === 'medium' ? 0.9 : 0.8;
  }
  if (inference.need === 'needs_sponsorship') {
    return inference.confidence === 'high' ? 0.05 : inference.confidence === 'medium' ? 0.2 : 0.35;
  }
  return 0.45;
}

export function shouldHardExcludeForSponsorship(
  inference: SponsorshipInference,
  jobDoesNotSponsor: boolean
): boolean {
  return (
    jobDoesNotSponsor &&
    inference.need === 'needs_sponsorship' &&
    (inference.confidence === 'high' || inference.confidence === 'medium')
  );
}

export function summarizeSponsorshipCoverage(
  inferences: SponsorshipInference[]
): { known: number; needs: number; authorized: number; unknown: number; message: string } {
  let needs = 0;
  let authorized = 0;
  let unknown = 0;
  for (const item of inferences) {
    if (item.need === 'needs_sponsorship') needs += 1;
    else if (item.need === 'authorized') authorized += 1;
    else unknown += 1;
  }
  const known = needs + authorized;
  const total = inferences.length;
  const message =
    total === 0
      ? ''
      : known === 0
        ? `I don't have clear sponsorship signals for these ${total} matches, so I ranked by skills and GitHub and flagged them as unknown.`
        : unknown > 0
          ? `I only have clear sponsorship signals for ${known}/${total} of these matches; the other ${unknown} ${unknown === 1 ? 'is' : 'are'} unknown, so I ranked by skills/GitHub and flagged them.`
          : `Sponsorship signals are clear for all ${total} matches shown.`;
  return { known, needs, authorized, unknown, message };
}
