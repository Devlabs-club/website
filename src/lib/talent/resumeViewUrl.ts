import { hrefForProfileField } from '@/lib/talent/externalProfileHref';

/**
 * Turn a stored resume URL into a browser-viewable href.
 * Cloudinary raw uploads force Content-Disposition: attachment, so we route
 * through our proxy which serves application/pdf inline.
 */
export function builderResumeViewHref(builderId: string | null | undefined): string | null {
  const id = String(builderId || '').trim();
  if (!id) return null;
  return `/api/builders/${encodeURIComponent(id)}/resume`;
}

/** Prefer the inline proxy for resume links; drop values that would 404 on DevLabs. */
export function hrefForBuilderLink(params: {
  key: string;
  href: string;
  builderId?: string | null;
}): string | null {
  if (params.key === 'resume') {
    const stored = hrefForProfileField('resume', params.href);
    if (!stored) return null;
    return builderResumeViewHref(params.builderId) || stored;
  }
  return hrefForProfileField(params.key, params.href);
}
