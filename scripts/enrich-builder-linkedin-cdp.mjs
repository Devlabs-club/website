#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OUTPUT_DIR = '.context/linkedin-enrichment';
const CURRENT_YEAR = new Date().getFullYear();

function parseArgs(argv) {
  const args = {
    first: false,
    all: false,
    builderId: null,
    linkedInUrl: null,
    profileName: null,
    email: null,
    outputKey: null,
    cdpUrl: process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222',
    waitMs: 12000,
    delayMs: 4000,
    limit: null,
    offset: 0,
    resume: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--first') args.first = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--dry-run') continue;
    else if (arg === '--apply') throw new Error('This script is dry-run only. Refusing --apply.');
    else if (arg === '--builderId') args.builderId = argv[++i];
    else if (arg.startsWith('--builderId=')) args.builderId = arg.slice('--builderId='.length);
    else if (arg === '--linkedin-url') args.linkedInUrl = argv[++i];
    else if (arg.startsWith('--linkedin-url=')) args.linkedInUrl = arg.slice('--linkedin-url='.length);
    else if (arg === '--name') args.profileName = argv[++i];
    else if (arg.startsWith('--name=')) args.profileName = arg.slice('--name='.length);
    else if (arg === '--email') args.email = argv[++i];
    else if (arg.startsWith('--email=')) args.email = arg.slice('--email='.length);
    else if (arg === '--output-key') args.outputKey = argv[++i];
    else if (arg.startsWith('--output-key=')) args.outputKey = arg.slice('--output-key='.length);
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--offset') args.offset = Number(argv[++i]);
    else if (arg.startsWith('--offset=')) args.offset = Number(arg.slice('--offset='.length));
    else if (arg === '--resume') args.resume = true;
    else if (arg === '--cdp-url') args.cdpUrl = argv[++i];
    else if (arg.startsWith('--cdp-url=')) args.cdpUrl = arg.slice('--cdp-url='.length);
    else if (arg === '--wait-ms' || arg === '--playwright-wait-ms') args.waitMs = Number(argv[++i]);
    else if (arg.startsWith('--wait-ms=')) args.waitMs = Number(arg.slice('--wait-ms='.length));
    else if (arg.startsWith('--playwright-wait-ms=')) args.waitMs = Number(arg.slice('--playwright-wait-ms='.length));
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++i]);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number(arg.slice('--delay-ms='.length));
    else if (arg === '--skip-browser' || arg === '--photo-mode=playwright') continue;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.builderId && !args.linkedInUrl && !args.first && !args.all) args.first = true;
  if (!Number.isFinite(args.waitMs) || args.waitMs < 0) {
    throw new Error('--wait-ms must be a non-negative number');
  }
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative number');
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  if (!Number.isInteger(args.offset) || args.offset < 0) {
    throw new Error('--offset must be a non-negative integer');
  }
  return args;
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

function getMongoUri() {
  return process.env.DEVLABS_MONGO_URI || process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;
}

