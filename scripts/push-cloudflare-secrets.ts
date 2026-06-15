/**
 * Upload Worker secrets from .env as JSON for `wrangler secret bulk`.
 *
 * Usage: bun run scripts/push-cloudflare-secrets.ts
 */
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CLOUDFLARE_PUBLIC_VAR_KEYS, loadEnvFile } from './envFile';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const secrets = loadEnvFile(root);
for (const key of CLOUDFLARE_PUBLIC_VAR_KEYS) {
  delete secrets[key];
}

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
if (bypass) {
  secrets.VERCEL_AUTOMATION_BYPASS_SECRET = bypass;
}

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
