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

export async function readSourceSamples(sources) {
  const samples = [];
  for (const source of sources) {
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
      samples.push({
        agent: source.agent,
        kind: source.kind,
        text: redactSecrets(text),
      });
    }
  }
  return samples;
}
