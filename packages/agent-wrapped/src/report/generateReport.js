import { buildBuildprint } from '../buildprint/index.js';
import { PACKAGE_VERSION } from '../buildprint/constants.js';

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
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].length;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const DEFAULT_SESSION_MINUTES = 42;

function scoreFromTerms(text, terms) {
  return terms.reduce((sum, term) => sum + countMatches(text, term), 0);
}

function makeReportId(builderId) {
  return `agent-usage-${builderId}-${Date.now()}`;
}

function computeTimeInvested(samples) {
  const sessionSamples = samples.filter((sample) => sample.isSessionFile);
  const timedSessions = sessionSamples.filter((sample) => sample.timeRange);
  const untimedSessions = sessionSamples.filter((sample) => !sample.timeRange);

  const timedMinutes = timedSessions.map((sample) => {
    const raw = Math.max(1, (sample.timeRange.endMs - sample.timeRange.startMs) / 60_000);
    // Cap wall-clock spans (editor sessions left open for days).
    return Math.min(6 * 60, raw);
  });
  const timedTotalMinutes = timedMinutes.reduce((sum, value) => sum + value, 0);
  const avgTimedMinutes =
    timedMinutes.length > 0 ? timedTotalMinutes / timedMinutes.length : DEFAULT_SESSION_MINUTES;

  const estimatedUntimedMinutes = untimedSessions.length * Math.max(DEFAULT_SESSION_MINUTES, avgTimedMinutes);
  const configMinutes = samples
    .filter((sample) => !sample.isSessionFile)
    .length * Math.max(12, Math.round(avgTimedMinutes * 0.35));

  const totalMinutes = timedTotalMinutes + estimatedUntimedMinutes + configMinutes;
  const longestSessionMinutes = timedMinutes.length
    ? Math.round(Math.max(...timedMinutes))
    : Math.round(Math.max(DEFAULT_SESSION_MINUTES, avgTimedMinutes));

  const allStarts = timedSessions.map((sample) => sample.timeRange.startMs);
  const allEnds = timedSessions.map((sample) => sample.timeRange.endMs);
  const daysCovered =
    allStarts.length && allEnds.length
      ? Math.max(1, Math.ceil((Math.max(...allEnds) - Math.min(...allStarts)) / 86_400_000))
      : undefined;

  return {
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    longestSessionMinutes,
    sessionFiles: sessionSamples.length,
    timedSessionFiles: timedSessions.length,
    estimated: untimedSessions.length > 0 || timedSessions.length < sessionSamples.length,
    daysCovered,
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
  const avgMinutesPerSession = totalTimedSessions > 0 ? totalMinutes / totalTimedSessions : 0;
  const totalSessions = samples.length || 1;

  const estimatedMinutes = (agent) =>
    perAgentMinutes.get(agent) || (perAgentSessions.get(agent) || 0) * avgMinutesPerSession;
  const estimatedTotalMinutes = useTime
    ? agents.reduce((sum, agent) => sum + estimatedMinutes(agent), 0)
    : 0;

  const split = agents.map((agent) => ({
    agent,
    sessions: perAgentSessions.get(agent) || 0,
    percent: useTime
      ? Math.round((estimatedMinutes(agent) / (estimatedTotalMinutes || 1)) * 100)
      : Math.round(((perAgentSessions.get(agent) || 0) / totalSessions) * 100),
  }));

  const drift = 100 - split.reduce((sum, item) => sum + item.percent, 0);
  if (drift !== 0 && split.length) {
    const largest = [...split].sort((a, b) => b.percent - a.percent)[0];
    largest.percent += drift;
  }
  return split.sort((a, b) => b.percent - a.percent);
}

export function generateReport({ builderId, builderName, samples, usage = null, publicRoot }) {
  const allText = samples.map((sample) => sample.text).join('\n').toLowerCase();
  const agents = [...new Set(samples.map((sample) => sample.agent))];
  const sessionCount =
    usage?.sessions?.allTime ||
    samples.filter((sample) => sample.isSessionFile).length ||
    samples.length;

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

  const languages = languageHits.length
    ? languageHits.map((item) => ({
        name: item.name,
        percent: Math.max(1, Math.round((item.hits / languageTotal) * 100)),
        sessions: item.hits,
        evidence: 'session_summary',
      }))
    : [{ name: 'TypeScript', percent: 100, sessions: 0, evidence: 'session_summary' }];

  const { buildprint, facts, signals, legacy } = buildBuildprint({
    samples,
    languages,
    frameworks,
  });

  const frontend = scoreFromTerms(allText, [/\b(ui|react|component|frontend|css|tailwind|page|route)\b/gi]);
  const backend = scoreFromTerms(allText, [/\b(api|server|auth|backend|database|endpoint|worker)\b/gi]);
  const database = scoreFromTerms(allText, [/\b(database|postgres|mongo|sql|schema|migration|prisma)\b/gi]);
  const infra = scoreFromTerms(allText, [/\b(deploy|vercel|cloudflare|docker|env|ci|github action)\b/gi]);
  const tests = scoreFromTerms(allText, [/\b(test|spec|vitest|jest|playwright|pytest|lint|typecheck)\b/gi]);
  const docs = scoreFromTerms(allText, [/\b(readme|docs|comment|instructions|agents\.md|claude\.md)\b/gi]);

  const buildSurface = {
    frontend: clamp(frontend * 4),
    backend: clamp(backend * 4),
    database: clamp(database * 5),
    infra: clamp(infra * 5),
    tests: clamp(tests * 4),
    docs: clamp(docs * 5),
  };

  const fallbackTime = computeTimeInvested(samples);
  const timeInvested = usage?.activeHours
    ? {
        totalHours: usage.activeHours.allTime,
        longestSessionMinutes: fallbackTime.longestSessionMinutes,
        estimated: Boolean(usage.activeHours.estimated),
        sessionFiles: usage.sessions?.allTime ?? fallbackTime.sessionFiles,
        timedSessionFiles: usage.sessions?.allTime ?? fallbackTime.timedSessionFiles,
        daysCovered: fallbackTime.daysCovered,
        method: usage.activeHours.method || 'active_gap',
        last30Hours: usage.activeHours.last30,
      }
    : fallbackTime;
  const agentSplit = usage?.tokens?.byAgent?.length
    ? usage.tokens.byAgent
        .filter((row) => row.sessions > 0)
        .map((row) => ({
          agent: row.agent,
          sessions: row.sessions,
          percent: 0,
        }))
        .map((row, _i, arr) => {
          const total = arr.reduce((s, r) => s + (r.sessions || 0), 0) || 1;
          return { ...row, percent: Math.round(((row.sessions || 0) / total) * 100) };
        })
        .sort((a, b) => b.percent - a.percent)
    : computeAgentSplit(samples, agents);

  if (agentSplit.length) {
    const drift = 100 - agentSplit.reduce((sum, item) => sum + item.percent, 0);
    if (drift !== 0) agentSplit[0].percent += drift;
  }

  return {
    builderId,
    reportId: makeReportId(builderId),
    builderName,
    ...legacy,
    source: 'uploaded_agent_usage',
    sourceSummary: {
      claudeSessions: samples.filter((sample) => sample.agent === 'Claude Code').length,
      codexSessions: samples.filter((sample) => sample.agent === 'Codex').length,
      cursorSessions: samples.filter((sample) => sample.agent === 'Cursor').length,
      manualImports: samples.filter((sample) => sample.agent === 'Manual import').length,
      projectsReferenced: facts.projectCount,
      daysCovered: timeInvested.daysCovered,
    },
    sourceCoverage: {
      agents,
      sessionCount,
      timeframeLabel: usage ? 'Local agent telemetry (active-gap hours)' : 'Local available agent usage',
      confidenceNotes: [
        'Report is generated from local agent usage summaries/configs and approved by the builder before upload.',
        'Raw prompts, conversations, source code, full paths, private filenames, and secrets are not uploaded.',
        `Methodology: ${buildprint.methodologyVersion}.`,
        ...(usage?.tokens?.cursorEstimated
          ? ['Cursor tokens are estimated from active time when usage counters are unavailable.']
          : []),
      ],
    },
    usage: usage || undefined,
    languages,
    frameworks,
    buildSurface,
    validation: {
      buildTestLoops: facts.testActivitySessions,
      errorRecoveryLoops: facts.recoveryLoopEvents,
      successfulReruns: facts.sessionsWithVerifiedRecovery,
      testDisciplineScore: Math.round(signals.testDiscipline),
    },
    agentMaturity: {
      planningScore: Math.round(signals.planningQuality),
      contextScore: Math.round(signals.contextDiscipline),
      iterationScore: Math.round(signals.iterationIntensity),
      verificationScore: Math.round(signals.verificationDiscipline),
      blindAcceptanceRisk:
        signals.verificationDiscipline >= 65
          ? 'low'
          : signals.verificationDiscipline >= 40
            ? 'moderate'
            : 'high',
    },
    share: {
      publicUrl: `${publicRoot.replace(/\/$/, '')}/builder/wrapped/${builderId}`,
    },
    createdAt: new Date().toISOString(),
    timeInvested,
    agentSplit,
    buildprint,
    localAnalysisVersion: PACKAGE_VERSION,
  };
}
