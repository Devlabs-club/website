const LANGUAGE_PATTERNS = {
  TypeScript: /\b(typescript|tsx|ts|react|next\.?js|astro)\b/gi,
  JavaScript: /\b(javascript|node|express|vite|npm|pnpm)\b/gi,
  Python: /\b(python|fastapi|django|flask|pytest|uv|pip)\b/gi,
  SQL: /\b(sql|postgres|mysql|sqlite|prisma|supabase)\b/gi,
  Shell: /\b(shell|bash|zsh|terminal|docker|deploy)\b/gi,
  Go: /\b(go|golang|go\.mod)\b/gi,
  Rust: /\b(rust|cargo|tokio)\b/gi,
};

const FRAMEWORK_PATTERNS = {
  React: /\breact\b/gi,
  'Next.js': /\bnext\.?js\b/gi,
  Astro: /\bastro\b/gi,
  Tailwind: /\btailwind\b/gi,
  Prisma: /\bprisma\b/gi,
  Postgres: /\bpostgres|postgresql\b/gi,
  MongoDB: /\bmongodb|mongoose\b/gi,
  FastAPI: /\bfastapi\b/gi,
  Docker: /\bdocker\b/gi,
  Vercel: /\bvercel\b/gi,
  Cloudflare: /\bcloudflare\b/gi,
};

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromTerms(text, terms) {
  return terms.reduce((sum, term) => sum + countMatches(text, term), 0);
}

function makeReportId(builderId) {
  return `agent-usage-${builderId}-${Date.now()}`;
}

const IDENTITY_DEFS = [
  {
    name: 'Shipper',
    tagline: 'Ships fast, ships often.',
    score: (m) => 0.25 * m.frontend + 0.25 * m.backend + 0.25 * m.verificationScore + 0.25 * m.testDisciplineScore,
  },
  {
    name: 'Debugger',
    tagline: "Turns red terminals green.",
    score: (m) => 0.6 * m.iterationScore + 0.4 * Math.min(100, m.errorRecoveryLoops * 8),
  },
  {
    name: 'Perfectionist',
    tagline: "One more pass before it ships.",
    score: (m) => 0.5 * m.testDisciplineScore + 0.3 * m.verificationScore + 0.2 * Math.max(0, 100 - m.iterationScore),
  },
  {
    name: 'Architect',
    tagline: 'Plans before it prompts.',
    score: (m) => 0.55 * m.planningScore + 0.45 * m.contextScore,
  },
  {
    name: 'Systems Builder',
    tagline: 'At home in infra and data.',
    score: (m) => 0.5 * m.infra + 0.5 * m.database,
  },
  {
    name: 'Full-Stack Operator',
    tagline: 'Equally dangerous on both ends.',
    score: (m) => Math.min(m.frontend, m.backend),
  },
  {
    name: 'Polyglot',
    tagline: 'Fluent across the stack.',
    score: (m) => Math.min(100, m.languageCount * 14 + m.frameworkCount * 6),
  },
  {
    name: 'Grinder',
    tagline: 'Long sessions, no quit.',
    score: (m) => Math.min(100, m.totalHours * 2 + m.longestSessionMinutes / 3),
  },
  {
    name: 'Multi-Agent Power User',
    tagline: 'Runs a whole agent squad.',
    score: (m) => (m.agentCount >= 3 ? 92 : m.agentCount === 2 ? 65 : m.agentCount === 1 ? 30 : 12),
  },
];

