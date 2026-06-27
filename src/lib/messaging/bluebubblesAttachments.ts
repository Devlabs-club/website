import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export type InboundAttachment = {
  guid: string;
  mimeType: string | null;
  transferName: string | null;
};

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
  return type.includes('pdf') || name.endsWith('.pdf') || type.startsWith('text/') || name.endsWith('.txt');
}

/** Download an attachment's raw bytes from the BlueBubbles server. */
export async function downloadBlueBubblesAttachment(
  guid: string,
  runtime?: RuntimeEnv
): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  const serverUrl = readEnv('BLUEBUBBLES_SERVER_URL', runtime)?.replace(/\/$/, '');
  const password = readEnv('BLUEBUBBLES_PASSWORD', runtime);
  if (!serverUrl || !password) return null;

  const url = `${serverUrl}/api/v1/attachment/${encodeURIComponent(guid)}/download?password=${encodeURIComponent(password)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[bluebubbles-attachment] download failed (${res.status}) for ${guid}`);
    return null;
  }
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: res.headers.get('content-type'),
  };
}