function getDbName(uri) {
  try {
    return new URL(uri).pathname.replace(/^\//, '') || 'devlabs';
  } catch {
    return 'devlabs';
  }
}

function runMongoshJson(uri, script) {
  const result = spawnSync('mongosh', ['--nodb', '--quiet', '--eval', script], {
    env: { ...process.env, LINKEDIN_ENRICH_MONGO_URI: uri },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 100,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`mongosh failed: ${result.stderr || result.stdout}`);

  const output = result.stdout.trim();
  const start = output.lastIndexOf('\n{');
  const jsonText = start >= 0 ? output.slice(start + 1) : output.slice(output.indexOf('{'));
  if (!jsonText.trim()) throw new Error(`mongosh returned no JSON. Output: ${output}`);
  return JSON.parse(jsonText);
}

function fetchBuilder(uri, args) {
  const dbName = getDbName(uri);
  const selector = args.builderId
    ? `{ _id: ObjectId("${args.builderId.replace(/"/g, '\\"')}") }`
    : `{ "links.linkedin": { $nin: [null, ""] } }`;
  const sort = args.builderId ? '{}' : '{ createdAt: 1 }';
  const script = `
const uri = process.env.LINKEDIN_ENRICH_MONGO_URI;
const conn = new Mongo(uri);
const db = conn.getDB(${JSON.stringify(dbName)});
const collectionName = db.getCollectionNames().includes('builderprofiles') ? 'builderprofiles' : 'builderProfiles';
const projection = {
  name: 1,
  email: 1,
  headline: 1,
  bio: 1,
  photoUrl: 1,
  phone: 1,
  location: 1,
  timezone: 1,
  universityOrCompany: 1,
  graduationYear: 1,
  currentStatus: 1,
  rolePreference: 1,
  preferredWorkType: 1,
  experiences: 1,
  links: 1,
  availability: 1,
  hiringIntent: 1,
  profileCompletion: 1,
  profileQuality: 1,
  verificationStatus: 1,
  visibilityStatus: 1,
  legacyRefs: 1,
  createdAt: 1,
  updatedAt: 1
};
const builder = db.getCollection(collectionName).find(${selector}, projection).sort(${sort}).limit(1).next();
print(JSON.stringify({ dbName: db.getName(), collectionName, builder }, null, 2));
`;
  const result = runMongoshJson(uri, script);
  if (!result.builder) throw new Error('No builder profile found for the requested selector');
  return result;
}

function fetchBuilders(uri, args) {
  const dbName = getDbName(uri);
  const limitClause = args.limit ? `.limit(${args.limit})` : '';
  const script = `
const uri = process.env.LINKEDIN_ENRICH_MONGO_URI;
const conn = new Mongo(uri);
const db = conn.getDB(${JSON.stringify(dbName)});
const collectionName = db.getCollectionNames().includes('builderprofiles') ? 'builderprofiles' : 'builderProfiles';
const filter = { "links.linkedin": { $nin: [null, ""] } };
const projection = {
  name: 1,
  email: 1,
  headline: 1,
  bio: 1,
  photoUrl: 1,
  phone: 1,
  location: 1,
  timezone: 1,
  universityOrCompany: 1,
  graduationYear: 1,
  currentStatus: 1,
  rolePreference: 1,
  preferredWorkType: 1,
  experiences: 1,
  links: 1,
  availability: 1,
  hiringIntent: 1,
  profileCompletion: 1,
  profileQuality: 1,
  verificationStatus: 1,
  visibilityStatus: 1,
  legacyRefs: 1,
  createdAt: 1,
  updatedAt: 1
};
const totalLinkedIn = db.getCollection(collectionName).countDocuments(filter);
const builders = db.getCollection(collectionName)
  .find(filter, projection)
  .sort({ createdAt: 1 })
  .skip(${args.offset})
  ${limitClause}
  .toArray();
print(JSON.stringify({ dbName: db.getName(), collectionName, totalLinkedIn, builders }, null, 2));
`;
  const result = runMongoshJson(uri, script);
  if (!Array.isArray(result.builders)) throw new Error('MongoDB did not return a builders array');
  return result;
}

function normalizeUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.|linkedin\.com|github\.com)/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cdpHttpBase(cdpUrl) {
  const parsed = new URL(cdpUrl);
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

async function cdpJsonRequest(cdpUrl, pathName, options = {}) {
  const base = cdpHttpBase(cdpUrl);
  const response = await fetch(`${base}${pathName}`, options);
  if (!response.ok) {
    throw new Error(`Chrome CDP ${pathName} failed: HTTP ${response.status} ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createCdpTarget(cdpUrl, url) {
  const pathName = `/json/new?${encodeURIComponent(url)}`;
  try {
    return await cdpJsonRequest(cdpUrl, pathName, { method: 'PUT' });
  } catch (error) {
    if (!/HTTP 405|HTTP 404/i.test(String(error?.message || error))) throw error;
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

function linkedInDomExtractionExpression(builderName) {
  return `(${function extractLinkedInDom(builderNameValue) {
    const normalizedName = String(builderNameValue || '').toLowerCase();
    const cleanLines = (text) => {
      const seen = new Set();
      const noise = /^(show all|show more|see more|more|message|connect|follow|save|view|view profile|report|open profile)$/i;
      return String(text || '')
        .replace(/\u00a0/g, ' ')
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.length > 1 && !noise.test(line))
        .filter((line) => {
          const key = line.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    };
    const absolutize = (href) => {
      try {
        return href ? new URL(href, location.origin).toString() : null;
      } catch {
        return null;
      }
    };
    const imageForExperience = (item) => {
      const images = Array.from(item.querySelectorAll('img')).map((img) => {
        const rect = img.getBoundingClientRect();
        const src = img.currentSrc || img.src || '';
        const alt = img.alt || '';
        const className = typeof img.className === 'string' ? img.className : '';
        const width = img.naturalWidth || img.width || rect.width || 0;
        const height = img.naturalHeight || img.height || rect.height || 0;
        let score = 0;

        if (/media\.licdn\.com/i.test(src)) score += 20;
        if (/company|logo|organization/i.test(`${alt} ${className} ${src}`)) score += 45;
        if (/profile-displayphoto|avatar|member/i.test(`${alt} ${className} ${src}`)) score -= 45;
        if (Math.abs(width - height) <= Math.max(width, height) * 0.25) score += 15;
        if (width >= 40 && height >= 40) score += 15;
        if (rect.width >= 32 && rect.height >= 32 && rect.width <= 96 && rect.height <= 96) score += 10;
        if (!src || src.startsWith('data:')) score -= 100;

        return { src, alt, width, height, score };
      }).filter((img) => img.src && img.score > 0).sort((a, b) => b.score - a.score);

      return images[0] || null;
    };
    const imagesForExperienceSection = (section) => {
      return Array.from(section.querySelectorAll('img')).map((img) => {
        const rect = img.getBoundingClientRect();
        const src = img.currentSrc || img.src || '';
        const alt = img.alt || '';
        const className = typeof img.className === 'string' ? img.className : '';
        const width = img.naturalWidth || img.width || rect.width || 0;
        const height = img.naturalHeight || img.height || rect.height || 0;
        let score = 0;

        if (/media\.licdn\.com/i.test(src)) score += 20;
        if (/company|logo|organization/i.test(`${alt} ${className} ${src}`)) score += 45;
        if (/profile-displayphoto|avatar|member/i.test(`${alt} ${className} ${src}`)) score -= 45;
        if (Math.abs(width - height) <= Math.max(width, height) * 0.25) score += 15;
        if (width >= 40 && height >= 40) score += 15;
        if (rect.width >= 32 && rect.height >= 32 && rect.width <= 96 && rect.height <= 96) score += 10;
        if (!src || src.startsWith('data:')) score -= 100;

        return { src, alt, width, height, score, top: rect.top };
      }).filter((img) => img.src && img.score > 0).sort((a, b) => a.top - b.top);
    };
    const looksLikeDateRangeLine = (line) => /\b(present|20[0-4][0-9]|19[8-9][0-9])\b/i.test(line) && /\s[–-]\s/.test(line);
    const segmentExperienceLines = (section) => {
      const bodyLines = cleanLines(section.innerText).filter((line) => !/^Experience$/i.test(line));
      const logos = imagesForExperienceSection(section);
      const entries = [];

      for (let i = 0; i < bodyLines.length; i += 1) {
        if (!looksLikeDateRangeLine(bodyLines[i + 2] || '')) continue;
        let next = bodyLines.length;
        for (let j = i + 3; j < bodyLines.length; j += 1) {
          if (looksLikeDateRangeLine(bodyLines[j + 2] || '')) {
            next = j;
            break;
          }
        }
        entries.push({
          index: entries.length,
          lines: bodyLines.slice(i, next),
          text: bodyLines.slice(i, next).join('\n'),
          companyLinkedInUrl: null,
          logo: logos[entries.length] || null,
        });
        i = next - 1;
      }

      return entries;
    };
    const extractExperienceEntries = () => {
      const sections = Array.from(document.querySelectorAll('section'));
      const experienceSection = sections.find((section) => {
        const firstLines = cleanLines(section.innerText).slice(0, 6).join('\n');
        return /^Experience\b/im.test(firstLines) || /\nExperience\n/i.test(`\n${firstLines}\n`);
      });
      if (!experienceSection) return [];

      const firstList = experienceSection.querySelector('ul');
      const itemNodes = firstList
        ? Array.from(firstList.children).filter((node) => node.matches?.('li'))
        : Array.from(experienceSection.querySelectorAll('li.artdeco-list__item, li.pvs-list__item--line-separated, li'));

      const entries = itemNodes
        .map((item, index) => {
          const lines = cleanLines(item.innerText);
          const logo = imageForExperience(item);
          const companyLinkedInUrl = Array.from(item.querySelectorAll('a[href*="/company/"]'))
            .map((anchor) => absolutize(anchor.getAttribute('href')))
            .find(Boolean) || null;
          return {
            index,
            lines,
            text: lines.join('\n'),
            companyLinkedInUrl,
            logo,
          };
        })
        .filter((entry) => entry.lines.length >= 3)
        .slice(0, 12);

      if (entries.length) return entries;
      return segmentExperienceLines(experienceSection).slice(0, 12);
    };
    const text = document.body?.innerText || '';
    const imageData = Array.from(document.images).map((img) => {
      const rect = img.getBoundingClientRect();
      const src = img.currentSrc || img.src || '';
      const alt = img.alt || '';
      const className = typeof img.className === 'string' ? img.className : '';
      const parentText = img.closest('section, main, header, div')?.textContent?.slice(0, 300) || '';
      const width = img.naturalWidth || img.width || rect.width || 0;
      const height = img.naturalHeight || img.height || rect.height || 0;
      let score = 0;

      if (/media\.licdn\.com/i.test(src)) score += 30;
      if (/profile|photo|avatar|presence-entity/i.test(`${alt} ${className} ${src}`)) score += 25;
      if (normalizedName && alt.toLowerCase().includes(normalizedName)) score += 60;
      if (Math.abs(width - height) <= Math.max(width, height) * 0.2) score += 15;
      if (width >= 120 && height >= 120) score += 15;
      if (rect.top >= 0 && rect.top < 420 && rect.left >= 0 && rect.left < 420) score += 20;
      if (/logo|cover|banner|background|company/i.test(`${alt} ${className} ${parentText}`)) score -= 80;
      if (!src || src.startsWith('data:')) score -= 100;

      return {
        src,
        alt,
        width,
        height,
        rect: {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        score,
      };
    });

    const candidates = imageData
      .filter((img) => img.src && img.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    // Collect every LinkedIn company link on the page so we can resolve the company
    // username/slug for each experience (the slug lets us open the company About page).
    const collectCompanyLinks = () => {
      const map = new Map();
      Array.from(document.querySelectorAll('a[href*="/company/"]')).forEach((anchor) => {
        const url = absolutize(anchor.getAttribute('href'));
        if (!url) return;
        const match = url.match(/\/company\/([^/?#]+)/i);
        if (!match) return;
        const slug = match[1];
        const name = String(anchor.innerText || anchor.getAttribute('aria-label') || '')
          .trim()
          .replace(/\s+/g, ' ');
        if (!map.has(slug)) {
          map.set(slug, { slug, name: name || null, url: `https://www.linkedin.com/company/${slug}` });
        } else if (name && !map.get(slug).name) {
          map.get(slug).name = name;
        }
      });
      return Array.from(map.values()).slice(0, 40);
    };

    return {
      title: document.title,
      url: location.href,
      text,
      experienceEntries: extractExperienceEntries(),
      companyLinks: collectCompanyLinks(),
      candidates,
      bestPhoto: candidates[0] || null,
    };
  }.toString()})(${JSON.stringify(builderName || '')})`;
}

async function extractLinkedInProfileViaCDP(url, builder, cdpUrl, waitMs) {
  const result = {
    attempted: true,
    transport: 'cdp',
    cdpUrl,
    pageClosed: false,
    browserDisconnected: false,
    warning: null,
    pageTitle: null,
    finalUrl: null,
    rawText: '',
    experienceEntries: [],
    companyLinks: [],
    photo: {
      imageUrl: null,
      source: null,
      alt: null,
      score: null,
      candidates: [],
    },
  };

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
        for (let i = 0; i < 5; i += 1) {
          window.scrollBy(0, Math.floor(window.innerHeight * 0.85));
          await new Promise((resolve) => setTimeout(resolve, 450));
        }
        window.scrollTo(0, 0);
        await new Promise((resolve) => setTimeout(resolve, 700));
      })()`,
      awaitPromise: true,
    });

    const evaluated = await session.send('Runtime.evaluate', {
      expression: linkedInDomExtractionExpression(builder.name),
      awaitPromise: true,
      returnByValue: true,
    });
    const dom = evaluated?.result?.value || {};

    result.pageTitle = dom.title;
    result.finalUrl = dom.url;
    result.rawText = dom.text || '';
    result.experienceEntries = dom.experienceEntries || [];
    result.companyLinks = dom.companyLinks || [];
    result.photo.candidates = dom.candidates || [];
    if (dom.bestPhoto?.src) {
      result.photo.imageUrl = dom.bestPhoto.src;
      result.photo.source = 'cdp-dom';
      result.photo.alt = dom.bestPhoto.alt || null;
      result.photo.score = dom.bestPhoto.score;
    }

    const authProbe = `${dom.title}\n${String(dom.text || '').slice(0, 600)}`;
    if (/sign in|sign up|join now|authwall|checkpoint|log in to view/i.test(authProbe)) {
      result.warning = `LinkedIn appears to be showing login/authwall content. Page title: ${dom.title || 'unknown'}`;
    } else if (!result.rawText.trim()) {
      result.warning = 'CDP extraction returned no page text.';
    }
  } catch (error) {
    result.warning = `CDP profile extraction failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (session) {
      try {
        session.close();
        result.browserDisconnected = true;
      } catch (error) {
        result.warning = `${result.warning ? `${result.warning}; ` : ''}CDP websocket close failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (target?.id) {
      const closed = await closeCdpTarget(cdpUrl, target.id);
      result.pageClosed = closed;
      if (!closed) {
        result.warning = `${result.warning ? `${result.warning}; ` : ''}CDP page close failed for target ${target.id}`;
      }
    }
  }

  return result;
}

function linesFromText(text) {
  const seen = new Set();
  const noise = /^(skip to main content|feed|jobs|messaging|notifications|me$|premium|advertising|analytics|about this profile|people also viewed|show all|see more|connect|message|follow|save|more|report|profile language|public profile|cover photo|home|my network|for business|advertise|contact info|highlights)$/i;
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 1 && !noise.test(line))
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function section(lines, startLabel, endLabels) {
  const start = lines.findIndex((line) => line.toLowerCase() === startLabel.toLowerCase());
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && endLabels.some((label) => line.toLowerCase() === label.toLowerCase()));
  return lines.slice(start + 1, end > start ? end : undefined);
}

function looksLikeLocation(line) {
  const value = String(line || '');
  if (/[|@]/.test(value)) return false;
  if (/\b(junior|senior|freshman|sophomore|research|intern|engineer|winner|student)\b/i.test(value)) return false;
  return /\b(arizona|california|texas|new york|united states|usa|india|canada|tempe|phoenix|san francisco|seattle|austin|boston|chicago|karnataka|bengaluru)\b/i.test(value);
}

function extractYears(text) {
  return Array.from(String(text || '').matchAll(/\b(20[2-4][0-9])\b/g))
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2024 && year <= 2040);
}

function extractLinkedInData(rawText, builder, cdpExtraction) {
  const lines = linesFromText(rawText);
  const allText = lines.join('\n');
  const aboutLines = section(lines, 'About', ['Activity', 'Experience', 'Education', 'Licenses & certifications', 'Projects', 'Skills', 'Recommendations']);
  const experienceLines = section(lines, 'Experience', ['Education', 'Licenses & certifications', 'Projects', 'Skills', 'Recommendations']);
  const educationLines = section(lines, 'Education', ['Licenses & certifications', 'Projects', 'Skills', 'Recommendations', 'Interests']);
  const skillsLines = section(lines, 'Skills', ['Recommendations', 'Interests', 'Courses', 'Languages']);
  const projectLines = section(lines, 'Projects', ['Skills', 'Recommendations', 'Education', 'Interests']);

  const nameIndex = lines.findIndex((line) => line.toLowerCase() === String(builder.name || '').toLowerCase());
  const headlineCandidate = nameIndex >= 0 ? lines.slice(nameIndex + 1).find((line) => {
    return line.length <= 180 && !looksLikeLocation(line) && !/^(· 1st|1st|2nd|3rd|contact info|followers|connections|\d+ connections)$/i.test(line);
  }) : null;
  const years = extractYears(`${allText}\n${builder.graduationYear || ''}`);
  const inferredGraduationYear = builder.graduationYear || years.find((year) => year >= CURRENT_YEAR) || null;
  const currentExperience = inferCurrentExperience(experienceLines);
  const openSignal = /\b(open to work|looking for roles|looking for opportunities|open to networking|seeking internship|seeking full[- ]time|actively looking|i'm looking for)\b/i.test(allText);
  const collegeSignal = /\b(arizona state university|asu|university|college|bachelor|master|student|undergraduate|graduate student)\b/i.test(`${headlineCandidate || ''}\n${educationLines.join('\n')}`);

  const warnings = [];
  if (cdpExtraction.warning) warnings.push(cdpExtraction.warning);
  if (!rawText.trim()) warnings.push('No page text was extracted from Chrome CDP.');
  if (lines.length < 20) warnings.push('Extracted page text is short; profile sections may not have loaded or may be hidden.');
  if (!cdpExtraction.photo.imageUrl) warnings.push('No likely LinkedIn profile photo found in DOM.');

  return {
    lines,
    headline: headlineCandidate || null,
    location: lines.find(looksLikeLocation) || null,
    about: aboutLines.join(' ').slice(0, 1500) || null,
    experience: experienceLines.slice(0, 80),
    experiences: parseExperienceEntries(cdpExtraction, builder),
    education: educationLines.slice(0, 60),
    skills: extractSkills(skillsLines, lines),
    projects: projectLines.slice(0, 40),
    inferredGraduationYear,
    currentExperience,
    openSignal,
    collegeSignal,
    copiedTextLength: rawText.length,
    cdpExtraction,
    warnings,
  };
}

function inferCurrentExperience(experienceLines) {
  if (!/\bpresent\b/i.test(experienceLines.join('\n'))) return null;
  const presentIndex = experienceLines.findIndex((line) => /\bpresent\b/i.test(line));
  const nearby = experienceLines.slice(Math.max(0, presentIndex - 4), presentIndex + 4);
  const organization = nearby.find((line) => !/\b(present|full-time|part-time|internship|remote|hybrid|\d{4})\b/i.test(line) && line.length <= 100) || null;
  const universityBased = /\b(arizona state university|asu|university|college|school|campus|student)\b/i.test(nearby.join(' '));
  return {
    lines: nearby,
    organization,
    universityBased,
    offCampus: Boolean(organization && !universityBased),
  };
}

function extractSkills(skillsLines, allLines = []) {
  const blocked = /^(skills|endorse|show all|see more|profile|company|school)$/i;
  const topSkillsIndex = allLines.findIndex((line) => /^top skills$/i.test(line));
  const topSkills = topSkillsIndex >= 0 && allLines[topSkillsIndex + 1]
    ? allLines[topSkillsIndex + 1].split(/\s*[•,]\s*/).map((skill) => skill.trim())
    : [];
  return [...topSkills, ...skillsLines]
    .filter((line) => line.length <= 60 && !blocked.test(line))
    .filter((line) => !/\b(show all|endorsement|followers|connections)\b/i.test(line))
    .filter((line, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === line.toLowerCase()) === index)
    .slice(0, 25);
}

function compactKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function splitCompanyLine(line) {
  const parts = String(line || '').split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
  return {
    company: parts[0] || null,
    employmentType: parts.slice(1).join(' · ') || null,
  };
}

function splitDateRange(line) {
  const [rangePart, durationPart] = String(line || '').split(/\s+·\s+/).map((part) => part.trim());
  const [start, end] = String(rangePart || '').split(/\s*[–-]\s*/).map((part) => part.trim());
  return {
    dateRange: rangePart || null,
    startDateLabel: start || null,
    endDateLabel: end || null,
    duration: durationPart || null,
  };
}

function looksLikeDateRange(line) {
  return /\b(present|20[0-4][0-9]|19[8-9][0-9])\b/i.test(line) && /\s[–-]\s/.test(line);
}

function looksLikeExperienceLocation(line) {
  return /\b(remote|hybrid|on-site|onsite|united states|india|canada|tempe|phoenix|bengaluru|karnataka|california|new york|texas|washington|massachusetts)\b/i.test(line);
}

function normalizeExperienceLines(lines) {
  return lines
    .map((line) => String(line || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .filter((line) => !/^(show all|show more|see more|more|message|connect|follow|view profile|open profile)$/i.test(line))
    .filter((line) => !/^… more$/i.test(line));
}

function slugFromCompanyUrl(url) {
  const match = String(url || '').match(/\/company\/([^/?#]+)/i);
  return match ? match[1] : null;
}

/** Resolve a company's LinkedIn slug/url for an experience, using the page-wide company links. */
function resolveCompanyLink(company, companyLinkedInUrl, companyLinks) {
  let slug = slugFromCompanyUrl(companyLinkedInUrl);
  let url = companyLinkedInUrl || null;

  if (!slug && Array.isArray(companyLinks) && company) {
    const target = compactKey(company);
    const match = companyLinks.find((link) => link.name && compactKey(link.name) === target) ||
      companyLinks.find((link) => link.name && (compactKey(link.name).includes(target) || target.includes(compactKey(link.name))));
    if (match) {
      slug = match.slug;
      url = match.url;
    }
  }

  return {
    companyUsername: slug || null,
    companyLinkedInUrl: url || (slug ? `https://www.linkedin.com/company/${slug}` : null),
  };
}

function parseExperienceEntry(rawEntry, builder, companyLinks) {
  const lines = normalizeExperienceLines(rawEntry.lines || []);
  if (lines.length < 3) return null;

  const dateIndex = lines.findIndex(looksLikeDateRange);
  if (dateIndex < 1) return null;

  const title = lines[0];
  const companyLine = lines.slice(1, dateIndex).find((line) => !looksLikeDateRange(line)) || lines[1];
  const { company, employmentType } = splitCompanyLine(companyLine);
  if (!title || !company) return null;

  const dateParts = splitDateRange(lines[dateIndex]);
  const afterDate = lines.slice(dateIndex + 1);
  const location = afterDate.find(looksLikeExperienceLocation) || null;
  const descriptionLines = afterDate
    .filter((line) => line !== location)
    .filter((line) => line.length > 2)
    .filter((line) => !/^\d+\s+(skills?|endorsements?)$/i.test(line))
    .filter((line) => !/^[A-Z][A-Za-z+#. ]{1,30}$/.test(line) || /[-.,]/.test(line))
    .slice(0, 8);
  const skills = afterDate
    .flatMap((line) => /skill/i.test(line) || /,/.test(line) ? line.split(/\s*,\s*|\s+and\s+\+\d+\s+skill/i) : [])
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 1 && skill.length <= 40)
    .filter((skill, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === skill.toLowerCase()) === index)
    .slice(0, 8);
  const sourceId = `linkedin:${compactKey(builder.links?.linkedin || builder.name)}:${compactKey(`${title}-${company}-${dateParts.dateRange || rawEntry.index}`)}`;
  const { companyUsername, companyLinkedInUrl } = resolveCompanyLink(company, rawEntry.companyLinkedInUrl, companyLinks);

  return {
    title: title.slice(0, 140),
    company: company.slice(0, 140),
    companyLogoUrl: rawEntry.logo?.src || null,
    companyUsername,
    companyLinkedInUrl,
    employmentType,
    location,
    dateRange: dateParts.dateRange,
    startDateLabel: dateParts.startDateLabel,
    endDateLabel: dateParts.endDateLabel,
    duration: dateParts.duration,
    description: descriptionLines.join('\n').slice(0, 1200) || null,
    skills,
    isCurrent: /\bpresent\b/i.test(dateParts.dateRange || ''),
    source: 'linkedin',
    sourceId,
    importedAt: new Date().toISOString(),
  };
}

function parseExperienceEntries(cdpExtraction, builder) {
  const companyLinks = cdpExtraction.companyLinks || [];
  return (cdpExtraction.experienceEntries || [])
    .map((entry) => parseExperienceEntry(entry, builder, companyLinks))
    .filter(Boolean)
    .filter((entry, index, arr) => arr.findIndex((candidate) => candidate.sourceId === entry.sourceId) === index)
    .slice(0, 12);
}

function buildBio(builder, extracted) {
  const role = extracted.headline || (extracted.skills[0] ? `${extracted.skills[0]} builder` : 'builder');
  const school = builder.universityOrCompany || extracted.education.find((line) => /university|college|school|asu/i.test(line));
  const skills = extracted.skills.slice(0, 5).join(', ');
  const projectHint = extracted.projects.slice(0, 2).join('; ');
  const parts = [`${builder.name} is a ${role} focused on turning technical ideas into shipped products.`];
  if (school) parts.push(`They are connected to ${school}, with a profile that points toward hands-on building and fast iteration.`);
  if (skills) parts.push(`Their visible LinkedIn signals include ${skills}.`);
  if (projectHint) parts.push(`Recent proof points include ${projectHint}.`);
  parts.push('They fit the DevLabs builder graph as someone founders can evaluate by what they build, not just a resume headline.');
  return parts.join(' ').slice(0, 1200);
}

function addSet(target, pathName, values, reason) {
  const cleanValues = Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  if (!cleanValues.length) return;
  target.$addToSet[pathName] = { $each: cleanValues };
  target.reasons[pathName] = reason;
}

function pushEach(target, pathName, values, reason) {
  if (!values.length) return;
  target.$push[pathName] = { $each: values };
  target.reasons[pathName] = reason;
}

function setValue(target, pathName, value, reason) {
  if (value === undefined || value === null || value === '') return;
  target.$set[pathName] = value;
  target.reasons[pathName] = reason;
}

function decideWork(builder, extracted) {
  const gradYear = extracted.inferredGraduationYear || builder.graduationYear || null;
  const stillInCollege = Boolean(builder.currentStatus === 'student' || extracted.collegeSignal || (gradYear && gradYear >= CURRENT_YEAR));
  const graduatingSoon = Boolean(gradYear && gradYear >= CURRENT_YEAR && gradYear <= CURRENT_YEAR + 1);
  const current = extracted.currentExperience;
  const unavailable = Boolean(!stillInCollege && current?.offCampus && !current?.universityBased && !extracted.openSignal);
  const preferredWorkType = [];
  const hiringIntent = {};

  if (stillInCollege) {
    preferredWorkType.push('internship');
    hiringIntent.internship = true;
    if (graduatingSoon) {
      preferredWorkType.push('full_time');
      hiringIntent.fullTime = true;
    }
  } else {
    preferredWorkType.push('full_time');
    hiringIntent.fullTime = true;
  }

  return {
    gradYear,
    stillInCollege,
    graduatingSoon,
    availabilityAvailableNow: !unavailable,
    preferredWorkType,
    hiringIntent,
    reason: unavailable
      ? 'Graduated builder appears to have a current off-campus job and no open-to-work signal.'
      : 'Builder is still studying, university-affiliated, has no current off-campus job, or has an open-to-work/networking signal.',
  };
}

function buildProposedDiff(builder, extracted) {
  const proposed = { $set: {}, $addToSet: {}, $push: {}, reasons: {} };
  const skipped = [];

  if (!builder.headline && extracted.headline) setValue(proposed, 'headline', extracted.headline.slice(0, 120), 'LinkedIn headline fills empty BuilderProfile.headline.');
  else if (builder.headline) skipped.push({ field: 'headline', reason: 'Existing value present; not overwriting.' });

  if (!builder.bio) setValue(proposed, 'bio', buildBio(builder, extracted), 'Generated from LinkedIn because BuilderProfile.bio is empty.');
  else skipped.push({ field: 'bio', reason: 'Existing value present; not overwriting.' });

  if (!builder.photoUrl && extracted.cdpExtraction.photo.imageUrl) {
    setValue(proposed, 'photoUrl', extracted.cdpExtraction.photo.imageUrl, 'LinkedIn DOM profile image via Chrome CDP fills empty BuilderProfile.photoUrl.');
  } else if (builder.photoUrl) {
    skipped.push({ field: 'photoUrl', reason: 'Existing value present; not overwriting.' });
  } else {
    skipped.push({ field: 'photoUrl', reason: 'No likely LinkedIn profile photo found in DOM.' });
  }

  if (!builder.location && extracted.location) setValue(proposed, 'location', extracted.location, 'LinkedIn location fills empty BuilderProfile.location.');
  else if (builder.location) skipped.push({ field: 'location', reason: 'Existing value present; not overwriting.' });

  if (!builder.graduationYear && extracted.inferredGraduationYear) setValue(proposed, 'graduationYear', extracted.inferredGraduationYear, 'Inferred graduation year from LinkedIn education text.');
  else if (builder.graduationYear) skipped.push({ field: 'graduationYear', reason: 'Existing value present; not overwriting.' });

  if (!builder.universityOrCompany) {
    const school = extracted.education.find((line) => /university|college|school|asu/i.test(line));
    if (school) setValue(proposed, 'universityOrCompany', school.slice(0, 160), 'Inferred from LinkedIn education section.');
  } else {
    skipped.push({ field: 'universityOrCompany', reason: 'Existing value present; not overwriting.' });
  }

  const existingRoles = new Set((builder.rolePreference || []).map((role) => String(role).toLowerCase()));
  addSet(proposed, 'rolePreference', inferRolePreferences(extracted).filter((role) => !existingRoles.has(role.toLowerCase())), 'LinkedIn-derived role/skill labels; internship/full-time is intentionally excluded.');

  const work = decideWork(builder, extracted);
  const existingWorkTypes = new Set((builder.preferredWorkType || []).map((type) => String(type).toLowerCase()));
  addSet(proposed, 'preferredWorkType', work.preferredWorkType.filter((type) => !existingWorkTypes.has(type.toLowerCase())), 'Derived from college/graduation/current-experience rules.');

  const existingExperienceIds = new Set((builder.experiences || []).map((experience) => String(experience?.sourceId || '').toLowerCase()).filter(Boolean));
  const newExperiences = (extracted.experiences || []).filter((experience) => !existingExperienceIds.has(String(experience.sourceId || '').toLowerCase()));
  pushEach(proposed, 'experiences', newExperiences, 'LinkedIn experience cards extracted through Chrome CDP, including role, company, logo, dates, location, and description.');
  if (!newExperiences.length && extracted.experiences?.length) {
    skipped.push({ field: 'experiences', reason: 'All LinkedIn experience sourceIds already exist on the builder profile.' });
  } else if (!extracted.experiences?.length) {
    skipped.push({ field: 'experiences', reason: 'No structured LinkedIn experience cards were extracted from the DOM.' });
  }

  setValue(proposed, 'availability.remotePreference', 'remote', 'Remote is always proposed when enriching LinkedIn profiles.');
  setValue(proposed, 'availability.availableNow', work.availabilityAvailableNow, work.reason);
  setValue(proposed, 'availability.refreshedAt', new Date().toISOString(), 'Availability rule evaluated during LinkedIn dry run.');

  for (const [key, value] of Object.entries(work.hiringIntent)) {
    if (builder.hiringIntent?.[key] !== value) setValue(proposed, `hiringIntent.${key}`, value, 'Derived from college/graduation/current-experience rules.');
  }
  if (!builder.hiringIntent?.optedIn) setValue(proposed, 'hiringIntent.optedIn', true, 'LinkedIn enrichment found enough context to opt into builder matching review.');
  if (builder.links?.linkedin) skipped.push({ field: 'links.linkedin', reason: 'Existing LinkedIn URL present; not overwriting.' });

  if (!Object.keys(proposed.$set).length) delete proposed.$set;
  if (!Object.keys(proposed.$addToSet).length) delete proposed.$addToSet;
  if (!Object.keys(proposed.$push).length) delete proposed.$push;
  return { proposedMongoUpdate: proposed, skipped, workDecision: work };
}

function inferRolePreferences(extracted) {
  const text = `${extracted.headline || ''}\n${extracted.about || ''}\n${extracted.skills.join('\n')}`.toLowerCase();
  const roles = [];
  const checks = [
    ['Full-stack', /full[- ]stack|react.*node|node.*react/],
    ['Frontend', /front[- ]end|react|next\.?js|ui\/ux|typescript/],
    ['Backend', /back[- ]end|node|express|api|database|mongodb|postgres|sql/],
    ['AI/ML', /\b(ai|machine learning|ml|llm|openai|pytorch|tensorflow)\b/],
    ['Mobile', /\b(ios|android|react native|flutter|mobile)\b/],
    ['Product', /\b(product|founder|startup|strategy)\b/],
    ['Data', /\b(data|analytics|python|pandas|tableau)\b/],
  ];
  for (const [label, regex] of checks) if (regex.test(text)) roles.push(label);
  for (const skill of extracted.skills.slice(0, 8)) {
    if (!roles.some((role) => role.toLowerCase() === skill.toLowerCase())) roles.push(skill);
  }
  return roles.slice(0, 12);
}

async function processBuilder(builder, context, args) {
  const { dbName, collectionName } = context;
  const linkedInUrl = normalizeUrl(builder.links?.linkedin);
  if (!linkedInUrl) throw new Error(`Builder ${builder._id} does not have links.linkedin`);
  const builderId = String(builder._id);
  const outputPath = `${OUTPUT_DIR}/${builderId}.json`;

  if (args.resume && existsSync(outputPath)) {
    return {
      skippedExisting: true,
      outputPath,
      builderId,
      name: builder.name,
      linkedInUrl,
    };
  }

  const cdpExtraction = await extractLinkedInProfileViaCDP(linkedInUrl, builder, args.cdpUrl, args.waitMs);
  const extracted = extractLinkedInData(cdpExtraction.rawText, builder, cdpExtraction);
  const diff = buildProposedDiff(builder, extracted);
  const output = {
    mode: 'dry-run',
    wroteToMongo: false,
    generatedAt: new Date().toISOString(),
    source: {
      browser: 'Chrome CDP',
      linkedInUrl,
      cdpUrl: args.cdpUrl,
      pageClosed: cdpExtraction.pageClosed,
      browserDisconnected: cdpExtraction.browserDisconnected,
      dbName,
      collectionName,
    },
    builder: {
      _id: builderId,
      name: builder.name,
      email: builder.email,
      existingProfile: builder,
    },
    copiedLinkedInTextExcerpt: cdpExtraction.rawText.slice(0, 5000),
    extracted,
    ...diff,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  return {
    outputPath,
    builderId,
    name: builder.name,
    linkedInUrl,
    extractedTextLength: cdpExtraction.rawText.length,
    pageClosed: cdpExtraction.pageClosed,
    browserDisconnected: cdpExtraction.browserDisconnected,
    warnings: extracted.warnings,
    proposedSetFields: Object.keys(output.proposedMongoUpdate.$set || {}),
    proposedAddToSetFields: Object.keys(output.proposedMongoUpdate.$addToSet || {}),
    proposedPushFields: Object.keys(output.proposedMongoUpdate.$push || {}),
    extractedExperienceCount: extracted.experiences.length,
    skipped: output.skipped,
  };
}

async function processLinkedInUrl(args) {
  const linkedInUrl = normalizeUrl(args.linkedInUrl);
  if (!linkedInUrl) throw new Error('--linkedin-url must be a LinkedIn URL or URL-like value');

  const builder = {
    _id: args.outputKey || `linkedin-${compactKey(linkedInUrl) || Date.now()}`,
    name: args.profileName || 'LinkedIn user',
    email: args.email || null,
    headline: null,
    bio: null,
    photoUrl: null,
    phone: null,
    location: null,
    timezone: null,
    universityOrCompany: null,
    graduationYear: null,
    currentStatus: 'student',
    rolePreference: [],
    preferredWorkType: [],
    experiences: [],
    links: { linkedin: linkedInUrl },
    availability: {},
    hiringIntent: {},
    profileCompletion: {},
    profileQuality: {},
    verificationStatus: 'imported_unverified',
    visibilityStatus: 'matched_only',
    legacyRefs: [],
  };

  const cdpExtraction = await extractLinkedInProfileViaCDP(linkedInUrl, builder, args.cdpUrl, args.waitMs);
  const extracted = extractLinkedInData(cdpExtraction.rawText, builder, cdpExtraction);
  const diff = buildProposedDiff(builder, extracted);
  const output = {
    mode: 'dry-run',
    wroteToMongo: false,
    generatedAt: new Date().toISOString(),
    source: {
      browser: 'Chrome CDP',
      linkedInUrl,
      cdpUrl: args.cdpUrl,
      pageClosed: cdpExtraction.pageClosed,
      browserDisconnected: cdpExtraction.browserDisconnected,
      dbName: null,
      collectionName: null,
    },
    builder: {
      _id: String(builder._id),
      name: builder.name,
      email: builder.email,
      existingProfile: builder,
    },
    copiedLinkedInTextExcerpt: cdpExtraction.rawText.slice(0, 5000),
    extracted,
    ...diff,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = `${OUTPUT_DIR}/${builder._id}.json`;
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  return {
    outputPath,
    builderId: String(builder._id),
    name: builder.name,
    linkedInUrl,
    extractedTextLength: cdpExtraction.rawText.length,
    pageClosed: cdpExtraction.pageClosed,
    browserDisconnected: cdpExtraction.browserDisconnected,
    warnings: extracted.warnings,
    proposedSetFields: Object.keys(output.proposedMongoUpdate.$set || {}),
    proposedAddToSetFields: Object.keys(output.proposedMongoUpdate.$addToSet || {}),
    proposedPushFields: Object.keys(output.proposedMongoUpdate.$push || {}),
    extractedExperienceCount: extracted.experiences.length,
    skipped: output.skipped,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadLocalEnv();

  await mkdir(OUTPUT_DIR, { recursive: true });

  if (args.linkedInUrl) {
    const result = await processLinkedInUrl(args);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const uri = getMongoUri();
  if (!uri) throw new Error('Missing DEVLABS_MONGO_URI, ADMIN_MONGO_URI, or MONGODB_URI. Add it to .dev.vars, .env, or shell env.');

  if (args.all) {
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const runSummaryPath = `${OUTPUT_DIR}/run-${runId}.json`;
    const { dbName, collectionName, totalLinkedIn, builders } = fetchBuilders(uri, args);
    const run = {
      mode: 'dry-run',
      wroteToMongo: false,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      dbName,
      collectionName,
      totalLinkedIn,
      selectedCount: builders.length,
      offset: args.offset,
      limit: args.limit,
      waitMs: args.waitMs,
      delayMs: args.delayMs,
      resume: args.resume,
      processed: 0,
      skippedExisting: 0,
      succeeded: 0,
      failed: 0,
      warnings: 0,
      extractedExperiences: 0,
      results: [],
    };

    console.log(JSON.stringify({
      runSummaryPath,
      totalLinkedIn,
      selectedCount: builders.length,
      offset: args.offset,
      limit: args.limit,
      waitMs: args.waitMs,
      delayMs: args.delayMs,
      resume: args.resume,
    }));

    for (let index = 0; index < builders.length; index += 1) {
      const builder = builders[index];
      const position = args.offset + index + 1;
      let result;
      try {
        result = await processBuilder(builder, { dbName, collectionName }, args);
        run.processed += result.skippedExisting ? 0 : 1;
        run.skippedExisting += result.skippedExisting ? 1 : 0;
        run.succeeded += result.skippedExisting ? 0 : 1;
        run.warnings += result.warnings?.length ? 1 : 0;
        run.extractedExperiences += result.extractedExperienceCount || 0;
        run.results.push({
          position,
          builderId: result.builderId,
          name: result.name,
          outputPath: result.outputPath,
          skippedExisting: Boolean(result.skippedExisting),
          extractedTextLength: result.extractedTextLength || 0,
          extractedExperienceCount: result.extractedExperienceCount || 0,
          pageClosed: result.pageClosed ?? null,
          browserDisconnected: result.browserDisconnected ?? null,
          warnings: result.warnings || [],
          error: null,
        });
      } catch (error) {
        run.failed += 1;
        result = {
          builderId: String(builder._id),
          name: builder.name,
          error: error instanceof Error ? error.message : String(error),
        };
        run.results.push({
          position,
          builderId: result.builderId,
          name: result.name,
          outputPath: null,
          skippedExisting: false,
          extractedTextLength: 0,
          extractedExperienceCount: 0,
          pageClosed: null,
          browserDisconnected: null,
          warnings: [],
          error: result.error,
        });
      }

      await writeFile(runSummaryPath, `${JSON.stringify({ ...run, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({
        position,
        selectedCount: builders.length,
        builderId: result.builderId,
        name: result.name,
        skippedExisting: Boolean(result.skippedExisting),
        extractedExperienceCount: result.extractedExperienceCount || 0,
        warnings: result.warnings || [],
        error: result.error || null,
      }));

      if (index < builders.length - 1 && !result.skippedExisting) await sleep(args.delayMs);
    }

    run.finishedAt = new Date().toISOString();
    await writeFile(runSummaryPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      runSummaryPath,
      finishedAt: run.finishedAt,
      selectedCount: run.selectedCount,
      processed: run.processed,
      skippedExisting: run.skippedExisting,
      succeeded: run.succeeded,
      failed: run.failed,
      warnings: run.warnings,
      extractedExperiences: run.extractedExperiences,
    }, null, 2));
    return;
  }

  const { dbName, collectionName, builder } = fetchBuilder(uri, args);
  const result = await processBuilder(builder, { dbName, collectionName }, args);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
