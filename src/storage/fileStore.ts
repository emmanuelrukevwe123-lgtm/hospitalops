/**
 * File-backed JSON repository.
 *
 * Each collection is one JSON file containing an array of entities. The file is
 * loaded once on construction and rewritten after every mutation. This is not
 * meant to scale — it exists so the demo app has durable state between runs
 * without pulling in a database.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BaseRepository } from './repository';
import type { Entity } from '../core/types';

export class FileRepository<T extends Entity> extends BaseRepository<T> {
  constructor(
    entityName: string,
    private readonly filePath: string,
  ) {
    super(entityName);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, 'utf-8').trim();
    if (raw === '') return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new TypeError(`${this.filePath} does not contain a JSON array`);
    }
    for (const entity of parsed as T[]) {
      this.items.set(entity.id, entity);
    }
  }

  protected override onChange(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const snapshot = [...this.items.values()];
    writeFileSync(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
  }
}
