import { describe, it, expect } from 'vitest';
import {
  SampleStatus,
  validateSampleStatusTransition,
  checkTATSLA,
  evaluateCriticalThresholds,
  runDeltaCheck,
  type LabSample,
} from '../src/clinical/lab';

describe('Lab & Diagnostics Module', () => {
  describe('validateSampleStatusTransition', () => {
    it('allows valid sample lifecycle transitions', () => {
      expect(() =>
        validateSampleStatusTransition(SampleStatus.Collected, SampleStatus.InTransit),
      ).not.toThrow();
      expect(() =>
        validateSampleStatusTransition(SampleStatus.Resulted, SampleStatus.Verified),
      ).not.toThrow();
    });

    it('throws error for invalid transitions', () => {
      expect(() =>
        validateSampleStatusTransition(SampleStatus.Collected, SampleStatus.Verified),
      ).toThrow();
      expect(() =>
        validateSampleStatusTransition(SampleStatus.Verified, SampleStatus.Collected),
      ).toThrow();
    });
  });

  describe('checkTATSLA', () => {
    const sample: LabSample = {
      id: 'sam_0001',
      createdAt: '2026-06-04T12:00:00.000Z',
      updatedAt: '2026-06-04T12:00:00.000Z',
      patientId: 'pat_0001',
      testType: 'Troponin',
      status: SampleStatus.Collected,
      collectedAt: '2026-06-04T12:00:00.000Z',
      criticalValueAlert: false,
      criticalValueAcknowledged: false,
      tatSLAThresholdMinutes: 60,
    };

    it('returns false if completed within SLA threshold', () => {
      const isBreached = checkTATSLA(sample, '2026-06-04T12:45:00.000Z');
      expect(isBreached).toBe(false);
    });

    it('returns true if completed after SLA threshold', () => {
      const isBreached = checkTATSLA(sample, '2026-06-04T13:05:00.000Z');
      expect(isBreached).toBe(true);
    });
  });

  describe('evaluateCriticalThresholds', () => {
    it('alerts for critical Troponin', () => {
      expect(evaluateCriticalThresholds('Troponin', { value: 0.01 })).toBe(false);
      expect(evaluateCriticalThresholds('Troponin', { value: 0.12 })).toBe(true);
    });

    it('alerts for critical Lactate', () => {
      expect(evaluateCriticalThresholds('Lactate', { value: 1.5 })).toBe(false);
      expect(evaluateCriticalThresholds('Lactate', { value: 3.2 })).toBe(true);
    });

    it('alerts for critical Potassium', () => {
      expect(evaluateCriticalThresholds('Potassium', { value: 4.0 })).toBe(false);
      expect(evaluateCriticalThresholds('Potassium', { value: 2.8 })).toBe(true);
      expect(evaluateCriticalThresholds('Potassium', { value: 6.5 })).toBe(true);
    });
  });

  describe('runDeltaCheck', () => {
    it('flags delta alert if variation is too high', () => {
      // Potassium delta threshold is 1.5
      expect(runDeltaCheck(5.5, 3.8, 1.5)).toBe(true);
      expect(runDeltaCheck(4.5, 3.8, 1.5)).toBe(false);
    });
  });
});
