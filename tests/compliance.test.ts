import { describe, it, expect } from 'vitest';
import {
  PolicyStatus,
  RemediationStatus,
  validatePolicyStatusTransition,
  validateRemediationStatusTransition,
  checkEscalations,
  type RemediationTask,
} from '../src/compliance/compliance';

describe('Compliance & Accreditation Module', () => {
  describe('validatePolicyStatusTransition', () => {
    it('allows valid policy transitions', () => {
      expect(() => validatePolicyStatusTransition(PolicyStatus.Draft, PolicyStatus.UnderReview)).not.toThrow();
      expect(() => validatePolicyStatusTransition(PolicyStatus.Approved, PolicyStatus.Retired)).not.toThrow();
    });

    it('throws error for invalid policy transitions', () => {
      expect(() => validatePolicyStatusTransition(PolicyStatus.Draft, PolicyStatus.Approved)).toThrow();
    });
  });

  describe('validateRemediationStatusTransition', () => {
    it('allows valid task transitions', () => {
      expect(() =>
        validateRemediationStatusTransition(RemediationStatus.Open, RemediationStatus.Planned),
      ).not.toThrow();
      expect(() =>
        validateRemediationStatusTransition(RemediationStatus.Completed, RemediationStatus.Verified),
      ).not.toThrow();
    });

    it('throws error for invalid task transitions', () => {
      expect(() =>
        validateRemediationStatusTransition(RemediationStatus.Open, RemediationStatus.Completed),
      ).toThrow();
    });
  });

  describe('checkEscalations', () => {
    const tasks: RemediationTask[] = [
      {
        id: 'task_0001',
        createdAt: '2026-06-04T12:00:00.000Z',
        updatedAt: '2026-06-04T12:00:00.000Z',
        standardCode: 'JCI-IPSG.01',
        title: 'Patient Identification Policy',
        severity: 'High',
        status: RemediationStatus.InProgress,
        assigneeId: 'staff_0001',
        dueDate: '2026-06-04T10:00:00.000Z', // Past due
        escalated: false,
      },
      {
        id: 'task_0002',
        createdAt: '2026-06-04T12:00:00.000Z',
        updatedAt: '2026-06-04T12:00:00.000Z',
        standardCode: 'JCI-IPSG.02',
        title: 'Verbal Order Safety',
        severity: 'Medium',
        status: RemediationStatus.Completed,
        assigneeId: 'staff_0001',
        dueDate: '2026-06-04T10:00:00.000Z', // Past due but completed
        escalated: false,
      },
    ];

    it('escalates past due uncompleted tasks', () => {
      const now = new Date('2026-06-04T12:00:00.000Z');
      const updated = checkEscalations(tasks, now);
      expect(updated[0]?.escalated).toBe(true);
      expect(updated[1]?.escalated).toBe(false);
    });
  });
});
