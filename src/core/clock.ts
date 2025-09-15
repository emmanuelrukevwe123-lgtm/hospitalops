/**
 * Time is injected, never read from the ambient environment, so SLA windows,
 * certification expiries, and timestamps are reproducible under test.
 */
import type { ISODateString } from './types';

export interface Clock {
  /** Current time as a fresh `Date` (callers may mutate it safely). */
  now(): Date;
  /** Current time as an ISO-8601 string. */
  nowIso(): ISODateString;
}

/** Wall-clock implementation for production use. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): ISODateString {
    return this.now().toISOString();
  }
}

/**
 * Deterministic clock for tests. Starts at a fixed instant and only moves when
 * explicitly advanced, so behaviour around deadlines is exact.
 */
export class FixedClock implements Clock {
  private current: Date;

  constructor(start: Date | ISODateString = '2025-01-01T00:00:00.000Z') {
    this.current = FixedClock.coerce(start);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  nowIso(): ISODateString {
    return this.current.toISOString();
  }

  /** Move the clock forward by a number of milliseconds. */
  advance(ms: number): void {
    if (ms < 0) throw new RangeError('FixedClock.advance does not accept negative durations');
    this.current = new Date(this.current.getTime() + ms);
  }

  advanceSeconds(seconds: number): void {
    this.advance(seconds * 1_000);
  }

  advanceMinutes(minutes: number): void {
    this.advance(minutes * 60_000);
  }

  advanceHours(hours: number): void {
    this.advance(hours * 3_600_000);
  }

  advanceDays(days: number): void {
    this.advance(days * 86_400_000);
  }

  /** Jump to an absolute instant (forwards or backwards). */
  set(instant: Date | ISODateString): void {
    this.current = FixedClock.coerce(instant);
  }

  private static coerce(value: Date | ISODateString): Date {
    const date = typeof value === 'string' ? new Date(value) : new Date(value.getTime());
    if (Number.isNaN(date.getTime())) {
      throw new RangeError(`Invalid date passed to FixedClock: ${String(value)}`);
    }
    return date;
  }
}

const MS = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
} as const;

/** Whole minutes elapsed between two instants (floored, never negative). */
export const minutesBetween = (from: Date | ISODateString, to: Date | ISODateString): number => {
  const ms = instant(to) - instant(from);
  return Math.max(0, Math.floor(ms / MS.minute));
};

/** Add minutes to an instant and return an ISO string. */
export const addMinutes = (from: Date | ISODateString, minutes: number): ISODateString =>
  new Date(instant(from) + minutes * MS.minute).toISOString();

const instant = (value: Date | ISODateString): number =>
  typeof value === 'string' ? new Date(value).getTime() : value.getTime();
