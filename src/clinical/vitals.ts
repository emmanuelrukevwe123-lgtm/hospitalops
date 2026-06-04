import type { Entity, ISODateString } from '../core/types';
import { preconditionFailed, validation } from '../core/errors';
import type { RiskBand } from '../core/enums';

export const VitalType = {
  HeartRate: 'HeartRate',
  BloodPressureSystolic: 'BloodPressureSystolic',
  BloodPressureDiastolic: 'BloodPressureDiastolic',
  MeanArterialPressure: 'MeanArterialPressure',
  Temperature: 'Temperature',
  RespiratoryRate: 'RespiratoryRate',
  SpO2: 'SpO2',
  GlasgowComaScale: 'GlasgowComaScale',
  BloodGlucose: 'BloodGlucose',
  PainScore: 'PainScore',
  UrinaryOutput: 'UrinaryOutput',
} as const;
export type VitalType = (typeof VitalType)[keyof typeof VitalType];

export const VitalUnit: Record<VitalType, string> = {
  HeartRate: 'bpm',
  BloodPressureSystolic: 'mmHg',
  BloodPressureDiastolic: 'mmHg',
  MeanArterialPressure: 'mmHg',
  Temperature: '°C',
  RespiratoryRate: 'breaths/min',
  SpO2: '%',
  GlasgowComaScale: 'points',
  BloodGlucose: 'mmol/L',
  PainScore: '0-10',
  UrinaryOutput: 'mL/hr',
};

interface NormalRange {
  low: number;
  high: number;
  criticalLow?: number;
  criticalHigh?: number;
}

const ADULT_NORMAL_RANGES: Record<VitalType, NormalRange> = {
  HeartRate:               { low: 60,  high: 100,  criticalLow: 40,  criticalHigh: 150 },
  BloodPressureSystolic:   { low: 90,  high: 140,  criticalLow: 70,  criticalHigh: 180 },
  BloodPressureDiastolic:  { low: 60,  high: 90,   criticalLow: 40,  criticalHigh: 120 },
  MeanArterialPressure:    { low: 70,  high: 105,  criticalLow: 50,  criticalHigh: 130 },
  Temperature:             { low: 36.0, high: 37.5, criticalLow: 35.0, criticalHigh: 40.0 },
  RespiratoryRate:         { low: 12,  high: 20,   criticalLow: 8,   criticalHigh: 30  },
  SpO2:                    { low: 94,  high: 100,  criticalLow: 88               },
  GlasgowComaScale:        { low: 15,  high: 15,   criticalLow: 8                },
  BloodGlucose:            { low: 4.0, high: 7.8,  criticalLow: 2.5, criticalHigh: 20.0 },
  PainScore:               { low: 0,   high: 3                                   },
  UrinaryOutput:           { low: 30,  high: 200,  criticalLow: 10               },
};

export interface VitalReading extends Entity {
  patientId: string;
  encounterId: string;
  vitalType: VitalType;
  value: number;
  unit: string;
  recordedAt: ISODateString;
  recordedBy: string;
  isAbnormal: boolean;
  isCritical: boolean;
  deviceId?: string;
  notes?: string;
}

export interface VitalSummary {
  patientId: string;
  latestReadings: Partial<Record<VitalType, VitalReading>>;
  newsScore: number;
  newsBand: RiskBand;
  hasCriticalValue: boolean;
}

export function classifyVital(type: VitalType, value: number): { isAbnormal: boolean; isCritical: boolean } {
  const range = ADULT_NORMAL_RANGES[type];
  const isLow = value < range.low;
  const isHigh = value > range.high;
  const isCriticalLow = range.criticalLow !== undefined && value < range.criticalLow;
  const isCriticalHigh = range.criticalHigh !== undefined && value > range.criticalHigh;
  return {
    isAbnormal: isLow || isHigh,
    isCritical: isCriticalLow || isCriticalHigh,
  };
}

export function validateVitalValue(type: VitalType, value: number): void {
  if (!Number.isFinite(value)) {
    throw validation(`Vital value for ${type} must be a finite number`);
  }
  const hardLimits: Record<VitalType, [number, number]> = {
    HeartRate:               [0, 300],
    BloodPressureSystolic:   [0, 300],
    BloodPressureDiastolic:  [0, 200],
    MeanArterialPressure:    [0, 200],
    Temperature:             [20, 50],
    RespiratoryRate:         [0, 80],
    SpO2:                    [0, 100],
    GlasgowComaScale:        [3, 15],
    BloodGlucose:            [0, 100],
    PainScore:               [0, 10],
    UrinaryOutput:           [0, 1000],
  };
  const [min, max] = hardLimits[type];
  if (value < min || value > max) {
    throw validation(`Vital value ${value} for ${type} is outside physiologically plausible range [${min}, ${max}]`);
  }
}

