import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  SystemClock,
  addMinutes,
  minutesBetween,
} from '../src/core/clock';

describe('FixedClock', () => {
  it('starts at its configured instant and stays put', () => {
    const clock = new FixedClock('2025-03-01T09:00:00.000Z');
    expect(clock.nowIso()).toBe('2025-03-01T09:00:00.000Z');
    // reading the time should not move it
    clock.now();
    clock.now();
    expect(clock.nowIso()).toBe('2025-03-01T09:00:00.000Z');
  });

  it('hands out independent Date copies', () => {
    const clock = new FixedClock('2025-03-01T09:00:00.000Z');
    const a = clock.now();
    a.setFullYear(1999);
    expect(clock.nowIso()).toBe('2025-03-01T09:00:00.000Z');
  });

  it('advances by the various units', () => {
    const clock = new FixedClock('2025-01-01T00:00:00.000Z');
    clock.advanceMinutes(30);
    expect(clock.nowIso()).toBe('2025-01-01T00:30:00.000Z');
    clock.advanceHours(2);
    expect(clock.nowIso()).toBe('2025-01-01T02:30:00.000Z');
    clock.advanceDays(1);
    expect(clock.nowIso()).toBe('2025-01-02T02:30:00.000Z');
  });

  it('rejects negative advances', () => {
    const clock = new FixedClock();
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });

  it('rejects invalid instants', () => {
    expect(() => new FixedClock('not-a-date')).toThrow(RangeError);
  });

  it('can jump to an absolute instant', () => {
    const clock = new FixedClock('2025-01-01T00:00:00.000Z');
    clock.set('2026-06-04T12:00:00.000Z');
    expect(clock.nowIso()).toBe('2026-06-04T12:00:00.000Z');
  });
});

describe('SystemClock', () => {
  it('reports a plausible current time', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const reading = clock.now().getTime();
    const after = Date.now();
    expect(reading).toBeGreaterThanOrEqual(before);
    expect(reading).toBeLessThanOrEqual(after);
  });
});

describe('duration helpers', () => {
  it('counts whole minutes between instants', () => {
    expect(
      minutesBetween('2025-01-01T08:00:00.000Z', '2025-01-01T08:45:30.000Z'),
    ).toBe(45);
  });

  it('never returns a negative duration', () => {
    expect(
      minutesBetween('2025-01-01T09:00:00.000Z', '2025-01-01T08:00:00.000Z'),
    ).toBe(0);
  });

  it('adds minutes and returns an ISO string', () => {
    expect(addMinutes('2025-01-01T08:00:00.000Z', 90)).toBe(
      '2025-01-01T09:30:00.000Z',
    );
  });
});
