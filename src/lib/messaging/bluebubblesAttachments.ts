import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export type InboundAttachment = {
  guid: string;
  mimeType: string | null;
  transferName: string | null;
};

export type AttachmentDownloadResult =
  | { ok: true; buffer: Buffer; contentType: string | null }
  | { ok: false; error: string };

const DOWNLOAD_TIMEOUT_MS = 20_000;

/** Pull attachment descriptors out of a BlueBubbles inbound webhook payload. */
export function parseBlueBubblesAttachments(data: any): InboundAttachment[] {
  const list = data?.attachments || data?.data?.attachments || [];
  if (!Array.isArray(list)) return [];
  return list
    .filter((a: any) => a && (a.guid || a.id))
    .map((a: any) => ({
      guid: String(a.guid || a.id),
      mimeType: a.mimeType || a.uti || null,
      transferName: a.transferName || a.name || null,
    }));
}

/** Looks like something we can parse into a profile (resume). */
export function looksLikeResume(att: InboundAttachment): boolean {
  const type = (att.mimeType || '').toLowerCase();
  const name = (att.transferName || '').toLowerCase();
  if (type.includes('pdf') || type.includes('adobe.pdf') || type === 'com.adobe.pdf' || type === 'public.pdf') {
    return true;
  }
  if (name.endsWith('.pdf') || name.includes('resume') || name.includes('cv.')) return true;
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return true;
  // iMessage sometimes sends PDFs as generic octet-stream — sniff the extension.
  if ((type.includes('octet-stream') || type === 'application/data') && name.endsWith('.pdf')) return true;
  return false;
}

function blueBubblesServerCandidates(runtime?: RuntimeEnv): string[] {
  const values = [
    readEnv('BLUEBUBBLES_SERVER_URL', runtime),
    readEnv('BLUEBUBBLES_SERVER_URL_FALLBACK', runtime),
    // Common local dev default when the primary tunnel URL has expired.
    process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:1234' : null,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.replace(/\/$/, '') || '';
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Download an attachment's raw bytes from the BlueBubbles server. */
export async function downloadBlueBubblesAttachment(
  guid: string,
  runtime?: RuntimeEnv
): Promise<AttachmentDownloadResult> {
  const password = readEnv('BLUEBUBBLES_PASSWORD', runtime);
  if (!password) {
    return { ok: false, error: 'BlueBubbles is not configured (BLUEBUBBLES_PASSWORD missing).' };
  }

  const servers = blueBubblesServerCandidates(runtime);
  if (!servers.length) {
    return { ok: false, error: 'BLUEBUBBLES_SERVER_URL is not set.' };
  }

  let lastError = 'Unknown download error';
  for (const serverUrl of servers) {
    const url = `${serverUrl}/api/v1/attachment/${encodeURIComponent(guid)}/download?password=${encodeURIComponent(password)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok) {
        lastError = `HTTP ${res.status} from ${safeHost(serverUrl)}`;
        console.warn(`[bluebubbles-attachment] download failed (${res.status}) for ${guid} via ${safeHost(serverUrl)}`);
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      return {
        ok: true,
        buffer: Buffer.from(arrayBuffer),
        contentType: res.headers.get('content-type'),
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[bluebubbles-attachment] download error for ${guid} via ${safeHost(serverUrl)}:`, lastError);
    }
  }

  return { ok: false, error: lastError };
}

function safeHost(serverUrl: string) {
  try {
    return new URL(serverUrl).hostname;
  } catch {
    return serverUrl;
  }
}
