import { describe, expect, it } from 'bun:test';
import { pickProfileFields } from './linkedinVoyager';

const mockResponse = {
  data: {
    elements: [{ entityUrn: 'urn:li:fsd_profile:ACoAADYahia' }],
  },
  included: [
    {
      entityUrn: 'urn:li:fsd_profile:ACoAADFLw7sB',
      $type: 'com.linkedin.voyager.dash.identity.profile.Profile',
      publicIdentifier: 'dhanush-vardhan-30bb881b0',
      firstName: 'Dhanush',
      lastName: 'Vardhan',
      headline: 'Co founder @Devlabs',
    },
    {
      entityUrn: 'urn:li:fsd_profile:ACoAADYahia',
      $type: 'com.linkedin.voyager.dash.identity.profile.Profile',
      publicIdentifier: 'yahia-alqurnawi',
      firstName: 'Yahia',
      lastName: 'Alqurnawi',
      headline: 'CS @ ASU | Builder',
      summary: 'Building AI products at ASU.',
    },
    {
      $type: 'com.linkedin.voyager.dash.identity.profile.Skill',
      name: 'React.js',
      endorsementCount: 3,
    },
    {
      $type: 'com.linkedin.voyager.dash.identity.profile.Position',
      title: 'Software Officer',
      companyName: 'The AI Society at ASU',
    },
  ],
};

describe('pickProfileFields', () => {
  it('selects the target profile by publicIdentifier, not the viewer profile', () => {
    const picked = pickProfileFields(mockResponse, 'yahia-alqurnawi');
    expect(picked.firstName).toBe('Yahia');
    expect(picked.lastName).toBe('Alqurnawi');
    expect(picked.headline).toBe('CS @ ASU | Builder');
    expect(picked.summary).toBe('Building AI products at ASU.');
    expect(picked.skills).toContain('React.js');
    expect(picked.positions?.[0]?.company).toBe('The AI Society at ASU');
  });

  it('selects the viewer profile when vanity matches', () => {
    const picked = pickProfileFields(mockResponse, 'dhanush-vardhan-30bb881b0');
    expect(picked.firstName).toBe('Dhanush');
    expect(picked.headline).toBe('Co founder @Devlabs');
  });
});
