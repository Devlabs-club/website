import type { AgentWrappedReport } from './types';

const RAW_CONTENT_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}/i,
  /\b(api[_-]?key|secret|token|password)\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\/Users\/[^/\s]+\/[^\s]+/,
  /[A-Za-z]:\\Users\\[^\\\s]+\\[^\s]+/,
  /\b(prompt|conversation|transcript)\s*:/i,
];

function scanValue(value: unknown, path = 'report'): string[] {
  const issues: string[] = [];
  if (typeof value === 'string') {
    for (const pattern of RAW_CONTENT_PATTERNS) {
      if (pattern.test(value)) issues.push(`${path} appears to contain raw or sensitive content.`);
    }
    if (value.length > 1200) issues.push(`${path} is too long for a safe aggregated field.`);
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => issues.push(...scanValue(item, `${path}[${index}]`)));
    return issues;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      issues.push(...scanValue(nested, `${path}.${key}`));
    }
  }
  return issues;
}

export function validateSafeAgentWrappedReport(report: AgentWrappedReport) {
  const issues = scanValue(report);
  if (report.source !== 'uploaded_agent_usage') {
    issues.push('Uploaded reports must use source uploaded_agent_usage.');
  }
  if (!report.builderId || report.builderId !== String(report.builderId)) {
    issues.push('Report must include builderId.');
  }
  if (!Array.isArray(report.evidenceHighlights)) {
    issues.push('Report must include evidenceHighlights.');
  }
  return { ok: issues.length === 0, issues };
}
