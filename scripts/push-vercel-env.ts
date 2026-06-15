/**
 * Sync environment variables from .env / .env.backup to Vercel (production + preview).
 *
 * Usage: bun run scripts/push-vercel-env.ts
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFile, VERCEL_SKIP_KEYS } from './envFile';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnvFile(root);
const includePreview = process.argv.includes('--preview');
const environments = includePreview
  ? (['production', 'preview'] as const)
  : (['production'] as const);

function upsertVercelEnv(key: string, value: string, environment: string): void {
  const add = spawnSync(
    'vercel',
    ['env', 'add', key, environment, '--value', value, '--sensitive', '--force', '-y'],
    {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8',
    }
  );

  if (add.status !== 0) {
    process.stderr.write(add.stderr || add.stdout || '');
    process.exit(add.status ?? 1);
  }
}

const keys = Object.keys(env).filter((key) => !VERCEL_SKIP_KEYS.has(key));
console.log(`Uploading ${keys.length} env vars to Vercel for ${environments.join(', ')}...`);

for (const environment of environments) {
  for (const key of keys) {
    console.log(`  ${environment}: ${key}`);
    upsertVercelEnv(key, env[key], environment);
  }
}

console.log('Done. Redeploy Vercel for new env vars to take effect.');
