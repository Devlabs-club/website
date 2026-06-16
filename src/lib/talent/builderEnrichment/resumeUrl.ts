import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF';
}

/** Local filename with `.pdf` suffix (for parse/embed after download). */
export function resumeLocalPdfBasename(sourceUrl: string): string {
  try {
    const name = basename(new URL(sourceUrl).pathname) || 'resume';
    return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
  } catch {
    return 'resume.pdf';
  }
}

export async function fetchResumeBuffer(
  storedUrl: string,
  init?: RequestInit
): Promise<{ buffer: Buffer; fetchUrl: string }> {
  const fetchUrl = storedUrl.trim();
  const response = await fetch(fetchUrl, init);
  if (!response.ok) {
    throw new Error(`fetch_failed_${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('fetch_failed_empty');
  }

  return { buffer, fetchUrl };
}

/** Write downloaded bytes to a temp `.pdf` path before parsing/embedding. */
export function prepareDownloadedResumePdf(buffer: Buffer, sourceUrl: string) {
  if (!isPdfBuffer(buffer)) {
    throw new Error('downloaded_file_is_not_pdf');
  }

  const dir = mkdtempSync(join(tmpdir(), 'devlabs-resume-'));
  const localPdfPath = join(dir, resumeLocalPdfBasename(sourceUrl));
  writeFileSync(localPdfPath, buffer);

  return {
    buffer,
    localPdfPath,
    /** Re-read from disk so downstream sees a valid `.pdf` file. */
    readPreparedBuffer(): Buffer {
      return readFileSync(localPdfPath);
    },
    cleanup(): void {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

export async function downloadResumeAsPdf(
  storedUrl: string,
  init?: RequestInit
): Promise<{
  buffer: Buffer;
  fetchUrl: string;
  localPdfPath: string;
  cleanup: () => void;
}> {
  const { buffer, fetchUrl } = await fetchResumeBuffer(storedUrl, init);
  const prepared = prepareDownloadedResumePdf(buffer, fetchUrl);
  return {
    buffer: prepared.readPreparedBuffer(),
    fetchUrl,
    localPdfPath: prepared.localPdfPath,
    cleanup: prepared.cleanup,
  };
}
