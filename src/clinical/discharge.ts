import type { Entity, ISODateString } from '../core/types';
import { preconditionFailed, validation } from '../core/errors';
import type { Patient } from './patient';
import { PatientState } from './patient';

export const DischargeDestination = {
  Home: 'Home',
  HomeWithSupport: 'HomeWithSupport',
  RehabilitationFacility: 'RehabilitationFacility',
  NursingHome: 'NursingHome',
  AnotherHospital: 'AnotherHospital',
  Hospice: 'Hospice',
  SupportedLiving: 'SupportedLiving',
  Deceased: 'Deceased',
} as const;
export type DischargeDestination = (typeof DischargeDestination)[keyof typeof DischargeDestination];

export const DischargeStatus = {
  Planning: 'Planning',
  CriteriaNotMet: 'CriteriaNotMet',
  ReadyForDischarge: 'ReadyForDischarge',
  PendingTransport: 'PendingTransport',
  Discharged: 'Discharged',
  Delayed: 'Delayed',
} as const;
export type DischargeStatus = (typeof DischargeStatus)[keyof typeof DischargeStatus];

export const DelayReason = {
  AwaitsAssessment: 'AwaitsAssessment',
  PendingLabResults: 'PendingLabResults',
  PendingImaging: 'PendingImaging',
  SocialCareArrangements: 'SocialCareArrangements',
  TransportArrangements: 'TransportArrangements',
  MedicationToTake: 'MedicationToTake',
  ConsentRequired: 'ConsentRequired',
  SpecialistReview: 'SpecialistReview',
  PatientDeclined: 'PatientDeclined',
} as const;
export type DelayReason = (typeof DelayReason)[keyof typeof DelayReason];

export interface DischargeCriteria {
  clinicallyStable: boolean;
  afebrile: boolean;
  adequateOralIntake: boolean;
  adequatePainControl: boolean;
  mobilising: boolean;
  pendingResultsClear: boolean;
  safeSocialCircumstances: boolean;
  followUpArranged: boolean;
  medicationsReconciled: boolean;
  patientEducationComplete: boolean;
}

export interface DischargeCheckliste extends Entity {
  patientId: string;
  encounterId: string;
  status: DischargeStatus;
  criteria: DischargeCriteria;
  destination?: DischargeDestination;
  dischargeTargetDate?: ISODateString;
  actualDischargeTime?: ISODateString;
  dischargedBy?: string;
  delayReasons: DelayReason[];
  estimatedDelayHours?: number;
  summaryDictated: boolean;
  gPLetterSent: boolean;
  followUpAppointmentDate?: ISODateString;
  specialistReferralsMade: string[];
  medicationsToTake: MedicationToTake[];
  dischargeNotes?: string;
}

export interface MedicationToTake {
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  durationDays: number;
  isNew: boolean;
  counsellingProvided: boolean;
}

export interface DischargeDelay extends Entity {
  dischargeChecklistId: string;
  patientId: string;
  reportedAt: ISODateString;
  reportedBy: string;
  reasons: DelayReason[];
  estimatedResolutionHours: number;
  resolved: boolean;
  resolvedAt?: ISODateString;
}

export function evaluateDischargeCriteria(criteria: DischargeCriteria): {
  allMet: boolean;
  unmetCriteria: string[];
} {
  const checks: Array<[keyof DischargeCriteria, string]> = [
    ['clinicallyStable', 'Patient must be clinically stable'],
    ['afebrile', 'Patient must be afebrile (temperature ≤37.5°C)'],
    ['adequateOralIntake', 'Adequate oral intake must be confirmed'],
    ['adequatePainControl', 'Pain must be adequately controlled (score ≤3/10)'],
    ['pendingResultsClear', 'All pending investigation results must be reviewed and cleared'],
    ['safeSocialCircumstances', 'Safe social circumstances must be confirmed'],
    ['followUpArranged', 'Follow-up appointment must be arranged'],
    ['medicationsReconciled', 'Discharge medications must be reconciled and dispensed'],
    ['patientEducationComplete', 'Patient education and counselling must be completed'],
  ];

  const unmetCriteria: string[] = [];
  for (const [key, message] of checks) {
    if (!criteria[key]) {
      unmetCriteria.push(message);
    }
  }

  return { allMet: unmetCriteria.length === 0, unmetCriteria };
}

