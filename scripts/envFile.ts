import { readFileSync } from 'fs';
import { join } from 'path';

/** Plain [vars] in wrangler.toml — not Worker secrets. */
export const CLOUDFLARE_PUBLIC_VAR_KEYS = new Set([
  'WEBSITE_ROOT',
  'WORKOS_REDIRECT_URI',
  'API_PROXY_ORIGIN',
  'CLOUDFLARE_API_TOKEN',
]);

/** Keys that should not be uploaded to Vercel. */
export const VERCEL_SKIP_KEYS = new Set([
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'API_PROXY_ORIGIN',
]);

export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};

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

    if (!key || !value) continue;
    env[key] = value;
  }

  return env;
}

export function loadEnvFile(root: string): Record<string, string> {
  const candidates = ['.env', '.env.local', '.dev.vars', '.env.backup'];
  for (const name of candidates) {
    const path = join(root, name);
    try {
      return parseEnvFile(readFileSync(path, 'utf8'));
    } catch {
      // try next
    }
  }
  throw new Error(
    'No .env, .env.local, .dev.vars, or .env.backup found. Create one with your secrets before deploying.'
  );
}
