import { describe, expect, it } from 'bun:test';
import {
  buildFallbackEvidenceDimensions,
  buildReasonToHireFromDimensions,
  inferRoleFamily,
  sanitizeEvidenceDimensions,
  scoreRoleDimensions,
} from '@/lib/talent/roleEvidenceDimensions';
import { buildFallbackSearchPlan } from '@/lib/talent/searchPlan';

describe('roleEvidenceDimensions', () => {
  it('classifies DevRel as teacher_advocate', () => {
    expect(
      inferRoleFamily({
        roleTitle: 'Developer Relations Engineer',
        builderWillDo: 'Write tutorials, ship SDKs, run workshops',
      })
    ).toBe('teacher_advocate');
  });

  it('builds weighted teaching-heavy dimensions for DevRel fallback', () => {
    const dimensions = buildFallbackEvidenceDimensions({
      roleTitle: 'Developer Relations Engineer',
      builderWillDo: 'Open-source examples, blogs, demos',
      skillsNeeded: ['React', 'Python'],
    });
    expect(dimensions.length).toBeGreaterThanOrEqual(4);
    const teaching = dimensions.find((dimension) => dimension.id === 'teaching');
    const community = dimensions.find((dimension) => dimension.id === 'community');
    expect(teaching?.weight || 0).toBeGreaterThan(0.2);
    expect(community?.weight || 0).toBeGreaterThan(0.15);
    const sum = dimensions.reduce((total, dimension) => total + dimension.weight, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('scores a teaching/OSS builder higher on DevRel dimensions', () => {
    const plan = buildFallbackSearchPlan({
      roleTitle: 'Developer Relations Engineer',
      builderWillDo: 'Tutorials, workshops, open source SDKs',
      skillsNeeded: ['React', 'Node'],
    });
    const advocate = scoreRoleDimensions({
      dimensions: plan.evidenceDimensions,
      builder: {
        name: 'Ada',
        headline: 'Developer advocate and mentor',
        bio: 'Runs workshops and writes tutorials',
        links: { github: 'https://github.com/ada' },
        experiences: [
          {
            title: 'Mentor',
            company: 'SoDA',
            description: 'Mentored builders and organized hackathons',
          },
        ],
      },
      projects: [
        {
          projectName: 'sdk-docs',
          description: 'Open source SDK with documentation and demo',
          links: { github: 'https://github.com/ada/sdk', demo: 'https://demo.example.com' },
          techStack: ['React', 'TypeScript'],
        },
      ],
    });
    const generic = scoreRoleDimensions({
      dimensions: plan.evidenceDimensions,
      builder: {
        name: 'Bob',
        headline: 'Backend engineer',
        bio: 'Built internal services',
        links: {},
        experiences: [{ title: 'SWE', company: 'Acme', description: 'APIs and databases' }],
      },
      projects: [
        {
          projectName: 'internal-api',
          description: 'Private service',
          techStack: ['Java'],
        },
      ],
    });

    expect(advocate?.overall || 0).toBeGreaterThan(generic?.overall || 0);
    const reason = buildReasonToHireFromDimensions({
      dimensionScore: advocate,
      roleTitle: 'Developer Relations Engineer',
    });
    expect(reason).toMatch(/stands out|Teaching|Community|Open-source|Shipped/i);
  });

  it('sanitizes invalid LLM dimensions back to a valid plan', () => {
    const dimensions = sanitizeEvidenceDimensions(
      [{ id: 'not_real', weight: 1 }],
      { roleTitle: 'Founding Engineer', skillsNeeded: ['TypeScript'] },
      'builder'
    );
    expect(dimensions.every((dimension) => dimension.weight > 0)).toBe(true);
    expect(dimensions.some((dimension) => dimension.id === 'ship_proof')).toBe(true);
  });
});
