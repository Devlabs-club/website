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

/** Prefer the inline proxy for resume links; leave other link types unchanged. */
export function hrefForBuilderLink(params: {
  key: string;
  href: string;
  builderId?: string | null;
}): string {
  if (params.key !== 'resume') return params.href;
  return builderResumeViewHref(params.builderId) || params.href;
}
