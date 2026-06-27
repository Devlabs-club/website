#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OUTPUT_DIR = '.context/linkedin-company-enrichment';

function parseArgs(argv) {
  const args = {
    companyUsername: null,
    companyUrl: null,
    companyName: null,
    outputKey: null,
    cdpUrl: process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222',
    waitMs: 9000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--company-username') args.companyUsername = argv[++i];
    else if (arg.startsWith('--company-username=')) args.companyUsername = arg.slice('--company-username='.length);
    else if (arg === '--company-url') args.companyUrl = argv[++i];
    else if (arg.startsWith('--company-url=')) args.companyUrl = arg.slice('--company-url='.length);
    else if (arg === '--company-name') args.companyName = argv[++i];
    else if (arg.startsWith('--company-name=')) args.companyName = arg.slice('--company-name='.length);
    else if (arg === '--output-key') args.outputKey = argv[++i];
    else if (arg.startsWith('--output-key=')) args.outputKey = arg.slice('--output-key='.length);
    else if (arg === '--cdp-url') args.cdpUrl = argv[++i];
    else if (arg.startsWith('--cdp-url=')) args.cdpUrl = arg.slice('--cdp-url='.length);
    else if (arg === '--wait-ms') args.waitMs = Number(argv[++i]);
    else if (arg.startsWith('--wait-ms=')) args.waitMs = Number(arg.slice('--wait-ms='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  const slug = args.companyUsername || slugFromCompanyUrl(args.companyUrl);
  if (!slug) throw new Error('--company-username or --company-url (with /company/<slug>) is required');
  args.companyUsername = slug;
  if (!Number.isFinite(args.waitMs) || args.waitMs < 0) throw new Error('--wait-ms must be a non-negative number');
  return args;
}

function slugFromCompanyUrl(url) {
  const match = String(url || '').match(/\/company\/([^/?#]+)/i);
  return match ? match[1] : null;
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = await readFile(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
  }
}

async function loadLocalEnv() {
  await loadEnvFile('.dev.vars');
  await loadEnvFile('.env');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.|linkedin\.com|github\.com)/i.test(trimmed)) return `https://${trimmed}`;
  return `https://${trimmed}`;
}

function compactKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function cdpHttpBase(cdpUrl) {
  const parsed = new URL(cdpUrl);
  parsed.protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

async function cdpJsonRequest(cdpUrl, pathName, options = {}) {
  const response = await fetch(`${cdpHttpBase(cdpUrl)}${pathName}`, options);
  if (!response.ok) throw new Error(`CDP ${pathName} failed with ${response.status}`);
  return response.json();
}

async function createCdpTarget(cdpUrl, url) {
  const pathName = `/json/new?${encodeURIComponent(url)}`;
  try {
    return await cdpJsonRequest(cdpUrl, pathName, { method: 'PUT' });
  } catch {
    return cdpJsonRequest(cdpUrl, pathName);
  }
}

async function closeCdpTarget(cdpUrl, targetId) {
  if (!targetId) return false;
  try {
    const response = await fetch(`${cdpHttpBase(cdpUrl)}/json/close/${encodeURIComponent(targetId)}`);
    return response.ok;
  } catch {
    return false;
  }
}

function connectCdpWebSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((sendResolve, sendReject) => {
            pending.set(id, { resolve: sendResolve, reject: sendReject });
          });
        },
        close() {
          for (const { reject: pendingReject } of pending.values()) {
            pendingReject(new Error('CDP websocket closed'));
          }
          pending.clear();
          ws.close();
        },
      });
    });

    ws.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data));
      if (!payload.id || !pending.has(payload.id)) return;
      const callbacks = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) callbacks.reject(new Error(payload.error.message || JSON.stringify(payload.error)));
      else callbacks.resolve(payload.result);
    });

    ws.addEventListener('error', () => reject(new Error(`Could not connect CDP websocket ${wsUrl}`)));
  });
}

