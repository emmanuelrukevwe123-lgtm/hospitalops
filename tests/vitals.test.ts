import { describe, it, expect } from 'vitest';
import {
  classifyVital,
  validateVitalValue,
  calculateNEWS2Score,
  newsBandFromScore,
  buildVitalSummary,
  checkVitalTrend,
  VitalType,
} from '../src/clinical/vitals';
import type { VitalReading } from '../src/clinical/vitals';
import { AppError } from '../src/core/errors';

function makeReading(
  id: string,
  patientId: string,
  type: VitalType,
  value: number,
  recordedAt: string,
): VitalReading {
  const { isAbnormal, isCritical } = classifyVital(type, value);
  return {
    id,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    patientId,
    encounterId: 'enc_001',
    vitalType: type,
    value,
    unit: 'bpm',
    recordedAt,
    recordedBy: 'nurse_001',
    isAbnormal,
    isCritical,
  };
}

describe('classifyVital', () => {
  it('marks normal heart rate as not abnormal', () => {
    const result = classifyVital(VitalType.HeartRate, 80);
    expect(result.isAbnormal).toBe(false);
    expect(result.isCritical).toBe(false);
  });

  it('marks tachycardia as abnormal', () => {
    const result = classifyVital(VitalType.HeartRate, 110);
    expect(result.isAbnormal).toBe(true);
    expect(result.isCritical).toBe(false);
  });

  it('marks very high HR as critical', () => {
    const result = classifyVital(VitalType.HeartRate, 160);
    expect(result.isCritical).toBe(true);
  });

  it('marks low SpO2 as critical', () => {
    const result = classifyVital(VitalType.SpO2, 85);
    expect(result.isCritical).toBe(true);
  });

  it('marks normal SpO2 as not abnormal', () => {
    const result = classifyVital(VitalType.SpO2, 98);
    expect(result.isAbnormal).toBe(false);
  });
});

describe('validateVitalValue', () => {
  it('accepts valid heart rate', () => {
    expect(() => validateVitalValue(VitalType.HeartRate, 80)).not.toThrow();
  });

  it('throws for impossible GCS of 2', () => {
    expect(() => validateVitalValue(VitalType.GlasgowComaScale, 2)).toThrow(AppError);
  });

  it('throws for SpO2 > 100', () => {
    expect(() => validateVitalValue(VitalType.SpO2, 101)).toThrow(AppError);
  });

  it('throws for negative heart rate', () => {
    expect(() => validateVitalValue(VitalType.HeartRate, -1)).toThrow(AppError);
  });

  it('throws for non-finite value', () => {
    expect(() => validateVitalValue(VitalType.Temperature, NaN)).toThrow(AppError);
  });
});

describe('calculateNEWS2Score', () => {
  it('returns 0 for all normal values', () => {
    const score = calculateNEWS2Score({
      RespiratoryRate: 16,
      SpO2: 98,
      BloodPressureSystolic: 120,
      HeartRate: 75,
      Temperature: 36.8,
      GlasgowComaScale: 15,
    });
    expect(score).toBe(0);
  });

  it('scores high respiratory rate correctly', () => {
    const score = calculateNEWS2Score({ RespiratoryRate: 32 });
    expect(score).toBe(3);
  });

  it('scores low SpO2 as 3', () => {
    const score = calculateNEWS2Score({ SpO2: 88 });
    expect(score).toBe(3);
  });

  it('adds points for multiple abnormalities', () => {
    const score = calculateNEWS2Score({
      RespiratoryRate: 28,  // >24 → +3
      SpO2: 92,             // 91-93 → +2
      HeartRate: 115,       // 111-130 → +2
    });
    expect(score).toBe(7);
  });

  it('scores reduced GCS as 3', () => {
    const score = calculateNEWS2Score({ GlasgowComaScale: 12 });
    expect(score).toBe(3);
  });

  it('handles empty readings with score 0', () => {
    expect(calculateNEWS2Score({})).toBe(0);
  });
});

describe('newsBandFromScore', () => {
  it('maps 0 to Low', () => expect(newsBandFromScore(0)).toBe('Low'));
  it('maps 4 to Moderate', () => expect(newsBandFromScore(4)).toBe('Moderate'));
  it('maps 5 to High', () => expect(newsBandFromScore(5)).toBe('High'));
  it('maps 7 to Critical', () => expect(newsBandFromScore(7)).toBe('Critical'));
  it('maps 12 to Critical', () => expect(newsBandFromScore(12)).toBe('Critical'));
});

describe('buildVitalSummary', () => {
  const patientId = 'pat_001';
  const readings: VitalReading[] = [
    makeReading('r1', patientId, VitalType.HeartRate, 80, '2026-01-01T08:00:00Z'),
    makeReading('r2', patientId, VitalType.HeartRate, 95, '2026-01-01T10:00:00Z'),
    makeReading('r3', patientId, VitalType.SpO2, 97, '2026-01-01T09:00:00Z'),
    makeReading('r4', 'pat_002', VitalType.HeartRate, 110, '2026-01-01T09:00:00Z'),
  ];

  it('returns the most recent reading per type', () => {
    const summary = buildVitalSummary(patientId, readings);
    expect(summary.latestReadings[VitalType.HeartRate]?.value).toBe(95);
  });

  it('only includes readings for the specified patient', () => {
    const summary = buildVitalSummary(patientId, readings);
    const hrReading = summary.latestReadings[VitalType.HeartRate];
    expect(hrReading?.patientId).toBe(patientId);
  });

  it('computes NEWS score', () => {
    const summary = buildVitalSummary(patientId, readings);
    expect(summary.newsScore).toBeGreaterThanOrEqual(0);
  });
});

describe('checkVitalTrend', () => {
  const makeReadings = (values: number[]): VitalReading[] =>
    values.map((v, i) =>
      makeReading(`r${i}`, 'pat_001', VitalType.HeartRate, v, `2026-01-01T${String(i).padStart(2, '0')}:00:00Z`),
    );

  it('detects rising trend', () => {
    const readings = makeReadings([60, 70, 80, 90, 100]);
    expect(checkVitalTrend(readings, VitalType.HeartRate, 5)).toBe('Rising');
  });

  it('detects falling trend', () => {
    const readings = makeReadings([100, 90, 80, 70, 60]);
    expect(checkVitalTrend(readings, VitalType.HeartRate, 5)).toBe('Falling');
  });

  it('returns Stable for a single reading', () => {
    const readings = makeReadings([75]);
    expect(checkVitalTrend(readings, VitalType.HeartRate, 5)).toBe('Stable');
  });

  it('returns Stable for minimal change', () => {
    const readings = makeReadings([75, 76, 75, 76]);
    expect(checkVitalTrend(readings, VitalType.HeartRate, 4)).toBe('Stable');
  });
});
