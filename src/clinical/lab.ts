import type { Entity, ISODateString } from '../core/types';
import { invalidTransition } from '../core/errors';
import { minutesBetween } from '../core/clock';

export const SampleStatus = {
  Collected: 'Collected',
  InTransit: 'InTransit',
  Received: 'Received',
  Processing: 'Processing',
  Resulted: 'Resulted',
  Verified: 'Verified',
  Rejected: 'Rejected',
} as const;
export type SampleStatus = (typeof SampleStatus)[keyof typeof SampleStatus];

export interface LabSample extends Entity {
  patientId: string;
  testType: string; // e.g. "Potassium", "Troponin", "Lactate", "CBC"
  status: SampleStatus;
  collectedAt: ISODateString;
  receivedAt?: ISODateString;
  resultedAt?: ISODateString;
  verifiedAt?: ISODateString;
  results?: Record<string, number>;
  criticalValueAlert: boolean;
  criticalValueAcknowledged: boolean;
  criticalValueAcknowledgedBy?: string;
  criticalValueAcknowledgedAt?: ISODateString;
  tatSLAThresholdMinutes: number;
}

export function validateSampleStatusTransition(from: SampleStatus, to: SampleStatus): void {
  const allowed: Record<SampleStatus, readonly SampleStatus[]> = {
    [SampleStatus.Collected]: [SampleStatus.InTransit, SampleStatus.Rejected],
    [SampleStatus.InTransit]: [SampleStatus.Received, SampleStatus.Rejected],
    [SampleStatus.Received]: [SampleStatus.Processing, SampleStatus.Rejected],
    [SampleStatus.Processing]: [SampleStatus.Resulted, SampleStatus.Rejected],
    [SampleStatus.Resulted]: [SampleStatus.Verified, SampleStatus.Rejected],
    [SampleStatus.Verified]: [],
    [SampleStatus.Rejected]: [],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('Sample', from, to);
  }
}

/** Check if sample processing breached TAT SLA. */
export function checkTATSLA(sample: LabSample, completionTime: ISODateString): boolean {
  const diff = minutesBetween(sample.collectedAt, completionTime);
  return diff >= sample.tatSLAThresholdMinutes;
}

/** Check if the result values qualify as critical alert values. */
export function evaluateCriticalThresholds(testType: string, results: Record<string, number>): boolean {
  if (testType === 'Troponin' && (results['value'] ?? 0) > 0.04) {
    return true;
  }
  if (testType === 'Lactate' && (results['value'] ?? 0) > 2.0) {
    return true;
  }
  if (testType === 'Potassium' && ((results['value'] ?? 0) < 3.0 || (results['value'] ?? 0) > 6.0)) {
    return true;
  }
  return false;
}

/** Calculate Potassium or general delta difference and raise alert if too high. */
export function runDeltaCheck(
  currentVal: number,
  priorVal: number,
  maxAllowedDelta: number,
): boolean {
  const diff = Math.abs(currentVal - priorVal);
  return diff > maxAllowedDelta;
}
