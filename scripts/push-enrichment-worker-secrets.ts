/**
 * Upload secrets for the builder-enrichment queue worker.
 *
 * Usage: bun run scripts/push-enrichment-worker-secrets.ts
 */
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFile } from './envFile';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const workerDir = join(root, 'workers/builder-enrichment');

const env = loadEnvFile(root);
const secret = env.ENRICHMENT_INTERNAL_SECRET?.trim();
if (!secret) {
  console.error('ENRICHMENT_INTERNAL_SECRET missing in .env / .dev.vars');
  process.exit(1);
}

const payload = { ENRICHMENT_INTERNAL_SECRET: secret };
const tmpPath = join(root, '.enrichment-worker-secrets.json');
writeFileSync(tmpPath, JSON.stringify(payload, null, 2));

console.log('Uploading secrets to Worker "builder-enrichment"...');
const result = spawnSync('wrangler', ['secret', 'bulk', tmpPath], {
  cwd: workerDir,
  stdio: 'inherit',
  env: process.env,
});

try {
  unlinkSync(tmpPath);
} catch {
  // ignore
}

process.exit(result.status ?? 1);