/**
 * National Early Warning Score (NEWS2) — standard UK NHS scoring tool.
 * Gives an integer risk score from 0-20+.
 */
export function calculateNEWS2Score(readings: Partial<Record<VitalType, number>>): number {
  let score = 0;

  const rr = readings[VitalType.RespiratoryRate];
  if (rr !== undefined) {
    if (rr <= 8) score += 3;
    else if (rr <= 11) score += 1;
    else if (rr <= 20) score += 0;
    else if (rr <= 24) score += 2;
    else score += 3;
  }

  const spo2 = readings[VitalType.SpO2];
  if (spo2 !== undefined) {
    if (spo2 <= 91) score += 3;
    else if (spo2 <= 93) score += 2;
    else if (spo2 <= 95) score += 1;
  }

  const sbp = readings[VitalType.BloodPressureSystolic];
  if (sbp !== undefined) {
    if (sbp <= 90) score += 3;
    else if (sbp <= 100) score += 2;
    else if (sbp <= 110) score += 1;
    else if (sbp <= 219) score += 0;
    else score += 3;
  }

  const hr = readings[VitalType.HeartRate];
  if (hr !== undefined) {
    if (hr <= 40) score += 3;
    else if (hr <= 50) score += 1;
    else if (hr <= 90) score += 0;
    else if (hr <= 110) score += 1;
    else if (hr <= 130) score += 2;
    else score += 3;
  }

  const temp = readings[VitalType.Temperature];
  if (temp !== undefined) {
    if (temp <= 35.0) score += 3;
    else if (temp <= 36.0) score += 1;
    else if (temp <= 38.0) score += 0;
    else if (temp <= 39.0) score += 1;
    else score += 2;
  }

  const gcs = readings[VitalType.GlasgowComaScale];
  if (gcs !== undefined && gcs < 15) {
    score += 3;
  }

  return score;
}

export function newsBandFromScore(score: number): RiskBand {
  if (score >= 7) return 'Critical';
  if (score >= 5) return 'High';
  if (score >= 1) return 'Moderate';
  return 'Low';
}

export function buildVitalSummary(
  patientId: string,
  readings: VitalReading[],
): VitalSummary {
  const patientReadings = readings.filter((r) => r.patientId === patientId);
  const latestReadings: Partial<Record<VitalType, VitalReading>> = {};

  for (const reading of patientReadings) {
    const existing = latestReadings[reading.vitalType];
    if (!existing || new Date(reading.recordedAt) > new Date(existing.recordedAt)) {
      latestReadings[reading.vitalType] = reading;
    }
  }

  const rawValues: Partial<Record<VitalType, number>> = {};
  for (const [type, reading] of Object.entries(latestReadings) as [VitalType, VitalReading][]) {
    rawValues[type] = reading.value;
  }

  const newsScore = calculateNEWS2Score(rawValues);
  const newsBand = newsBandFromScore(newsScore);
  const hasCriticalValue = Object.values(latestReadings).some((r) => r?.isCritical);

  return { patientId, latestReadings, newsScore, newsBand, hasCriticalValue };
}

export function checkVitalTrend(
  readings: VitalReading[],
  type: VitalType,
  windowCount: number,
): 'Rising' | 'Falling' | 'Stable' {
  if (readings.length < 2) return 'Stable';
  const sorted = readings
    .filter((r) => r.vitalType === type)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .slice(-windowCount);

  if (sorted.length < 2) return 'Stable';
  const first = sorted[0]!.value;
  const last = sorted[sorted.length - 1]!.value;
  const delta = last - first;
  const threshold = first * 0.05; // 5% change counts as a trend
  if (delta > threshold) return 'Rising';
  if (delta < -threshold) return 'Falling';
  return 'Stable';
}

export function requireCriticalAcknowledgement(reading: VitalReading): void {
  if (reading.isCritical) {
    throw preconditionFailed(
      `Critical vital ${reading.vitalType}=${reading.value} for patient ${reading.patientId} must be acknowledged before proceeding`,
      { readingId: reading.id, value: reading.value, type: reading.vitalType },
    );
  }
}
