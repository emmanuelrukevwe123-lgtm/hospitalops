import { beforeEach, describe, expect, it } from 'vitest';
import { AuditAction, AuditLog } from '../src/audit/auditLog';
import { FixedClock } from '../src/core/clock';
import { SequentialIdGenerator } from '../src/core/ids';

const setup = () => {
  const clock = new FixedClock('2025-02-01T08:00:00.000Z');
  const log = new AuditLog(clock, new SequentialIdGenerator());
  return { clock, log };
};

describe('AuditLog', () => {
  let clock: FixedClock;
  let log: AuditLog;

  beforeEach(() => {
    ({ clock, log } = setup());
  });

  it('stamps entries with the current time and a generated id', () => {
    const entry = log.record({
      entityType: 'Patient',
      entityId: 'pat_0001',
      action: AuditAction.Create,
      actorId: 'usr_1',
      actorRole: 'Nurse',
    });
    expect(entry.id).toBe('aud_0001');
    expect(entry.timestamp).toBe('2025-02-01T08:00:00.000Z');
    expect(entry.reason).toBeUndefined();
  });

  it('freezes before/after snapshots against later mutation', () => {
    const before = { status: 'Registered' };
    const after = { status: 'Triaged' };
    log.record({
      entityType: 'Patient',
      entityId: 'pat_0001',
      action: AuditAction.Update,
      actorId: 'usr_1',
      actorRole: 'Nurse',
      reason: 'triage completed',
      before,
      after,
    });

    // mutating the originals must not affect the stored snapshot
    after.status = 'Discharged';

    const [entry] = log.history('Patient', 'pat_0001');
    expect(entry?.after).toEqual({ status: 'Triaged' });
    expect(entry?.reason).toBe('triage completed');
  });

  it('returns entity history in chronological order', () => {
    log.record({
      entityType: 'Patient',
      entityId: 'pat_0001',
      action: AuditAction.Create,
      actorId: 'usr_1',
      actorRole: 'Nurse',
    });
    clock.advanceMinutes(15);
    log.record({
      entityType: 'Patient',
      entityId: 'pat_0001',
      action: AuditAction.Update,
      actorId: 'usr_2',
      actorRole: 'Clinician',
    });

    const history = log.history('Patient', 'pat_0001');
    expect(history.map((e) => e.action)).toEqual([AuditAction.Create, AuditAction.Update]);
    expect(history[1]?.timestamp).toBe('2025-02-01T08:15:00.000Z');
  });

  it('isolates history by entity', () => {
    log.record({
      entityType: 'Patient',
      entityId: 'pat_0001',
      action: AuditAction.Create,
      actorId: 'usr_1',
      actorRole: 'Nurse',
    });
    log.record({
      entityType: 'Patient',
      entityId: 'pat_0002',
      action: AuditAction.Create,
      actorId: 'usr_1',
      actorRole: 'Nurse',
    });
    expect(log.history('Patient', 'pat_0001')).toHaveLength(1);
  });

  it('queries by actor and by action', () => {
    log.record({
      entityType: 'Order',
      entityId: 'ord_1',
      action: AuditAction.Create,
      actorId: 'usr_9',
      actorRole: 'Clinician',
    });
    clock.advanceMinutes(5);
    log.record({
      entityType: 'Order',
      entityId: 'ord_1',
      action: AuditAction.Override,
      actorId: 'usr_3',
      actorRole: 'ChiefMedicalOfficer',
    });

    expect(log.byActor('usr_9')).toHaveLength(1);
    expect(log.query({ action: AuditAction.Override })).toHaveLength(1);
    expect(log.size).toBe(2);
  });

  it('filters by time window', () => {
    log.record({
      entityType: 'Order',
      entityId: 'ord_1',
      action: AuditAction.Create,
      actorId: 'usr_9',
      actorRole: 'Clinician',
    });
    clock.advanceHours(2);
    log.record({
      entityType: 'Order',
      entityId: 'ord_1',
      action: AuditAction.Update,
      actorId: 'usr_9',
      actorRole: 'Clinician',
    });

    const windowed = log.query({ since: '2025-02-01T09:00:00.000Z' });
    expect(windowed).toHaveLength(1);
    expect(windowed[0]?.action).toBe(AuditAction.Update);
  });
});
