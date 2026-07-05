/** Download inbound media from AgentPhone (MMS/iMessage attachments). */
export async function downloadAgentPhoneMedia(
  mediaUrl: string
): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  const url = String(mediaUrl || '').trim();
  if (!url.startsWith('http')) return null;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type');
    return { buffer, contentType };
  } catch (err) {
    console.warn('[agentPhoneAttachments] download failed', url, err);
    return null;
  }
}

export function looksLikeResumeAttachment(contentType: string | null, url: string) {
  const ct = (contentType || '').toLowerCase();
  const path = url.toLowerCase();
  return (
    ct.includes('pdf') ||
    ct.includes('msword') ||
    ct.includes('wordprocessingml') ||
    ct.includes('text/plain') ||
    path.endsWith('.pdf') ||
    path.endsWith('.doc') ||
    path.endsWith('.docx') ||
    path.endsWith('.txt')
  );
}
