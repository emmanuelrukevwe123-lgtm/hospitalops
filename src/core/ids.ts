/**
 * Identifier generation.
 *
 * IDs are prefixed by entity kind (`pat_`, `bed_`, …) so they are
 * self-describing in logs and audit trails. The generator is an interface so
 * tests can swap in a deterministic sequence.
 */
import { randomUUID } from 'node:crypto';

export interface IdGenerator {
  next(prefix: string): string;
}

/** Production generator backed by a random UUID. */
export class RandomIdGenerator implements IdGenerator {
  next(prefix: string): string {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    return `${prefix}_${suffix}`;
  }
}

/** Deterministic generator for tests: `pat_0001`, `pat_0002`, … per prefix. */
export class SequentialIdGenerator implements IdGenerator {
  private readonly counters = new Map<string, number>();

  constructor(private readonly pad: number = 4) {}

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(this.pad, '0')}`;
  }
}
