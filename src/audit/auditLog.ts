/**
 * Audit trail.
 *
 * Mutating operations record an entry capturing who did what, when, why, and
 * the before/after state. Snapshots are deep-copied on the way in and on the
 * way out, so an entry is an immutable record of the moment it was written.
 */
import type { Clock } from '../core/clock';
import type { IdGenerator } from '../core/ids';
import type { ISODateString } from '../core/types';

export const AuditAction = {
  Create: 'Create',
  Update: 'Update',
  Delete: 'Delete',
  Approve: 'Approve',
  Reject: 'Reject',
  Escalate: 'Escalate',
  Override: 'Override',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly actorId: string;
  readonly actorRole: string;
  readonly timestamp: ISODateString;
  readonly reason: string | undefined;
  readonly before: unknown;
  readonly after: unknown;
}

export interface RecordInput {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId: string;
  actorRole: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: AuditAction;
  since?: ISODateString;
  until?: ISODateString;
}

export class AuditLog {
  private readonly entries: AuditEntry[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** Append an entry; returns a copy of what was recorded. */
  record(input: RecordInput): AuditEntry {
    const entry: AuditEntry = {
      id: this.ids.next('aud'),
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      timestamp: this.clock.nowIso(),
      reason: input.reason,
      before: input.before !== undefined ? structuredClone(input.before) : undefined,
      after: input.after !== undefined ? structuredClone(input.after) : undefined,
    };
    this.entries.push(entry);
    return structuredClone(entry);
  }

  /** Full history for a single entity, oldest first. */
  history(entityType: string, entityId: string): AuditEntry[] {
    return this.query({ entityType, entityId });
  }

  /** Everything a given actor did, oldest first. */
  byActor(actorId: string): AuditEntry[] {
    return this.query({ actorId });
  }

  /** Filtered investigation trail, oldest first. */
  query(filter: AuditQuery = {}): AuditEntry[] {
    return this.entries
      .filter((e) => matches(e, filter))
      .map((e) => structuredClone(e));
  }

  /** All entries, oldest first. */
  all(): AuditEntry[] {
    return this.entries.map((e) => structuredClone(e));
  }

  get size(): number {
    return this.entries.length;
  }
}

const matches = (entry: AuditEntry, filter: AuditQuery): boolean => {
  if (filter.entityType !== undefined && entry.entityType !== filter.entityType) return false;
  if (filter.entityId !== undefined && entry.entityId !== filter.entityId) return false;
  if (filter.actorId !== undefined && entry.actorId !== filter.actorId) return false;
  if (filter.action !== undefined && entry.action !== filter.action) return false;
  if (filter.since !== undefined && entry.timestamp < filter.since) return false;
  if (filter.until !== undefined && entry.timestamp > filter.until) return false;
  return true;
};
