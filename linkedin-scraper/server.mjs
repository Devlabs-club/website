// LinkedIn scraper service.
// Runs a durable, authenticated FIFO queue for the existing CDP enrichment script.
// The service owns the logged-in LinkedIn Chromium and permits only one active
// scrape, with a cooldown after every profile and an authwall circuit breaker.
//
// Env:
//   PORT                      public platform port, or 6090 for direct local use
//   LINKEDIN_SCRAPER_SECRET   shared bearer token; must match the website
//   MONGODB_URI               needed by scripts when called with --builderId
//   CHROME_CDP_URL            defaults to http://127.0.0.1:9222
//   GITHUB_TOKEN              used by the github enricher path (API token, no browser)

import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const PORT = Number(process.env.PORT || 6090);
const SECRET = process.env.LINKEDIN_SCRAPER_SECRET || '';
const CDP_URL = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
const BATCH_ROOT = process.env.LINKEDIN_BATCH_DIR || '/data/linkedin-batches';
// One Chrome worker at current Railway rates stays comfortably below the $5
// batch budget within this window. The queue pauses rather than running on.
const DEFAULT_BATCH_MAX_RUN_MS = Number(process.env.LINKEDIN_BATCH_MAX_RUN_MS || 8 * 60 * 60 * 1000);
const GLOBAL_QUEUE_PATH = join(BATCH_ROOT, 'queue.json');
const DEFAULT_COOLDOWN_MS = Math.max(60_000, Number(process.env.LINKEDIN_SCRAPER_COOLDOWN_MS || 5 * 60 * 1000));
const ENRICHMENT_CALLBACK_URL = process.env.LINKEDIN_ENRICHMENT_CALLBACK_URL || '';
const ENRICHMENT_CALLBACK_SECRET = process.env.LINKEDIN_ENRICHMENT_CALLBACK_SECRET || '';
let globalWorkerRunning = false;

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(text);
}

function requireAuth(req) {
  const auth = req.headers.authorization || '';
  return Boolean(SECRET && auth === `Bearer ${SECRET}`);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function batchIdFrom(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function batchDir(batchId) {
  return join(BATCH_ROOT, batchId);
}

function jobPath(batchId) {
  return join(batchDir(batchId), 'job.json');
}

async function writeJsonAtomic(filePath, value) {
  const temp = `${filePath}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, filePath);
}

async function loadBatch(batchId) {
  return JSON.parse(await readFile(jobPath(batchId), 'utf8'));
}

async function loadGlobalQueue() {
  try {
    return JSON.parse(await readFile(GLOBAL_QUEUE_PATH, 'utf8'));
  } catch {
    return {
      version: 1,
      paused: false,
      pauseReason: null,
      pausedAt: null,
      lastCompletedAt: null,
      items: [],
    };
  }
}

async function saveGlobalQueue(queue) {
  await mkdir(BATCH_ROOT, { recursive: true });
  await writeJsonAtomic(GLOBAL_QUEUE_PATH, queue);
}

function summarizeBatch(job) {
  const items = Array.isArray(job.items) ? job.items : [];
  return {
    batchId: job.batchId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    deadlineAt: job.deadlineAt || null,
    pauseReason: job.pauseReason || null,
    total: items.length,
    queued: items.filter((item) => item.status === 'queued').length,
    running: items.filter((item) => item.status === 'running').length,
    succeeded: items.filter((item) => item.status === 'succeeded').length,
    failed: items.filter((item) => item.status === 'failed').length,
    blocked: items.filter((item) => item.status === 'blocked').length,
  };
}

function normalizeBatchItem(item) {
  const builderId = String(item?.builderId || '').trim();
  const linkedInUrl = String(item?.linkedInUrl || '').trim();
  const name = String(item?.name || 'LinkedIn user').trim();
  const email = typeof item?.email === 'string' ? item.email.trim().toLowerCase() : null;
  if (!builderId || !linkedInUrl || !/linkedin\.com\/in\/[^/?#]+/i.test(linkedInUrl)) {
    throw new Error('Each builder needs builderId, name, and a valid linkedin.com/in/ URL.');
  }
  return {
    builderId,
    linkedInUrl,
    name,
    email,
    callback: Boolean(item?.callback),
    callbackType: item?.callbackType === 'founder' ? 'founder' : 'builder',
    callbackStatus: null,
    status: 'queued',
    error: null,
    artifactFile: null,
  };
}

async function deliverEnrichmentCallback({ batchId, item, summary, artifact }) {
  if (!item.callback) return null;
  if (!ENRICHMENT_CALLBACK_URL || !ENRICHMENT_CALLBACK_SECRET) {
    throw new Error('LinkedIn enrichment callback is not configured on the scraper service.');
  }
  const response = await fetch(ENRICHMENT_CALLBACK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-linkedin-enrichment-secret': ENRICHMENT_CALLBACK_SECRET,
    },
    body: JSON.stringify({
      event: 'linkedin_enrichment.completed',
      batchId,
      builderId: item.builderId,
      callbackType: item.callbackType,
      email: item.email,
      name: item.name,
      linkedInUrl: item.linkedInUrl,
      summary,
      artifact,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Enrichment callback failed with HTTP ${response.status}.`);
  }
  return { deliveredAt: new Date().toISOString() };
}

