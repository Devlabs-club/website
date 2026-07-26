export type BuildprintFunnelEvent =
  | 'buildprint_public_viewed'
  | 'buildprint_identity_viewed'
  | 'buildprint_story_completed'
  | 'buildprint_cta_viewed'
  | 'buildprint_cta_clicked'
  | 'buildprint_signup_started'
  | 'buildprint_signup_completed'
  | 'buildprint_command_copied'
  | 'buildprint_analysis_uploaded'
  | 'buildprint_generated'
  | 'buildprint_published'
  | 'buildprint_discoverability_enabled'
  | 'buildprint_share_started'
  | 'buildprint_share_completed';

export type BuildprintFunnelProps = {
  builderId?: string;
  anonymousSessionId?: string;
  referringBuildprintId?: string;
  sourceBuilderId?: string;
  ctaPlacement?: string;
  card?: string;
  channel?: string;
  methodologyVersion?: string;
  [key: string]: string | number | boolean | undefined;
};

function anonId() {
  if (typeof window === 'undefined') return undefined;
  try {
    const key = 'devlabs_bp_anon';
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = `anon_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return undefined;
  }
}

export function trackBuildprintEvent(event: BuildprintFunnelEvent, props: BuildprintFunnelProps = {}) {
  if (typeof window === 'undefined') return;
  const payload = {
    ...props,
    anonymousSessionId: props.anonymousSessionId || anonId(),
  };
  try {
    // Vercel Analytics track (optional dependency at runtime)
    const va = (window as any).va;
    if (typeof va === 'function') {
      va('event', { name: event, data: payload });
    }
    import('@vercel/analytics')
      .then((mod) => {
        if (typeof mod.track === 'function') mod.track(event, payload as Record<string, string | number | boolean | null>);
      })
      .catch(() => {
        // no-op when analytics package unavailable
      });
  } catch {
    // never break UX for analytics
  }
}
