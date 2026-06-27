import { describe, expect, test } from 'bun:test';
import { canShowPostCallActions, hasCallSlotEnded, hasCallSlotStarted } from './callTiming';

describe('callTiming', () => {
  test('shows post-call actions after start time, before end', () => {
    const start = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    const entry = {
      callCompletedAt: null,
      confirmedCallStartAt: start,
      confirmedCallEndAt: end,
      callScheduleStatus: 'confirmed',
    };
    expect(hasCallSlotStarted(entry)).toBe(true);
    expect(hasCallSlotEnded(entry)).toBe(false);
    expect(canShowPostCallActions(entry, {})).toBe(true);
  });

  test('hides post-call actions before start time', () => {
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 90 * 60 * 1000).toISOString();
    const entry = {
      callCompletedAt: null,
      confirmedCallStartAt: start,
      confirmedCallEndAt: end,
      callScheduleStatus: 'confirmed',
    };
    expect(hasCallSlotStarted(entry)).toBe(false);
    expect(canShowPostCallActions(entry, {})).toBe(false);
  });
});