export function validateDischargeReadiness(
  patient: Patient,
  checklist: DischargeCheckliste,
): void {
  if (patient.state === PatientState.Discharged) {
    throw preconditionFailed(`Patient ${patient.id} is already discharged`);
  }

  if (patient.state !== PatientState.InTreatment && patient.state !== PatientState.Admitted) {
    throw preconditionFailed(
      `Patient must be in treatment or admitted status to be discharged. Current state: ${patient.state}`,
    );
  }

  const { allMet, unmetCriteria } = evaluateDischargeCriteria(checklist.criteria);
  if (!allMet) {
    throw preconditionFailed(
      `Discharge criteria not met. Outstanding: ${unmetCriteria.join('; ')}`,
    );
  }

  if (!checklist.destination) {
    throw preconditionFailed(`Discharge destination must be specified before discharge`);
  }

  if (!checklist.summaryDictated) {
    throw preconditionFailed(`Discharge summary must be dictated before patient discharge`);
  }
}

export function calculateExpectedLengthOfStay(
  admittedAt: ISODateString,
  dischargeTargetDate: ISODateString,
): number {
  const diff = new Date(dischargeTargetDate).getTime() - new Date(admittedAt).getTime();
  return Math.ceil(diff / 86_400_000);
}

export function calculateActualLengthOfStay(
  admittedAt: ISODateString,
  dischargedAt: ISODateString,
): number {
  const diff = new Date(dischargedAt).getTime() - new Date(admittedAt).getTime();
  return Math.ceil(diff / 86_400_000);
}

export function isDelayedDischarge(
  targetDate: ISODateString,
  actualDate: ISODateString,
): boolean {
  return new Date(actualDate) > new Date(targetDate);
}

export function estimateDelayHours(reasons: DelayReason[]): number {
  const hoursByReason: Record<DelayReason, number> = {
    AwaitsAssessment:      4,
    PendingLabResults:     6,
    PendingImaging:        8,
    SocialCareArrangements: 24,
    TransportArrangements:  4,
    MedicationToTake:       2,
    ConsentRequired:        2,
    SpecialistReview:       8,
    PatientDeclined:        12,
  };

  return reasons.reduce((acc, r) => acc + (hoursByReason[r] ?? 4), 0);
}

export function reconcileMedications(
  inpatientMedications: string[],
  homeMedications: string[],
): {
  continued: string[];
  added: string[];
  stopped: string[];
  requiresCounselling: string[];
} {
  const continued = inpatientMedications.filter((m) => homeMedications.includes(m));
  const added = inpatientMedications.filter((m) => !homeMedications.includes(m));
  const stopped = homeMedications.filter((m) => !inpatientMedications.includes(m));
  const requiresCounselling = added; // All new medications require counselling
  return { continued, added, stopped, requiresCounselling };
}

export function validateMedicationToTake(med: MedicationToTake): void {
  if (!med.drugName.trim()) throw validation('Medication name is required');
  if (!med.dose.trim()) throw validation(`Dose is required for ${med.drugName}`);
  if (!med.route.trim()) throw validation(`Route is required for ${med.drugName}`);
  if (!med.frequency.trim()) throw validation(`Frequency is required for ${med.drugName}`);
  if (med.durationDays < 0) throw validation(`Duration must be non-negative for ${med.drugName}`);
  if (med.isNew && !med.counsellingProvided) {
    throw preconditionFailed(
      `Counselling must be provided for new medication ${med.drugName} before discharge`,
    );
  }
}
