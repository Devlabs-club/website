import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MAX_SAMPLE_BYTES = 160_000;
const MAX_FILES_PER_SOURCE = 24;

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir, max = MAX_FILES_PER_SOURCE) {
  const results = [];
  async function walk(current) {
    if (results.length >= max) return;
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= max) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(json|jsonl|md|txt|toml)$/i.test(entry.name)) results.push(full);
    }
  }
  await walk(dir);
  return results;
}

async function addSource(sources, agent, kind, target) {
  if (!(await exists(target))) return;
  const stat = await fs.stat(target);
  const files = stat.isDirectory() ? await listFiles(target) : [target];
  if (!files.length) return;
  sources.push({
    agent,
    kind,
    target,
    files,
    safeCountLabel: stat.isDirectory() ? `${files.length}+ readable summary/config files` : '1 readable file',
  });
}

export async function discoverAgentSources({ imports = [] } = {}) {
  const home = os.homedir();
  const sources = [];

  await addSource(sources, 'Claude Code', 'local settings', path.join(home, '.claude', 'settings.json'));
  await addSource(sources, 'Claude Code', 'session/export summaries', path.join(home, '.claude', 'projects'));
  await addSource(sources, 'Codex', 'local config', path.join(home, '.codex', 'config.toml'));
  await addSource(sources, 'Codex', 'session/export summaries', path.join(home, '.codex', 'sessions'));
  await addSource(sources, 'Codex', 'agent instructions', path.join(home, '.codex', 'AGENTS.md'));
  await addSource(sources, 'Cursor', 'rules and summaries', path.join(home, '.cursor'));

  for (const manual of imports.filter(Boolean)) {
    await addSource(sources, 'Manual import', 'exported session summary', path.resolve(manual));
  }

  return sources;
}

function redactSecrets(text) {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_SECRET]')
    .replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^"'\s]+/gi, '$1=[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\/Users\/[^/\s]+\/[^\s]+/g, '[LOCAL_PATH]')
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+\\[^\s]+/g, '[LOCAL_PATH]');
}

const TIMESTAMP_PATTERN = /"timestamp"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z?)"/g;
const TAIL_SAMPLE_BYTES = 8_000;
const MAX_PLAUSIBLE_SESSION_HOURS = 12;

function firstAndLastTimestamp(text) {
  const matches = [...text.matchAll(TIMESTAMP_PATTERN)];
  if (!matches.length) return null;
  const times = matches.map((match) => Date.parse(match[1])).filter((value) => !Number.isNaN(value));
  if (!times.length) return null;
  return { startMs: Math.min(...times), endMs: Math.max(...times) };
}

// Session logs (Claude Code/Codex JSONL) carry a real per-line ISO timestamp; reading a small
// head+tail slice is enough to bound session start/end without loading (or uploading) full transcripts.
async function readSessionTimeRange(file) {
  try {
    const stat = await fs.stat(file);
    if (!/\.jsonl$/i.test(file)) return null;

    const headHandle = await fs.open(file, 'r');
    const headBuffer = Buffer.alloc(Math.min(MAX_SAMPLE_BYTES, stat.size));
    const { bytesRead: headBytes } = await headHandle.read(headBuffer, 0, headBuffer.length, 0);
    await headHandle.close();
    const headText = headBuffer.subarray(0, headBytes).toString('utf8');

    let tailText = '';
    if (stat.size > headBytes) {
      const tailSize = Math.min(TAIL_SAMPLE_BYTES, stat.size);
      const tailHandle = await fs.open(file, 'r');
      const tailBuffer = Buffer.alloc(tailSize);
      const { bytesRead: tailBytes } = await tailHandle.read(tailBuffer, 0, tailSize, stat.size - tailSize);
      await tailHandle.close();
      tailText = tailBuffer.subarray(0, tailBytes).toString('utf8');
    }

    const headRange = firstAndLastTimestamp(headText);
    const tailRange = firstAndLastTimestamp(tailText);
    if (!headRange && !tailRange) return null;

    const startMs = headRange ? headRange.startMs : tailRange.startMs;
    const endMs = Math.max(headRange ? headRange.endMs : 0, tailRange ? tailRange.endMs : 0) || startMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;

    const hours = (endMs - startMs) / 3_600_000;
    if (hours > MAX_PLAUSIBLE_SESSION_HOURS) return null;

    return { startMs, endMs };
  } catch {
    return null;
  }
}

export async function readSourceSamples(sources) {
  const samples = [];
  for (const source of sources) {
    const isSessionKind = source.kind === 'session/export summaries';
    for (const file of source.files.slice(0, MAX_FILES_PER_SOURCE)) {
      let text = '';
      try {
        const handle = await fs.open(file, 'r');
        const buffer = Buffer.alloc(MAX_SAMPLE_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, MAX_SAMPLE_BYTES, 0);
        await handle.close();
        text = buffer.subarray(0, bytesRead).toString('utf8');
      } catch {
        continue;
      }
      const timeRange = isSessionKind ? await readSessionTimeRange(file) : null;
      samples.push({
        agent: source.agent,
        kind: source.kind,
        text: redactSecrets(text),
        timeRange,
      });
    }
  }
  return samples;
}
