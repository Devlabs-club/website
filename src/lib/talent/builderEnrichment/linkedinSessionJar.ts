import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { LinkedInSessionConfig } from './linkedinTypes';

export type { LinkedInSessionConfig } from './linkedinTypes';

const SESSION_FILE = join(process.cwd(), '.linkedin-session.json');

const CORE_COOKIE_NAMES = new Set(['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'lang', 'liap']);

let activeJar: LinkedInCookieJar | null = null;

function stripQuotes(value: string): string {
  return value.trim().replace(/^"|"$/g, '');
}

function parseCookiePairs(header: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) pairs[name] = value;
  }
  return pairs;
}

function configFromCookiePairs(pairs: Record<string, string>): LinkedInSessionConfig | null {
  const liAt = pairs.li_at ? stripQuotes(pairs.li_at) : '';
  const jsessionId = pairs.JSESSIONID ? stripQuotes(pairs.JSESSIONID) : '';
  if (!liAt || !jsessionId) return null;

  const extras: Record<string, string> = {};
  for (const [name, value] of Object.entries(pairs)) {
    if (CORE_COOKIE_NAMES.has(name)) continue;
    if (name === '__cf_bm') continue;
    extras[name] = value;
  }

  return {
    liAt,
    jsessionId,
    bcookie: pairs.bcookie ? stripQuotes(pairs.bcookie) : undefined,
    bscookie: pairs.bscookie ? stripQuotes(pairs.bscookie) : undefined,
    extras: Object.keys(extras).length ? extras : undefined,
  };
}

export function getLinkedInSessionConfigFromEnv(): LinkedInSessionConfig | null {
  const raw = process.env.LINKEDIN_COOKIE_HEADER?.trim();
  if (raw) {
    const parsed = configFromCookiePairs(parseCookiePairs(raw));
    if (parsed) return { ...parsed, rawCookieHeader: raw };
  }

  const liAt = process.env.LINKEDIN_LI_AT_COOKIE?.trim();
  const jsessionId = process.env.LINKEDIN_JSESSIONID_COOKIE?.trim();
  if (!liAt || !jsessionId) return null;

  const extras: Record<string, string> = {};
  const pushExtra = (name: string, envKey: string) => {
    const value = process.env[envKey]?.trim();
    if (value) extras[name] = value.includes('=') || value.startsWith('"') ? value : value;
  };

  pushExtra('__cf_bm', 'LINKEDIN_CF_BM');
  pushExtra('lidc', 'LINKEDIN_LIDC');
  pushExtra('liap', 'LINKEDIN_LIAP');
  pushExtra('li_a', 'LINKEDIN_LI_A');

  return {
    liAt,
    jsessionId: stripQuotes(jsessionId),
    bcookie: process.env.LINKEDIN_BCOOKIE?.trim()
      ? stripQuotes(process.env.LINKEDIN_BCOOKIE.trim())
      : undefined,
    bscookie: process.env.LINKEDIN_BSCOOKIE?.trim()
      ? stripQuotes(process.env.LINKEDIN_BSCOOKIE.trim())
      : undefined,
    extras: Object.keys(extras).length ? extras : undefined,
  };
}

