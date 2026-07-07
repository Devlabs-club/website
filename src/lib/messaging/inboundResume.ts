import {
  parseResumeAttachment,
  type ExtractedResume,
} from '@/lib/talent/builderResumeExtract';
import {
  downloadBlueBubblesAttachment,
  type InboundAttachment,
} from '@/lib/messaging/bluebubblesAttachments';

/** Raw PDF bytes held in memory for this request only — persisted later on profile write. */
export type InboundResumePdf = {
  buffer: Buffer;
  fileName: string | null;
  contentType: string | null;
};

export type ResumeInbound =
  | { status: 'parsed'; text: string; extracted: ExtractedResume; pdf: InboundResumePdf }
  | { status: 'download_failed'; fileName: string | null; error: string }
  | { status: 'parse_failed'; fileName: string | null; error: string };

/** True when links.resume already points at a stored PDF, not a placeholder or wrong link type. */
export function isStoredResumeFileUrl(url: string | null | undefined): boolean {
  const value = String(url || '').trim();
  if (!value || value === 'imessage:attachment') return false;
  if (/linkedin\.com/i.test(value)) return false;
  return /\.pdf($|\?)/i.test(value) || /cloudinary\.com/i.test(value);
}

/**
 * Parse resume bytes for the agent. Does NOT persist the PDF — that happens only
 * after extraction is applied to the builder profile.
 */
export async function processResumeBytes(
  buffer: Buffer,
  contentType: string | null | undefined,
  fileName: string | null | undefined
): Promise<ResumeInbound> {
  const name = fileName || null;
  try {
    const parsed = await parseResumeAttachment(buffer, contentType, name);
    return {
      status: 'parsed',
      text: parsed.text,
      extracted: parsed.extracted,
      pdf: { buffer, fileName: name, contentType: contentType || null },
    };
  } catch (err) {
    return {
      status: 'parse_failed',
      fileName: name,
      error: err instanceof Error ? err.message : 'parse error',
    };
  }
}

export async function processBlueBubblesResumeAttachment(
  attachment: InboundAttachment,
  runtime?: import('@/lib/workosEnv').RuntimeEnv
): Promise<ResumeInbound> {
  const fileName = attachment.transferName || null;
  const downloaded = await downloadBlueBubblesAttachment(attachment.guid, runtime);
  if (!downloaded.ok) {
    return { status: 'download_failed', fileName, error: downloaded.error };
  }
  return processResumeBytes(
    downloaded.buffer,
    downloaded.contentType || attachment.mimeType,
    fileName
  );
}
