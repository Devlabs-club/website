/**
 * Structured usage telemetry from Claude/Codex JSONL + Cursor SQLite.
 * Uploads aggregates only — never prompts, paths, or raw transcripts.
 */
import fs from 'node:fs';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const USAGE_SCHEMA_VERSION = 1;
export const WINDOW_DAYS = 30;
export const MAX_ACTIVE_GAP_MINUTES = 15;
export const MAX_SESSION_HOURS = 4;
export const SINGLE_EVENT_SESSION_MINUTES = 1;

/** Rough retail $/MTok fallbacks when model unknown. */
const DEFAULT_RATE = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

const MODEL_RATES = [
  { match: /opus/i, input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  { match: /sonnet/i, input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  { match: /haiku/i, input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  { match: /gpt-5|o3|o4/i, input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  { match: /gpt-4\.1|gpt-4o/i, input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 1.25 },
  { match: /composer/i, input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
];

/** Cursor tokens estimated from active hours (disclosed to user). */
export const CURSOR_EST_TOKENS_PER_HOUR = {
  input: 38_000,
  output: 110_000,
  cacheRead: 24_750_000,
  cacheWrite: 750_000,
};

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Loop min/max — `Math.min(...arr)` throws RangeError past ~100k args. */
export function minNumber(values) {
  let min = Infinity;
  for (const value of values) {
    if (Number.isFinite(value) && value < min) min = value;
  }
  return min === Infinity ? null : min;
}

export function maxNumber(values) {
  let max = -Infinity;
  for (const value of values) {
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max === -Infinity ? null : max;
}

function rateForModel(model) {
  if (model) {
    for (const r of MODEL_RATES) {
      if (r.match.test(model)) {
        return {
          input: r.input,
          output: r.output,
          cacheRead: r.cacheRead,
          cacheWrite: r.cacheWrite,
        };
      }
    }
  }
  return DEFAULT_RATE;
}

export function estimateActiveDurationMs(timestamps, options = {}) {
  const maxGapMinutes = options.maxGapMinutes ?? MAX_ACTIVE_GAP_MINUTES;
  const maxSessionHours = options.maxSessionHours ?? MAX_SESSION_HOURS;
  const singleEventMinutes = options.singleEventMinutes ?? SINGLE_EVENT_SESSION_MINUTES;

  const sorted = [...new Set(timestamps)]
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return singleEventMinutes * 60 * 1000;

  const maxGapMs = maxGapMinutes * 60 * 1000;
  let total = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap <= 0) continue;
    total += Math.min(gap, maxGapMs);
  }
  return Math.min(total, maxSessionHours * 3600 * 1000);
}

function normalizeModelId(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().slice(0, 80);
  if (!cleaned || cleaned === 'default') return null;
  return cleaned;
}

function shortModelLabel(id) {
  const s = String(id || '');
  if (/opus\s*4\.?8|claude-opus-4/i.test(s)) return 'Opus 4.8';
  if (/opus/i.test(s)) return 'Opus';
  if (/sonnet/i.test(s)) return 'Sonnet';
  if (/haiku/i.test(s)) return 'Haiku';
  if (/gpt-5/i.test(s)) return 'GPT-5';
  if (/gpt-4\.1/i.test(s)) return 'GPT-4.1';
  if (/gpt-4o/i.test(s)) return 'GPT-4o';
  if (/composer/i.test(s)) return 'Composer';
  if (/codex|o3|o4/i.test(s)) return s.slice(0, 24);
  return s.length > 28 ? `${s.slice(0, 26)}…` : s;
}

function emptyBucket() {
  return {
    sessions: new Map(), // sessionId -> { timestamps: number[], model?, input, output, cacheRead, cacheWrite }
  };
}

function ensureSession(bucket, sessionId) {
  if (!bucket.sessions.has(sessionId)) {
    bucket.sessions.set(sessionId, {
      timestamps: [],
      model: null,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  }
  return bucket.sessions.get(sessionId);
}

function addTokens(session, usage) {
  if (!usage || typeof usage !== 'object') return;
  session.input += num(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens);
  session.output += num(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens);
  const cacheRead =
    usage.cache_read_tokens ??
    usage.cache_read_input_tokens ??
    usage.cacheReadTokens ??
    (usage.cache_tokens != null && usage.cache_write_tokens == null ? usage.cache_tokens : 0);
  const cacheWrite = usage.cache_write_tokens ?? usage.cache_creation_input_tokens ?? usage.cacheWriteTokens ?? 0;
  session.cacheRead += num(cacheRead);
  session.cacheWrite += num(cacheWrite);
}

async function streamJsonl(filePath, onLine) {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }
    onLine(data);
  }
}

function parseTs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

async function collectClaudeJsonl(bucket) {
  const base = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(base)) return;

  let projectDirs = [];
  try {
    projectDirs = fs.readdirSync(base);
  } catch {
    return;
  }

  for (const projectDir of projectDirs) {
    const full = path.join(base, projectDir);
    let entries = [];
    try {
      entries = fs.readdirSync(full);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const filePath = path.join(full, entry);
      const fallbackId = entry.replace(/\.jsonl$/, '');
      let sessionId = fallbackId;
      try {
        await streamJsonl(filePath, (d) => {
          if (typeof d.sessionId === 'string') sessionId = d.sessionId;
          const ts = parseTs(d.timestamp);
          const session = ensureSession(bucket, sessionId);
          if (ts != null) session.timestamps.push(ts);

          const message = d.message;
          if (message && typeof message === 'object') {
            if (typeof message.model === 'string') session.model = normalizeModelId(message.model) || session.model;
            addTokens(session, message.usage);
          }
          if (d.usage) addTokens(session, d.usage);
          if (typeof d.model === 'string') session.model = normalizeModelId(d.model) || session.model;
        });
      } catch {
        // skip unreadable file
      }
    }
  }
}

async function collectCodexJsonl(bucket) {
  const base = path.join(os.homedir(), '.codex', 'sessions');
  if (!fs.existsSync(base)) return;

  async function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.name.endsWith('.jsonl')) continue;

      let sessionId = entry.name.replace(/\.jsonl$/, '');
      let model = null;
      try {
        await streamJsonl(full, (d) => {
          const type = d.type;
          const payload = d.payload;
          const ts = parseTs(d.timestamp);
          if (type === 'session_meta' && payload) {
            if (typeof payload.id === 'string') sessionId = payload.id;
            if (typeof payload.model === 'string') model = normalizeModelId(payload.model);
          }
          const session = ensureSession(bucket, sessionId);
          if (model) session.model = model;
          if (ts != null) session.timestamps.push(ts);

          if (type === 'event_msg' && payload?.info?.total_token_usage) {
            const totals = payload.info.total_token_usage;
            const cached = num(totals.cached_input_tokens);
            const totalIn = num(totals.input_tokens);
            session.input = Math.max(session.input, Math.max(0, totalIn - cached));
            session.output = Math.max(session.output, num(totals.output_tokens));
            session.cacheRead = Math.max(session.cacheRead, cached);
          }
          if (payload?.model) session.model = normalizeModelId(payload.model) || session.model;
        });
      } catch {
        // skip
      }
    }
  }

  await walk(base);
}