/** DOM extraction that runs inside the logged-in Chrome tab on the company About page. */
function aboutDomExpression() {
  return `(${function extractCompanyAboutDom() {
    const absolutize = (href) => {
      try {
        return href ? new URL(href, location.href).toString() : null;
      } catch {
        return null;
      }
    };
    const cleanLines = (text) =>
      String(text || '')
        .replace(/ /g, ' ')
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.length > 0);

    // LinkedIn renders the About overview as a <dl> of <dt> labels and <dd> values.
    const overview = {};
    Array.from(document.querySelectorAll('dl')).forEach((dl) => {
      const children = Array.from(dl.children);
      for (let i = 0; i < children.length; i += 1) {
        const node = children[i];
        if (node.tagName !== 'DT') continue;
        const label = (node.innerText || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const dd = children[i + 1];
        if (!label || !dd || dd.tagName !== 'DD') continue;
        const linkInDd = dd.querySelector('a[href]');
        const value = (dd.innerText || '').trim().replace(/\s+/g, ' ');
        if (!overview[label]) {
          overview[label] = {
            text: value || null,
            href: linkInDd ? absolutize(linkInDd.getAttribute('href')) : null,
          };
        }
      }
    });

    // Description: the "Overview" section paragraph (or the longest about paragraph).
    let description = null;
    const headings = Array.from(document.querySelectorAll('h2, h3'));
    const overviewHeading = headings.find((h) => /^overview$/i.test((h.innerText || '').trim()));
    if (overviewHeading) {
      let sib = overviewHeading.nextElementSibling;
      while (sib && !description) {
        const text = (sib.innerText || '').trim().replace(/\s+/g, ' ');
        if (text.length >= 60) description = text;
        sib = sib.nextElementSibling;
      }
    }
    if (!description) {
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map((p) => (p.innerText || '').trim().replace(/\s+/g, ' '))
        .filter((t) => t.length >= 80 && /[a-z]/.test(t));
      description = paragraphs.sort((a, b) => b.length - a.length)[0] || null;
    }

    // External (non-LinkedIn) links — the strongest fallback for the website.
    const externalLinks = Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => ({
        text: String(anchor.innerText || anchor.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '),
        href: absolutize(anchor.getAttribute('href')),
      }))
      .filter((link) => {
        if (!link.href) return false;
        try {
          return !/linkedin\.com|licdn\.com|bing\.com|google\.com/i.test(new URL(link.href).hostname);
        } catch {
          return false;
        }
      });

    // Company logo.
    const logo = Array.from(document.images)
      .map((img) => {
        const rect = img.getBoundingClientRect();
        const src = img.currentSrc || img.src || '';
        const alt = img.alt || '';
        const className = typeof img.className === 'string' ? img.className : '';
        let score = 0;
        if (/media\.licdn\.com/i.test(src)) score += 20;
        if (/logo|company|organization/i.test(`${alt} ${className}`)) score += 50;
        if (/cover|banner|background/i.test(`${alt} ${className}`)) score -= 30;
        if (rect.width >= 48 && rect.height >= 48) score += 15;
        if (!src || src.startsWith('data:')) score -= 100;
        return { src, alt, score };
      })
      .filter((img) => img.src && img.score > 0)
      .sort((a, b) => b.score - a.score)[0] || null;

    return {
      title: document.title,
      url: location.href,
      text: (document.body && document.body.innerText) || '',
      lines: cleanLines((document.body && document.body.innerText) || '').slice(0, 400),
      overview,
      externalLinks,
      logo,
    };
  }.toString()})()`;
}