function computeIdentities(metrics) {
  return IDENTITY_DEFS.map((def) => ({ name: def.name, tagline: def.tagline, score: clamp(def.score(metrics)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function computeTimeInvested(samples) {
  const ranges = samples.map((sample) => sample.timeRange).filter(Boolean);
  if (!ranges.length) {
    return { totalHours: 0, longestSessionMinutes: 0, estimated: true };
  }
  const durationsMinutes = ranges.map((range) => Math.max(1, (range.endMs - range.startMs) / 60_000));
  const totalMinutes = durationsMinutes.reduce((sum, value) => sum + value, 0);
  return {
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    longestSessionMinutes: Math.round(Math.max(...durationsMinutes)),
    estimated: ranges.length < samples.length,
  };
}

function computeAgentSplit(samples, agents) {
  const perAgentMinutes = new Map();
  const perAgentSessions = new Map();
  const perAgentTimedSessions = new Map();
  for (const sample of samples) {
    perAgentSessions.set(sample.agent, (perAgentSessions.get(sample.agent) || 0) + 1);
    if (sample.timeRange) {
      const minutes = Math.max(1, (sample.timeRange.endMs - sample.timeRange.startMs) / 60_000);
      perAgentMinutes.set(sample.agent, (perAgentMinutes.get(sample.agent) || 0) + minutes);
      perAgentTimedSessions.set(sample.agent, (perAgentTimedSessions.get(sample.agent) || 0) + 1);
    }
  }
  const totalMinutes = [...perAgentMinutes.values()].reduce((sum, value) => sum + value, 0);
  const totalTimedSessions = [...perAgentTimedSessions.values()].reduce((sum, value) => sum + value, 0);
  const useTime = totalMinutes > 0;
  // Agents whose files carry no timestamps (e.g. Cursor's rule/config text) would otherwise
  // vanish from a time-weighted split; backfill them at the observed average minutes/session
  // so every agent with real usage still shows up proportionally.
  const avgMinutesPerSession = totalTimedSessions > 0 ? totalMinutes / totalTimedSessions : 0;
  const totalSessions = samples.length || 1;

  const estimatedMinutes = (agent) => perAgentMinutes.get(agent) || (perAgentSessions.get(agent) || 0) * avgMinutesPerSession;
  const estimatedTotalMinutes = useTime ? agents.reduce((sum, agent) => sum + estimatedMinutes(agent), 0) : 0;

  const split = agents.map((agent) => ({
    agent,
    sessions: perAgentSessions.get(agent) || 0,
    percent: useTime
      ? Math.round((estimatedMinutes(agent) / (estimatedTotalMinutes || 1)) * 100)
      : Math.round(((perAgentSessions.get(agent) || 0) / totalSessions) * 100),
  }));

  // Rounding can drift the total off 100; nudge the largest share to absorb it.
  const drift = 100 - split.reduce((sum, item) => sum + item.percent, 0);
  if (drift !== 0 && split.length) {
    const largest = [...split].sort((a, b) => b.percent - a.percent)[0];
    largest.percent += drift;
  }
  return split.sort((a, b) => b.percent - a.percent);
}

export function generateReport({ builderId, builderName, samples, publicRoot }) {
  const allText = samples.map((sample) => sample.text).join('\n').toLowerCase();
  const agents = [...new Set(samples.map((sample) => sample.agent))];
  const sessionCount = samples.length;

  const languageHits = Object.entries(LANGUAGE_PATTERNS)
    .map(([name, pattern]) => ({ name, hits: countMatches(allText, pattern) }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 6);
  const languageTotal = languageHits.reduce((sum, item) => sum + item.hits, 0) || 1;

  const frameworks = Object.entries(FRAMEWORK_PATTERNS)
    .map(([name, pattern]) => ({ name, hits: countMatches(allText, pattern) }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 10)
    .map((item) => ({
      name: item.name,
      confidence: item.hits >= 5 ? 'high' : item.hits >= 2 ? 'moderate' : 'low',
      evidence: ['agent usage aggregate'],
    }));

  const planning = scoreFromTerms(allText, [/\b(plan|approach|architecture|spec|todo|step)\b/gi]);
  const context = scoreFromTerms(allText, [/\b(context|agents\.md|claude\.md|rules|instructions)\b/gi]);
  const iteration = scoreFromTerms(allText, [/\b(iterate|retry|fix|patch|refactor|debug)\b/gi]);
  const verification = scoreFromTerms(allText, [/\b(test|build|lint|typecheck|verify|rerun|ci)\b/gi]);
  const errors = scoreFromTerms(allText, [/\b(error|failed|exception|stack trace|regression)\b/gi]);

  const frontend = scoreFromTerms(allText, [/\b(ui|react|component|frontend|css|tailwind|page|route)\b/gi]);
  const backend = scoreFromTerms(allText, [/\b(api|server|auth|backend|database|endpoint|worker)\b/gi]);
  const database = scoreFromTerms(allText, [/\b(database|postgres|mongo|sql|schema|migration|prisma)\b/gi]);
  const infra = scoreFromTerms(allText, [/\b(deploy|vercel|cloudflare|docker|env|ci|github action)\b/gi]);
  const tests = scoreFromTerms(allText, [/\b(test|spec|vitest|jest|playwright|pytest|lint|typecheck)\b/gi]);
  const docs = scoreFromTerms(allText, [/\b(readme|docs|comment|instructions|agents\.md|claude\.md)\b/gi]);

  const planningScore = clamp(35 + planning * 2.4);
  const contextScore = clamp(35 + context * 3.8);
  const iterationScore = clamp(35 + iteration * 2.1);
  const verificationScore = clamp(30 + verification * 2.7);
  const testDisciplineScore = clamp(25 + verification * 2.4 + tests * 1.2);
  const score = clamp((planningScore + contextScore + iterationScore + verificationScore + testDisciplineScore) / 5);

  const buildSurface = {
    frontend: clamp(frontend * 4),
    backend: clamp(backend * 4),
    database: clamp(database * 5),
    infra: clamp(infra * 5),
    tests: clamp(tests * 4),
    docs: clamp(docs * 5),
  };
  const errorRecoveryLoops = Math.max(0, Math.round(errors / 4));
  const timeInvested = computeTimeInvested(samples);
  const agentSplit = computeAgentSplit(samples, agents);
  const identities = computeIdentities({
    frontend: buildSurface.frontend,
    backend: buildSurface.backend,
    infra: buildSurface.infra,
    database: buildSurface.database,
    verificationScore,
    testDisciplineScore,
    planningScore,
    contextScore,
    iterationScore,
    errorRecoveryLoops,
    languageCount: languageHits.length,
    frameworkCount: frameworks.length,
    totalHours: timeInvested.totalHours,
    longestSessionMinutes: timeInvested.longestSessionMinutes,
    agentCount: agents.length,
  });

  return {
    builderId,
    reportId: makeReportId(builderId),
    builderName,
    archetype:
      frontend && backend
        ? 'AI-Native Full-Stack Shipper'
        : verificationScore >= 70
          ? 'AI-Native Reliability Builder'
          : 'AI-Native Product Builder',
    score,
    percentile: score >= 90 ? 8 : score >= 80 ? 14 : score >= 70 ? 24 : 38,
    confidence: sessionCount >= 12 ? 'high' : sessionCount >= 5 ? 'moderate' : 'low',
    source: 'uploaded_agent_usage',
    sourceSummary: {
      claudeSessions: samples.filter((sample) => sample.agent === 'Claude Code').length,
      codexSessions: samples.filter((sample) => sample.agent === 'Codex').length,
      cursorSessions: samples.filter((sample) => sample.agent === 'Cursor').length,
      manualImports: samples.filter((sample) => sample.agent === 'Manual import').length,
      daysCovered: undefined,
    },
    sourceCoverage: {
      agents,
      sessionCount,
      timeframeLabel: 'Local available agent usage',
      confidenceNotes: [
        'Report is generated from local agent usage summaries/configs and approved by the builder before upload.',
        'Raw prompts, conversations, source code, full paths, private filenames, and secrets are not uploaded.',
      ],
    },
    languages: languageHits.length
      ? languageHits.map((item) => ({
          name: item.name,
          percent: Math.max(1, Math.round((item.hits / languageTotal) * 100)),
          sessions: item.hits,
          evidence: 'session_summary',
        }))
      : [{ name: 'TypeScript', percent: 100, sessions: 0, evidence: 'session_summary' }],
    frameworks,
    buildSurface,
    validation: {
      buildTestLoops: Math.max(0, Math.round(verification / 3)),
      errorRecoveryLoops,
      successfulReruns: Math.max(0, Math.round(verification / 5)),
      testDisciplineScore,
    },
    agentMaturity: {
      planningScore,
      contextScore,
      iterationScore,
      verificationScore,
      blindAcceptanceRisk: verificationScore >= 70 ? 'low' : verificationScore >= 45 ? 'moderate' : 'high',
    },
    founderRead: {
      bestFitRoles: ['AI product engineer', 'Full-stack builder', 'Prototype engineer'],
      summary:
        'Uses AI agents across builder workflows with measurable planning, iteration, and verification signals. Review stack fit and verification score for role matching.',
      strengths: [
        agents.length ? `Agent usage observed across ${agents.join(', ')}.` : 'Agent usage sources detected.',
        verificationScore >= 60 ? 'Shows repeated validation and rerun behavior.' : 'Has a baseline AI-agent workflow ready for stronger validation.',
        contextScore >= 60 ? 'Uses context/instruction files to steer agents.' : 'Can improve reusable context hygiene.',
      ],
      weaknesses: verificationScore < 50 ? ['Validation/test discipline needs stronger evidence.'] : ['No major weakness detected from aggregate usage.'],
      riskFlags: verificationScore < 45 ? ['Blind acceptance risk is elevated without stronger rerun/test signals.'] : [],
    },
    evidenceHighlights: [
      `${sessionCount} safe local agent source file${sessionCount === 1 ? '' : 's'} analyzed.`,
      agents.length ? `Sources included ${agents.join(', ')}.` : 'Agent source coverage was limited.',
      'Only aggregated proof-of-work metrics are uploaded after local preview approval.',
    ],
    share: {
      publicUrl: `${publicRoot.replace(/\/$/, '')}/builder/wrapped/${builderId}`,
    },
    createdAt: new Date().toISOString(),
    timeInvested,
    agentSplit,
    identities,
  };
}
