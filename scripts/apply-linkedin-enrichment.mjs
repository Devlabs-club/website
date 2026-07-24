#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ARTIFACT_DIR = '.context/linkedin-enrichment';
const EMPTY_ONLY_FIELDS = new Set([
  'headline',
  'bio',
  'avatarUrl',
  'location',
  'graduationYear',
  'universityOrCompany',
  'links.linkedin',
  'links.github',
  'links.portfolio',
  'links.personalWebsite',
  'links.resume',
  'links.devpost',
]);

function parseArgs(argv) {
  const args = {
    artifactsDir: ARTIFACT_DIR,
    limit: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--artifacts-dir') args.artifactsDir = argv[++i];
    else if (arg.startsWith('--artifacts-dir=')) args.artifactsDir = arg.slice('--artifacts-dir='.length);
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive integer');
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

async function importPackageFromRuntime(packageName) {
  try {
    return await import(packageName);
  } catch (originalError) {
    const require = createRequire(import.meta.url);
    const moduleDirs = String(process.env.PATH || '')
      .split(path.delimiter)
      .filter((entry) => entry.endsWith(`${path.sep}node_modules${path.sep}.bin`))
      .map((entry) => path.dirname(entry));

    for (const modulesDir of moduleDirs) {
      try {
        const resolved = require.resolve(packageName, { paths: [modulesDir] });
        return await import(pathToFileURL(resolved).href);
      } catch {
        // Try the next npx/npm temp package root.
      }
    }
    throw originalError;
  }
}

function getPath(object, pathName) {
  return String(pathName || '')
    .split('.')
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizeDateValues(update) {
  const next = { ...update };
  if (next['availability.refreshedAt']) next['availability.refreshedAt'] = new Date(next['availability.refreshedAt']);
  return next;
}

function normalizeExperience(experience) {
  return {
    ...experience,
    importedAt: experience.importedAt ? new Date(experience.importedAt) : new Date(),
  };
}

function compactKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function looksLikeProjectDate(line) {
  return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20[0-4][0-9]\b/i.test(line) ||
    /\b20[0-4][0-9]\s*[–-]\s*(20[0-4][0-9]|present)\b/i.test(line);
}

function isProjectNoise(line) {
  return /^(projects?|other contributors?|show all|show more|see more|interests|licenses|certifications)$/i.test(String(line || '').trim()) ||
    /\.(png|jpe?g|gif|webp)$/i.test(String(line || '').trim());
}

function parseTechStack(line) {
  const value = String(line || '');
  if (!/\bskills?\b|•|\+\d+\s+skills?/i.test(value)) return [];
  return value
    .replace(/\s+and\s+\+\d+\s+skills?/gi, '')
    .split(/\s*[,\u2022]\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1 && item.length <= 60)
    .filter((item) => !/[.!?]/.test(item))
    .filter((item) => !/\+\d+\s+skills?/i.test(item))
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 12);
}

function pickProjectLinks(lines) {
  const urls = lines.flatMap((line) => Array.from(String(line || '').matchAll(/https?:\/\/[^\s)]+/g)).map((match) => match[0]));
  const links = {};
  for (const url of urls) {
    if (/github\.com/i.test(url) && !links.github) links.github = url;
    else if (/devpost\.com/i.test(url) && !links.devpost) links.devpost = url;
    else if (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) && !links.screenshots) links.screenshots = url;
    else if (!links.demo) links.demo = url;
  }
  return links;
}

