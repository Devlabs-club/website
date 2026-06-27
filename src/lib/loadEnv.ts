import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

let loaded = false;

/**
 * Load local env files into process.env for Astro dev and Node.
 * Skipped in production builds where secrets come from the platform (Vercel / Cloudflare bindings).
 */
export function ensureLocalEnvLoaded(): void {
  if (loaded || typeof process === 'undefined') return;
  loaded = true;

  if (import.meta.env?.PROD === true) return;

  const root = process.cwd();
  const files = ['.env', '.env.local', '.dev.vars', '.env.backup', '.env.local.backup'];

  for (const name of files) {
    const path = join(root, name);
    if (existsSync(path)) {
      dotenv.config({ path, override: false });
    }
  }
}
