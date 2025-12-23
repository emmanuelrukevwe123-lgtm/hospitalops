import { describe, it, expect } from 'vitest';
import { Department } from '../src/core/enums';
import {
  SeverityLevel,
  calculateRegulatoryDeadline,
  getOverdueIncidents,
  type SafetyIncident,
} from '../src/safety/safety';

describe('Patient Safety & Incident Reporting Module', () => {
  describe('calculateRegulatoryDeadline', () => {
    it('sets 24-hour deadline for Sentinel severity', () => {
      const deadline = calculateRegulatoryDeadline(SeverityLevel.Sentinel, '2026-06-04T12:00:00.000Z');
      expect(deadline).toBe('2026-06-05T12:00:00.000Z');
    });

    it('sets 7-day deadline for Serious severity', () => {
      const deadline = calculateRegulatoryDeadline(SeverityLevel.Serious, '2026-06-04T12:00:00.000Z');
      expect(deadline).toBe('2026-06-11T12:00:00.000Z');
    });

    it('returns undefined for other severities', () => {
      expect(
        calculateRegulatoryDeadline(SeverityLevel.Minor, '2026-06-04T12:00:00.000Z'),
      ).toBeUndefined();
    });
  });

  describe('getOverdueIncidents', () => {
    const baseIncident: SafetyIncident = {
      id: 'inc_0001',
      createdAt: '2026-06-04T12:00:00.000Z',
      updatedAt: '2026-06-04T12:00:00.000Z',
      title: 'Medication Error',
      eventType: 'AdverseEvent',
      severity: SeverityLevel.Sentinel,
      unit: Department.General,
      reportedBy: 'staff_0001',
      reportedAt: '2026-06-04T12:00:00.000Z',
      description: 'Wrong dosage of insulin',
      correctiveActions: [],
      regulatoryDeadline: '2026-06-05T12:00:00.000Z',
    };

    it('identifies overdue reporting if past deadline and not reported', () => {
      const futureNow = new Date('2026-06-05T13:00:00.000Z');
      const list = getOverdueIncidents([baseIncident], futureNow);
      expect(list).toContain('inc_0001');
    });

    it('does not identify as overdue if reported already', () => {
      const reported = {
        ...baseIncident,
        regulatoryReportedAt: '2026-06-05T11:00:00.000Z',
      };
      const futureNow = new Date('2026-06-05T13:00:00.000Z');
      const list = getOverdueIncidents([reported], futureNow);
      expect(list).not.toContain('inc_0001');
    });
  });
});