function isLinkedInBlockedArtifact(artifact) {
  const warnings = [
    ...(artifact?.warnings || []),
    ...(artifact?.extracted?.warnings || []),
    artifact?.extracted?.cdpExtraction?.warning,
  ]
    .filter(Boolean)
    .join('\n');
  return /\bauthwall\b|sign up \| linkedin|checkpoint|temporarily restricted|suspicious activity|unusual activity|account restricted/i.test(warnings);
}

async function refreshBatchStatus(job) {
  if (job.status === 'paused_budget') return;
  const items = Array.isArray(job.items) ? job.items : [];
  if (items.some((item) => item.status === 'queued' || item.status === 'running')) {
    job.status = items.some((item) => item.status === 'running') ? 'running' : 'queued';
    return;
  }
  if (items.some((item) => item.status === 'blocked')) {
    job.status = 'paused_linkedin';
    return;
  }
  job.status = 'completed';
  job.completedAt ||= new Date().toISOString();
}

async function enqueueBatch(batchId) {
  const job = await loadBatch(batchId);
  const queue = await loadGlobalQueue();
  const queued = new Set(queue.items.map((item) => `${item.batchId}:${item.builderId}`));
  for (const item of job.items || []) {
    if (item.status !== 'queued' || queued.has(`${batchId}:${item.builderId}`)) continue;
    queue.items.push({ batchId, builderId: item.builderId, enqueuedAt: new Date().toISOString() });
  }
  await saveGlobalQueue(queue);
  void processGlobalQueue();
}

