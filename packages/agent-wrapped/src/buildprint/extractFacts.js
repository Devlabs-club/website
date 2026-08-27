import { createHash } from 'node:crypto';

const PRODUCT_TERMS = /\b(ui|react|component|frontend|css|tailwind|page|route|prototype|ship|product|feature|screen)\b/gi;
const BACKEND_TERMS = /\b(api|server|auth|backend|endpoint|worker|service)\b/gi;
const DATABASE_TERMS = /\b(database|postgres|mongo|sql|schema|migration|prisma)\b/gi;
const INFRA_TERMS = /\b(deploy|vercel|cloudflare|docker|env|ci|github action|infra|kubernetes)\b/gi;
const TEST_TERMS = /\b(test|spec|vitest|jest|playwright|pytest|lint|typecheck|verify|rerun)\b/gi;
const VERIFY_TERMS = /\b(test|build|lint|typecheck|verify|rerun|ci|pass|passed)\b/gi;
const ERROR_TERMS = /\b(error|failed|exception|stack trace|regression|bug)\b/gi;
const FIX_TERMS = /\b(fix|patch|debug|resolve|retry|iterate|refactor)\b/gi;
const PLAN_TERMS = /\b(plan|approach|architecture|spec|todo|step|design)\b/gi;
const CONTEXT_TERMS = /\b(context|agents\.md|claude\.md|rules|instructions|readme)\b/gi;
const DOCS_TERMS = /\b(readme|docs|comment|instructions|agents\.md|claude\.md)\b/gi;

function countMatches(text, pattern) {
  pattern.lastIndex = 0;
  let count = 0;
  for (const _ of String(text || '').matchAll(pattern)) count += 1;
  return count;
}

function sessionDurationMinutes(sample) {
  if (!sample.timeRange) return null;
  return Math.max(1, (sample.timeRange.endMs - sample.timeRange.startMs) / 60_000);
}

function isConfigOnly(sample) {
  return (
    !sample.isSessionFile ||
    /local settings|local config|agent instructions/i.test(sample.kind || '')
  );
}

/**
 * A sample is substantial if it looks like real building work, not config noise.
 */
export function isSubstantialSession(sample) {
  if (isConfigOnly(sample) && (sample.text?.length || 0) < 4000) return false;
  if (!sample.isSessionFile && (sample.text?.length || 0) < 4000) return false;

  const textLen = sample.text?.length || 0;
  const minutes = sessionDurationMinutes(sample);
  const families = [
    countMatches(sample.text || '', PRODUCT_TERMS) > 0,
    countMatches(sample.text || '', BACKEND_TERMS) > 0,
    countMatches(sample.text || '', TEST_TERMS) > 0,
    countMatches(sample.text || '', FIX_TERMS) > 0,
    countMatches(sample.text || '', PLAN_TERMS) > 0,
  ].filter(Boolean).length;

  if (sample.isSessionFile && textLen >= 4000) return true;
  if (minutes != null && minutes >= 15) return true;
  if (minutes != null && minutes >= 8 && families >= 2) return true;
  if (textLen >= 8000) return true;
  return false;
}

function hashProjectBucket(filePath) {
  if (!filePath) return null;
  // Prefer Claude projects/<bucket>/… or Codex sessions parent; never upload raw path.
  const parts = String(filePath).replace(/\\/g, '/').split('/');
  const projectsIdx = parts.findIndex((p) => p === 'projects');
  if (projectsIdx >= 0 && parts[projectsIdx + 1]) {
    return createHash('sha256').update(`claude:${parts[projectsIdx + 1]}`).digest('hex').slice(0, 16);
  }
  const sessionsIdx = parts.findIndex((p) => p === 'sessions');
  if (sessionsIdx >= 0 && parts[sessionsIdx + 1]) {
    return createHash('sha256').update(`codex:${parts[sessionsIdx + 1]}`).digest('hex').slice(0, 16);
  }
  // Fall back to parent directory name hash when available on sample meta.
  if (parts.length >= 2) {
    return createHash('sha256').update(`dir:${parts[parts.length - 2]}`).digest('hex').slice(0, 16);
  }
  return null;
}

function hasContextArtifact(samples) {
  return samples.some((sample) => {
    const kind = (sample.kind || '').toLowerCase();
    const text = (sample.text || '').toLowerCase();
    if (kind.includes('agent instructions') || kind.includes('local settings') || kind.includes('local config')) {
      return true;
    }
    return /\bagents\.md\b|\bclaude\.md\b|\.cursorrules\b|cursor rules/.test(text);
  });
}

/**
 * @param {Array<{ agent: string, kind: string, isSessionFile: boolean, text: string, timeRange: any, projectBucketId?: string|null, byteLength?: number }>} samples
 */
