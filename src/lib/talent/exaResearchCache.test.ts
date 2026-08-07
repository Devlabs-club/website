import { describe, expect, it } from 'bun:test';
import {
  buildBuilderExaFingerprint,
  companyResearchCacheKey,
  hashBuilderExaFingerprint,
  isCompanyResearchFresh,
} from './exaResearchCache';

describe('companyResearchCacheKey', () => {
  it('prefers LinkedIn company slug', () => {
    expect(
      companyResearchCacheKey({
        name: 'Google',
        linkedInUrl: 'https://www.linkedin.com/company/google/',
      })
    ).toBe('li:google');
  });

  it('falls back to website domain', () => {
    expect(companyResearchCacheKey({ name: 'DevLabs', website: 'https://www.devlabs.club' })).toBe(
      'web:devlabs.club'
    );
  });
});

describe('builder exa fingerprint', () => {
  it('is stable for the same identity links', () => {
    const a = buildBuilderExaFingerprint(
      {
        name: 'Dhanush Vardhan',
        links: { linkedin: 'https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/', github: 'https://github.com/x' },
        headline: 'Builder',
      },
      []
    );
    const b = buildBuilderExaFingerprint(
      {
        name: 'Dhanush Vardhan',
        links: { linkedin: 'https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/', github: 'https://github.com/x' },
        headline: 'Builder',
      },
      []
    );
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(hashBuilderExaFingerprint(a.text));
  });

  it('changes when LinkedIn changes', () => {
    const a = buildBuilderExaFingerprint(
      { name: 'Dhanush', links: { linkedin: 'https://www.linkedin.com/in/a/' } },
      []
    );
    const b = buildBuilderExaFingerprint(
      { name: 'Dhanush', links: { linkedin: 'https://www.linkedin.com/in/b/' } },
      []
    );
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('isCompanyResearchFresh', () => {
  it('treats recent research as fresh', () => {
    expect(isCompanyResearchFresh(new Date())).toBe(true);
    expect(isCompanyResearchFresh(new Date(Date.now() - 40 * 864e5))).toBe(false);
  });
});