async function processQueueItem(queueItem) {
  const job = await loadBatch(queueItem.batchId);
  const item = job.items.find((candidate) => candidate.builderId === queueItem.builderId);
  if (!item || item.status !== 'queued') return { skipped: true, blocked: false };
  job.maxRunMs ||= DEFAULT_BATCH_MAX_RUN_MS;
  job.activeRunMs ||= 0;
  if (job.activeRunMs >= job.maxRunMs) {
    job.status = 'paused_budget';
    job.pausedAt = new Date().toISOString();
    job.pauseReason = `Reached the ${Math.round(job.maxRunMs / 3_600_000)} hour cloud-run limit.`;
    await writeJsonAtomic(jobPath(queueItem.batchId), job);
    return { skipped: true, blocked: false };
  }
  job.status = 'running';
  job.startedAt ||= new Date().toISOString();
  item.status = 'running';
  item.error = null;
  await writeJsonAtomic(jobPath(queueItem.batchId), job);

  const scrapeStartedAt = Date.now();
  try {
    const { summary, artifact } = await runCdpScript('enrich-builder-linkedin-cdp.mjs', [
      '--linkedin-url',
      item.linkedInUrl,
      '--name',
      item.name,
      '--output-key',
      item.builderId,
      '--wait-ms',
      String(job.waitMs || 12000),
    ]);
    if (!artifact) throw new Error('Scraper returned no artifact.');
    if (isLinkedInBlockedArtifact(artifact)) {
      item.status = 'blocked';
      item.error = 'LinkedIn returned an authwall or account restriction. Global queue paused to protect the shared session.';
      item.summary = summary;
      item.finishedAt = new Date().toISOString();
      await refreshBatchStatus(job);
      await writeJsonAtomic(jobPath(queueItem.batchId), job);
      return { skipped: false, blocked: true, reason: item.error };
    }
    artifact.builder = {
      ...(artifact.builder || {}),
      _id: item.builderId,
      existingProfile: { _id: item.builderId, name: item.name, links: { linkedin: item.linkedInUrl } },
    };
    const artifactFile = `${item.builderId}.json`;
    await writeJsonAtomic(join(batchDir(queueItem.batchId), artifactFile), artifact);
    item.status = 'succeeded';
    item.summary = summary;
    item.artifactFile = artifactFile;
    try {
      item.callbackStatus = await deliverEnrichmentCallback({
        batchId: queueItem.batchId,
        item,
        summary,
        artifact,
      });
    } catch (callbackError) {
      // Scraping succeeded and its artifact remains durable. Keep the job terminal
      // but surface a retryable delivery failure rather than scraping LinkedIn again.
      item.callbackStatus = {
        error: callbackError instanceof Error ? callbackError.message : String(callbackError),
        failedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    item.status = 'failed';
    item.error = error instanceof Error ? error.message : String(error);
  }
  job.activeRunMs += Date.now() - scrapeStartedAt;
  item.finishedAt = new Date().toISOString();
  await refreshBatchStatus(job);
  await writeJsonAtomic(jobPath(queueItem.batchId), job);
  return { skipped: false, blocked: false };
}

async function processGlobalQueue() {
  if (globalWorkerRunning) return;
  globalWorkerRunning = true;
  try {
    while (true) {
      const queue = await loadGlobalQueue();
      if (queue.paused || !queue.items.length) return;
      const next = queue.items.shift();
      await saveGlobalQueue(queue);
      const result = await processQueueItem(next);
      if (result.blocked) {
        queue.paused = true;
        queue.pauseReason = result.reason;
        queue.pausedAt = new Date().toISOString();
        await saveGlobalQueue(queue);
        return;
      }
      if (!result.skipped) {
        queue.lastCompletedAt = new Date().toISOString();
        await saveGlobalQueue(queue);
        await sleep(DEFAULT_COOLDOWN_MS);
      }
    }
  } catch (error) {
    console.error('[linkedin-scraper] global queue crashed', error);
  } finally {
    globalWorkerRunning = false;
  }
}

function runCdpScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [`scripts/${scriptName}`, ...args],
      { cwd: REPO_ROOT, env: process.env, timeout: 180000, maxBuffer: 1024 * 1024 * 80 },
      async (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || stdout || error.message));
        try {
          const start = stdout.lastIndexOf('\n{');
          const jsonText = start >= 0 ? stdout.slice(start + 1) : stdout.slice(stdout.indexOf('{'));
          const summary = JSON.parse(jsonText);
          const artifact = summary.outputPath
            ? JSON.parse(await readFile(summary.outputPath, 'utf8'))
            : null;
          resolve({ summary, artifact });
        } catch (e) {
          reject(new Error(`Failed to parse script output: ${e.message}\n---\n${stdout}`));
        }
      },
    );
  });
}

