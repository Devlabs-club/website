/**
 * Upload Worker secrets from .env as JSON for `wrangler secret bulk`.
 *
 * Usage: bun run scripts/push-cloudflare-secrets.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** Plain [vars] in wrangler.toml — not Worker secrets. */
const SKIP_KEYS = new Set([
  'WEBSITE_ROOT',
  'WORKOS_REDIRECT_URI',
  'API_PROXY_ORIGIN',
  'CLOUDFLARE_API_TOKEN',
]);

function parseEnvFile(content: string): Record<string, string> {
  const secrets: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!key || SKIP_KEYS.has(key) || !value) continue;
    secrets[key] = value;
  }

  return secrets;
}

function loadEnvContent(): string {
  const candidates = ['.env', '.env.local', '.dev.vars', '.env.backup'];
  for (const name of candidates) {
    const path = join(root, name);
    try {
      return readFileSync(path, 'utf8');
    } catch {
      // try next
    }
  }
  throw new Error(
    'No .env, .env.local, or .dev.vars found. Create one with your secrets before deploying.'
  );
}

const secrets = parseEnvFile(loadEnvContent());
const keys = Object.keys(secrets);

if (keys.length === 0) {
  console.error('No secrets found in .env (after skipping public vars).');
  process.exit(1);
}

console.log(`Uploading ${keys.length} secrets to Worker "website"...`);

const tmpPath = join(root, '.cloudflare-secrets.json');
writeFileSync(tmpPath, JSON.stringify(secrets, null, 2));

const result = spawnSync('wrangler', ['secret', 'bulk', tmpPath], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

try {
  unlinkSync(tmpPath);
} catch {
  // ignore
}

process.exit(result.status ?? 1);
