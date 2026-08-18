import { describe, expect, it } from 'bun:test';
import {
  resolveBuilderBaseLocation,
  scoreLocationFit,
  locationFitLabel,
  roleGeoSearchTerms,
  locationMatchRegex,
  looksLikeGeoRequirement,
  reserveGeoShortlistSeats,
  summarizeShortlistLocations,
} from './builderLocation';

describe('builder location', () => {
  it('prefers LinkedIn profile location over experience', () => {
    const resolved = resolveBuilderBaseLocation({
      location: 'Mumbai, India',
      experiences: [{ isCurrent: true, location: 'Tempe, Arizona, United States' }],
    });
    expect(resolved).toEqual({ text: 'Mumbai, India', source: 'profile' });
  });

  it('ignores scraped junk profile locations', () => {
    const resolved = resolveBuilderBaseLocation({
      location: 'Your California Privacy Choices',
      experiences: [{ isCurrent: true, location: 'Mumbai, Maharashtra, India' }],
    });
    expect(resolved).toEqual({ text: 'Mumbai, Maharashtra, India', source: 'current_experience' });
  });

  it('falls back to current experience location', () => {
    const resolved = resolveBuilderBaseLocation({
      location: null,
      experiences: [
        { isCurrent: false, location: 'London, United Kingdom' },
        { isCurrent: true, location: 'Pune, Maharashtra, India' },
      ],
    });
    expect(resolved.source).toBe('current_experience');
    expect(resolved.text).toBe('Pune, Maharashtra, India');
  });

  it('scores India-remote roles highly for Mumbai builders', () => {
    const builder = { location: 'Mumbai Metropolitan Region' };
    const opportunity = { locationPreference: 'Fully remote, anywhere in India', workMode: 'Remote' };
    expect(scoreLocationFit(builder, opportunity)).toBeGreaterThanOrEqual(0.8);
    expect(locationFitLabel(builder, opportunity)).toContain('Mumbai');
  });

  it('penalizes US-onsite roles for India-based builders', () => {
    const builder = { location: 'Bengaluru, India' };
    const opportunity = { locationPreference: 'Tempe, AZ', workMode: 'Onsite' };
    expect(scoreLocationFit(builder, opportunity)).toBeLessThan(0.3);
  });

  it('stays neutral when builder location is missing', () => {
    expect(scoreLocationFit({}, { locationPreference: 'Mumbai' })).toBeCloseTo(0.48);
  });

  it('does not treat other Indian cities as Mumbai matches', () => {
    expect(scoreLocationFit({ location: 'Pune, India' }, { locationPreference: 'Mumbai based' })).toBeLessThan(0.8);
    expect(scoreLocationFit({ location: 'Mumbai, India' }, { locationPreference: 'Mumbai based' })).toBe(1);
    expect(scoreLocationFit({ location: 'Pune, India' }, { locationPreference: 'Remote, India' })).toBeGreaterThanOrEqual(0.8);
  });

  it('extracts city and country terms from a Mumbai search', () => {
    const terms = roleGeoSearchTerms({
      locationPreference: 'Anywhere in India, Mumbai preferred',
      workMode: 'Remote',
      searchPlan: {
        requirements: [
          { text: 'Mumbai based or able to work from Mumbai', importance: 'nice', retrievalTerms: ['Mumbai'] },
          { text: 'Remote, India', importance: 'must', matchAnyOf: ['India', 'Bengaluru', 'Mumbai', 'Pune'] },
          { text: 'Practical LLM agent or tool-calling experience', importance: 'must', retrievalTerms: ['TypeScript', 'LangGraph'] },
        ],
      },
    });
    expect(terms).toContain('mumbai');
    expect(terms).toContain('india');
    expect(terms).not.toContain('remote');
    expect(terms).not.toContain('typescript');
    expect(terms).not.toContain('langgraph');
    expect(terms).not.toContain('preferred');
  });

  it('does not treat Indiana as an India match', () => {
    const regex = locationMatchRegex(['india', 'mumbai']);
    expect(regex?.test('Indiana, United States')).toBe(false);
    expect(regex?.test('Mumbai, Maharashtra, India')).toBe(true);
  });

  it('detects geo requirements without treating skill musts as location', () => {
    expect(looksLikeGeoRequirement('Mumbai based')).toBe(true);
    expect(looksLikeGeoRequirement('Remote, India')).toBe(true);
    expect(looksLikeGeoRequirement('previous experience in cybersecurity')).toBe(false);
  });

  it('reserves shortlist seats for location matches', () => {
    const ranked = [
      { builderId: 'us-1', builder: { location: 'Tempe, AZ' } },
      { builderId: 'us-2', builder: { location: 'San Francisco, CA' } },
      { builderId: 'us-3', builder: { location: 'Boston, MA' } },
      { builderId: 'us-4', builder: { location: 'Seattle, WA' } },
      { builderId: 'us-5', builder: { location: 'Austin, TX' } },
      { builderId: 'in-1', builder: { location: 'Mumbai, India' } },
      { builderId: 'in-2', builder: { location: 'Pune, India' } },
    ];
    const reserved = reserveGeoShortlistSeats(ranked, { locationPreference: 'Mumbai based, India' }, 5);
    const ids = reserved.map((entry) => entry.builderId);
    expect(ids).toContain('in-1');
    expect(ids.length).toBe(5);
  });

  it('summarizes one Mumbai builder and the rest of India', () => {
    const mix = summarizeShortlistLocations(
      [
        { name: 'Karthiknadar', location: 'Mumbai' },
        { name: 'Swaraj Bari', location: 'Banswara, India' },
        { name: 'Dhanush Kumar', location: 'Bengaluru, India' },
        { name: 'Dilpreet S. Grover', location: 'Gurugram' },
        { name: 'Gauransh Sharma', location: 'India' },
      ],
      { locationPreference: 'Anywhere in India, Mumbai preferred', workMode: 'Remote' }
    );
    expect(mix.requestedCityCount).toBe(1);
    expect(mix.requestedCountryCount).toBe(4);
    expect(mix.summary).toMatch(/1 builder in Mumbai/i);
    expect(mix.summary).toMatch(/other parts of India/i);
  });
});