async function cdpReachable() {
  try {
    const r = await fetch(`${CDP_URL.replace(/\/$/, '')}/json/version`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      const queue = await loadGlobalQueue();
      return send(res, 200, {
        ok: true,
        cdp: await cdpReachable(),
        queue: {
          paused: Boolean(queue.paused),
          pauseReason: queue.pauseReason || null,
          pending: queue.items.length,
          lastCompletedAt: queue.lastCompletedAt || null,
          cooldownMs: DEFAULT_COOLDOWN_MS,
        },
      });
    }

    if (!requireAuth(req)) {
      return send(res, 401, { error: 'unauthorized' });
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const batchMatch = url.pathname.match(/^\/batches\/([a-zA-Z0-9_-]+)$/);
    const artifactMatch = url.pathname.match(/^\/batches\/([a-zA-Z0-9_-]+)\/artifacts\/([^/]+)$/);

    if (req.method === 'GET' && url.pathname === '/queue') {
      const queue = await loadGlobalQueue();
      return send(res, 200, {
        paused: Boolean(queue.paused),
        pauseReason: queue.pauseReason || null,
        pausedAt: queue.pausedAt || null,
        pending: queue.items.length,
        lastCompletedAt: queue.lastCompletedAt || null,
        cooldownMs: DEFAULT_COOLDOWN_MS,
      });
    }

    if (req.method === 'POST' && url.pathname === '/queue/resume') {
      const queue = await loadGlobalQueue();
      queue.paused = false;
      queue.pauseReason = null;
      queue.pausedAt = null;
      await saveGlobalQueue(queue);
      void processGlobalQueue();
      return send(res, 202, { resumed: true, pending: queue.items.length });
    }

    if (req.method === 'POST' && url.pathname === '/batches') {
      const payload = await readJson(req);
      const batchId = batchIdFrom(payload?.batchId) || `batch-${Date.now()}`;
      const builders = Array.isArray(payload?.builders) ? payload.builders : [];
      if (!builders.length || builders.length > 300) {
        return send(res, 400, { error: 'invalid_builders', message: 'Provide 1–300 builders.' });
      }
      await mkdir(batchDir(batchId), { recursive: false });
      const job = {
        batchId,
        status: 'queued',
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        waitMs: Number(payload?.waitMs) || 12000,
        maxRunMs: Math.min(
          Math.max(Number(payload?.maxRunMs) || DEFAULT_BATCH_MAX_RUN_MS, 60_000),
          DEFAULT_BATCH_MAX_RUN_MS
        ),
        items: builders.map(normalizeBatchItem),
      };
      await writeJsonAtomic(jobPath(batchId), job);
      await enqueueBatch(batchId);
      return send(res, 202, { ...summarizeBatch(job), statusUrl: `/batches/${batchId}` });
    }

    if (req.method === 'GET' && batchMatch) {
      const job = await loadBatch(batchMatch[1]);
      return send(res, 200, { ...summarizeBatch(job), items: job.items });
    }

    if (req.method === 'GET' && artifactMatch) {
      const job = await loadBatch(artifactMatch[1]);
      const item = job.items.find((candidate) => candidate.builderId === artifactMatch[2]);
      if (!item?.artifactFile) return send(res, 404, { error: 'artifact_not_found' });
      return send(res, 200, JSON.parse(await readFile(join(batchDir(artifactMatch[1]), item.artifactFile), 'utf8')));
    }

    if (req.method === 'POST' && url.pathname === '/run') {
      // Instant path for website builder/founder enrichment. Shares the single
      // Chrome worker lock with the FIFO queue (bulk jobs still use /batches).
      if (globalWorkerRunning) {
        return send(res, 409, {
          error: 'busy',
          message: 'LinkedIn scraper is busy with another job. Retry in a few seconds.',
        });
      }
      const payload = await readJson(req);
      const script = String(payload?.script || '').trim();
      const args = Array.isArray(payload?.args) ? payload.args.map(String) : [];
      if (!/^[a-zA-Z0-9._-]+\.mjs$/.test(script)) {
        return send(res, 400, { error: 'invalid_script', message: 'script must be a *.mjs filename.' });
      }
      globalWorkerRunning = true;
      try {
        const { summary, artifact } = await runCdpScript(script, args);
        if (artifact && isLinkedInBlockedArtifact(artifact)) {
          const queue = await loadGlobalQueue();
          queue.paused = true;
          queue.pauseReason =
            'LinkedIn returned an authwall or account restriction. Global queue paused to protect the shared session.';
          queue.pausedAt = new Date().toISOString();
          await saveGlobalQueue(queue);
          return send(res, 423, {
            error: 'linkedin_blocked',
            message: queue.pauseReason,
            summary,
            artifact,
          });
        }
        const queue = await loadGlobalQueue();
        queue.lastCompletedAt = new Date().toISOString();
        await saveGlobalQueue(queue);
        return send(res, 200, { summary, artifact });
      } finally {
        globalWorkerRunning = false;
        void processGlobalQueue();
      }
    }

    if (req.method !== 'POST') {
      return send(res, 404, { error: 'not_found' });
    }
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    return send(res, 500, { error: 'run_failed', message: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[linkedin-scraper] listening on :${PORT}  cdp=${CDP_URL}  auth=${SECRET ? 'on' : 'OFF'}`);
  // A sleep/restart resumes persistent batches from the next unfinished item.
  void (async () => {
    await mkdir(BATCH_ROOT, { recursive: true });
    for (const entry of await readdir(BATCH_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const job = await loadBatch(entry.name);
        if (job.status !== 'completed' && job.status !== 'paused_budget' && job.status !== 'paused_linkedin') {
          for (const item of job.items || []) if (item.status === 'running') item.status = 'queued';
          job.status = 'queued';
          await writeJsonAtomic(jobPath(entry.name), job);
          await enqueueBatch(entry.name);
        }
      } catch (error) {
        console.warn(`[linkedin-scraper] could not resume batch ${entry.name}`, error);
      }
    }
  })();
});
