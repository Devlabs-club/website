import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateActiveDurationMs,
  formatPeakHour,
  formatTokenCount,
  MAX_ACTIVE_GAP_MINUTES,
} from '../usageCollector.js';

test('estimateActiveDurationMs sums capped inter-event gaps', () => {
  const base = Date.parse('2026-01-01T12:00:00Z');
  const timestamps = [
    base,
    base + 5 * 60_000,
    base + 10 * 60_000,
    base + 40 * 60_000, // 30m gap -> capped at 15m
  ];
  const ms = estimateActiveDurationMs(timestamps);
  const expected = (5 + 5 + MAX_ACTIVE_GAP_MINUTES) * 60_000;
  assert.equal(ms, expected);
});

test('estimateActiveDurationMs caps a session at 4 hours', () => {
  const base = Date.parse('2026-01-01T08:00:00Z');
  const timestamps = [];
  for (let i = 0; i < 40; i += 1) {
    timestamps.push(base + i * 10 * 60_000); // 10m apart for ~6.5h wall
  }
  const ms = estimateActiveDurationMs(timestamps);
  assert.equal(ms, 4 * 3600 * 1000);
});

test('estimateActiveDurationMs returns one minute for a single event', () => {
  const ms = estimateActiveDurationMs([Date.parse('2026-01-01T12:00:00Z')]);
  assert.equal(ms, 60_000);
});

test('formatTokenCount uses compact labels', () => {
  assert.equal(formatTokenCount(2_000_000_000), '2B');
  assert.equal(formatTokenCount(351_100_000), '351.1M');
  assert.equal(formatTokenCount(12_400), '12.4K');
  assert.equal(formatTokenCount(42), '42');
});

test('formatPeakHour formats local-style labels', () => {
  assert.equal(formatPeakHour(13), '1:00 pm');
  assert.equal(formatPeakHour(0), '12:00 am');
  assert.equal(formatPeakHour(12), '12:00 pm');
});

test('generateReport attaches usage aggregates', async () => {
  const { generateReport } = await import('../../report/generateReport.js');
  const samples = [
    {
      agent: 'Claude Code',
      kind: 'session',
      isSessionFile: true,
      text: 'react typescript test lint fix patch ' + 'x'.repeat(500),
      timeRange: {
        startMs: Date.now() - 30 * 60_000,
        endMs: Date.now(),
        source: 'timestamps',
      },
      byteLength: 600,
      projectBucketId: 'p1',
    },
  ];
  const usage = {
    schemaVersion: 1,
    windowDays: 30,
    activeHours: {
      last30: 12.5,
      allTime: 404,
      longestSessionMinutes: 95,
      estimated: false,
      method: 'active_gap',
    },
    sessions: { last30: 20, allTime: 120 },
    tokens: {
      total: 2_000_000_000,
      work: 500_000_000,
      cache: 1_500_000_000,
      byAgent: [{ agent: 'Claude Code', total: 2_000_000_000, sessions: 120 }],
      cursorEstimated: false,
      retailCostUsd: 1200,
    },
    models: [{ id: 'Opus', percent: 47, sessions: 56 }],
    rhythm: {
      hourBuckets: Array.from({ length: 24 }, (_, i) => (i === 13 ? 40 : 2)),
      peakHour: 13,
      weekdayPct: 72,
      weekendPct: 28,
    },
    months: [{ ym: '2026-01', hours: 40, sessions: 30 }],
  };

  const report = generateReport({
    builderId: 'builder-1',
    builderName: 'dan',
    samples,
    usage,
    publicRoot: 'https://www.devlabs.club',
  });

  assert.equal(report.usage.activeHours.allTime, 404);
  assert.equal(report.timeInvested.totalHours, 404);
  assert.equal(report.timeInvested.last30Hours, 12.5);
  assert.equal(report.timeInvested.longestSessionMinutes, 95);
  assert.equal(report.timeInvested.method, 'active_gap');
  assert.equal(report.usage.tokens.total, 2_000_000_000);
  assert.equal(report.usage.models[0].id, 'Opus');
  assert.equal(report.usage.rhythm.peakHour, 13);
  assert.equal(report.localAnalysisVersion, '0.4.2');
  assert.match(report.sourceCoverage.confidenceNotes.join(' '), /Methodology/);
});
