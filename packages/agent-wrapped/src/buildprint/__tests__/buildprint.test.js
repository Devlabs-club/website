import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReport } from '../../report/generateReport.js';
import { buildBuildprint } from '../index.js';

function makeSample({
  agent = 'Claude Code',
  kind = 'session/export summaries',
  text,
  minutes = 30,
  projectBucketId = 'proj-a',
  isSessionFile = true,
}) {
  const endMs = Date.now();
  return {
    agent,
    kind,
    isSessionFile,
    text,
    timeRange: {
      startMs: endMs - minutes * 60_000,
      endMs,
      source: 'timestamps',
    },
    byteLength: text.length,
    projectBucketId,
  };
}

function pad(text, min = 4200) {
  if (text.length >= min) return text;
  return text + `\n${'context note. '.repeat(Math.ceil((min - text.length) / 14))}`;
}

function frontendPrototypeCorpus() {
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(
      makeSample({
        minutes: 25,
        projectBucketId: i < 4 ? 'fe-1' : 'fe-2',
        text: pad(
          `react component page route ui frontend tailwind feature prototype ship iterate retry fix patch debug test lint`
        ),
      })
    );
  }
  return samples;
}

function infraReliabilityCorpus() {
  const samples = [];
  for (let i = 0; i < 10; i++) {
    samples.push(
      makeSample({
        minutes: 40,
        projectBucketId: `sys-${i % 3}`,
        text: pad(
          `api server backend database postgres schema migration docker deploy vercel ci test lint typecheck verify pytest error failed exception fix patch debug resolve rerun`
        ),
      })
    );
  }
  return samples;
}

function fullStackProductCorpus() {
  const samples = [];
  for (let i = 0; i < 12; i++) {
    samples.push(
      makeSample({
        minutes: 35,
        projectBucketId: `fs-${i % 4}`,
        text: pad(
          `react page route ui frontend feature product ship api server backend auth endpoint database prisma postgres test lint typecheck verify build iterate fix patch`
        ),
      })
    );
  }
  samples.push(
    makeSample({
      agent: 'Codex',
      kind: 'agent instructions',
      isSessionFile: false,
      minutes: 5,
      projectBucketId: 'ctx',
      text: pad('agents.md rules instructions context plan approach architecture spec'),
    })
  );
  return samples;
}

function contextHeavyCorpus() {
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(
      makeSample({
        minutes: 30,
        projectBucketId: `ctx-${i % 2}`,
        text: pad(
          `plan approach architecture spec todo step context agents.md claude.md rules instructions readme docs comment implement react api test verify`
        ),
      })
    );
  }
  samples.push(
    makeSample({
      agent: 'Codex',
      kind: 'agent instructions',
      isSessionFile: false,
      projectBucketId: 'agents',
      text: pad('AGENTS.md project instructions and rules for the coding agent.'),
    })
  );
  return samples;
}

function lowEvidenceCorpus() {
  return [
    makeSample({
      minutes: 10,
      text: pad('hello world small note', 500),
      isSessionFile: true,
    }),
  ];
}

function keywordSpamCorpus() {
  const spam = 'plan plan plan plan architecture architecture todo todo step step '.repeat(200);
  return [
    makeSample({
      minutes: 12,
      text: pad(spam, 5000),
      projectBucketId: 'spam',
    }),
  ];
}

test('frontend prototype corpus leans Prototype Sprinter or Product Shipper', () => {
  const { buildprint } = buildBuildprint({ samples: frontendPrototypeCorpus() });
  const ids = buildprint.earnedIdentities.map((item) => item.id);
  assert.ok(ids.length > 0, 'should earn at least one identity');
  assert.ok(
    ids.includes('prototype_sprinter') || ids.includes('product_shipper') || ids.includes('debugging_closer'),
    `unexpected identities: ${ids.join(',')}`
  );
  assert.ok(!ids.includes('systems_builder'));
  assert.ok(!ids.includes('agent_orchestrator'));
});

test('infra reliability corpus earns Systems or Reliability', () => {
  const { buildprint } = buildBuildprint({ samples: infraReliabilityCorpus() });
  const ids = buildprint.earnedIdentities.map((item) => item.id);
  assert.ok(ids.includes('systems_builder') || ids.includes('reliability_builder') || ids.includes('debugging_closer'));
  assert.ok(!ids.includes('prototype_sprinter'));
});

test('full-stack product corpus earns Product Shipper or Full-Stack Owner', () => {
  const { buildprint } = buildBuildprint({ samples: fullStackProductCorpus() });
  const ids = buildprint.earnedIdentities.map((item) => item.id);
  assert.ok(ids.includes('product_shipper') || ids.includes('full_stack_owner'), ids.join(','));
});

test('context corpus can earn Context Architect; never Agent Orchestrator in MVP', () => {
  const { buildprint } = buildBuildprint({ samples: contextHeavyCorpus() });
  const ids = buildprint.earnedIdentities.map((item) => item.id);
  assert.ok(!ids.includes('agent_orchestrator'));
  if (ids.length) {
    assert.ok(ids.includes('context_architect') || ids.includes('product_shipper') || ids.includes('full_stack_owner'));
  }
});

test('low evidence does not award identities', () => {
  const { buildprint } = buildBuildprint({ samples: lowEvidenceCorpus() });
  assert.equal(buildprint.earnedIdentities.length, 0);
  assert.ok(buildprint.forming);
  assert.equal(buildprint.evidenceStrength, 'emerging');
});

test('keyword spam alone does not award verified identities', () => {
  const { buildprint, signals } = buildBuildprint({ samples: keywordSpamCorpus() });
  assert.equal(buildprint.earnedIdentities.length, 0);
  assert.ok(signals.planningQuality <= 100);
  assert.ok(buildprint.evidenceStrength === 'emerging' || buildprint.confidence === 'low');
});

test('generateReport includes buildprint and no hardcoded bestFitRoles', () => {
  const report = generateReport({
    builderId: 'builder1',
    builderName: 'test',
    samples: fullStackProductCorpus(),
    publicRoot: 'https://www.devlabs.club',
  });
  assert.ok(report.buildprint);
  assert.deepEqual(report.founderRead.bestFitRoles, []);
  assert.equal(report.percentile, undefined);
  assert.ok(report.buildprint.methodologyVersion.includes('buildprint'));
  for (const identity of report.buildprint.earnedIdentities) {
    assert.match(identity.proofStatement, /session/i);
    assert.doesNotMatch(identity.proofStatement, /82% of meaningful changes/);
  }
});

test('different corpora produce different primary identities', () => {
  const a = buildBuildprint({ samples: frontendPrototypeCorpus() }).buildprint.primaryIdentityId;
  const b = buildBuildprint({ samples: infraReliabilityCorpus() }).buildprint.primaryIdentityId;
  assert.ok(a || b);
  if (a && b) assert.notEqual(a, b);
});