function parseLinkedInProjects(artifact) {
  const lines = (artifact.extracted?.projects || [])
    .map((line) => String(line || '').trim().replace(/\s+/g, ' '))
    .filter((line) => line && !isProjectNoise(line));
  const builder = artifact.builder?.existingProfile || artifact.builder || {};
  const linkedIn = builder.links?.linkedin || artifact.source?.linkedInUrl || artifact.source?.linkedInUrl;
  const projects = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const title = lines[i];
    const dateLine = lines[i + 1];
    if (!title || !looksLikeProjectDate(dateLine)) continue;

    let next = lines.length;
    for (let j = i + 2; j < lines.length - 1; j += 1) {
      if (looksLikeProjectDate(lines[j + 1])) {
        next = j;
        break;
      }
    }

    const segment = lines.slice(i, next);
    const body = segment.slice(2);
    const description = body.find((line) => line.length > 40 && !parseTechStack(line).length && !/^https?:\/\//i.test(line)) || null;
    const techStack = body.flatMap(parseTechStack)
      .filter((skill, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === skill.toLowerCase()) === index)
      .slice(0, 12);
    const links = pickProjectLinks(body);
    const sourceId = `linkedin:${compactKey(linkedIn || builder.name)}:project:${compactKey(title)}`;

    projects.push({
      projectName: title.slice(0, 160),
      description: description ? description.slice(0, 1200) : null,
      techStack,
      links,
      source: 'linkedin',
      sourceId,
    });
    i = next - 1;
  }

  return projects.filter((project, index, arr) => {
    return arr.findIndex((candidate) => candidate.sourceId === project.sourceId) === index;
  });
}

async function listArtifacts(dir, limit) {
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.json') && !file.startsWith('run-') && !file.startsWith('apply-'))
    .sort();
  return limit ? files.slice(0, limit) : files;
}

async function applyBuilderUpdate({ builders, users, ObjectId, artifact, dryRun }) {
  const builderId = artifact.builder?._id || artifact.builder?.existingProfile?._id;
  if (!builderId) return { skipped: true, reason: 'missing builder id' };

  const builder = await builders.findOne({ _id: new ObjectId(String(builderId)) });
  if (!builder) return { skipped: true, reason: 'builder not found' };

  const proposed = artifact.proposedMongoUpdate || {};
  const proposedSet = { ...(proposed.$set || {}) };
  // Older CDP artifacts used a non-schema photoUrl field. Apply those images to
  // BuilderProfile.avatarUrl while retaining the empty-only guard below.
  if (!proposedSet.avatarUrl && proposedSet.photoUrl) {
    proposedSet.avatarUrl = proposedSet.photoUrl;
  }
  delete proposedSet.photoUrl;
  const set = {};
  for (const [field, value] of Object.entries(proposedSet)) {
    if (EMPTY_ONLY_FIELDS.has(field) && !isEmpty(getPath(builder, field))) continue;
    set[field] = value;
  }

  const update = {};
  if (Object.keys(set).length) update.$set = normalizeDateValues(set);

  const addToSet = {};
  for (const [field, value] of Object.entries(proposed.$addToSet || {})) {
    if (value?.$each?.length) addToSet[field] = { $each: value.$each };
  }
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;

  const incomingExperiences = proposed.$push?.experiences?.$each || [];
  const existingExperienceIds = new Set((builder.experiences || []).map((experience) => String(experience?.sourceId || '').toLowerCase()).filter(Boolean));
  const newExperiences = incomingExperiences
    .filter((experience) => !existingExperienceIds.has(String(experience.sourceId || '').toLowerCase()))
    .map(normalizeExperience);
  if (newExperiences.length) update.$push = { experiences: { $each: newExperiences } };

  if (!dryRun && Object.keys(update).length) {
    await builders.updateOne({ _id: builder._id }, update);
    if (set.avatarUrl && builder.email && users) {
      await users.updateOne(
        {
          email: String(builder.email).toLowerCase(),
          $or: [{ avatarUrl: null }, { avatarUrl: '' }, { avatarUrl: { $exists: false } }],
        },
        { $set: { avatarUrl: set.avatarUrl } }
      );
    }
  }

  return {
    skipped: false,
    setFields: Object.keys(update.$set || {}),
    addToSetFields: Object.keys(update.$addToSet || {}),
    experiencesAdded: newExperiences.length,
    changed: Object.keys(update).length > 0,
  };
}

