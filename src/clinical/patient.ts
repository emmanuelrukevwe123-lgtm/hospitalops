import type { Entity, ISODateString } from '../core/types';
import { invalidTransition } from '../core/errors';
import { addMinutes } from '../core/clock';

export const TriageLevel = {
  Immediate: 'Immediate',
  Urgent: 'Urgent',
  SemiUrgent: 'Semi-Urgent',
  NonUrgent: 'Non-Urgent',
  Deceased: 'Deceased',
} as const;
export type TriageLevel = (typeof TriageLevel)[keyof typeof TriageLevel];

export const PatientState = {
  Registered: 'Registered',
  Triaged: 'Triaged',
  Admitted: 'Admitted',
  InTreatment: 'InTreatment',
  Transferred: 'Transferred',
  Discharged: 'Discharged',
  Deceased: 'Deceased',
} as const;
export type PatientState = (typeof PatientState)[keyof typeof PatientState];

export interface Patient extends Entity {
  name: string;
  gender: string;
  birthdate: ISODateString; // YYYY-MM-DD
  presentingComplaint: string;
  arrivalSource: 'WalkIn' | 'Ambulance' | 'Referral';
  state: PatientState;
  triageLevel?: TriageLevel;
  triageTime?: ISODateString;
  priorityScore?: number;
  comorbidities: string[];
  assignedBedId?: string;
  assignedDoctorId?: string;
  admittedAt?: ISODateString;
  dischargedAt?: ISODateString;
  // SLA thresholds
  triageToDoctorSLA?: ISODateString;
  triageToBedSLA?: ISODateString;
  dischargeTargetSLA?: ISODateString;
}

/** Calculate priority score based on triage level, age risk, and comorbidity flags. */
export function calculatePriorityScore(
  triageLevel: TriageLevel,
  birthdate: ISODateString,
  comorbidities: string[],
  now: Date,
): number {
  if (triageLevel === TriageLevel.Deceased) return 0;

  let base = 0;
  switch (triageLevel) {
    case TriageLevel.Immediate:
      base = 100;
      break;
    case TriageLevel.Urgent:
      base = 75;
      break;
    case TriageLevel.SemiUrgent:
      base = 50;
      break;
    case TriageLevel.NonUrgent:
      base = 25;
      break;
  }

  // Calculate age
  const birth = new Date(birthdate);
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }

  let ageRisk = 0;
  if (age >= 65 || age < 1) {
    ageRisk = 15;
  }

  const comorbidityRisk = comorbidities.length * 10;

  return base + ageRisk + comorbidityRisk;
}

/** Compute SLA window targets based on triage level and triage timestamp. */
export function getSLATargets(
  triageLevel: TriageLevel,
  triageTime: ISODateString,
): { triageToDoctorSLA?: ISODateString; triageToBedSLA?: ISODateString } {
  if (triageLevel === TriageLevel.Deceased) return {};

  let docMins = 0;
  let bedMins = 0;

  switch (triageLevel) {
    case TriageLevel.Immediate:
      docMins = 0; // immediate
      bedMins = 10;
      break;
    case TriageLevel.Urgent:
      docMins = 15;
      break;
    case TriageLevel.SemiUrgent:
      docMins = 60;
      bedMins = 120;
      break;
    case TriageLevel.NonUrgent:
      docMins = 120;
      bedMins = 240;
      break;
  }

  return {
    triageToDoctorSLA: addMinutes(triageTime, docMins),
    triageToBedSLA: bedMins > 0 ? addMinutes(triageTime, bedMins) : undefined,
  };
}

/** Validate patient lifecycle state transitions. */
export function validateStateTransition(from: PatientState, to: PatientState): void {
  const allowed: Record<PatientState, readonly PatientState[]> = {
    [PatientState.Registered]: [PatientState.Triaged, PatientState.Deceased],
    [PatientState.Triaged]: [PatientState.Admitted, PatientState.Transferred, PatientState.Deceased],
    [PatientState.Admitted]: [PatientState.InTreatment, PatientState.Transferred, PatientState.Deceased],
    [PatientState.InTreatment]: [PatientState.Transferred, PatientState.Discharged, PatientState.Deceased],
    [PatientState.Transferred]: [PatientState.Discharged, PatientState.Deceased],
    [PatientState.Discharged]: [],
    [PatientState.Deceased]: [],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('Patient', from, to);
  }
}
