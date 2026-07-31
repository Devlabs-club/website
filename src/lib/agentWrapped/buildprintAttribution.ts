import type { BuildprintAcquisitionSource } from './buildprintTypes';
import type { WrappedCardKey } from '@/components/builder/wrapped/theme';

export const BUILDPRINT_ATTR_KEY = 'devlabs_buildprint_attr';

export type BuildprintAttr = BuildprintAcquisitionSource & {
  sourceBuilderId?: string;
  referringBuildprintId?: string;
  card?: string;
  channel?: string;
  ctaPlacement?: string;
  campaign?: string;
  methodologyVersion?: string;
  ts?: number;
};

const CARD_SHORT: Record<string, WrappedCardKey> = {
  cover: 'cover',
  cv: 'cover',
  time: 'time',
  t: 'time',
  tokens: 'tokens',
  k: 'tokens',
  models: 'models',
  m: 'models',
  rhythm: 'rhythm',
  r: 'rhythm',
  stack: 'stack',
  s: 'stack',
  buildsurface: 'buildSurface',
  bs: 'buildSurface',
  agents: 'agents',
  a: 'agents',
  identity: 'identity',
  i: 'identity',
  convert: 'convert',
  g: 'convert',
};

const CARD_TO_SHORT: Record<WrappedCardKey, string> = {
  cover: 'cv',
  time: 't',
  tokens: 'k',
  models: 'm',
  rhythm: 'r',
  stack: 's',
  buildSurface: 'bs',
  agents: 'a',
  identity: 'i',
  convert: 'g',
};

const CHANNEL_SHORT: Record<string, string> = {
  x: 'x',
  twitter: 'x',
  linkedin: 'li',
  li: 'li',
  link: 'l',
  l: 'l',
  download: 'd',
  native: 'n',
};

export function parseShareCardParam(raw: string | null | undefined): WrappedCardKey | null {
  if (!raw) return null;
  return CARD_SHORT[raw.trim().toLowerCase()] || null;
}

export function readBuildprintAttrFromSearch(search: string): BuildprintAttr {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const card =
    parseShareCardParam(params.get('c')) ||
    parseShareCardParam(params.get('card')) ||
    undefined;
  const channelRaw = params.get('ch') || params.get('channel') || undefined;
  const channel = channelRaw ? CHANNEL_SHORT[channelRaw.toLowerCase()] || channelRaw : undefined;
  return {
    sourceBuilderId: params.get('from') || params.get('sourceBuilderId') || undefined,
    referringBuildprintId: params.get('reportId') || params.get('referringBuildprintId') || undefined,
    card,
    channel,
    ctaPlacement: params.get('cta') || params.get('ctaPlacement') || undefined,
    campaign: params.get('ref') || params.get('campaign') || undefined,
    methodologyVersion: params.get('mv') || params.get('methodologyVersion') || undefined,
    ts: Date.now(),
  };
}

export function persistBuildprintAttr(attr: BuildprintAttr) {
  if (typeof window === 'undefined') return;
  const cleaned = Object.fromEntries(
    Object.entries(attr).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  if (!Object.keys(cleaned).length) return;
  try {
    window.localStorage.setItem(BUILDPRINT_ATTR_KEY, JSON.stringify(cleaned));
    document.cookie = `${BUILDPRINT_ATTR_KEY}=${encodeURIComponent(JSON.stringify(cleaned))}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  } catch {
    // ignore
  }
}

export function loadBuildprintAttr(): BuildprintAttr | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BUILDPRINT_ATTR_KEY);
    if (raw) return JSON.parse(raw) as BuildprintAttr;
  } catch {
    // fall through
  }
  return null;
}

/** Compact share URL: /builder/wrapped/:id?c=t&ch=x */
export function buildShareUrl(
  baseUrl: string,
  attr: Partial<BuildprintAttr> & { card?: string; channel?: string } = {}
) {
  try {
    const url = new URL(baseUrl, typeof window !== 'undefined' ? window.location.origin : 'https://www.devlabs.club');
    // Drop legacy bloated tracking params from any incoming base.
    ['ref', 'source', 'card', 'channel', 'cta', 'from', 'reportId', 'mv', 'c', 'ch'].forEach((key) =>
      url.searchParams.delete(key)
    );

    const cardKey = parseShareCardParam(attr.card) || (attr.card as WrappedCardKey | undefined);
    if (cardKey && CARD_TO_SHORT[cardKey]) {
      url.searchParams.set('c', CARD_TO_SHORT[cardKey]);
    }
    if (attr.channel) {
      const ch = CHANNEL_SHORT[attr.channel.toLowerCase()] || attr.channel;
      url.searchParams.set('ch', ch);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}

export function shortCardParam(card: WrappedCardKey | string | undefined | null): string | null {
  const key = parseShareCardParam(card || null) || (card as WrappedCardKey | null);
  if (!key || !CARD_TO_SHORT[key]) return null;
  return CARD_TO_SHORT[key];
}

export function getBuildprintSignupHref(nextPath = '/builder/home') {
  const redirect = encodeURIComponent(nextPath);
  return `/auth/signup?redirect=${redirect}`;
}

export function getBuildprintCtaHref(viewer: 'signed_out' | 'builder' | 'founder' | 'owner') {
  if (viewer === 'founder') return '/founder/home';
  if (viewer === 'builder' || viewer === 'owner') return '/builder/home';
  return getBuildprintSignupHref();
}
