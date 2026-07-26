import type { BuildprintAcquisitionSource } from './buildprintTypes';

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

export function readBuildprintAttrFromSearch(search: string): BuildprintAttr {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return {
    sourceBuilderId: params.get('sourceBuilderId') || params.get('from') || undefined,
    referringBuildprintId: params.get('reportId') || params.get('referringBuildprintId') || undefined,
    card: params.get('card') || undefined,
    channel: params.get('channel') || undefined,
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

export function buildShareUrl(baseUrl: string, attr: Partial<BuildprintAttr>) {
  try {
    const url = new URL(baseUrl, typeof window !== 'undefined' ? window.location.origin : 'https://www.devlabs.club');
    url.searchParams.set('ref', attr.campaign || 'buildprint');
    url.searchParams.set('source', 'builder-share');
    if (attr.card) url.searchParams.set('card', attr.card);
    if (attr.channel) url.searchParams.set('channel', attr.channel);
    if (attr.ctaPlacement) url.searchParams.set('cta', attr.ctaPlacement);
    if (attr.sourceBuilderId) url.searchParams.set('from', attr.sourceBuilderId);
    if (attr.referringBuildprintId) url.searchParams.set('reportId', attr.referringBuildprintId);
    if (attr.methodologyVersion) url.searchParams.set('mv', attr.methodologyVersion);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

export function getBuildprintSignupHref(nextPath = '/builder/buildprint/get?step=command') {
  const redirect = encodeURIComponent(nextPath);
  return `/auth/signup?redirect=${redirect}`;
}

export function getBuildprintCtaHref(viewer: 'signed_out' | 'builder' | 'founder' | 'owner') {
  if (viewer === 'founder') return '/founder/home';
  if (viewer === 'builder' || viewer === 'owner') return '/builder/buildprint/get?step=command';
  return getBuildprintSignupHref();
}
