import type { AgentWrappedReport } from './types';

const LANGUAGE_HINTS: Record<string, string[]> = {
  TypeScript: ['typescript', 'ts', 'tsx', 'react', 'next', 'astro'],
  JavaScript: ['javascript', 'js', 'node', 'express'],
  Python: ['python', 'django', 'fastapi', 'flask'],
  SQL: ['sql', 'postgres', 'mysql', 'sqlite', 'prisma'],
  Shell: ['shell', 'bash', 'docker', 'infra'],
  Go: ['go', 'golang'],
  Rust: ['rust', 'cargo'],
};

const FRAMEWORK_HINTS = [
  'React',
  'Next.js',
  'Astro',
  'Tailwind',
  'Node',
  'Express',
  'FastAPI',
  'Django',
  'Prisma',
  'Postgres',
  'MongoDB',
  'Vercel',
  'Docker',
  'Cloudflare',
];

function normalizeWords(...values: unknown[]) {
  return values
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>);
      return value ? [value] : [];
    })
    .join(' ')
    .toLowerCase();
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function generateFallbackAgentWrappedReport({
  profile,
  projects,
  rootUrl,
}: {
  profile: any;
  projects: any[];
  rootUrl: string;
}): AgentWrappedReport {
  const builderId = String(profile._id || profile.id);
  const projectText = normalizeWords(
    profile.headline,
    profile.bio,
    profile.rolePreference,
    profile.preferredWorkType,
    profile.experiences,
    projects.map((project) => [
      project.projectName,
      project.description,
      project.problemSolved,
      project.builderContribution,
      project.techStack,
      project.contributionTags,
    ])
  );

  const languageScores = Object.entries(LANGUAGE_HINTS)
    .map(([name, hints]) => ({
      name,
      hits: hints.reduce((sum, hint) => sum + (projectText.includes(hint) ? 1 : 0), 0),
    }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const languageTotal = languageScores.reduce((sum, item) => sum + item.hits, 0) || 1;

  const frameworks = FRAMEWORK_HINTS.filter((name) =>
    projectText.includes(name.toLowerCase().replace('.js', '')) || projectText.includes(name.toLowerCase())
  ).slice(0, 8);
  const hasFrontend = /react|next|astro|tailwind|frontend|ui|tsx/.test(projectText);
  const hasBackend = /node|express|fastapi|api|backend|server|auth/.test(projectText);
  const hasDb = /postgres|mongo|prisma|sql|database|db/.test(projectText);
  const hasInfra = /vercel|cloudflare|docker|aws|deploy|infra/.test(projectText);
  const hasTests = /test|jest|vitest|playwright|cypress|qa/.test(projectText);
  const projectCount = projects.length;
  const score = clampScore(62 + Math.min(projectCount, 8) * 4 + frameworks.length * 2);

  return {
    builderId,
    reportId: `fallback-${builderId}`,
    builderName: profile.name || 'DevLabs Builder',
    builderHandle: profile.links?.github || profile.links?.twitter || undefined,
    archetype:
      hasFrontend && hasBackend
        ? 'AI-Native Full-Stack Shipper'
        : hasFrontend
          ? 'AI-Native Product Builder'
          : 'AI-Native Systems Builder',
    score,
    percentile: score >= 88 ? 8 : score >= 78 ? 18 : 32,
    confidence: projectCount >= 3 ? 'moderate' : 'low',
    source: 'profile_fallback',
    sourceSummary: {
      projectsReferenced: projectCount,
      daysCovered: undefined,
    },
    sourceCoverage: {
      agents: [],
      sessionCount: 0,
      timeframeLabel: 'Profile/project fallback only',
      confidenceNotes: ['No uploaded local agent-usage report found yet.'],
    },
    languages: languageScores.length
      ? languageScores.map((item) => ({
          name: item.name,
          percent: Math.round((item.hits / languageTotal) * 100),
          evidence: 'project_fallback',
        }))
      : [{ name: 'TypeScript', percent: 100, evidence: 'project_fallback' }],
    frameworks: frameworks.length
      ? frameworks.map((name) => ({ name, confidence: 'moderate', evidence: ['profile/project fallback'] }))
      : [{ name: 'React', confidence: 'low', evidence: ['profile/project fallback'] }],
    buildSurface: {
      frontend: hasFrontend ? 86 : 42,
      backend: hasBackend ? 78 : 38,
      database: hasDb ? 70 : 28,
      infra: hasInfra ? 64 : 25,
      tests: hasTests ? 58 : 24,
      docs: profile.bio || projects.some((project) => project.description) ? 55 : 20,
    },
    validation: {
      buildTestLoops: hasTests ? 8 : 3,
      errorRecoveryLoops: 5,
      successfulReruns: hasTests ? 6 : 2,
      testDisciplineScore: hasTests ? 66 : 38,
    },
    agentMaturity: {
      planningScore: 58,
      contextScore: 52,
      iterationScore: 61,
      verificationScore: hasTests ? 62 : 40,
      blindAcceptanceRisk: hasTests ? 'moderate' : 'high',
    },
    founderRead: {
      bestFitRoles: profile.rolePreference?.length
        ? profile.rolePreference.slice(0, 3)
        : ['Full-stack builder', 'Prototype engineer', 'AI product builder'],
      summary:
        'Fallback report generated from DevLabs profile and project proof. Run the local agent analysis to verify builder-wide AI workflow patterns.',
      strengths: [
        projectCount ? `${projectCount} project${projectCount === 1 ? '' : 's'} available for proof-of-work review.` : 'Profile is ready for richer proof-of-work data.',
        frameworks.length ? `Stack signal includes ${frameworks.slice(0, 3).join(', ')}.` : 'Stack signal can be strengthened with local agent analysis.',
      ],
      weaknesses: ['Agent-session evidence has not been uploaded yet.'],
      riskFlags: ['Agent usage maturity is unverified until local analysis is completed.'],
    },
    evidenceHighlights: [
      projectCount
        ? `${projectCount} DevLabs project record${projectCount === 1 ? '' : 's'} available.`
        : 'No project records found yet.',
      'Fallback report does not include raw prompts, conversations, local paths, or source code.',
    ],
    share: {
      publicUrl: `${rootUrl.replace(/\/$/, '')}/builder/wrapped/${builderId}`,
    },
    createdAt: new Date().toISOString(),
  };
}