function getSetCookieHeaders(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function parseSetCookieLine(line: string): { name: string; value: string } | null {
  const idx = line.indexOf('=');
  if (idx === -1) return null;
  const name = line.slice(0, idx).trim();
  const rest = line.slice(idx + 1);
  const value = rest.split(';')[0]?.trim();
  if (!name || !value) return null;
  return { name, value };
}

export class LinkedInCookieJar {
  session: LinkedInSessionConfig;

  constructor(session: LinkedInSessionConfig) {
    this.session = {
      ...session,
      extras: session.extras ? { ...session.extras } : undefined,
      rawCookieHeader: session.rawCookieHeader,
    };
  }

  static reset(): void {
    activeJar = null;
  }

  static load(): LinkedInCookieJar | null {
    if (activeJar) return activeJar;

    const fromEnv = getLinkedInSessionConfigFromEnv();
    let fromFile: LinkedInSessionConfig | null = null;

    if (existsSync(SESSION_FILE)) {
      try {
        const saved = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as LinkedInSessionConfig;
        if (saved?.liAt && saved?.jsessionId) fromFile = saved;
      } catch {
        // fall through
      }
    }

    if (fromFile && fromEnv) {
      const envMatchesFile =
        fromFile.liAt === fromEnv.liAt && fromFile.jsessionId === fromEnv.jsessionId;
      // Prefer imported session file (often has full rawCookieHeader from DevTools).
      const preferFile = Boolean(fromFile.rawCookieHeader?.trim()) || envMatchesFile;
      activeJar = new LinkedInCookieJar(preferFile ? fromFile : fromEnv);
      if (!envMatchesFile && !preferFile) activeJar.persist();
    } else if (fromFile) {
      activeJar = new LinkedInCookieJar(fromFile);
    } else if (fromEnv) {
      activeJar = new LinkedInCookieJar(fromEnv);
    } else {
      return null;
    }

    return activeJar;
  }

  absorbResponse(res: Response): 'ok' | 'expired' {
    const setCookies = getSetCookieHeaders(res);
    if (!setCookies.length) return 'ok';

    const combined = setCookies.join(', ');
    if (/li_at=delete/i.test(combined) || /liap=delete/i.test(combined)) return 'expired';

    for (const line of setCookies) {
      const parsed = parseSetCookieLine(line);
      if (!parsed) continue;
      const { name, value } = parsed;
      if (/delete/i.test(value)) continue;

      if (name === 'li_at') {
        this.session.liAt = stripQuotes(value);
      } else if (name === 'JSESSIONID') {
        this.session.jsessionId = stripQuotes(value);
      } else if (name === 'bcookie') {
        this.session.bcookie = stripQuotes(value);
      } else if (name === 'bscookie') {
        this.session.bscookie = stripQuotes(value);
      } else {
        if (!this.session.extras) this.session.extras = {};
        this.session.extras[name] = value;
        if (name === '__cf_bm') this.session.extras._cfBmFromApi = '1';
      }
    }

    this.patchRawCookieHeader(setCookies);
    return 'ok';
  }

  /** Update rotated cookies inside the stored raw header (keeps Cloudflare / bot cookies intact). */
  private patchRawCookieHeader(setCookies: string[]): void {
    if (!this.session.rawCookieHeader?.trim()) return;

    let header = this.session.rawCookieHeader;
    for (const line of setCookies) {
      const parsed = parseSetCookieLine(line);
      if (!parsed || /delete/i.test(parsed.value)) continue;
      const value = stripQuotes(parsed.value);
      const re = new RegExp(`(?:^|;\\s*)${parsed.name}=[^;]*`);
      if (re.test(header)) {
        header = header.replace(re, (m) => `${parsed.name}=${value}`);
      } else {
        header = `${header}; ${parsed.name}=${value}`;
      }
    }
    this.session.rawCookieHeader = header;
  }

  persist(): void {
    try {
      writeFileSync(
        SESSION_FILE,
        JSON.stringify(
          {
            liAt: this.session.liAt,
            jsessionId: this.session.jsessionId,
            bcookie: this.session.bcookie,
            bscookie: this.session.bscookie,
            extras: this.session.extras,
            rawCookieHeader: this.session.rawCookieHeader,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
    } catch (err) {
      console.warn('[linkedin] session persist failed', err instanceof Error ? err.message : err);
    }
  }

  buildCookieHeader(): string {
    if (this.session.rawCookieHeader?.trim()) {
      return this.session.rawCookieHeader.trim();
    }

    const parts: string[] = [];

    const push = (name: string, value: string | undefined, quoted = false) => {
      if (!value) return;
      const v = quoted && !value.startsWith('"') ? `"${value}"` : value;
      parts.push(`${name}=${v}`);
    };

    push('li_at', this.session.liAt);
    push('JSESSIONID', this.session.jsessionId, true);
    push('lang', this.session.extras?.lang || 'v=2&lang=en-us');
    push('bcookie', this.session.bcookie, true);
    push('bscookie', this.session.bscookie, true);
    push('liap', this.session.extras?.liap || 'true');

    const used = new Set(['li_at', 'JSESSIONID', 'lang', 'bcookie', 'bscookie', 'liap']);
    for (const [name, value] of Object.entries(this.session.extras || {})) {
      if (used.has(name)) continue;
      // Stale __cf_bm from a browser export triggers LinkedIn to invalidate li_at.
      if (name === '__cf_bm' && !this.session.extras?._cfBmFromApi) continue;
      push(name, value);
    }

    return parts.join('; ');
  }
}
