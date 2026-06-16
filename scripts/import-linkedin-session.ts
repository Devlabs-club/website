/**
 * Import LinkedIn session cookies (from Arc/Chrome DevTools) for Voyager API enrichment.
 *
 * In Arc while logged into linkedin.com:
 *   1. DevTools → Network → filter "voyager"
 *   2. Click any graphql request → Headers → Request Headers → Cookie
 *   3. Copy the full Cookie value
 *
 *   bun run scripts/import-linkedin-session.ts -- --cookie "li_at=...; JSESSIONID=..."
 */

import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LinkedInCookieJar } from '../src/lib/talent/builderEnrichment/linkedinSessionJar';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, '../.linkedin-session.json');

function parseArgs(argv: string[]) {
  const cookieIdx = argv.indexOf('--cookie');
  const fileIdx = argv.indexOf('--file');
  if (fileIdx >= 0 && argv[fileIdx + 1]) {
    return readFileSync(argv[fileIdx + 1], 'utf8').trim();
  }
  if (cookieIdx >= 0 && argv[cookieIdx + 1]) {
    return argv[cookieIdx + 1];
  }
  console.error('Usage: bun run scripts/import-linkedin-session.ts -- --file /path/to/cookie.txt');
  process.exit(1);
}

function extractCookieValue(header: string, name: string): string | null {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]*|"[^"]*")`);
  const match = header.match(re);
  if (!match) return null;
  return match[1].replace(/^"|"$/g, '').trim() || null;
}

function buildSession(header: string) {
  const liAt = extractCookieValue(header, 'li_at');
  const jsessionId = extractCookieValue(header, 'JSESSIONID');
  if (!liAt || !jsessionId) {
    throw new Error('Cookie header must include li_at and JSESSIONID');
  }
  return {
    liAt,
    jsessionId,
    bcookie: extractCookieValue(header, 'bcookie') ?? undefined,
    bscookie: extractCookieValue(header, 'bscookie') ?? undefined,
    rawCookieHeader: header.trim(),
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const cookieHeader = parseArgs(process.argv.slice(2));
  const session = buildSession(cookieHeader);
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
  LinkedInCookieJar.reset();
  console.log(`[import-linkedin-session] saved ${SESSION_FILE}`);
  console.log(`  li_at length=${session.liAt.length} JSESSIONID length=${session.jsessionId.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
