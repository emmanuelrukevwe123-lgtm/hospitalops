import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepository } from '../src/storage/memoryStore';
import { FileRepository } from '../src/storage/fileStore';
import { AppError } from '../src/core/errors';
import type { Entity } from '../src/core/types';

interface Widget extends Entity {
  label: string;
  tags: string[];
}

const widget = (id: string, label: string, tags: string[] = []): Widget => ({
  id,
  label,
  tags,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
});

describe('InMemoryRepository', () => {
  it('saves and reads back by id', () => {
    const repo = new InMemoryRepository<Widget>('Widget');
    repo.save(widget('w1', 'first'));
    expect(repo.get('w1')?.label).toBe('first');
    expect(repo.count()).toBe(1);
  });

  it('require throws NOT_FOUND for missing ids', () => {
    const repo = new InMemoryRepository<Widget>('Widget');
    try {
      repo.require('nope');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('NOT_FOUND');
    }
  });

  it('does not leak internal references on read', () => {
    const repo = new InMemoryRepository<Widget>('Widget');
    repo.save(widget('w1', 'first', ['a']));
    const read = repo.require('w1');
    read.tags.push('mutated');
    read.label = 'changed';
    expect(repo.require('w1').tags).toEqual(['a']);
    expect(repo.require('w1').label).toBe('first');
  });

  it('does not capture references on write', () => {
    const repo = new InMemoryRepository<Widget>('Widget');
    const w = widget('w1', 'first', ['a']);
    repo.save(w);
    w.tags.push('after-save');
    expect(repo.require('w1').tags).toEqual(['a']);
  });

  it('find and findOne filter by predicate', () => {
    const repo = new InMemoryRepository<Widget>('Widget');
    repo.save(widget('w1', 'alpha', ['x']));
    repo.save(widget('w2', 'beta', ['y']));
    repo.save(widget('w3', 'gamma', ['x']));
    expect(repo.find((w) => w.tags.includes('x')).map((w) => w.id)).toEqual(['w1', 'w3']);
    expect(repo.findOne((w) => w.label === 'beta')?.id).toBe('w2');
    expect(repo.findOne((w) => w.label === 'missing')).toBeUndefined();
  });

  it('deletes and clears', () => {
    const repo = new InMemoryRepository<Widget>('Widget');
    repo.save(widget('w1', 'a'));
    repo.save(widget('w2', 'b'));
    expect(repo.delete('w1')).toBe(true);
    expect(repo.delete('w1')).toBe(false);
    expect(repo.count()).toBe(1);
    repo.clear();
    expect(repo.count()).toBe(0);
  });
});

describe('FileRepository', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hospitalops-store-'));
    path = join(dir, 'widgets.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists writes to disk as a JSON array', () => {
    const repo = new FileRepository<Widget>('Widget', path);
    repo.save(widget('w1', 'first', ['a']));
    const onDisk = JSON.parse(readFileSync(path, 'utf-8')) as Widget[];
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0]?.id).toBe('w1');
  });

  it('reloads state in a fresh instance', () => {
    const first = new FileRepository<Widget>('Widget', path);
    first.save(widget('w1', 'first'));
    first.save(widget('w2', 'second'));

    const reopened = new FileRepository<Widget>('Widget', path);
    expect(reopened.count()).toBe(2);
    expect(reopened.get('w2')?.label).toBe('second');
  });

  it('reflects deletes on disk', () => {
    const repo = new FileRepository<Widget>('Widget', path);
    repo.save(widget('w1', 'first'));
    repo.save(widget('w2', 'second'));
    repo.delete('w1');

    const reopened = new FileRepository<Widget>('Widget', path);
    expect(reopened.get('w1')).toBeUndefined();
    expect(reopened.count()).toBe(1);
  });
});
