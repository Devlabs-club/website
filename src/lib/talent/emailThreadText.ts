/** Normalize a Message-ID to angle-bracket form for RFC headers. */
export function normalizeMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`;
}

export function stripQuotedReplyText(body: string): string {
  const lines = body.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^on .+wrote:$/i.test(trimmed)) break;
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(trimmed)) break;
    if (/^from:/i.test(trimmed) && kept.length > 2) break;
    if (/^>{1,}/.test(line)) continue;
    if (/^reply (directly )?to this email/i.test(trimmed)) break;
    if (/^founder:/i.test(trimmed) && kept.length > 0) break;
    if (/^company:/i.test(trimmed) && kept.length > 0) break;
    if (/^website:/i.test(trimmed) && kept.length > 0) break;
    if (/^scheduling link:/i.test(trimmed)) break;
    if (/^you can also view this on your builder dashboard/i.test(trimmed)) break;
    if (/^open (conversation|dashboard)/i.test(trimmed)) break;
    kept.push(line);
  }

  let result = kept.join('\n').trim();
  result = result.replace(/^[^:]+:\s*replied:\s*/i, '').trim();
  result = result.replace(/^new message about .+:\s*/i, '').trim();
  return result;
}

/** Pull GitHub + walkthrough links from a trial submission email reply. */
export function extractTrialSubmissionFromEmail(body: string): {
  githubUrl: string | null;
  videoUrl: string | null;
} {
  const urls = [...body.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map((match) => match[0].replace(/[.,;]+$/, ''));
  const githubUrl = urls.find((url) => /github\.com\//i.test(url)) || null;
  const videoUrl =
    urls.find((url) =>
      /(drive\.google\.com|docs\.google\.com|loom\.com|youtube\.com|youtu\.be|vimeo\.com)/i.test(url)
    ) ||
    urls.find((url) => url !== githubUrl) ||
    null;
  return { githubUrl, videoUrl };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
