/**
 * Deploy the split stack:
 *   1. Vercel — Node/Mongoose API backend (ASTRO_ADAPTER=vercel)
 *   2. Cloudflare Workers — frontend + auth + API proxy to Vercel
 *
 * Usage:
 *   bun run scripts/deploy-stack.ts              # both (+ env/secrets sync)
 *   bun run scripts/deploy-stack.ts --secrets    # alias; secrets always synced
 *   bun run scripts/deploy-stack.ts --vercel-only
 *   bun run scripts/deploy-stack.ts --cloudflare-only
 */
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

const vercelOnly = args.has('--vercel-only');
const cloudflareOnly =
  args.has('--cloudflare-only') || process.env.SKIP_VERCEL === '1';

function run(
  command: string,
  commandArgs: string[],
  env: Record<string, string> = {}
): string {
  console.log(`\n→ ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout || '';
}

function parseVercelDeployUrl(output: string): string | null {
  const productionLine = output.match(/Production:\s+(https:\/\/[^\s]+)/i);
  if (productionLine?.[1]) return productionLine[1].replace(/\/$/, '');

  try {
    const json = JSON.parse(output.trim());
    const candidates = [
      json.url,
      json.alias?.[0],
      json.automaticAliases?.[0],
      json.preview?.url,
    ].filter(Boolean);
    if (candidates.length) return String(candidates[0]).replace(/\/$/, '');
  } catch {
    // not JSON
  }

  const matches = output.match(/https:\/\/[^\s"'`]+\.vercel\.app/gi);
  return matches?.length ? matches[matches.length - 1].replace(/\/$/, '') : null;
}

function getVercelBypassSecret(): string | undefined {
  const output = run('vercel', ['project', 'protection', 'website', '--format', 'json']);
  try {
    const json = JSON.parse(output.trim());
    const keys = Object.keys(json.protectionBypass || {});
    if (keys.length) return keys[0];
  } catch {
    // ignore
  }
  return process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
}

function ensureVercelProtectionBypass(): string | undefined {
  let secret = getVercelBypassSecret();
  if (secret) {
    console.log('Vercel protection bypass secret found.');
    return secret;
  }

  console.log('Enabling Vercel Protection Bypass for Automation...');
  run('vercel', ['project', 'protection', 'enable', 'website', '--protection-bypass', '-y']);
  secret = getVercelBypassSecret();
  if (!secret) {
    console.warn('Could not read Vercel bypass secret. Proxy may hit SSO HTML errors.');
  }
  return secret;
}

function syncVercelEnv(): void {
  console.log('\n=== Vercel environment variables ===');
  run('bun', ['run', 'scripts/push-vercel-env.ts']);
}

function syncCloudflareSecrets(bypassSecret?: string): void {
  console.log('\n=== Cloudflare Worker secrets ===');
  run('bun', ['run', 'scripts/push-cloudflare-secrets.ts'], {
    ...(bypassSecret ? { VERCEL_AUTOMATION_BYPASS_SECRET: bypassSecret } : {}),
  });
}

function deployVercelBackend(): string {
  const configured = process.env.VERCEL_BACKEND_URL?.trim().replace(/\/$/, '');
  if (configured) {
    console.log(`Using VERCEL_BACKEND_URL: ${configured}`);
    return configured;
  }

  console.log('\n=== Vercel API backend ===');
  const output = run('vercel', ['deploy', '--prod', '-y', '--format', 'json'], {
    ASTRO_ADAPTER: 'vercel',
  });

  const url = parseVercelDeployUrl(output);
  if (!url) {
    console.error(
      'Could not detect Vercel deployment URL. Re-run with VERCEL_BACKEND_URL=https://your-app.vercel.app'
    );
    process.exit(1);
  }

  console.log(`Vercel backend URL: ${url}`);
  return url;
}

function syncWranglerProxyOrigin(origin: string): void {
  const path = join(root, 'wrangler.toml');
  const content = readFileSync(path, 'utf8');
  const line = `API_PROXY_ORIGIN = "${origin}"`;

  const updated = content.replace(/^API_PROXY_ORIGIN = ".*"$/m, line);
  if (updated === content && !content.includes(line)) {
    console.warn('Could not update API_PROXY_ORIGIN in wrangler.toml');
    return;
  }

  writeFileSync(path, updated);
  console.log(`wrangler.toml API_PROXY_ORIGIN → ${origin}`);
}

function readWranglerProxyOrigin(): string | undefined {
  const content = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  const match = content.match(/^API_PROXY_ORIGIN = "(.+)"$/m);
  return match?.[1]?.replace(/\/$/, '');
}

function deployCloudflareFrontend(apiProxyOrigin?: string): void {
  console.log('\n=== Cloudflare Worker frontend ===');
  run('bun', ['run', 'build']);

  const deployArgs = ['deploy'];
  if (apiProxyOrigin) {
    deployArgs.push('--var', `API_PROXY_ORIGIN:${apiProxyOrigin}`, '--keep-vars');
  }

  run('wrangler', deployArgs);
}

function main(): void {
  console.log('Deploy stack: Vercel backend + Cloudflare frontend');

  const bypassSecret = ensureVercelProtectionBypass();
  let apiProxyOrigin = process.env.API_PROXY_ORIGIN?.trim().replace(/\/$/, '');

  if (!cloudflareOnly) {
    syncVercelEnv();
    apiProxyOrigin = deployVercelBackend();
    syncWranglerProxyOrigin(apiProxyOrigin);
  } else {
    apiProxyOrigin = apiProxyOrigin || readWranglerProxyOrigin();
    if (!apiProxyOrigin) {
      console.error('Set API_PROXY_ORIGIN or configure wrangler.toml before --cloudflare-only');
      process.exit(1);
    }
    console.log(`Using existing API_PROXY_ORIGIN: ${apiProxyOrigin}`);
  }

  if (!vercelOnly) {
    syncCloudflareSecrets(bypassSecret);
    deployCloudflareFrontend(apiProxyOrigin);
    console.log('\nDone.');
    console.log('  Frontend: https://website.plain-fire-9ab3.workers.dev');
    console.log(`  API proxy: ${apiProxyOrigin}`);
  } else {
    console.log('\nVercel-only deploy complete.');
    console.log(`  Backend: ${apiProxyOrigin}`);
  }
}

main();
