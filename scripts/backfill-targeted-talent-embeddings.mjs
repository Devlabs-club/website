#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LINKEDIN_DIR = '.context/linkedin-enrichment';
const ATTACHMENT_PATH = '.context/attachments/mMirXh/pasted_text_2026-06-16_18-50-23.txt';
const OUTPUT_DIR = '.context/embedding-backfill';
const EMBEDDING_DIMENSIONS = 1536;

function parseArgs(argv) {
  const args = {
    linkedInDir: LINKEDIN_DIR,
    attachmentPath: ATTACHMENT_PATH,
    outputDir: OUTPUT_DIR,
    resumeSummary: null,
    resume: false,
    limit: null,
    delayMs: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--resume') args.resume = true;
    else if (arg === '--resume-summary') args.resumeSummary = argv[++i];
    else if (arg.startsWith('--resume-summary=')) args.resumeSummary = arg.slice('--resume-summary='.length);
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++i]);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number(arg.slice('--delay-ms='.length));
    else if (arg === '--attachment') args.attachmentPath = argv[++i];
    else if (arg.startsWith('--attachment=')) args.attachmentPath = arg.slice('--attachment='.length);
    else if (arg === '--linkedin-dir') args.linkedInDir = argv[++i];
    else if (arg.startsWith('--linkedin-dir=')) args.linkedInDir = arg.slice('--linkedin-dir='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) throw new Error('--delay-ms must be non-negative');
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectLinkedInBuilderIds(dir) {
  if (!existsSync(dir)) return new Set();
  const files = await readdir(dir);
  return new Set(
    files
      .filter((file) => file.endsWith('.json') && !file.startsWith('run-') && !file.startsWith('apply-') && !file.startsWith('repair-'))
      .map((file) => file.replace(/\.json$/, ''))
      .filter(Boolean)
  );
}

async function collectAttachedBuilderIds(filePath) {
  if (!existsSync(filePath)) return new Set();
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  return new Set((parsed.builders || []).map((builder) => String(builder.builderId || '').trim()).filter(Boolean));
}

function buildBuilderProfileText(builder, projects) {
  const parts = [];
  if (builder.name) parts.push(builder.name);
  if (builder.headline) parts.push(builder.headline);
  if (builder.bio) parts.push(String(builder.bio).slice(0, 400));
  if (builder.universityOrCompany) parts.push(`Background: ${builder.universityOrCompany}`);
  for (const education of (builder.education || []).slice(0, 4)) {
    const line = [education.school, education.degree, education.field].filter(Boolean).join(' — ');
    if (line) parts.push(`Education: ${line}`);
  }

  const roles = (builder.rolePreference || []).slice(0, 12).join(', ');
  if (roles) parts.push(`Skills: ${roles}`);

  for (const experience of (builder.experiences || []).slice(0, 5)) {
    const eParts = [];
    if (experience.title || experience.company) {
      eParts.push(`Experience: ${[experience.title, experience.company].filter(Boolean).join(' at ')}`);
    }
    if (experience.description) eParts.push(String(experience.description).slice(0, 220));
    if ((experience.skills || []).length) eParts.push(`Experience skills: ${experience.skills.slice(0, 6).join(', ')}`);
    if (eParts.length) parts.push(eParts.join('. '));
  }

  const rankedProjects = [...(projects || [])].sort((a, b) => {
    const score = (p) =>
      (p.builderContribution ? 2 : 0) +
      (p.description ? 1 : 0) +
      ((p.techStack || []).length > 0 ? 1 : 0);
    return score(b) - score(a);
  });

  for (const project of rankedProjects.slice(0, 5)) {
    const pParts = [];
    if (project.projectName) pParts.push(project.projectName);
    if (project.description) pParts.push(String(project.description).slice(0, 200));
    if (project.builderContribution) pParts.push(`Contribution: ${String(project.builderContribution).slice(0, 200)}`);
    if ((project.techStack || []).length) pParts.push(`Stack: ${project.techStack.slice(0, 8).join(', ')}`);
    if (project.problemSolved) pParts.push(`Problem: ${String(project.problemSolved).slice(0, 120)}`);
    if (pParts.length) parts.push(pParts.join('. '));
  }

  return parts.join('\n').slice(0, 3000);
}

function buildProjectText(project) {
  const parts = [];
  if (project.projectName) parts.push(project.projectName);
  if (project.description) parts.push(String(project.description).slice(0, 400));
  if (project.problemSolved) parts.push(String(project.problemSolved).slice(0, 200));
  if (project.builderContribution) parts.push(`Built: ${String(project.builderContribution).slice(0, 250)}`);
  if ((project.techStack || []).length) parts.push(`Stack: ${project.techStack.slice(0, 10).join(', ')}`);
  if ((project.contributionTags || []).length) parts.push(`Contribution: ${project.contributionTags.join(', ')}`);
  return parts.join('\n').slice(0, 2000);
}

function getEmbeddingModelName() {
  return process.env.OPENROUTER_API_KEY
    ? process.env.OPENROUTER_MODEL_EMBEDDING || 'openai/text-embedding-3-small'
    : 'text-embedding-3-small';
}

