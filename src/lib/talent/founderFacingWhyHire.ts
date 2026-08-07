/**
 * Founder-facing Why hire must talk about the builder in third person.
 * LLMs often write "At Wipro, you launched…" which reads as the founder's bio.
 *
 * Kept in a leaf module so Astro client islands can import it without pulling
 * server-only OpenRouter / search-plan code (process.env is not in the browser).
 */
export function toFounderFacingWhyHire(text: string, builderName?: string | null): string {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const firstName = String(builderName || '')
    .trim()
    .split(/\s+/)
    .find(Boolean);
  const subject = firstName || 'they';
  const possessive = firstName ? `${firstName}'s` : 'their';

  let out = raw
    .replace(/\byourself\b/gi, 'themselves')
    .replace(/\byours\b/gi, 'theirs')
    .replace(/\byour\b/gi, possessive)
    .replace(/\byou\b/gi, subject);

  // Keep sentence starts capitalized when we substituted a lowercase name/they.
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`);
  return out.slice(0, 220);
}