async function applyProjects({ projectsCollection, ObjectId, artifact, dryRun }) {
  const builderId = artifact.builder?._id || artifact.builder?.existingProfile?._id;
  if (!builderId) return { parsed: 0, created: 0, updated: 0 };

  const builderObjectId = new ObjectId(String(builderId));
  const parsedProjects = parseLinkedInProjects(artifact);
  let created = 0;
  let updated = 0;

  for (const project of parsedProjects) {
    const existingBySource = await projectsCollection.findOne({ builderId: builderObjectId, sourceId: project.sourceId });
    const existing = existingBySource || await projectsCollection.findOne({
      builderId: builderObjectId,
      projectName: { $regex: `^${project.projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });

    if (!existing) {
      const doc = {
        builderId: builderObjectId,
        projectName: project.projectName,
        source: project.source,
        sourceId: project.sourceId,
      };
      if (project.description) doc.description = project.description;
      if (project.techStack.length) doc.techStack = project.techStack;
      if (Object.keys(project.links).length) doc.links = project.links;
      if (!dryRun) await projectsCollection.insertOne(doc);
      created += 1;
      continue;
    }

    const set = {};
    if (isEmpty(existing.description) && project.description) set.description = project.description;
    if (isEmpty(existing.sourceId)) set.sourceId = project.sourceId;
    if (isEmpty(existing.source)) set.source = project.source;
    for (const [key, value] of Object.entries(project.links)) {
      if (value && isEmpty(existing.links?.[key])) set[`links.${key}`] = value;
    }
    const existingStack = new Set((existing.techStack || []).map((skill) => String(skill).toLowerCase()));
    const newStack = project.techStack.filter((skill) => !existingStack.has(skill.toLowerCase()));
    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (newStack.length) update.$addToSet = { techStack: { $each: newStack } };
    if (Object.keys(update).length) {
      if (!dryRun) await projectsCollection.updateOne({ _id: existing._id }, update);
      updated += 1;
    }
  }

  return { parsed: parsedProjects.length, created, updated };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadLocalEnv();
  const uri = getMongoUri();
  if (!uri) throw new Error('Missing DEVLABS_MONGO_URI, ADMIN_MONGO_URI, or MONGODB_URI.');

  const { MongoClient, ObjectId } = await importPackageFromRuntime('mongodb');
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(getDbName(uri));
  const collectionNames = await db.listCollections({}, { nameOnly: true }).toArray();
  const hasLower = collectionNames.some((collection) => collection.name === 'builderprofiles');
  const builders = db.collection(hasLower ? 'builderprofiles' : 'builderProfiles');
  const hasUsers = collectionNames.some((collection) => collection.name === 'users');
  const users = hasUsers ? db.collection('users') : null;
  const projectsCollection = db.collection('projectrecords');
  const artifacts = await listArtifacts(args.artifactsDir, args.limit);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryPath = path.join(args.artifactsDir, `apply-${runId}.json`);
  const summary = {
    mode: args.dryRun ? 'dry-run' : 'apply',
    artifacts: artifacts.length,
    buildersChanged: 0,
    buildersSkipped: 0,
    setFields: {},
    addToSetFields: {},
    experiencesAdded: 0,
    projectsParsed: 0,
    projectsCreated: 0,
    projectsUpdated: 0,
    errors: [],
    results: [],
  };

  await mkdir(args.artifactsDir, { recursive: true });
  try {
    for (const file of artifacts) {
      try {
        const artifactPath = path.join(args.artifactsDir, file);
        const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
        const builderResult = await applyBuilderUpdate({ builders, users, ObjectId, artifact, dryRun: args.dryRun });
        const projectResult = await applyProjects({ projectsCollection, ObjectId, artifact, dryRun: args.dryRun });

        if (builderResult.skipped) summary.buildersSkipped += 1;
        else if (builderResult.changed) summary.buildersChanged += 1;
        for (const field of builderResult.setFields || []) summary.setFields[field] = (summary.setFields[field] || 0) + 1;
        for (const field of builderResult.addToSetFields || []) summary.addToSetFields[field] = (summary.addToSetFields[field] || 0) + 1;
        summary.experiencesAdded += builderResult.experiencesAdded || 0;
        summary.projectsParsed += projectResult.parsed;
        summary.projectsCreated += projectResult.created;
        summary.projectsUpdated += projectResult.updated;
        summary.results.push({
          file,
          builderId: artifact.builder?._id,
          name: artifact.builder?.name,
          builder: builderResult,
          projects: projectResult,
        });
      } catch (error) {
        summary.errors.push({ file, error: error instanceof Error ? error.message : String(error) });
      }
      await writeFile(summaryPath, `${JSON.stringify({ ...summary, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
    }
  } finally {
    await client.close();
  }

  await writeFile(summaryPath, `${JSON.stringify({ ...summary, finishedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ summaryPath, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
