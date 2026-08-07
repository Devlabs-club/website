import { experienceIsCurrent, sortExperiencesByRecency } from '@/lib/talent/experienceNormalize';

function plain<T = any>(value: T): T {
  return value && typeof (value as any).toObject === 'function' ? (value as any).toObject() : ({ ...(value as any) } as T);
}

function compact(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\bswe\b/g, 'software engineer')
    .replace(/\bsoftware engineering\b/g, 'software engineer')
    .replace(/\b(co\.|company|inc|llc|ltd|corp|corporation)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function roleKey(value: unknown) {
  const role = compact(value)
    .replace(/\binternship\b/g, 'intern')
    .replace(/\binterning\b/g, 'intern')
    .replace(/\bengineer intern\b/g, 'engineer intern')
    .replace(/\bengineering intern\b/g, 'engineer intern');
  if (/software engineer intern/.test(role)) return 'software engineer intern';
  if (/software engineer/.test(role)) return 'software engineer';
  return role;
}

function looksLikeLocationTitle(value: unknown) {
  return /\b(united states|remote|on site|on-site|hybrid|greater|area|california|arizona|new york|san francisco)\b/i.test(
    String(value || '')
  );
}

function inferTitleFromSourceId(value: unknown) {
  const text = compact(value);
  if (/software engineer intern/.test(text) || /software engineering intern/.test(text)) return 'Software Engineering Intern';
  if (/\bsde\b/.test(text)) return 'SDE';
  if (/co founder/.test(text)) return 'Co-Founder';
  return null;
}

function dateText(value: unknown) {
  return compact(value).replace(/\bpresent\b/g, 'current');
}

function years(value: unknown) {
  return new Set(Array.from(String(value || '').matchAll(/\b(20\d{2}|19\d{2})\b/g)).map((m) => m[1]));
}

function datesCompatible(a: any, b: any) {
  const aDate = dateText(a?.dateRange || `${a?.startDateLabel || ''} ${a?.endDateLabel || ''}`);
  const bDate = dateText(b?.dateRange || `${b?.startDateLabel || ''} ${b?.endDateLabel || ''}`);
  if (!aDate || !bDate) return true;
  if (aDate === bDate || aDate.includes(bDate) || bDate.includes(aDate)) return true;

  const aYears = years(aDate);
  const bYears = years(bDate);
  if (!aYears.size || !bYears.size) return false;
  return [...aYears].some((year) => bYears.has(year));
}

function pickString(current: unknown, incoming: unknown) {
  const a = typeof current === 'string' ? current.trim() : '';
  const b = typeof incoming === 'string' ? incoming.trim() : '';
  if (!a) return b || null;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function compactLogo(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function logoMatchesCompany(logoUrl: unknown, company: unknown) {
  const logo = compactLogo(logoUrl);
  const name = compactLogo(company);
  if (!logo || !name || name.length < 4) return false;
  return logo.includes(name) || name.includes(logo);
}

function pickCompanyLogo(current: unknown, incoming: unknown, company: unknown) {
  const a = typeof current === 'string' ? current.trim() : '';
  const b = typeof incoming === 'string' ? incoming.trim() : '';
  if (!a) return b || null;
  if (!b) return a;

  const aMatches = logoMatchesCompany(a, company);
  const bMatches = logoMatchesCompany(b, company);
  if (bMatches && !aMatches) return b;
  return pickString(a, b);
}

function pickTitle(current: unknown, incoming: unknown) {
  const a = typeof current === 'string' ? current.trim() : '';
  const b = typeof incoming === 'string' ? incoming.trim() : '';
  if (looksLikeLocationTitle(a) && b && !looksLikeLocationTitle(b)) return b;
  if (looksLikeLocationTitle(b) && a && !looksLikeLocationTitle(a)) return a;
  return pickString(a, b) || 'Builder';
}

export function mergeStringList(existing: unknown[] = [], incoming: unknown[] = []) {
  const byKey = new Map<string, string>();
  for (const value of [...existing, ...incoming]) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = compact(text);
    if (!byKey.has(key)) byKey.set(key, text);
  }
  return [...byKey.values()];
}

function normalizedExperience(raw: any, fallbackSource = 'imessage') {
  const entry = plain(raw || {});
  const inferredTitle = looksLikeLocationTitle(entry.title) ? inferTitleFromSourceId(entry.sourceId) : null;
  const title = inferredTitle || pickString(null, entry.title) || 'Builder';
  const company = pickString(null, entry.company) || 'Independent';
  return {
    ...entry,
    title,
    company,
    companyLogoUrl: pickString(null, entry.companyLogoUrl),
    companyLinkedInUrl: pickString(null, entry.companyLinkedInUrl),
    employmentType: pickString(null, entry.employmentType),
    location: pickString(null, entry.location),
    dateRange: pickString(null, entry.dateRange),
    startDateLabel: pickString(null, entry.startDateLabel),
    endDateLabel: pickString(null, entry.endDateLabel),
    duration: pickString(null, entry.duration),
    description: pickString(null, entry.description),
    builderContribution: pickString(null, entry.builderContribution, entry.description),
    skills: mergeStringList([], Array.isArray(entry.skills) ? entry.skills : []),
    isCurrent: Boolean(entry.isCurrent),
    source: pickString(null, entry.source) || fallbackSource,
    sourceId:
      pickString(null, entry.sourceId) ||
      `${fallbackSource}:${compact(company)}:${compact(title)}:${dateText(entry.dateRange) || 'unknown'}`,
    importedAt: entry.importedAt || new Date(),
  };
}

function sameExperience(a: any, b: any) {
  if (a?.sourceId && b?.sourceId && String(a.sourceId) === String(b.sourceId)) return true;
  const titleA = compact(a?.title);
  const titleB = compact(b?.title);
  const roleA = roleKey(a?.title);
  const roleB = roleKey(b?.title);
  const companyA = compact(a?.company);
  const companyB = compact(b?.company);
  if (!titleA || !titleB || !companyA || !companyB) return false;
  if (companyA !== companyB) return false;
  if (looksLikeLocationTitle(a?.title) || looksLikeLocationTitle(b?.title)) return true;
  if (roleA !== roleB && !roleA.includes(roleB) && !roleB.includes(roleA)) return false;
  return datesCompatible(a, b) || (roleA === roleB && /intern/.test(roleA));
}

function mergeExperience(a: any, b: any) {
  return {
    ...a,
    ...b,
    title: pickTitle(a.title, b.title),
    company: pickString(a.company, b.company) || 'Independent',
    companyLogoUrl: pickCompanyLogo(a.companyLogoUrl, b.companyLogoUrl, pickString(a.company, b.company)),
    companyLinkedInUrl: pickString(a.companyLinkedInUrl, b.companyLinkedInUrl),
    employmentType: pickString(a.employmentType, b.employmentType),
    location: pickString(a.location, b.location),
    dateRange: pickString(a.dateRange, b.dateRange),
    startDateLabel: pickString(a.startDateLabel, b.startDateLabel),
    endDateLabel: pickString(a.endDateLabel, b.endDateLabel),
    duration: pickString(a.duration, b.duration),
    description: pickString(a.description, b.description),
    builderContribution: pickString(a.builderContribution, b.builderContribution, a.description, b.description),
    skills: mergeStringList(a.skills || [], b.skills || []),
    isCurrent: Boolean(a.isCurrent || b.isCurrent),
    source: a.source || b.source || 'imessage',
    sourceId: a.sourceId || b.sourceId,
    importedAt: a.importedAt || b.importedAt || new Date(),
  };
}

export function mergeExperiences(existing: any[] = [], incoming: any[] = [], fallbackSource = 'imessage') {
  const merged: any[] = [];
  for (const raw of [...existing, ...incoming]) {
    if (!raw || (!raw.title && !raw.company)) continue;
    const next = normalizedExperience(raw, fallbackSource);
    next.isCurrent = experienceIsCurrent(next);
    const index = merged.findIndex((entry) => sameExperience(entry, next));
    if (index >= 0) merged[index] = mergeExperience(merged[index], next);
    else merged.push(next);
  }
  return sortExperiencesByRecency(merged).slice(0, 12);
}

export function dedupeBuilderProfileCollections(builder: any) {
  if (!builder) return false;
  let changed = false;
  const updateList = (field: string, limit?: number) => {
    const current = Array.isArray(builder[field]) ? builder[field] : [];
    const next = mergeStringList(current, []).slice(0, limit || current.length || 64);
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      builder[field] = next;
      changed = true;
    }
  };

  updateList('skills', 32);
  updateList('rolePreference', 24);
  updateList('preferredWorkType', 12);

  const currentExperiences = Array.isArray(builder.experiences) ? builder.experiences : [];
  const nextExperiences = mergeExperiences(currentExperiences, []);
  if (JSON.stringify(nextExperiences) !== JSON.stringify(currentExperiences.map((entry: any) => plain(entry)))) {
    builder.experiences = nextExperiences;
    changed = true;
  }

  return changed;
}

export function projectIdentityKey(project: any) {
  const links = project?.links || {};
  const link = links.github || links.devpost || links.demo || project?.sourceId || '';
  if (link) return `link:${String(link).trim().toLowerCase().replace(/\/$/, '')}`;
  return `name:${compact(project?.projectName)}`;
}

export function dedupeProjectsForDisplay(projects: any[] = []) {
  const byKey = new Map<string, any>();
  for (const raw of projects) {
    const project = plain(raw);
    const key = projectIdentityKey(project);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, project);
      continue;
    }
    byKey.set(key, {
      ...prev,
      ...project,
      description: pickString(prev.description, project.description),
      problemSolved: pickString(prev.problemSolved, project.problemSolved),
      builderContribution: pickString(prev.builderContribution, project.builderContribution),
      techStack: mergeStringList(prev.techStack || [], project.techStack || []),
      links: { ...(prev.links || {}), ...(project.links || {}) },
      confidence: Math.max(Number(prev.confidence || 0), Number(project.confidence || 0)),
    });
  }
  return [...byKey.values()];
}

export function normalizedProjectName(name: unknown) {
  return compact(name);
}
