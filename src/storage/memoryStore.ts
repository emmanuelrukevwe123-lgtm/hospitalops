/**
 * In-memory repository. The default store for tests: fast, isolated, and
 * discarded when the process exits.
 */
import { BaseRepository } from './repository';
import type { Entity } from '../core/types';

export class InMemoryRepository<T extends Entity> extends BaseRepository<T> {}
