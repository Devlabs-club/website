/**
 * Fail if git-tracked files contain MongoDB URIs with real userinfo.
 *
 * Placeholder forms such as `mongodb+srv://<user>:<password>@<cluster>...`
 * in `.env.example` are allowed. Credentialed `mongodb://` / `mongodb+srv://`
 * strings are not, even in comments or docs.
 *
 * Usage: node scripts/check-no-hardcoded-secrets.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MONGO_URI_RE = /mongodb(?:\+srv)?:\/\/([^\s"'`<>]+)/gi;

const PLACEHOLDER_RE =
  /^(?:<[^>]+>|\$\{[^}]+\}|%(?:3C)[^%]+(?:3E)|(?:your[_-])?(?:user(?:name)?|password|passwd|pass|secret|token)|xxx+|[*x]{3,}|change-?me|todo|example|dummy|placeholder)$/i;

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.lock',
]);

const SKIP_BASENAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);

function decodeUriComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseMongoUserInfo(authority) {
  const at = authority.lastIndexOf('@');
  if (at === -1) return null;
  const userinfo = authority.slice(0, at);
  if (!userinfo.includes(':')) return null;
  const colon = userinfo.indexOf(':');
  return {
    user: decodeUriComponentSafe(userinfo.slice(0, colon)),
    password: decodeUriComponentSafe(userinfo.slice(colon + 1)),
  };
}

export function isPlaceholderCredential(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return true;
  return PLACEHOLDER_RE.test(trimmed);
}

export function redactMongoUri(uri) {
  return uri.replace(/\/\/([^:/@\s]+):([^@/\s]+)@/g, '//$1:***@');
}

export function findCredentialedMongoUris(content) {
  const findings = [];
  for (const match of content.matchAll(MONGO_URI_RE)) {
    const parsed = parseMongoUserInfo(match[1]);
    if (!parsed) continue;
    if (isPlaceholderCredential(parsed.user) && isPlaceholderCredential(parsed.password)) {
      continue;
    }
    findings.push({
      index: match.index ?? 0,
      snippet: redactMongoUri(match[0]),
    });
  }
  return findings;
}

export function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

function listTrackedFiles() {
  const stdout = execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer' });
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function shouldScan(file) {
  const base = file.split('/').pop() ?? file;
  if (SKIP_BASENAMES.has(base)) return false;
  if (SKIP_EXTENSIONS.has(extname(file).toLowerCase())) return false;
  return true;
}

export function scanFiles(files, readFile = (file) => readFileSync(file, 'utf8')) {
  const hits = [];
  for (const file of files) {
    if (!shouldScan(file)) continue;
    let content;
    try {
      content = readFile(file);
    } catch {
      continue;
    }
    if (!content || content.includes('\0')) continue;
    for (const finding of findCredentialedMongoUris(content)) {
      hits.push({
        file,
        line: lineNumberAt(content, finding.index),
        snippet: finding.snippet,
      });
    }
  }
  return hits;
}

function main() {
  const files = listTrackedFiles();
  const hits = scanFiles(files);
  if (hits.length === 0) {
    process.stdout.write(`No hardcoded MongoDB credentials in ${files.length} tracked files.\n`);
    return;
  }
  process.stderr.write('Hardcoded MongoDB credentials found:\n');
  for (const hit of hits) {
    process.stderr.write(`  ${hit.file}:${hit.line}: ${hit.snippet}\n`);
  }
  process.stderr.write(
    '\nMove connection strings to MONGODB_URI / ADMIN_MONGO_URI / MOMENTUM_MONGODB_URI in a gitignored .env or the host secret store, then rotate the Atlas database user.\n'
  );
  process.exit(1);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main();
}
