import { describe, expect, it } from 'vitest';
import {
  isPdfBuffer,
  prepareDownloadedResumePdf,
  resumeLocalPdfBasename,
} from './resumeUrl';

describe('resumeLocalPdfBasename', () => {
  it('appends .pdf to extensionless Cloudinary paths', () => {
    expect(
      resumeLocalPdfBasename(
        'https://res.cloudinary.com/dllpvtkqd/raw/upload/v1772843190/resumes/tmswzbu6uejrqoblmtgx'
      )
    ).toBe('tmswzbu6uejrqoblmtgx.pdf');
  });

  it('keeps existing .pdf basename', () => {
    expect(resumeLocalPdfBasename('https://example.com/files/resume.pdf')).toBe('resume.pdf');
  });
});

describe('prepareDownloadedResumePdf', () => {
  it('writes a temp file ending in .pdf', () => {
    const buffer = Buffer.from('%PDF-1.4\n%fake');
    const prepared = prepareDownloadedResumePdf(
      buffer,
      'https://res.cloudinary.com/x/raw/upload/v1/resumes/abc123'
    );
    try {
      expect(prepared.localPdfPath.endsWith('.pdf')).toBe(true);
      expect(prepared.localPdfPath).toContain('abc123.pdf');
      expect(isPdfBuffer(prepared.readPreparedBuffer())).toBe(true);
    } finally {
      prepared.cleanup();
    }
  });

  it('rejects non-pdf bytes', () => {
    expect(() => prepareDownloadedResumePdf(Buffer.from('not-a-pdf'), 'https://x/y')).toThrow(
      'downloaded_file_is_not_pdf'
    );
  });
});
