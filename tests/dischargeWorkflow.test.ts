import { describe, it, expect } from 'vitest';
import {
  initiateDischargeProcess,
  updateDischargeStatus,
  validateMedications,
  executeDischarge,
  handleDelayedDischarge,
  checkEarlyDischargeEligibility,
  generateTransferSummary,
} from '../src/workflow/dischargeWorkflow';
import {
  DischargeStatus,
  DischargeDestination,
  DelayReason,
  type DischargeCriteria,
  type DischargeCheckliste,
  type MedicationToTake,
} from '../src/clinical/discharge';
import { PatientState, type Patient } from '../src/clinical/patient';
import { BedStatus, BedType, type Bed } from '../src/clinical/ward';
import { AppError } from '../src/core/errors';

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

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'pat_001',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
    name: 'Jane Doe',
    gender: 'F',
    birthdate: '1970-05-15',
    presentingComplaint: 'Pneumonia',
    arrivalSource: 'Ambulance',
    state: PatientState.InTreatment,
    comorbidities: [],
    admittedAt: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

function makeChecklist(overrides: Partial<DischargeCheckliste> = {}): DischargeCheckliste {
  return {
    id: 'chk_001',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
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

function makeBed(overrides: Partial<Bed> = {}): Bed {
  return {
    id: 'bed_0001',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    wardId: 'ward_0001',
    roomId: 'room_101',
    bedNumber: '1A',
    type: BedType.General,
    status: BedStatus.Occupied,
    isolationPrecautions: [],
    assignedPatientId: 'pat_001',
    ...overrides,
  };
}

const nowIso = '2026-06-04T12:00:00.000Z';

describe('initiateDischargeProcess', () => {
  it('moves checklist into planning', () => {
    const result = initiateDischargeProcess(makePatient(), makeChecklist({ status: DischargeStatus.CriteriaNotMet }), nowIso);
    expect(result.status).toBe(DischargeStatus.Planning);
    expect(result.updatedAt).toBe(nowIso);
  });

  it('throws when patient already discharged', () => {
    expect(() =>
      initiateDischargeProcess(makePatient({ state: PatientState.Discharged }), makeChecklist(), nowIso),
    ).toThrow(/already discharged/);
  });
});

describe('updateDischargeStatus', () => {
  it('marks ready when criteria met and destination set', () => {
    const result = updateDischargeStatus(makeChecklist(), nowIso);
    expect(result.status).toBe(DischargeStatus.ReadyForDischarge);
  });

  it('marks delayed when delay reasons exist', () => {
    const checklist = makeChecklist({
      criteria: { ...fullMet, afebrile: false },
      delayReasons: [DelayReason.SocialCareArrangements],
    });
    const result = updateDischargeStatus(checklist, nowIso);
    expect(result.status).toBe(DischargeStatus.Delayed);
    expect(result.estimatedDelayHours).toBeGreaterThan(0);
  });

  it('marks criteria-not-met when unmet and no delay reasons', () => {
    const checklist = makeChecklist({ criteria: { ...fullMet, afebrile: false } });
    const result = updateDischargeStatus(checklist, nowIso);
    expect(result.status).toBe(DischargeStatus.CriteriaNotMet);
    expect(result.estimatedDelayHours).toBeUndefined();
  });
});

describe('validateMedications', () => {
  const goodMed: MedicationToTake = {
    drugName: 'Amoxicillin',
    dose: '500mg',
    route: 'PO',
    frequency: 'TDS',
    durationDays: 7,
    isNew: true,
    counsellingProvided: true,
  };

  it('returns no warnings for valid medications', () => {
    expect(validateMedications([goodMed])).toEqual([]);
  });

  it('collects warnings for invalid medications', () => {
    const warnings = validateMedications([{ ...goodMed, drugName: '', durationDays: 0 }]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('executeDischarge', () => {
  it('discharges the patient, frees the bed and summarises medications', () => {
    const med: MedicationToTake = {
      drugName: 'Amoxicillin',
      dose: '500mg',
      route: 'PO',
      frequency: 'TDS',
      durationDays: 7,
      isNew: true,
      counsellingProvided: true,
    };
    const result = executeDischarge(
      makePatient(),
      makeBed(),
      makeChecklist({ medicationsToTake: [med] }),
      'doc_1',
      nowIso,
    );
    expect(result.patient.state).toBe(PatientState.Discharged);
    expect(result.patient.dischargedAt).toBe(nowIso);
    expect(result.bed.status).toBe(BedStatus.Cleaning);
    expect(result.bed.assignedPatientId).toBeUndefined();
    expect(result.checklist.status).toBe(DischargeStatus.Discharged);
    expect(result.checklist.dischargedBy).toBe('doc_1');
    expect(result.lengthOfStayDays).toBeGreaterThanOrEqual(3);
    expect(result.medicationsSummary.newMeds).toContain('Amoxicillin');
    expect(result.postDischargeInstructions.some((l) => l.includes('Amoxicillin'))).toBe(true);
  });

  it('throws when discharge readiness fails', () => {
    expect(() =>
      executeDischarge(makePatient(), makeBed(), makeChecklist({ criteria: { ...fullMet, afebrile: false } }), 'doc_1', nowIso),
    ).toThrow(AppError);
  });

  it('falls back to now when admittedAt is missing', () => {
    const result = executeDischarge(
      makePatient({ admittedAt: undefined }),
      makeBed(),
      makeChecklist(),
      'doc_1',
      nowIso,
    );
    expect(result.lengthOfStayDays).toBe(0);
  });

  it('emits GP follow-up guidance when no appointment date set', () => {
    const result = executeDischarge(makePatient(), makeBed(), makeChecklist(), 'doc_1', nowIso);
    expect(result.postDischargeInstructions.some((l) => l.includes('GP within 2 weeks'))).toBe(true);
  });

  it('includes booked follow-up and specialist referrals in instructions', () => {
    const result = executeDischarge(
      makePatient(),
      makeBed(),
      makeChecklist({ followUpAppointmentDate: '2026-06-20T09:00:00Z', specialistReferralsMade: ['Cardiology'] }),
      'doc_1',
      nowIso,
    );
    expect(result.postDischargeInstructions.some((l) => l.includes('2026-06-20'))).toBe(true);
    expect(result.postDischargeInstructions.some((l) => l.includes('Cardiology'))).toBe(true);
  });
});

describe('handleDelayedDischarge', () => {
  it('records delay reasons and estimated resolution', () => {
    const result = handleDelayedDischarge(
      makeChecklist(),
      [DelayReason.TransportArrangements, DelayReason.PendingImaging],
      'nurse_2',
      nowIso,
    );
    expect(result.updatedChecklist.status).toBe(DischargeStatus.Delayed);
    expect(result.updatedChecklist.delayReasons).toHaveLength(2);
    expect(result.estimatedResolutionHours).toBeGreaterThan(0);
  });
});

describe('checkEarlyDischargeEligibility', () => {
  it('is eligible when criteria met and target is in the future', () => {
    const result = checkEarlyDischargeEligibility(makePatient(), makeChecklist(), '2026-06-06T12:00:00Z', nowIso);
    expect(result.eligible).toBe(true);
    expect(result.hoursEarly).toBeCloseTo(48, 0);
    expect(result.barriers).toHaveLength(0);
  });

  it('is ineligible when criteria unmet, reporting barriers', () => {
    const result = checkEarlyDischargeEligibility(
      makePatient(),
      makeChecklist({ criteria: { ...fullMet, afebrile: false } }),
      '2026-06-06T12:00:00Z',
      nowIso,
    );
    expect(result.eligible).toBe(false);
    expect(result.barriers.length).toBeGreaterThan(0);
  });

  it('clamps negative hoursEarly to zero when target already passed', () => {
    const result = checkEarlyDischargeEligibility(makePatient(), makeChecklist(), '2026-06-01T12:00:00Z', nowIso);
    expect(result.eligible).toBe(false);
    expect(result.hoursEarly).toBe(0);
  });
});

describe('generateTransferSummary', () => {
  it('produces a structured handover summary', () => {
    const summary = generateTransferSummary(
      makePatient({ comorbidities: ['Diabetes', 'Hypertension'] }),
      'St. Mary Rehab',
      'Specialist rehabilitation',
      'Dr. Smith',
    );
    expect(summary).toContain('TRANSFER SUMMARY');
    expect(summary).toContain('Jane Doe');
    expect(summary).toContain('St. Mary Rehab');
    expect(summary).toContain('Diabetes, Hypertension');
    expect(summary).toContain('Authorised by: Dr. Smith');
  });

  it('notes when comorbidities are absent', () => {
    const summary = generateTransferSummary(makePatient({ comorbidities: [] }), 'Facility', 'Reason', 'Dr. Smith');
    expect(summary).toContain('None documented');
  });
});