async function generateEmbedding(text) {
  if (!text.trim()) return null;
  if (process.env.OPENROUTER_API_KEY) {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
        ...(process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
      },
      body: JSON.stringify({
        model: getEmbeddingModelName(),
        input: text.slice(0, 8000),
        dimensions: EMBEDDING_DIMENSIONS,
        encoding_format: 'float',
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter embeddings failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;
    return Array.isArray(embedding) && embedding.length ? embedding : null;
  }

  if (process.env.OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000),
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI embeddings failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
    return data.data?.[0]?.embedding ?? null;
  }

  throw new Error('Missing OPENROUTER_API_KEY or OPENAI_API_KEY for embeddings.');
}

async function upsertEmbedding(collection, input) {
  const text = input.entityType === 'builder_profile'
    ? buildBuilderProfileText(input.builder, input.projects)
    : buildProjectText(input.project);
  if (!text.trim()) return { skipped: true, reason: 'empty text' };

  const embedding = await generateEmbedding(text);
  if (!embedding) return { skipped: true, reason: 'embedding unavailable' };
  const model = getEmbeddingModelName();
  await collection.updateOne(
    { entityType: input.entityType, entityId: input.entityId },
    {
      $set: {
        entityType: input.entityType,
        entityId: input.entityId,
        builderId: input.builderId,
        text,
        embedding,
        model,
        dimensions: embedding.length,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  return { skipped: false, dimensions: embedding.length, textLength: text.length };
}

async function latestSummaryPath(outputDir) {
  if (!existsSync(outputDir)) return null;
  const files = (await readdir(outputDir))
    .filter((file) => file.startsWith('targeted-') && file.endsWith('.json'))
    .sort()
    .reverse();
  return files[0] ? path.join(outputDir, files[0]) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadLocalEnv();
  const uri = getMongoUri();
  if (!uri) throw new Error('Missing DEVLABS_MONGO_URI, ADMIN_MONGO_URI, or MONGODB_URI.');
  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENROUTER_API_KEY or OPENAI_API_KEY for embeddings.');
  }

  await mkdir(args.outputDir, { recursive: true });
  const [linkedInIds, attachedIds] = await Promise.all([
    collectLinkedInBuilderIds(args.linkedInDir),
    collectAttachedBuilderIds(args.attachmentPath),
  ]);
  let targetIds = Array.from(new Set([...linkedInIds, ...attachedIds])).sort();
  if (args.limit) targetIds = targetIds.slice(0, args.limit);

  const summaryPath = args.resumeSummary || (args.resume ? await latestSummaryPath(args.outputDir) : null) ||
    path.join(args.outputDir, `targeted-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  let summary;
  if (args.resume && existsSync(summaryPath)) {
    summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    summary.resumedAt = new Date().toISOString();
  } else {
    summary = {
      mode: 'apply',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      sourceCounts: {
        linkedInScrapedBuilders: linkedInIds.size,
        attachedBuilders: attachedIds.size,
        overlap: Array.from(linkedInIds).filter((id) => attachedIds.has(id)).length,
        uniqueTargets: targetIds.length,
      },
      targetCount: targetIds.length,
      buildersProcessed: 0,
      buildersEmbedded: 0,
      projectsEmbedded: 0,
      buildersSkipped: 0,
      projectsSkipped: 0,
      errors: [],
      results: [],
    };
  }

  const completedBuilderIds = new Set((summary.results || []).filter((result) => result.done).map((result) => result.builderId));
  const { MongoClient, ObjectId } = await importPackageFromRuntime('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));
  const builders = db.collection('builderprofiles');
  const projects = db.collection('projectrecords');
  const embeddings = db.collection('talentembeddings');

  try {
    for (const builderId of targetIds) {
      if (completedBuilderIds.has(builderId)) continue;
      const result = {
        builderId,
        done: false,
        builderEmbedded: false,
        projectEmbeddings: 0,
        projectSkips: 0,
        errors: [],
      };
      try {
        const builder = await builders.findOne({ _id: new ObjectId(builderId) });
        if (!builder) {
          result.errors.push('builder not found');
          summary.buildersSkipped += 1;
        } else {
          const builderProjects = await projects.find({ builderId: builder._id }).toArray();
          const builderResult = await upsertEmbedding(embeddings, {
            entityType: 'builder_profile',
            entityId: builderId,
            builderId,
            builder,
            projects: builderProjects,
          });
          if (builderResult.skipped) {
            summary.buildersSkipped += 1;
            result.errors.push(`builder embedding skipped: ${builderResult.reason}`);
          } else {
            summary.buildersEmbedded += 1;
            result.builderEmbedded = true;
          }

          for (const project of builderProjects) {
            try {
              const projectResult = await upsertEmbedding(embeddings, {
                entityType: 'project',
                entityId: String(project._id),
                builderId,
                project,
              });
              if (projectResult.skipped) {
                summary.projectsSkipped += 1;
                result.projectSkips += 1;
              } else {
                summary.projectsEmbedded += 1;
                result.projectEmbeddings += 1;
              }
              if (args.delayMs) await sleep(args.delayMs);
            } catch (error) {
              summary.errors.push({ builderId, projectId: String(project._id), error: error instanceof Error ? error.message : String(error) });
              result.errors.push(`project ${project._id}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      } catch (error) {
        summary.errors.push({ builderId, error: error instanceof Error ? error.message : String(error) });
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
      result.done = true;
      summary.buildersProcessed += 1;
      summary.results.push(result);
      summary.updatedAt = new Date().toISOString();
      await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({
        builderId,
        buildersProcessed: summary.buildersProcessed,
        targetCount: summary.targetCount,
        builderEmbedded: result.builderEmbedded,
        projectEmbeddings: result.projectEmbeddings,
        errors: result.errors,
      }));
      if (args.delayMs) await sleep(args.delayMs);
    }
  } finally {
    await client.close();
  }

  summary.finishedAt = new Date().toISOString();
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    summaryPath,
    targetCount: summary.targetCount,
    buildersProcessed: summary.buildersProcessed,
    buildersEmbedded: summary.buildersEmbedded,
    projectsEmbedded: summary.projectsEmbedded,
    buildersSkipped: summary.buildersSkipped,
    projectsSkipped: summary.projectsSkipped,
    errorCount: summary.errors.length,
    finishedAt: summary.finishedAt,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
