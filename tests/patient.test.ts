import { describe, it, expect } from 'vitest';
import {
  TriageLevel,
  PatientState,
  calculatePriorityScore,
  getSLATargets,
  validateStateTransition,
} from '../src/clinical/patient';

describe('Patient Admission & Triage Module', () => {
  describe('calculatePriorityScore', () => {
    const now = new Date('2026-06-04T12:00:00.000Z');

    it('returns 0 for Deceased patient', () => {
      const score = calculatePriorityScore(TriageLevel.Deceased, '1980-01-01', [], now);
      expect(score).toBe(0);
    });

    it('calculates score with base triage levels', () => {
      const immediate = calculatePriorityScore(TriageLevel.Immediate, '1990-06-04', [], now);
      const urgent = calculatePriorityScore(TriageLevel.Urgent, '1990-06-04', [], now);
      const semiUrgent = calculatePriorityScore(TriageLevel.SemiUrgent, '1990-06-04', [], now);
      const nonUrgent = calculatePriorityScore(TriageLevel.NonUrgent, '1990-06-04', [], now);

      expect(immediate).toBe(100);
      expect(urgent).toBe(75);
      expect(semiUrgent).toBe(50);
      expect(nonUrgent).toBe(25);
    });

    it('adds points for risk age (>65)', () => {
      const elderlyScore = calculatePriorityScore(TriageLevel.Urgent, '1950-01-01', [], now);
      expect(elderlyScore).toBe(75 + 15);
    });

    it('adds points for risk age (<1)', () => {
      const infantScore = calculatePriorityScore(TriageLevel.Urgent, '2026-01-01', [], now);
      expect(infantScore).toBe(75 + 15);
    });

    it('adds points for comorbidity flags', () => {
      const score = calculatePriorityScore(TriageLevel.Urgent, '1990-06-04', ['Diabetes', 'Hypertension'], now);
      expect(score).toBe(75 + 20);
    });
  });

  describe('getSLATargets', () => {
    const triageTime = '2026-06-04T12:00:00.000Z';

    it('returns empty object for Deceased triage level', () => {
      expect(getSLATargets(TriageLevel.Deceased, triageTime)).toEqual({});
    });

    it('calculates correct SLAs for Immediate triage', () => {
      const targets = getSLATargets(TriageLevel.Immediate, triageTime);
      expect(targets.triageToDoctorSLA).toBe('2026-06-04T12:00:00.000Z');
      expect(targets.triageToBedSLA).toBe('2026-06-04T12:10:00.000Z');
    });

    it('calculates correct SLAs for Urgent triage', () => {
      const targets = getSLATargets(TriageLevel.Urgent, triageTime);
      expect(targets.triageToDoctorSLA).toBe('2026-06-04T12:15:00.000Z');
      expect(targets.triageToBedSLA).toBeUndefined();
    });
  });

  describe('validateStateTransition', () => {
    it('allows valid state transitions', () => {
      expect(() => validateStateTransition(PatientState.Registered, PatientState.Triaged)).not.toThrow();
      expect(() => validateStateTransition(PatientState.Triaged, PatientState.Admitted)).not.toThrow();
    });

    it('throws error for invalid state transitions', () => {
      expect(() => validateStateTransition(PatientState.Registered, PatientState.Admitted)).toThrow(
        /cannot move from 'Registered' to 'Admitted'/,
      );
      expect(() => validateStateTransition(PatientState.Discharged, PatientState.Registered)).toThrow();
    });
  });
});
