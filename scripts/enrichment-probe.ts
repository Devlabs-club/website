#!/usr/bin/env bun
/**
 * Dry-run enrichment probes — inspect each source in isolation (no DB writes).
 *
 * Usage:
 *   bun run scripts/enrichment-probe.ts github --username dhanush17-tech --audit
 *   bun run scripts/enrichment-probe.ts linkedin --url "https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/"
 *   bun run scripts/enrichment-probe.ts devpost --url "https://devpost.com/software/..."
 *   bun run scripts/enrichment-probe.ts resume --url "https://example.com/resume.pdf"
 *   bun run scripts/enrichment-probe.ts portfolio --url "https://yoursite.dev"
 *   bun run scripts/enrichment-probe.ts twitter --url "https://x.com/handle"
 *   bun run scripts/enrichment-probe.ts link --url "https://example.com/project"
 *   bun run scripts/enrichment-probe.ts sample github_dhanush
 *   bun run scripts/enrichment-probe.ts batch --github dhanush17-tech --linkedin "https://linkedin.com/in/..."
 *
 * Env: OPENROUTER_*, GITHUB_TOKEN, TWITTER_BEARER_TOKEN, BRAVE_SEARCH_API_KEY, EXA (twitter fallback).
 */
import {
  runEnrichmentProbe,
  runEnrichmentProbeBatch,
  SAMPLE_PROBE_PROFILES,
  type EnrichmentProbeRequest,
} from '../src/lib/talent/builderEnrichment/probe';

await import('../src/lib/workerPolyfills');

function arg(flag: string) {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? null : process.argv[idx + 1] || null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

const command = process.argv[2] || 'help';

function printResult(label: string, result: Awaited<ReturnType<typeof runEnrichmentProbe>>) {
  console.log(`\n=== ${label} (${result.durationMs}ms) ===`);
  if (result.errors?.length) console.log('Errors:', result.errors.join(', '));
  console.log('Quality:', JSON.stringify(result.quality, null, 2));
  if (result.meta) console.log('Meta:', JSON.stringify(result.meta, null, 2));
  if (result.profile) {
    console.log('\nProfile fields:', JSON.stringify(result.profile, null, 2));
  }
  if (result.projects?.length) {
    console.log(`\nProjects (${result.projects.length}):`);
    for (const p of result.projects) {
      console.log(`\n• ${p.projectName} [${p.source}] confidence=${p.confidence ?? 'n/a'}`);
      if (p.description) console.log(`  desc: ${p.description.slice(0, 200)}`);
      if (p.builderContribution) console.log(`  contribution: ${p.builderContribution.slice(0, 160)}`);
      if (p.techStack?.length) console.log(`  stack: ${p.techStack.join(', ')}`);
      if (p.links) console.log(`  links:`, p.links);
    }
  }
}

async function main() {
  if (command === 'help' || command === '--help') {
    console.log(`Commands: github | linkedin | devpost | resume | portfolio | twitter | link | sample | batch`);
    console.log(`Samples: ${Object.keys(SAMPLE_PROBE_PROFILES).join(', ')}`);
    process.exit(0);
  }

  const name = arg('--name') || undefined;

  if (command === 'sample') {
    const key = process.argv[3];
    if (!key || !(key in SAMPLE_PROBE_PROFILES)) {
      console.error(`Usage: bun run scripts/enrichment-probe.ts sample <${Object.keys(SAMPLE_PROBE_PROFILES).join('|')}>`);
      process.exit(1);
    }
    const result = await runEnrichmentProbe(SAMPLE_PROBE_PROFILES[key as keyof typeof SAMPLE_PROBE_PROFILES]);
    printResult(key, result);
    if (hasFlag('--json')) console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'batch') {
    const probes: EnrichmentProbeRequest[] = [];
    const gh = arg('--github');
    const li = arg('--linkedin');
    const dp = arg('--devpost');
    const resume = arg('--resume');
    if (gh) probes.push({ source: 'github', githubUsername: gh, name, audit: hasFlag('--audit') });
    if (li) probes.push({ source: 'linkedin', url: li, name });
    if (dp) probes.push({ source: 'devpost', url: dp, name });
    if (resume) probes.push({ source: 'resume', url: resume, name });
    if (!probes.length) {
      console.error('batch needs at least one of --github --linkedin --devpost --resume');
      process.exit(1);
    }
    const batch = await runEnrichmentProbeBatch(probes);
    for (const result of batch.results) printResult(result.source, result);
    if (hasFlag('--json')) console.log(JSON.stringify(batch, null, 2));
    return;
  }

  const url = arg('--url') || undefined;
  const sourceMap: Record<string, EnrichmentProbeRequest['source']> = {
    github: 'github',
    linkedin: 'linkedin',
    devpost: 'devpost',
    resume: 'resume',
    portfolio: 'portfolio',
    twitter: 'twitter',
    link: 'generic_link',
  };

  const source = sourceMap[command];
  if (!source) {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  const result = await runEnrichmentProbe({
    source,
    name,
    url,
    githubUsername: arg('--username') || arg('--github') || undefined,
    audit: hasFlag('--audit'),
  });

  printResult(command, result);
  if (hasFlag('--json')) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
