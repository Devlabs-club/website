import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_SAMPLE_BYTES = 160_000;
const CHUNK_SCAN_BYTES = 256_000;
const DEFAULT_SESSION_MINUTES = 42;

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir) {
  const results = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(json|jsonl|md|txt|toml)$/i.test(entry.name)) results.push(full);
    }
  }
  await walk(dir);
  const withMtime = await Promise.all(
    results.map(async (file) => {
      try {
        const stat = await fs.stat(file);
        return { file, mtimeMs: stat.mtimeMs };
      } catch {
        return { file, mtimeMs: 0 };
      }
    })
  );
  return withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs).map((item) => item.file);
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
    safeCountLabel: stat.isDirectory() ? `${files.length} readable summary/config files` : '1 readable file',
  });
}

export async function discoverAgentSources({ imports = [] } = {}) {
  const home = os.homedir();
  const sources = [];

  await addSource(sources, 'Claude Code', 'local settings', path.join(home, '.claude', 'settings.json'));
  await addSource(sources, 'Claude Code', 'session/export summaries', path.join(home, '.claude', 'projects'));
  await addSource(sources, 'Claude Code', 'session/export summaries', path.join(home, '.claude', 'history'));
  await addSource(sources, 'Codex', 'local config', path.join(home, '.codex', 'config.toml'));
  await addSource(sources, 'Codex', 'session/export summaries', path.join(home, '.codex', 'sessions'));
  await addSource(sources, 'Codex', 'agent instructions', path.join(home, '.codex', 'AGENTS.md'));
  await addSource(sources, 'Cursor', 'session/export summaries', path.join(home, '.cursor'));
  await addSource(sources, 'Cursor', 'session/export summaries', path.join(home, '.cursor', 'chats'));
  await addSource(sources, 'Cursor', 'session/export summaries', path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'History'));

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
const CREATED_AT_PATTERN = /"createdAt"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z?)"/g;
const UPDATED_AT_PATTERN = /"updatedAt"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z?)"/g;

function collectTimestamps(text) {
  const times = [];
  for (const pattern of [TIMESTAMP_PATTERN, CREATED_AT_PATTERN, UPDATED_AT_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const parsed = Date.parse(match[1]);
      if (!Number.isNaN(parsed)) times.push(parsed);
    }
  }
  return times;
}

function rangeFromTimestamps(times) {
  if (!times.length) return null;
  const startMs = Math.min(...times);
  const endMs = Math.max(...times);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return { startMs, endMs, source: 'timestamps' };
}

async function readJsonlTimeRange(file) {
  try {
    const stat = await fs.stat(file);
    if (!/\.jsonl$/i.test(file)) return null;

    const times = [];
    const handle = await fs.open(file, 'r');
    let offset = 0;
    while (offset < stat.size) {
      const chunkSize = Math.min(CHUNK_SCAN_BYTES, stat.size - offset);
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, offset);
      if (bytesRead <= 0) break;
      times.push(...collectTimestamps(buffer.subarray(0, bytesRead).toString('utf8')));
      offset += bytesRead;
    }
    await handle.close();

    const ranged = rangeFromTimestamps(times);
    if (ranged) return ranged;

    if (stat.size > 4_000) {
      const minutes = Math.max(DEFAULT_SESSION_MINUTES, Math.round(stat.size / 2_000));
      const endMs = stat.mtimeMs || Date.now();
      return { startMs: endMs - minutes * 60_000, endMs, source: 'file-size' };
    }
    return null;
  } catch {
    return null;
  }
}

async function readJsonTimeRange(file) {
  try {
    const stat = await fs.stat(file);
    if (!/\.json$/i.test(file)) return null;

    const handle = await fs.open(file, 'r');
    const buffer = Buffer.alloc(Math.min(stat.size, 512_000));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    const ranged = rangeFromTimestamps(collectTimestamps(buffer.subarray(0, bytesRead).toString('utf8')));
    if (ranged) return ranged;

    if (stat.size > 2_000) {
      const minutes = Math.max(DEFAULT_SESSION_MINUTES, Math.round(stat.size / 2_500));
      const endMs = stat.mtimeMs || Date.now();
      return { startMs: endMs - minutes * 60_000, endMs, source: 'file-size' };
    }
    return null;
  } catch {
    return null;
  }
}

async function readHeuristicSessionTimeRange(file) {
  try {
    const stat = await fs.stat(file);
    if (!/\.(json|jsonl|md|txt)$/i.test(file)) return null;
    const minutes = Math.max(DEFAULT_SESSION_MINUTES, Math.round(stat.size / 2_500) + 12);
    const endMs = stat.mtimeMs || Date.now();
    return { startMs: endMs - minutes * 60_000, endMs, source: 'file-heuristic' };
  } catch {
    return null;
  }
}

function isSessionLikeFile(source, file) {
  if (source.kind === 'session/export summaries') return true;
  if (source.agent === 'Cursor' && /\.(json|jsonl)$/i.test(file)) return true;
  if (/\.jsonl$/i.test(file)) return true;
  return false;
}

/** Stable project bucket id for diversity counts — never upload the raw path. */
function projectBucketIdForFile(file) {
  const normalized = String(file || '').replace(/\\/g, '/');
  const parts = normalized.split('/');
  const projectsIdx = parts.findIndex((p) => p === 'projects');
  if (projectsIdx >= 0 && parts[projectsIdx + 1]) {
    return createHash('sha256').update(`claude:${parts[projectsIdx + 1]}`).digest('hex').slice(0, 16);
  }
  const sessionsIdx = parts.findIndex((p) => p === 'sessions');
  if (sessionsIdx >= 0 && parts[sessionsIdx + 1]) {
    return createHash('sha256').update(`codex:${parts[sessionsIdx + 1]}`).digest('hex').slice(0, 16);
  }
  if (parts.length >= 2) {
    return createHash('sha256').update(`dir:${parts[parts.length - 2]}`).digest('hex').slice(0, 16);
  }
  return null;
}

export async function readSourceSamples(sources) {
  const samples = [];
  const seenFiles = new Set();
  for (const source of sources) {
    for (const file of source.files) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
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

      const sessionLike = isSessionLikeFile(source, file);
      const timeRange = sessionLike
        ? (await readJsonlTimeRange(file)) ||
          (await readJsonTimeRange(file)) ||
          (await readHeuristicSessionTimeRange(file))
        : null;

      samples.push({
        agent: source.agent,
        kind: source.kind,
        isSessionFile: sessionLike,
        text: redactSecrets(text),
        timeRange,
        byteLength: text.length,
        projectBucketId: projectBucketIdForFile(file),
      });
    }
  }
  return samples;
}
