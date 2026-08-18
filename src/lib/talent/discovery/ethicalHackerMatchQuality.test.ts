import { describe, expect, it } from 'bun:test';
import {
  inferRoleFamily,
  sanitizeDomainTokens,
  sanitizeEvidenceDimensions,
  buildFallbackEvidenceDimensions,
} from '@/lib/talent/roleEvidenceDimensions';
import { detectRoleDomain, buildRoleSkillTiers } from '@/lib/talent/discovery/roleSkillTiers';
import { evaluateFounderRequirement } from '@/lib/talent/searchTokens';
import { buildRoleEvidenceDossier } from '@/lib/talent/roleEvidenceDossier';
import { buildFallbackSearchPlan } from '@/lib/talent/searchPlan';
import { mergeChannelBuilders } from '@/lib/talent/roleShapedRetrieval';
import { runFounderDiscoveryPipeline } from '@/lib/talent/discovery/index';
import { scoreRoleDimensions } from '@/lib/talent/roleEvidenceDimensions';

const ethicalHackerOpportunity = {
  _id: 'ethical-hacker-fixture',
  roleTitle: 'Ethical Hacker',
  title: 'Ethical Hacker',
  company: 'Devlabs',
  skillsNeeded: ['Operating Systems', 'Computer Networks', 'Python', 'java', 'JavaScript'],
  salary: '$50k - $100k P.a.',
  location: 'Tempe, Arizona',
  searchRequirements: [
    { text: 'previous experience in cybersecurity', importance: 'must' },
    { text: 'completed an internship', importance: 'must' },
    { text: 'currently enrolled in a US college', importance: 'must' },
  ],
};

const mohak = {
  _id: 'mohak',
  name: 'Mohak Rathod',
  headline: 'Computer Science graduate student with experience as a SOC analyst',
  universityOrCompany: 'Arizona State University',
  currentStatus: 'student',
  skills: ['Python', 'SIEM'],
  experiences: [
    {
      title: 'SOC Analyst Intern',
      company: 'Eviden',
      description: 'Monitored and triaged security alerts using IBM QRadar and ArcSight in a live enterprise SOC.',
    },
    {
      title: 'SOC Analyst Intern',
      company: 'Atos',
      description: 'Supported SOC operations and incident reporting with LogRhythm.',
    },
  ],
  education: [{ school: 'Arizona State University', field: 'Computer Science' }],
  links: { github: 'https://github.com/MKR-24' },
};

const andrey = {
  _id: 'andrey',
  name: 'Andrey Luzhnov',
  headline: 'Computer Science student specializing in cybersecurity at ASU',
  universityOrCompany: 'Arizona State University',
  currentStatus: 'student',
  skills: ['Python'],
  experiences: [
    {
      title: 'Software Engineering Intern',
      company: 'SpaceX',
      description: 'Working in Product Security in the Starlink department at SpaceX.',
    },
  ],
  education: [{ school: 'Arizona State University', field: 'Computer Science' }],
  links: {},
};

const zaid = {
  _id: 'zaid',
  name: 'Zaid Taiyab',
  headline: 'Software Engineer Intern | Cybersecurity TA at Arizona State University',
  universityOrCompany: 'Arizona State University',
  currentStatus: 'student',
  skills: ['Python', 'Java'],
  experiences: [
    {
      title: 'Undergraduate Teaching Assistant',
      company: 'Arizona State University',
      description: 'Guided students through core cybersecurity concepts, including cryptography and reverse engineering.',
    },
    {
      title: 'Software Engineer Intern',
      company: 'Millennial Partners',
      description: 'Built JavaScript tooling for website performance.',
    },
  ],
  education: [{ school: 'Arizona State University', field: 'Computer Science' }],
  links: { github: 'https://github.com/Zaid-Taiyab' },
};

const stackGeneralist = {
  _id: 'generalist',
  name: 'Stack Generalist',
  headline: 'Full-stack engineer shipping React and Node apps',
  universityOrCompany: 'Arizona State University',
  currentStatus: 'student',
  skills: ['Operating Systems', 'Computer Networks', 'Python', 'Java', 'JavaScript', 'React'],
  experiences: [
    {
      title: 'Software Engineer Intern',
      company: 'Acme',
      description: 'Shipped production React dashboards and Node APIs.',
    },
  ],
  education: [{ school: 'Arizona State University', field: 'Computer Science' }],
  links: { github: 'https://github.com/generalist' },
};

