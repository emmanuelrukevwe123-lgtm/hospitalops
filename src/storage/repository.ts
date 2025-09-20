/**
 * Storage abstraction.
 *
 * Modules talk to a `Repository<T>` and never to a concrete store, so the same
 * code runs against the in-memory store in tests and the file-backed store in
 * the demo app. Reads and writes are deep-copied at the boundary so a caller
 * can never mutate stored state by holding a reference to it.
 */
import { notFound } from '../core/errors';
import type { Entity } from '../core/types';

export interface Repository<T extends Entity> {
  /** Return a copy of the entity, or `undefined` if absent. */
  get(id: string): T | undefined;
  /** Like `get`, but throws `NOT_FOUND` when absent. */
  require(id: string): T;
  /** All entities, as copies. */
  getAll(): T[];
  /** Entities matching a predicate, as copies. */
  find(predicate: (entity: T) => boolean): T[];
  /** First entity matching a predicate, or `undefined`. */
  findOne(predicate: (entity: T) => boolean): T | undefined;
  /** Insert or replace; returns a copy of what was stored. */
  save(entity: T): T;
  /** Remove by id; returns whether anything was removed. */
  delete(id: string): boolean;
  /** Remove everything. */
  clear(): void;
  /** Number of stored entities. */
  count(): number;
}

/**
 * Shared map-backed implementation. Subclasses provide persistence by
 * overriding `onChange`, which fires after every mutation.
 */
export abstract class BaseRepository<T extends Entity> implements Repository<T> {
  protected readonly items = new Map<string, T>();

  constructor(protected readonly entityName: string) {}

  protected onChange(): void {
    // no-op by default
  }

  get(id: string): T | undefined {
    const found = this.items.get(id);
    return found ? clone(found) : undefined;
  }

  require(id: string): T {
    const found = this.get(id);
    if (!found) throw notFound(this.entityName, id);
    return found;
  }

  getAll(): T[] {
    return [...this.items.values()].map(clone);
  }

  find(predicate: (entity: T) => boolean): T[] {
    return this.getAll().filter(predicate);
  }

  findOne(predicate: (entity: T) => boolean): T | undefined {
    for (const item of this.items.values()) {
      if (predicate(item)) return clone(item);
    }
    return undefined;
  }

  save(entity: T): T {
    this.items.set(entity.id, clone(entity));
    this.onChange();
    return this.require(entity.id);
  }

  delete(id: string): boolean {
    const removed = this.items.delete(id);
    if (removed) this.onChange();
    return removed;
  }

  clear(): void {
    if (this.items.size === 0) return;
    this.items.clear();
    this.onChange();
  }

  count(): number {
    return this.items.size;
  }
}

const clone = <T>(value: T): T => structuredClone(value);
