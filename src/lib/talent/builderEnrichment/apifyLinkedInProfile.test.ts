import { describe, expect, it } from 'bun:test';
import { mapApifyLinkedInToDraft } from './apifyLinkedInProfile';
import {
  enrichmentOrgSlug,
  linkedInAvatarPublicId,
  organizationLogoPublicId,
} from '@/lib/talent/enrichmentCloudinary';

describe('enrichmentCloudinary public ids', () => {
  it('builds stable company and school logo ids', () => {
    expect(organizationLogoPublicId({ type: 'company', slug: 'Google' })).toBe(
      'devlabs/enrichment/organizations/company/google/logo'
    );
    expect(organizationLogoPublicId({ type: 'school', slug: 'Arizona State University' })).toBe(
      'devlabs/enrichment/organizations/school/arizona-state-university/logo'
    );
    expect(enrichmentOrgSlug('https://www.linkedin.com/company/google/')).toBe('google');
  });

  it('builds stable avatar ids from vanity urls', () => {
    expect(linkedInAvatarPublicId('https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/')).toBe(
      'devlabs/enrichment/avatars/dhanush-vardhan-30bb881b0'
    );
  });
});

describe('mapApifyLinkedInToDraft', () => {
  it('maps experience education skills and headline', () => {
    const draft = mapApifyLinkedInToDraft(
      {
        firstName: 'Dhanush',
        lastName: 'Vardhan',
        headline: 'Builder',
        about: 'Ships products',
        photo: 'https://example.com/a.jpg',
        location: { linkedinText: 'Tempe, Arizona, United States' },
        experience: [
          {
            position: 'Intern',
            companyName: 'Google',
            companyLinkedinUrl: 'https://www.linkedin.com/company/google/',
            companyLogo: { url: 'https://example.com/g.png' },
            startDate: { text: 'May 2026' },
            endDate: { text: 'Present' },
          },
        ],
        education: [
          {
            schoolName: 'Arizona State University',
            degree: 'B.S. Computer Science',
            period: 'Apr 2023 - Apr 2027',
            endDate: { text: 'Apr 2027', year: 2027 },
          },
        ],
        skills: [{ name: 'Flutter' }, { name: 'TypeScript' }],
      },
      'https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/'
    );

    expect(draft.headline).toBe('Builder');
    expect(draft.experiences?.[0]?.company).toBe('Google');
    expect(draft.experiences?.[0]?.isCurrent).toBe(true);
    expect(draft.education?.[0]?.school).toBe('Arizona State University');
    expect(draft.education?.[0]?.graduationYear).toBe(2027);
    expect(draft.skills).toEqual(['Flutter', 'TypeScript']);
    expect(draft.links?.linkedin).toContain('dhanush-vardhan-30bb881b0');
  });
});