const projectsByBuilder = new Map<string, any[]>([
  [
    'mohak',
    [
      {
        projectName: 'VulnGraph',
        description: 'LLM-Powered Application Security Posture Management Platform',
        techStack: ['Python'],
      },
    ],
  ],
  [
    'andrey',
    [
      {
        projectName: 'ASU Hacking Club CTF Leaderboard',
        description: 'Currently ranked #3 on ASU Hacking Club CTF Leaderboard.',
      },
      {
        projectName: 'Cybersecurity Social Engineering Training Program',
        description: 'Created a cybersecurity social engineering training program at Sunhacks.',
      },
    ],
  ],
  [
    'zaid',
    [{ projectName: 'Mesa-Baseball-Exhibit', description: 'Android exhibit app', techStack: ['Java'] }],
  ],
  [
    'generalist',
    [
      {
        projectName: 'saas-dashboard',
        description: 'Shipped a production SaaS dashboard with React and Node',
        links: { demo: 'https://demo.example.com', github: 'https://github.com/x/y' },
        techStack: ['React', 'Node.js', 'Python'],
      },
    ],
  ],
]);

describe('Ethical Hacker match quality regression', () => {
  it('classifies Ethical Hacker as specialist (not operator/builder)', () => {
    expect(inferRoleFamily(ethicalHackerOpportunity)).toBe('specialist');
    expect(detectRoleDomain('Ethical Hacker', ethicalHackerOpportunity.skillsNeeded)).toBe('security');
    const tiers = buildRoleSkillTiers(ethicalHackerOpportunity);
    expect(tiers.domain).toBe('security');
    expect(tiers.primarySkills.some((skill) => /cyber|pentest|security|soc/i.test(skill))).toBe(true);
  });

  it('builds specialist-weighted dimensions with domain_depth first', () => {
    const dimensions = buildFallbackEvidenceDimensions(ethicalHackerOpportunity, 'specialist');
    const domain = dimensions.find((dimension) => dimension.id === 'domain_depth');
    const ship = dimensions.find((dimension) => dimension.id === 'ship_proof');
    expect(domain?.weight || 0).toBeGreaterThan(ship?.weight || 0);
    expect(domain?.weight || 0).toBeGreaterThan(0.3);
  });

  it('strips generic stack/ship tokens from domain_depth sanitization', () => {
    const cleaned = sanitizeDomainTokens([
      'penetration testing',
      'python',
      'shipped',
      'operating',
      'systems',
      'cybersecurity',
      'growth',
    ]);
    expect(cleaned).toContain('penetration testing');
    expect(cleaned).toContain('cybersecurity');
    expect(cleaned).not.toContain('python');
    expect(cleaned).not.toContain('shipped');
    expect(cleaned).not.toContain('operating');

    const dimensions = sanitizeEvidenceDimensions(
      [
        {
          id: 'domain_depth',
          weight: 0.4,
          matchAnyOf: ['cybersecurity', 'python', 'shipped', 'penetration testing', 'operating'],
        },
        { id: 'ship_proof', weight: 0.2, matchAnyOf: ['shipped'] },
        { id: 'stack_fit', weight: 0.2, matchAnyOf: ['Python'] },
        { id: 'systems_depth', weight: 0.2, matchAnyOf: ['infrastructure'] },
      ],
      ethicalHackerOpportunity,
      'specialist'
    );
    const domain = dimensions.find((dimension) => dimension.id === 'domain_depth');
    expect(domain?.matchAnyOf || []).toContain('penetration testing');
    expect(domain?.matchAnyOf || []).not.toContain('python');
    expect(domain?.matchAnyOf || []).not.toContain('shipped');
  });

  it('does not mark cybersecurity must as yes on skill-bag / stack alone', () => {
    const compiled = {
      mode: 'category',
      matchAnyOf: [
        'previous experience in cybersecurity',
        'cybersecurity',
        'penetration testing',
        'python',
        'operating',
        'systems',
      ],
    };
    const skillOnly = evaluateFounderRequirement(
      'previous experience in cybersecurity',
      {
        skills: ['Python', 'Operating Systems', 'cybersecurity'],
        experiences: [{ title: 'SWE Intern', company: 'Acme', description: 'Built React apps' }],
      },
      [{ projectName: 'todo', description: 'React todo app', techStack: ['Python'] }],
      compiled
    );
    expect(skillOnly.met).not.toBe('yes');

    const socProof = evaluateFounderRequirement(
      'previous experience in cybersecurity',
      mohak,
      projectsByBuilder.get('mohak') || [],
      compiled
    );
    expect(socProof.met).toBe('yes');
  });

  it('expands security dossier vocabulary beyond hardware-only packs', () => {
    const dossier = buildRoleEvidenceDossier({
      builder: andrey,
      projects: projectsByBuilder.get('andrey') || [],
      roleEvidence: {
        anchorConcepts: ['cybersecurity', 'ethical hacking'],
        supportingConcepts: ['Python'],
        minimumAnchorMatches: 1,
        minimumTotalMatches: 2,
      },
      requireInternship: true,
    });
    expect(dossier?.hasRoleProof).toBe(true);
    expect(dossier?.hasInternshipProof).toBe(true);
    expect(dossier?.evidenceFit || 0).toBeGreaterThan(0.2);
  });

  it('reserves domain channel seats when merging retrieval channels', () => {
    const domain = Array.from({ length: 40 }, (_, index) => ({ _id: `domain-${index}` }));
    const stack = Array.from({ length: 40 }, (_, index) => ({ _id: `stack-${index}` }));
    const must = Array.from({ length: 20 }, (_, index) => ({ _id: `must-${index}` }));
    const merged = mergeChannelBuilders({ domain, must, stack, poolTarget: 80 });
    const domainCount = merged.filter((builder) => String(builder._id).startsWith('domain-')).length;
    expect(domainCount).toBeGreaterThanOrEqual(30);
    expect(merged.length).toBeLessThanOrEqual(80);
  });

  it('reserves location channel seats when geo results exist', () => {
    const domain = Array.from({ length: 40 }, (_, index) => ({ _id: `domain-${index}` }));
    const stack = Array.from({ length: 40 }, (_, index) => ({ _id: `stack-${index}` }));
    const must = Array.from({ length: 20 }, (_, index) => ({ _id: `must-${index}` }));
    const location = Array.from({ length: 20 }, (_, index) => ({ _id: `loc-${index}` }));
    const merged = mergeChannelBuilders({ domain, must, stack, location, poolTarget: 80 });
    const locationCount = merged.filter((builder) => String(builder._id).startsWith('loc-')).length;
    expect(locationCount).toBeGreaterThanOrEqual(12);
    expect(merged.length).toBeLessThanOrEqual(80);
  });

  it('ranks Mohak and Andrey above empty-domain stack generalists', async () => {
    const plan = buildFallbackSearchPlan(ethicalHackerOpportunity);
    expect(plan.roleFamily).toBe('specialist');

    const opportunity = { ...ethicalHackerOpportunity, searchPlan: plan };
    const builders = [stackGeneralist, zaid, andrey, mohak];
    const result = await runFounderDiscoveryPipeline({
      opportunity,
      founderId: 'test-founder',
      builders,
      projectsByBuilder,
      limit: 4,
      skipSemanticScoring: true,
      enableLlmRerank: false,
    });

    const rankedIds = result.candidates.map((candidate) => candidate.builderId);
    const mohakRank = rankedIds.indexOf('mohak');
    const andreyRank = rankedIds.indexOf('andrey');
    const generalistRank = rankedIds.indexOf('generalist');

    expect(mohakRank).toBeGreaterThanOrEqual(0);
    expect(andreyRank).toBeGreaterThanOrEqual(0);
    // Domain specialists with SOC / product-security proof outrank empty-domain shippers.
    if (generalistRank >= 0) {
      expect(mohakRank).toBeLessThan(generalistRank);
      expect(andreyRank).toBeLessThan(generalistRank);
    }

    const mohakCandidate = result.candidates.find((candidate) => candidate.builderId === 'mohak');
    const cyberFinding = mohakCandidate?.explanation.requirementFindings?.find((finding) =>
      /cybersecurity/i.test(finding.text)
    );
    expect(cyberFinding?.met).toBe('yes');

    const generalistCandidate = result.candidates.find((candidate) => candidate.builderId === 'generalist');
    if (generalistCandidate) {
      const generalistCyber = generalistCandidate.explanation.requirementFindings?.find((finding) =>
        /cybersecurity/i.test(finding.text)
      );
      expect(generalistCyber?.met).not.toBe('yes');
    }
  });

  it('scores domain specialists higher than stack-only builders on specialist dimensions', () => {
    const plan = buildFallbackSearchPlan(ethicalHackerOpportunity);
    const mohakScore = scoreRoleDimensions({
      dimensions: plan.evidenceDimensions,
      builder: mohak,
      projects: projectsByBuilder.get('mohak') || [],
    });
    const generalistScore = scoreRoleDimensions({
      dimensions: plan.evidenceDimensions,
      builder: stackGeneralist,
      projects: projectsByBuilder.get('generalist') || [],
    });
    const mohakDomain = mohakScore?.hits.find((hit) => hit.id === 'domain_depth')?.score || 0;
    const generalistDomain = generalistScore?.hits.find((hit) => hit.id === 'domain_depth')?.score || 0;
    expect(mohakDomain).toBeGreaterThan(generalistDomain);
  });
});