async function extractViaCdp(url, expression, cdpUrl, waitMs) {
  const result = { url, finalUrl: null, title: null, warning: null, data: {} };

  let target;
  let session;
  try {
    target = await createCdpTarget(cdpUrl, 'about:blank');
    if (!target?.webSocketDebuggerUrl) throw new Error('Chrome CDP did not return a target websocket URL.');
    session = await connectCdpWebSocket(target.webSocketDebuggerUrl);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Page.navigate', { url });
    await sleep(waitMs);
    await session.send('Runtime.evaluate', {
      expression: `(async () => {
        for (let i = 0; i < 4; i += 1) {
          window.scrollBy(0, Math.floor(window.innerHeight * 0.85));
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        window.scrollTo(0, 0);
        await new Promise((resolve) => setTimeout(resolve, 400));
      })()`,
      awaitPromise: true,
    });
    const evaluated = await session.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const data = evaluated?.result?.value || {};
    result.data = data;
    result.title = data.title || null;
    result.finalUrl = data.url || null;
    if (/sign up|join now|authwall|checkpoint/i.test(`${data.title}\n${(data.text || '').slice(0, 400)}`)) {
      result.warning = `LinkedIn appears to be showing login/authwall content. Page title: ${data.title || 'unknown'}`;
    }
  } catch (error) {
    result.warning = `CDP extraction failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (session) {
      try {
        session.close();
      } catch {}
    }
    if (target?.id) await closeCdpTarget(cdpUrl, target.id);
  }

  return result;
}

function cleanWebsiteUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    // LinkedIn often wraps the real website in a redirect: /redir/redirect?url=...
    const wrapped = parsed.searchParams.get('url');
    if (wrapped) return cleanWebsiteUrl(decodeURIComponent(wrapped));
    if (/linkedin\.com$/i.test(parsed.hostname.replace(/^www\./i, ''))) return null;
    parsed.hash = '';
    parsed.search = '';
    const out = parsed.toString();
    return parsed.pathname === '/' ? out.replace(/\/$/, '') : out;
  } catch {
    return normalized;
  }
}

function pickWebsite(aboutData) {
  const overviewWebsite = aboutData.data?.overview?.website;
  const direct = cleanWebsiteUrl(overviewWebsite?.href) || cleanWebsiteUrl(overviewWebsite?.text);
  if (direct) return direct;

  const links = aboutData.data?.externalLinks || [];
  const scored = links
    .map((link) => {
      let score = 0;
      const text = `${link.text || ''} ${link.href || ''}`;
      if (/website|site|visit/i.test(text)) score += 40;
      if (/twitter|x\.com|facebook|instagram|youtube|crunchbase|angel|wellfound|mailto:/i.test(text)) score -= 60;
      return { href: cleanWebsiteUrl(link.href), score };
    })
    .filter((link) => link.href && link.score >= 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.href || null;
}

function overviewValue(aboutData, label) {
  const value = aboutData.data?.overview?.[label.toLowerCase()];
  return value?.text || null;
}

function buildCompanyDraft(aboutData, args) {
  const titleName = String(aboutData.title || '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
  const name = args.companyName || titleName || args.companyUsername || null;
  const description = aboutData.data?.description || overviewValue(aboutData, 'Overview') || null;
  const headquarters = overviewValue(aboutData, 'Headquarters');

  return {
    name,
    website: pickWebsite(aboutData),
    about: description,
    description,
    industry: overviewValue(aboutData, 'Industry'),
    companySize: overviewValue(aboutData, 'Company size'),
    headquarters,
    location: headquarters,
    founded: overviewValue(aboutData, 'Founded'),
    specialties: overviewValue(aboutData, 'Specialties'),
    logoUrl: aboutData.data?.logo?.src || null,
    linkedInUrl: `https://www.linkedin.com/company/${args.companyUsername}`,
    companyUsername: args.companyUsername,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadLocalEnv();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const aboutUrl = `https://www.linkedin.com/company/${args.companyUsername}/about/?viewAsMember=true`;
  const outputKey = args.outputKey || `founder-company-${compactKey(args.companyUsername) || Date.now()}`;
  const warnings = [];

  const aboutData = await extractViaCdp(aboutUrl, aboutDomExpression(), args.cdpUrl, args.waitMs);
  if (aboutData.warning) warnings.push(aboutData.warning);

  const company = buildCompanyDraft(aboutData, args);
  if (!company.website) warnings.push('No website was found on the company About page.');
  if (!company.about) warnings.push('No About/Overview text was found on the company About page.');

  const output = {
    mode: 'dry-run',
    wroteToMongo: false,
    generatedAt: new Date().toISOString(),
    source: { browser: 'Chrome CDP', aboutUrl, cdpUrl: args.cdpUrl },
    companyUsername: args.companyUsername,
    aboutExtraction: aboutData,
    company,
    warnings,
  };

  const outputPath = `${OUTPUT_DIR}/${outputKey}.json`;
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath,
    companyUsername: args.companyUsername,
    aboutUrl,
    company,
    warnings,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