function findCursorDb() {
  const home = os.homedir();
  const candidates =
    process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')]
      : process.platform === 'linux'
        ? [path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb')]
        : process.platform === 'win32'
          ? [path.join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb')]
          : [];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function openSqlite(dbPath) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    try {
      const mod = await import('better-sqlite3');
      const Driver = mod.default;
      return new Driver(dbPath, { readonly: true });
    } catch {
      return null;
    }
  }
}

function sqliteAll(db, sql, ...params) {
  if (typeof db.prepare !== 'function') return [];
  const stmt = db.prepare(sql);
  if (typeof stmt.all === 'function') return stmt.all(...params);
  if (typeof stmt.iterate === 'function') {
    const rows = [];
    for (const row of stmt.iterate(...params)) rows.push(row);
    return rows;
  }
  return [];
}

function forEachCursorKv(db, sql, onRow) {
  const PAGE = 1000;
  let lastKey = '';
  for (;;) {
    let rows = [];
    try {
      rows = sqliteAll(db, sql, lastKey, PAGE);
    } catch {
      break;
    }
    if (!rows.length) break;
    const nextKey = rows[rows.length - 1]?.key;
    for (const row of rows) onRow(row);
    if (rows.length < PAGE || !nextKey || nextKey === lastKey) break;
    lastKey = nextKey;
  }
}

async function collectCursorSqlite(bucket) {
  const dbPath = findCursorDb();
  if (!dbPath) return false;
  const db = await openSqlite(dbPath);
  if (!db) return false;

  try {
    const composers = new Map();

    try {
      const headers = sqliteAll(
        db,
        'SELECT composerId, createdAt, lastUpdatedAt FROM composerHeaders',
      );
      for (const row of headers) {
        if (!row.composerId) continue;
        composers.set(row.composerId, {
          createdAt: parseTs(row.createdAt),
          lastUpdatedAt: parseTs(row.lastUpdatedAt),
          model: null,
        });
      }
    } catch {
      // Older Cursor DBs may not have composerHeaders.
    }

    forEachCursorKv(
      db,
      `SELECT key,
              json_extract(value, '$.composerId') as composerId,
              json_extract(value, '$.createdAt') as createdAt,
              json_extract(value, '$.modelConfig.modelName') as modelName,
              json_extract(value, '$.latestSelectedModel') as latestSelectedModel
       FROM cursorDiskKV
       WHERE key LIKE 'composerData:%' AND key > ?
       ORDER BY key LIMIT ?`,
      (row) => {
        const composerId = row.composerId || String(row.key).slice('composerData:'.length);
        const prev = composers.get(composerId) || {};
        composers.set(composerId, {
          createdAt: parseTs(row.createdAt) ?? prev.createdAt ?? null,
          lastUpdatedAt: prev.lastUpdatedAt ?? null,
          model: normalizeModelId(row.modelName) || normalizeModelId(row.latestSelectedModel) || prev.model || null,
        });
      },
    );

    forEachCursorKv(
      db,
      `SELECT key, json_extract(value, '$.createdAt') as createdAt
       FROM cursorDiskKV
       WHERE key LIKE 'bubbleId:%' AND key > ?
       ORDER BY key LIMIT ?`,
      (row) => {
        const parts = String(row.key).split(':');
        if (parts.length < 3) return;
        const conversationId = parts[1];
        const session = ensureSession(bucket, conversationId);
        const createdAt = parseTs(row.createdAt);
        if (createdAt != null) session.timestamps.push(createdAt);
        const composer = composers.get(conversationId);
        if (composer?.model) session.model = composer.model;
      },
    );

    for (const [composerId, composer] of composers.entries()) {
      const session = ensureSession(bucket, composerId);
      if (composer.createdAt != null) session.timestamps.push(composer.createdAt);
      if (composer.lastUpdatedAt != null) session.timestamps.push(composer.lastUpdatedAt);
      if (composer.model) session.model = composer.model;
    }

    return bucket.sessions.size > 0;
  } catch {
    return false;
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

function rollupAgent(bucket, agentLabel, windowStartMs, options = {}) {
  const estimateTokens = Boolean(options.estimateTokensFromHours);
  let allTimeMs = 0;
  let last30Ms = 0;
  let allTimeSessions = 0;
  let last30Sessions = 0;
  let longestSessionMs = 0;
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let costUsd = 0;
  const modelCounts = new Map();
  const hourBuckets = new Array(24).fill(0);
  let weekendEvents = 0;
  let totalEvents = 0;
  const monthMap = new Map();

  for (const [, session] of bucket.sessions.entries()) {
    const timestamps = session.timestamps.filter((t) => Number.isFinite(t));
    if (!timestamps.length && !session.input && !session.output) continue;

    const durationMs = estimateActiveDurationMs(timestamps);
    const minTs = minNumber(timestamps);
    const inWindow = minTs != null && minTs >= windowStartMs;

    allTimeMs += durationMs;
    allTimeSessions += 1;
    if (durationMs > longestSessionMs) longestSessionMs = durationMs;
    if (inWindow) {
      last30Ms += durationMs;
      last30Sessions += 1;
    }

    let sessInput = session.input;
    let sessOutput = session.output;
    let sessCacheRead = session.cacheRead;
    let sessCacheWrite = session.cacheWrite;

    if (estimateTokens && sessInput + sessOutput + sessCacheRead === 0 && durationMs > 0) {
      const hours = durationMs / 3_600_000;
      sessInput = Math.round(CURSOR_EST_TOKENS_PER_HOUR.input * hours);
      sessOutput = Math.round(CURSOR_EST_TOKENS_PER_HOUR.output * hours);
      sessCacheRead = Math.round(CURSOR_EST_TOKENS_PER_HOUR.cacheRead * hours);
      sessCacheWrite = Math.round(CURSOR_EST_TOKENS_PER_HOUR.cacheWrite * hours);
    }

    input += sessInput;
    output += sessOutput;
    cacheRead += sessCacheRead;
    cacheWrite += sessCacheWrite;

    const rate = rateForModel(session.model);
    costUsd +=
      (sessInput * rate.input) / 1e6 +
      (sessOutput * rate.output) / 1e6 +
      (sessCacheRead * rate.cacheRead) / 1e6 +
      (sessCacheWrite * rate.cacheWrite) / 1e6;

    if (session.model) {
      const label = shortModelLabel(session.model);
      modelCounts.set(label, (modelCounts.get(label) || 0) + 1);
    }

    for (const ts of timestamps) {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) continue;
      hourBuckets[d.getHours()] += 1;
      const day = d.getDay();
      if (day === 0 || day === 6) weekendEvents += 1;
      totalEvents += 1;
    }

    if (minTs != null) {
      const ym = new Date(minTs).toISOString().slice(0, 7);
      const month = monthMap.get(ym) || { hours: 0, sessions: 0 };
      month.hours += durationMs / 3_600_000;
      month.sessions += 1;
      monthMap.set(ym, month);
    }
  }

  return {
    agent: agentLabel,
    allTimeHours: allTimeMs / 3_600_000,
    last30Hours: last30Ms / 3_600_000,
    allTimeSessions,
    last30Sessions,
    longestSessionMs,
    tokens: {
      work: input + output,
      cache: cacheRead + cacheWrite,
      total: input + output + cacheRead + cacheWrite,
      input,
      output,
      cacheRead,
      cacheWrite,
    },
    costUsd,
    modelCounts,
    hourBuckets,
    weekendEvents,
    totalEvents,
    monthMap,
    estimatedTokens: estimateTokens,
  };
}

function mergeMaps(target, source) {
  for (const [k, v] of source.entries()) {
    target.set(k, (target.get(k) || 0) + v);
  }
}

/**
 * Collect aggregated usage telemetry from local agent logs.
 * @returns {Promise<object|null>}
 */
export async function collectUsageTelemetry() {
  const windowStartMs = Date.now() - WINDOW_DAYS * 86_400_000;
  const claude = emptyBucket();
  const codex = emptyBucket();
  const cursor = emptyBucket();

  try {
    await collectClaudeJsonl(claude);
  } catch {
    // continue with other agents
  }
  try {
    await collectCodexJsonl(codex);
  } catch {
    // continue with other agents
  }
  let cursorOk = false;
  try {
    cursorOk = await collectCursorSqlite(cursor);
  } catch {
    cursorOk = false;
  }

  const rolls = [];
  for (const item of [
    [claude, 'Claude Code', {}],
    [codex, 'Codex', {}],
    [cursor, 'Cursor', { estimateTokensFromHours: true }],
  ]) {
    try {
      rolls.push(rollupAgent(item[0], item[1], windowStartMs, item[2]));
    } catch {
      // Skip a single agent rather than failing the whole wrapped run.
    }
  }

  const anySessions = rolls.some((r) => r.allTimeSessions > 0);
  if (!anySessions) return null;

  let allTimeHours = 0;
  let last30Hours = 0;
  let allTimeSessions = 0;
  let last30Sessions = 0;
  let longestSessionMs = 0;
  let work = 0;
  let cache = 0;
  let costUsd = 0;
  let cursorEstimated = false;
  const byAgent = [];
  const modelCounts = new Map();
  const hourBuckets = new Array(24).fill(0);
  let weekendEvents = 0;
  let totalEvents = 0;
  const monthMap = new Map();

  for (const roll of rolls) {
    if (!roll.allTimeSessions) continue;
    allTimeHours += roll.allTimeHours;
    last30Hours += roll.last30Hours;
    allTimeSessions += roll.allTimeSessions;
    last30Sessions += roll.last30Sessions;
    if (roll.longestSessionMs > longestSessionMs) longestSessionMs = roll.longestSessionMs;
    work += roll.tokens.work;
    cache += roll.tokens.cache;
    costUsd += roll.costUsd;
    if (roll.estimatedTokens && roll.tokens.total > 0) cursorEstimated = true;
    byAgent.push({
      agent: roll.agent,
      total: Math.round(roll.tokens.total),
      hours: Math.round(roll.allTimeHours * 10) / 10,
      sessions: roll.allTimeSessions,
    });
    mergeMaps(modelCounts, roll.modelCounts);
    for (let h = 0; h < 24; h += 1) hourBuckets[h] += roll.hourBuckets[h];
    weekendEvents += roll.weekendEvents;
    totalEvents += roll.totalEvents;
    for (const [ym, data] of roll.monthMap.entries()) {
      const cur = monthMap.get(ym) || { hours: 0, sessions: 0 };
      cur.hours += data.hours;
      cur.sessions += data.sessions;
      monthMap.set(ym, cur);
    }
  }

  const modelTotal = [...modelCounts.values()].reduce((s, n) => s + n, 0) || 1;
  const models = [...modelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, sessions]) => ({
      id,
      sessions,
      percent: Math.max(1, Math.round((sessions / modelTotal) * 100)),
    }));

  // renormalize percents
  if (models.length) {
    const drift = 100 - models.reduce((s, m) => s + m.percent, 0);
    models[0].percent += drift;
  }

  let peakHour = 0;
  let peakVal = -1;
  for (let h = 0; h < 24; h += 1) {
    if (hourBuckets[h] > peakVal) {
      peakVal = hourBuckets[h];
      peakHour = h;
    }
  }

  const weekendPct =
    totalEvents > 0 ? Math.round((weekendEvents / totalEvents) * 100) : 0;
  const weekdayPct = Math.max(0, 100 - weekendPct);

  const months = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([ym, data]) => ({
      ym,
      hours: Math.round(data.hours * 10) / 10,
      sessions: data.sessions,
    }));

  byAgent.sort((a, b) => b.total - a.total);

  return {
    schemaVersion: USAGE_SCHEMA_VERSION,
    windowDays: WINDOW_DAYS,
    activeHours: {
      last30: Math.round(last30Hours * 10) / 10,
      allTime: Math.round(allTimeHours * 10) / 10,
      longestSessionMinutes: Math.max(1, Math.round(longestSessionMs / 60_000)),
      estimated: false,
      method: 'active_gap',
      gapMinutes: MAX_ACTIVE_GAP_MINUTES,
      cursorSqlite: Boolean(cursorOk),
    },
    sessions: {
      last30: last30Sessions,
      allTime: allTimeSessions,
    },
    tokens: {
      total: Math.round(work + cache),
      work: Math.round(work),
      cache: Math.round(cache),
      byAgent,
      cursorEstimated,
      retailCostUsd: Math.round(costUsd),
    },
    models,
    rhythm: {
      hourBuckets,
      peakHour,
      weekdayPct,
      weekendPct,
    },
    months,
    coverageHash: createHash('sha256')
      .update(
        JSON.stringify({
          allTimeSessions,
          allTimeHours: Math.round(allTimeHours),
          work: Math.round(work),
        }),
      )
      .digest('hex')
      .slice(0, 12),
  };
}

/** Format large token counts for display (e.g. 2.0B, 351.1M). */
export function formatTokenCount(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(v));
}

export function formatPeakHour(hour) {
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  const suffix = h >= 12 ? 'pm' : 'am';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}
