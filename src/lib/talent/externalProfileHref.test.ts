import { describe, expect, it } from 'bun:test';
import { normalizeLinkedInProfileKey } from '../linkedinUrl';
import {
  githubProfileHref,
  hrefForProfileField,
  linkedInProfileHref,
  sanitizeBuilderProfileLinks,
  toExternalHttpUrl,
  visibleBuilderLinkEntries,
  websiteHref,
} from './externalProfileHref';

describe('normalizeLinkedInProfileKey', () => {
  it('reads full and protocol-less profile URLs', () => {
    expect(normalizeLinkedInProfileKey('https://www.linkedin.com/in/Ada-Lovelace/')).toBe('ada-lovelace');
    expect(normalizeLinkedInProfileKey('linkedin.com/in/navsikand')).toBe('navsikand');
    expect(normalizeLinkedInProfileKey('www.linkedin.com/in/justin-naicker')).toBe('justin-naicker');
  });

  it('repairs malformed LinkedIn values', () => {
    expect(normalizeLinkedInProfileKey('/shivam-kumar-559417290')).toBe('shivam-kumar-559417290');
    expect(normalizeLinkedInProfileKey('linkedin/ashworks')).toBe('ashworks');
    expect(normalizeLinkedInProfileKey('linkedin.com/TejasGuptaX7')).toBe('tejasguptax7');
    expect(normalizeLinkedInProfileKey('linkedin.com/in/krystal-truong-/')).toBe('krystal-truong-');
    expect(normalizeLinkedInProfileKey('https://linkedin.com/in/nishan.paudel')).toBe('nishan.paudel');
  });

  it('rejects placeholders, company pages, and unrelated text', () => {
    expect(normalizeLinkedInProfileKey('LinkedIn')).toBeNull();
    expect(normalizeLinkedInProfileKey('LinkedIn Profile')).toBeNull();
    expect(normalizeLinkedInProfileKey('https://www.linkedin.com/company/devlabs')).toBeNull();
    expect(normalizeLinkedInProfileKey('Arveen Aziz')).toBeNull();
    expect(normalizeLinkedInProfileKey('kuber.studio')).toBeNull();
  });
});

describe('external profile hrefs', () => {
  it('adds https so protocol-less domains do not 404 on DevLabs', () => {
    expect(toExternalHttpUrl('navraj.me')).toBe('https://navraj.me/');
    expect(toExternalHttpUrl('www.linkedin.com/in/ada')).toBe('https://www.linkedin.com/in/ada');
    expect(linkedInProfileHref('linkedin.com/in/navsikand')).toBe('https://www.linkedin.com/in/navsikand/');
  });

  it('hides placeholders and relative junk that would hit the DevLabs 404 page', () => {
    expect(linkedInProfileHref('LinkedIn')).toBeNull();
    expect(githubProfileHref('GitHub')).toBeNull();
    expect(websiteHref('Portfolio')).toBeNull();
    expect(toExternalHttpUrl('/in/ada')).toBeNull();
    expect(toExternalHttpUrl('')).toBeNull();
    expect(toExternalHttpUrl('cody@codyq.dev')).toBeNull();
    expect(hrefForProfileField('linkedin', 'LinkedIn')).toBeNull();
    expect(hrefForProfileField('portfolio', 'Portfolio')).toBeNull();
  });

  it('keeps real GitHub and website URLs', () => {
    expect(githubProfileHref('https://github.com/octocat')).toBe('https://github.com/octocat');
    expect(githubProfileHref('octocat')).toBe('https://github.com/octocat');
    expect(websiteHref('https://ada.dev/work')).toBe('https://ada.dev/work');
  });

  it('omits invalid links from builder cards', () => {
    const sanitized = sanitizeBuilderProfileLinks({
      linkedin: 'LinkedIn',
      github: 'https://github.com/ada',
      portfolio: 'ada.dev',
      resume: 'https://res.cloudinary.com/demo/raw/upload/resume.pdf',
      devpost: 'https://../',
    });
    expect(sanitized.linkedin).toBeNull();
    expect(sanitized.github).toBe('https://github.com/ada');
    expect(sanitized.portfolio).toBe('https://ada.dev/');
    expect(sanitized.resume).toContain('cloudinary.com');
    expect(sanitized.devpost).toBeNull();

    const entries = visibleBuilderLinkEntries(sanitized, 'abc123');
    expect(entries.map((entry) => entry.key)).toEqual(['github', 'portfolio', 'resume']);
    expect(entries.find((entry) => entry.key === 'resume')?.href).toBe('/api/builders/abc123/resume');
  });
});
