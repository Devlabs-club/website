// LinkedIn scraper service.
// Wraps the existing CDP enrichment scripts behind a tiny authenticated HTTP API
// so the website's onboarding routes can trigger scraping on this remote box
// (which holds the logged-in LinkedIn Chromium) instead of running it locally.
//
// Contract mirrors the website's local runCdpScript(): given a script name + args,
// run it against 127.0.0.1:9222, then return { summary, artifact }.
//
// Env:
//   PORT                      public platform port, or 6090 for direct local use
//   LINKEDIN_SCRAPER_SECRET   shared bearer token; must match the website
//   MONGODB_URI               needed by scripts when called with --builderId
//   CHROME_CDP_URL            defaults to http://127.0.0.1:9222
//   GITHUB_TOKEN              used by the github enricher path (API token, no browser)

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const PORT = Number(process.env.PORT || 6090);
const SECRET = process.env.LINKEDIN_SCRAPER_SECRET || '';
const CDP_URL = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';

// Only these scripts may be invoked.
const ALLOWED_SCRIPTS = new Set([
  'enrich-builder-linkedin-cdp.mjs',
  'enrich-founder-company-linkedin-cdp.mjs',
]);

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function runCdpScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [`scripts/${scriptName}`, ...args],
      { cwd: REPO_ROOT, env: process.env, timeout: 120000, maxBuffer: 1024 * 1024 * 80 },
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
      return send(res, 200, { ok: true, cdp: await cdpReachable() });
    }

    if (req.method !== 'POST' || req.url !== '/run') {
      return send(res, 404, { error: 'not_found' });
    }

    // Auth
    const auth = req.headers.authorization || '';
    if (!SECRET || auth !== `Bearer ${SECRET}`) {
      return send(res, 401, { error: 'unauthorized' });
    }

    if (!(await cdpReachable())) {
      return send(res, 503, {
        error: 'cdp_unreachable',
        message: 'Chromium with remote debugging is not running / not signed into LinkedIn.',
      });
    }

    const { script, args = [] } = await readJson(req);
    if (!ALLOWED_SCRIPTS.has(script)) {
      return send(res, 400, { error: 'script_not_allowed', script });
    }
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
      return send(res, 400, { error: 'invalid_args' });
    }

    // Strip any caller-supplied --cdp-url pair and force this box's CDP url.
    const stripped = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--cdp-url') { i++; continue; }
      stripped.push(args[i]);
    }
    const result = await runCdpScript(script, [...stripped, '--cdp-url', CDP_URL]);
    return send(res, 200, result);
  } catch (e) {
    return send(res, 500, { error: 'run_failed', message: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[linkedin-scraper] listening on :${PORT}  cdp=${CDP_URL}  auth=${SECRET ? 'on' : 'OFF'}`);
});
