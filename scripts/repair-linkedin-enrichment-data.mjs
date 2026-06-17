#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ARTIFACT_DIR = '.context/linkedin-enrichment';

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

function parseLinkedInProjects(artifact) {
  const lines = (artifact.extracted?.projects || [])
    .map((line) => String(line || '').trim().replace(/\s+/g, ' '))
    .filter((line) => line && !isProjectNoise(line));
  const builder = artifact.builder?.existingProfile || artifact.builder || {};
  const linkedIn = builder.links?.linkedin || artifact.source?.linkedInUrl;
  const projects = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const title = lines[i];
    if (!looksLikeProjectDate(lines[i + 1])) continue;
    let next = lines.length;
    for (let j = i + 2; j < lines.length - 1; j += 1) {
      if (looksLikeProjectDate(lines[j + 1])) {
        next = j;
        break;
      }
    }
    const body = lines.slice(i + 2, next);
    projects.push({
      sourceId: `linkedin:${compactKey(linkedIn || builder.name)}:project:${compactKey(title)}`,
      techStack: body.flatMap(parseTechStack)
        .filter((skill, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === skill.toLowerCase()) === index)
        .slice(0, 12),
    });
    i = next - 1;
  }
  return projects;
}

async function main() {
  await loadEnvFile('.dev.vars');
  await loadEnvFile('.env');
  const uri = getMongoUri();
  if (!uri) throw new Error('Missing DEVLABS_MONGO_URI, ADMIN_MONGO_URI, or MONGODB_URI.');

  const { MongoClient } = await importPackageFromRuntime('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));
  const builders = db.collection('builderprofiles');
  const projects = db.collection('projectrecords');

  const experienceResult = await builders.updateMany(
    { 'experiences.source': 'linkedin' },
    { $set: { 'experiences.$[experience].skills': [] } },
    { arrayFilters: [{ 'experience.source': 'linkedin' }] }
  );

  const files = (await readdir(ARTIFACT_DIR))
    .filter((file) => file.endsWith('.json') && !file.startsWith('run-') && !file.startsWith('apply-'))
    .sort();
  let projectUpdates = 0;
  for (const file of files) {
    const artifact = JSON.parse(await readFile(path.join(ARTIFACT_DIR, file), 'utf8'));
    for (const project of parseLinkedInProjects(artifact)) {
      const result = await projects.updateMany(
        { source: 'linkedin', sourceId: project.sourceId },
        { $set: { techStack: project.techStack } }
      );
      projectUpdates += result.modifiedCount;
    }
  }

  await client.close();
  const summary = {
    experienceDocumentsMatched: experienceResult.matchedCount,
    experienceDocumentsModified: experienceResult.modifiedCount,
    projectTechStackUpdates: projectUpdates,
    finishedAt: new Date().toISOString(),
  };
  const summaryPath = path.join(ARTIFACT_DIR, `repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ summaryPath, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
