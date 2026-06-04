import { describe, it, expect } from 'vitest';
import {
  evaluateDischargeCriteria,
  validateDischargeReadiness,
  calculateActualLengthOfStay,
  calculateExpectedLengthOfStay,
  isDelayedDischarge,
  estimateDelayHours,
  reconcileMedications,
  validateMedicationToTake,
  DischargeStatus,
  DischargeDestination,
  DelayReason,
} from '../src/clinical/discharge';
import type { DischargeCriteria, DischargeCheckliste } from '../src/clinical/discharge';
import type { Patient } from '../src/clinical/patient';
import { PatientState } from '../src/clinical/patient';
import { AppError } from '../src/core/errors';

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'pat_001',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
    name: 'Jane Doe',
    gender: 'F',
    birthdate: '1970-05-15',
    presentingComplaint: 'Chest pain',
    arrivalSource: 'WalkIn',
    state: PatientState.InTreatment,
    comorbidities: [],
    admittedAt: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

const fullMet: DischargeCriteria = {
  clinicallyStable: true,
  afebrile: true,
  adequateOralIntake: true,
  adequatePainControl: true,
  mobilising: true,
  pendingResultsClear: true,
  safeSocialCircumstances: true,
  followUpArranged: true,
  medicationsReconciled: true,
  patientEducationComplete: true,
};

function makeChecklist(overrides: Partial<DischargeCheckliste> = {}): DischargeCheckliste {
  return {
    id: 'chk_001',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    patientId: 'pat_001',
    encounterId: 'enc_001',
    status: DischargeStatus.Planning,
    criteria: { ...fullMet },
    delayReasons: [],
    summaryDictated: true,
    gPLetterSent: false,
    specialistReferralsMade: [],
    medicationsToTake: [],
    destination: DischargeDestination.Home,
    ...overrides,
  };
}

describe('evaluateDischargeCriteria', () => {
  it('returns allMet when all criteria satisfied', () => {
    const result = evaluateDischargeCriteria(fullMet);
    expect(result.allMet).toBe(true);
    expect(result.unmetCriteria).toHaveLength(0);
  });

  it('identifies unmet criteria', () => {
    const criteria = { ...fullMet, followUpArranged: false, medicationsReconciled: false };
    const result = evaluateDischargeCriteria(criteria);
    expect(result.allMet).toBe(false);
    expect(result.unmetCriteria).toHaveLength(2);
  });

  it('identifies clinically unstable as unmet', () => {
    const result = evaluateDischargeCriteria({ ...fullMet, clinicallyStable: false });
    expect(result.allMet).toBe(false);
    expect(result.unmetCriteria[0]).toContain('clinically stable');
  });
});

describe('validateDischargeReadiness', () => {
  it('passes for a ready patient', () => {
    const patient = makePatient();
    const checklist = makeChecklist();
    expect(() => validateDischargeReadiness(patient, checklist)).not.toThrow();
  });

  it('throws if patient is already discharged', () => {
    const patient = makePatient({ state: PatientState.Discharged });
    const checklist = makeChecklist();
    expect(() => validateDischargeReadiness(patient, checklist)).toThrow(AppError);
  });

  it('throws if criteria are unmet', () => {
    const patient = makePatient();
    const checklist = makeChecklist({ criteria: { ...fullMet, clinicallyStable: false } });
    expect(() => validateDischargeReadiness(patient, checklist)).toThrow(AppError);
  });

  it('throws if no destination set', () => {
    const patient = makePatient();
    const checklist = makeChecklist({ destination: undefined });
    expect(() => validateDischargeReadiness(patient, checklist)).toThrow(AppError);
  });

  it('throws if discharge summary not dictated', () => {
    const patient = makePatient();
    const checklist = makeChecklist({ summaryDictated: false });
    expect(() => validateDischargeReadiness(patient, checklist)).toThrow(AppError);
  });
});

describe('calculateActualLengthOfStay', () => {
  it('calculates 3 days correctly', () => {
    expect(calculateActualLengthOfStay('2026-01-01T08:00:00Z', '2026-01-04T08:00:00Z')).toBe(3);
  });

  it('returns 1 for same-day discharge', () => {
    expect(calculateActualLengthOfStay('2026-01-01T08:00:00Z', '2026-01-01T23:00:00Z')).toBe(1);
  });
});

describe('calculateExpectedLengthOfStay', () => {
  it('calculates expected LOS in days', () => {
    expect(calculateExpectedLengthOfStay('2026-01-01T08:00:00Z', '2026-01-06T08:00:00Z')).toBe(5);
  });
});

describe('isDelayedDischarge', () => {
  it('returns true when actual date is after target', () => {
    expect(isDelayedDischarge('2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z')).toBe(true);
  });

  it('returns false when discharged before target', () => {
    expect(isDelayedDischarge('2026-01-10T00:00:00Z', '2026-01-05T00:00:00Z')).toBe(false);
  });
});

describe('estimateDelayHours', () => {
  it('returns 0 for empty reasons', () => {
    expect(estimateDelayHours([])).toBe(0);
  });

  it('adds hours for each reason', () => {
    const hours = estimateDelayHours([DelayReason.PendingLabResults, DelayReason.TransportArrangements]);
    expect(hours).toBe(10); // 6 + 4
  });

  it('returns large delay for social care', () => {
    expect(estimateDelayHours([DelayReason.SocialCareArrangements])).toBe(24);
  });
});

describe('reconcileMedications', () => {
  it('identifies continued, added, and stopped medications', () => {
    const inpatient = ['Metformin', 'Aspirin', 'Furosemide'];
    const home = ['Metformin', 'Lisinopril'];

    const result = reconcileMedications(inpatient, home);
    expect(result.continued).toContain('Metformin');
    expect(result.added).toContain('Aspirin');
    expect(result.added).toContain('Furosemide');
    expect(result.stopped).toContain('Lisinopril');
  });

  it('all new medications require counselling', () => {
    const result = reconcileMedications(['NewDrug'], []);
    expect(result.requiresCounselling).toContain('NewDrug');
  });
});

describe('validateMedicationToTake', () => {
  const validMed = {
    drugName: 'Aspirin',
    dose: '75mg',
    route: 'PO',
    frequency: 'Once daily',
    durationDays: 30,
    isNew: false,
    counsellingProvided: false,
  };

  it('passes for valid medication', () => {
    expect(() => validateMedicationToTake(validMed)).not.toThrow();
  });

  it('throws for missing drug name', () => {
    expect(() => validateMedicationToTake({ ...validMed, drugName: '' })).toThrow(AppError);
  });

  it('throws for negative duration', () => {
    expect(() => validateMedicationToTake({ ...validMed, durationDays: -1 })).toThrow(AppError);
  });

  it('throws for new medication without counselling', () => {
    expect(() =>
      validateMedicationToTake({ ...validMed, isNew: true, counsellingProvided: false }),
    ).toThrow(AppError);
  });

  it('passes for new medication with counselling', () => {
    expect(() =>
      validateMedicationToTake({ ...validMed, isNew: true, counsellingProvided: true }),
    ).not.toThrow();
  });
});