export function extractFacts(samples) {
  const substantial = samples.filter(isSubstantialSession);
  const projectBuckets = new Set();
  for (const sample of samples) {
    const bucket = sample.projectBucketId || null;
    if (bucket) projectBuckets.add(bucket);
  }

  let productSurfaceSessions = 0;
  let connectedWorkflowSessions = 0;
  let systemsSessions = 0;
  let testActivitySessions = 0;
  let sessionsWithVerification = 0;
  let sessionsWithRecovery = 0;
  let sessionsWithVerifiedRecovery = 0;
  let contextHeavySessions = 0;
  let prototypeSessions = 0;
  let recoveryLoopEvents = 0;
  let frontendHits = 0;
  let backendHits = 0;
  let databaseHits = 0;
  let infraHits = 0;
  let testHits = 0;
  let verifyHits = 0;
  let planHits = 0;
  let contextHits = 0;
  let docsHits = 0;
  let errorHits = 0;
  let fixHits = 0;
  let timedSubstantial = 0;
  let estimatedSubstantial = 0;

  for (const sample of substantial) {
    const text = (sample.text || '').toLowerCase();
    const product = countMatches(text, PRODUCT_TERMS);
    const backend = countMatches(text, BACKEND_TERMS);
    const database = countMatches(text, DATABASE_TERMS);
    const infra = countMatches(text, INFRA_TERMS);
    const tests = countMatches(text, TEST_TERMS);
    const verify = countMatches(text, VERIFY_TERMS);
    const errors = countMatches(text, ERROR_TERMS);
    const fixes = countMatches(text, FIX_TERMS);
    const plan = countMatches(text, PLAN_TERMS);
    const context = countMatches(text, CONTEXT_TERMS);
    const docs = countMatches(text, DOCS_TERMS);
    const minutes = sessionDurationMinutes(sample);

    frontendHits += product;
    backendHits += backend;
    databaseHits += database;
    infraHits += infra;
    testHits += tests;
    verifyHits += verify;
    planHits += plan;
    contextHits += context;
    docsHits += docs;
    errorHits += errors;
    fixHits += fixes;

    if (product > 0) productSurfaceSessions += 1;
    if (product > 0 && backend > 0) connectedWorkflowSessions += 1;
    if (database + infra > 0 || (backend > 0 && product === 0)) systemsSessions += 1;
    if (tests > 0 || verify > 0) {
      testActivitySessions += 1;
      sessionsWithVerification += 1;
    }
    const loops = Math.min(errors, fixes);
    if (loops > 0 || (errors > 0 && fixes > 0)) {
      sessionsWithRecovery += 1;
      recoveryLoopEvents += Math.max(1, Math.round(loops || Math.min(errors, fixes) || 1));
      if (verify > 0 || tests > 0) sessionsWithVerifiedRecovery += 1;
    }
    if (context > 0 || plan > 0 || docs > 0) contextHeavySessions += 1;
    if (minutes != null && minutes <= 45 && product > 0) prototypeSessions += 1;

    if (sample.timeRange?.source === 'timestamps') timedSubstantial += 1;
    else estimatedSubstantial += 1;
  }

  const agents = [...new Set(samples.map((s) => s.agent))];
  const contextArtifacts = hasContextArtifact(samples) ? 1 : 0;
  const fastSessionShare =
    substantial.length > 0 ? Math.round((prototypeSessions / substantial.length) * 100) : 0;

  return {
    sampleCount: samples.length,
    substantialSessions: substantial.length,
    projectCount: projectBuckets.size,
    productSurfaceSessions,
    connectedWorkflowSessions,
    systemsSessions,
    testActivitySessions,
    sessionsWithVerification,
    sessionsWithRecovery,
    sessionsWithVerifiedRecovery,
    contextHeavySessions,
    prototypeSessions,
    recoveryLoopEvents,
    contextArtifacts,
    agentsUsed: agents.length,
    agents,
    frontendHits,
    backendHits,
    databaseHits,
    infraHits,
    testHits,
    verifyHits,
    planHits,
    contextHits,
    docsHits,
    errorHits,
    fixHits,
    timedSubstantial,
    estimatedSubstantial,
    fastSessionShare,
    // multi-agent overlap deferred — keep count for future
    multiAgentSessionGroups: 0,
  };
}

export function attachProjectBuckets(samples, filePathsByIndex = []) {
  return samples.map((sample, index) => {
    if (sample.projectBucketId) return sample;
    const filePath = filePathsByIndex[index];
    return {
      ...sample,
      projectBucketId: hashProjectBucket(filePath),
    };
  });
}

export { hashProjectBucket };
