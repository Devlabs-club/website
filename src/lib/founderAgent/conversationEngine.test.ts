import { describe, expect, test } from 'bun:test';
import {
  buildConversationAgenda,
  hasRealDescription,
  isVagueProductOwnership,
} from './conversationEngine';

describe('isVagueProductOwnership', () => {
  test('treats "work fully on the product" as vague', () => {
    expect(isVagueProductOwnership('i want a builder to work fully on the product')).toBe(true);
    expect(isVagueProductOwnership('they should own the whole product')).toBe(true);
    expect(isVagueProductOwnership('the product in general')).toBe(true);
  });

  test('does not treat a real product brief as vague', () => {
    expect(
      isVagueProductOwnership('build the founder dashboard and chat agent for hiring builders')
    ).toBe(false);
    expect(
      isVagueProductOwnership("it's a hiring marketplace that helps founders find shipped builders")
    ).toBe(false);
  });
});

describe('hasRealDescription', () => {
  test('does not accept vague product ownership without enrichment', () => {
    expect(
      hasRealDescription(
        { description: 'i want a builder to work fully on the product' },
        null
      )
    ).toBe(false);
  });

  test('accepts vague ownership when company product context exists', () => {
    expect(
      hasRealDescription(
        { description: 'i want a builder to work fully on the product' },
        'A hiring marketplace that matches founders with builders who have shipped.'
      )
    ).toBe(true);
  });
});

describe('buildConversationAgenda', () => {
  test('keeps asking about the product after a vague ownership answer', () => {
    const agenda = buildConversationAgenda({
      company: { name: 'My company' },
      job: {
        title: 'Full-stack Developer',
        description: 'i want a builder to work fully on the product',
        skillsNeeded: ['React', 'Node.js', 'TypeScript'],
        searchRequirements: [{ text: 'new grad', importance: 'must' }],
        salary: '80k',
      },
      historyLength: 4,
    });

    expect(agenda.gaps[0]).toBe('description');
    expect(agenda.phase).toBe('gathering');
    expect(agenda.nextQuestionHint).toMatch(/do not know the product/i);
    expect(agenda.nextQuestionHint).toMatch(/do NOT search/i);
  });

  test('does not ask what they will build when enrichment already knows the product', () => {
    const agenda = buildConversationAgenda({
      company: {
        name: 'Flux',
        productSummary: 'A hardware design platform for PCB engineers to collaborate in the browser.',
      },
      job: {
        title: 'Full-stack Developer',
        description: 'Work across the product.',
        skillsNeeded: ['React', 'Node.js'],
      },
      historyLength: 2,
    });

    expect(agenda.gaps.includes('description')).toBe(false);
    expect(agenda.doNotAsk).toContain('what_will_they_build');
  });
});
