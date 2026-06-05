import { describe, it, expect } from 'vitest';
import {
  determineBedTypeFromTriage,
  findSuitableBeds,
  selectOptimalBed,
  validateAdmissionRequest,
  executeAdmission,
  runTriageWorkflow,
  reassignBed,
  findCoverageForDepartment,
  type AdmissionRequest,
} from '../src/workflow/admission';
import { BedType, BedStatus, type Bed } from '../src/clinical/ward';
import { PatientState, type Patient } from '../src/clinical/patient';
import { StaffStatus, type Clinician } from '../src/clinical/staff';
import { Department } from '../src/core/enums';
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
    state: PatientState.Triaged,
    comorbidities: [],
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
    status: BedStatus.Available,
    isolationPrecautions: [],
    ...overrides,
  };
}

function makeDoctor(overrides: Partial<Clinician> = {}): Clinician {
  return {
    id: 'staff_0001',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    name: 'Dr. House',
    specialty: 'General Medicine',
    licenseNumber: 'MD12345',
    certExpiry: '2027-01-01',
    status: StaffStatus.OnDuty,
    department: Department.General,
    ...overrides,
  };
}

const now = new Date('2026-06-04T12:00:00.000Z');
const nowIso = '2026-06-04T12:00:00.000Z';

describe('determineBedTypeFromTriage', () => {
  it('returns ICU when ICU is explicitly required', () => {
    expect(determineBedTypeFromTriage(50, false, false, true)).toBe(BedType.ICU);
  });

  it('returns ICU when priority score exceeds 110', () => {
    expect(determineBedTypeFromTriage(120, false, false, false)).toBe(BedType.ICU);
  });

  it('returns Surgical when surgery required and ICU not needed', () => {
    expect(determineBedTypeFromTriage(80, false, true, false)).toBe(BedType.Surgical);
  });

  it('returns Isolation when infectious risk present', () => {
    expect(determineBedTypeFromTriage(80, true, false, false)).toBe(BedType.Isolation);
  });

  it('defaults to General otherwise', () => {
    expect(determineBedTypeFromTriage(40, false, false, false)).toBe(BedType.General);
  });
});

describe('findSuitableBeds', () => {
  it('filters by availability and type', () => {
    const beds = [
      makeBed({ id: 'b1', type: BedType.General, status: BedStatus.Available }),
      makeBed({ id: 'b2', type: BedType.General, status: BedStatus.Occupied }),
      makeBed({ id: 'b3', type: BedType.ICU, status: BedStatus.Available }),
    ];
    const result = findSuitableBeds(beds, BedType.General, false);
    expect(result.map((b) => b.id)).toEqual(['b1']);
  });

  it('requires isolation beds for infectious patients', () => {
    const beds = [
      makeBed({ id: 'g1', type: BedType.General, status: BedStatus.Available }),
      makeBed({ id: 'i1', type: BedType.Isolation, status: BedStatus.Available, isolationPrecautions: ['contact'] }),
    ];
    const result = findSuitableBeds(beds, BedType.Isolation, true, ['contact']);
    expect(result.map((b) => b.id)).toEqual(['i1']);
  });

  it('excludes isolation beds missing required precautions', () => {
    const beds = [
      makeBed({ id: 'i1', type: BedType.Isolation, status: BedStatus.Available, isolationPrecautions: ['contact'] }),
    ];
    const result = findSuitableBeds(beds, BedType.Isolation, true, ['airborne']);
    expect(result).toHaveLength(0);
  });
});

describe('selectOptimalBed', () => {
  it('returns undefined when no beds', () => {
    expect(selectOptimalBed([])).toBeUndefined();
  });

  it('prefers the lowest room id', () => {
    const beds = [
      makeBed({ id: 'b1', roomId: 'room_305' }),
      makeBed({ id: 'b2', roomId: 'room_101' }),
    ];
    expect(selectOptimalBed(beds)!.id).toBe('b2');
  });
});

describe('validateAdmissionRequest', () => {
  const request: AdmissionRequest = {
    patientId: 'pat_001',
    bedId: 'bed_0001',
    assignedDoctorId: 'staff_0001',
    admissionReason: 'Observation',
    isEmergency: false,
  };

  it('returns no warnings for a clean admission', () => {
    const warnings = validateAdmissionRequest(request, makePatient(), makeBed(), makeDoctor(), now);
    expect(warnings).toEqual([]);
  });

  it('throws when patient is in a non-admittable state and not emergency', () => {
    expect(() =>
      validateAdmissionRequest(request, makePatient({ state: PatientState.Discharged }), makeBed(), makeDoctor(), now),
    ).toThrow(AppError);
  });

  it('throws when bed is not available or reserved', () => {
    expect(() =>
      validateAdmissionRequest(request, makePatient(), makeBed({ status: BedStatus.Cleaning }), makeDoctor(), now),
    ).toThrow(/not available/);
  });

  it('warns when doctor credentials fail rather than blocking', () => {
    const warnings = validateAdmissionRequest(
      request,
      makePatient(),
      makeBed(),
      makeDoctor({ status: StaffStatus.Suspended }),
      now,
    );
    expect(warnings.some((w) => w.includes('credentials check failed'))).toBe(true);
  });

  it('throws when infectious patient is placed in non-isolation bed', () => {
    expect(() =>
      validateAdmissionRequest(request, makePatient({ comorbidities: ['MRSA colonisation'] }), makeBed(), makeDoctor(), now),
    ).toThrow(/isolation bed is required/);
  });

  it('warns on emergency bypass for un-triaged patient', () => {
    const warnings = validateAdmissionRequest(
      { ...request, isEmergency: true },
      makePatient({ state: PatientState.Registered }),
      makeBed(),
      makeDoctor(),
      now,
    );
    expect(warnings.some((w) => w.includes('Emergency bypass'))).toBe(true);
  });
});

describe('executeAdmission', () => {
  const request: AdmissionRequest = {
    patientId: 'pat_001',
    bedId: 'bed_0001',
    assignedDoctorId: 'staff_0001',
    admissionReason: 'Observation',
    estimatedLengthOfStayDays: 3,
    isEmergency: false,
  };

  it('admits the patient and occupies the bed', () => {
    const result = executeAdmission(makePatient(), makeBed(), makeDoctor(), request, nowIso, []);
    expect(result.patient.state).toBe(PatientState.Admitted);
    expect(result.patient.assignedBedId).toBe('bed_0001');
    expect(result.bed.status).toBe(BedStatus.Occupied);
    expect(result.bed.assignedPatientId).toBe('pat_001');
    expect(result.admittedAt).toBe(nowIso);
  });

  it('computes an estimated discharge date from length of stay', () => {
    const result = executeAdmission(makePatient(), makeBed(), makeDoctor(), request, nowIso, []);
    expect(result.estimatedDischargeDate).toBe('2026-06-07T12:00:00.000Z');
  });

  it('omits discharge estimate when length of stay not provided', () => {
    const { estimatedLengthOfStayDays, ...noLos } = request;
    void estimatedLengthOfStayDays;
    const result = executeAdmission(makePatient(), makeBed(), makeDoctor(), noLos as AdmissionRequest, nowIso, []);
    expect(result.estimatedDischargeDate).toBeUndefined();
  });

  it('throws on an invalid state transition', () => {
    expect(() =>
      executeAdmission(makePatient({ state: PatientState.Registered }), makeBed(), makeDoctor(), request, nowIso, []),
    ).toThrow(AppError);
  });
});

describe('runTriageWorkflow', () => {
  it('flags MET activation for high NEWS2 and recommends ICU', () => {
    const wf = runTriageWorkflow(makePatient(), 'nurse_1', 8, nowIso);
    expect(wf.recommendedBedType).toBe(BedType.ICU);
    expect(wf.immediateInterventionsRequired).toContain('Activate MET/Rapid Response immediately');
  });

  it('recommends urgent review for moderate NEWS2', () => {
    const wf = runTriageWorkflow(makePatient(), 'nurse_1', 5, nowIso);
    expect(wf.immediateInterventionsRequired.some((i) => i.includes('Urgent medical review'))).toBe(true);
  });

  it('adds respiratory and chest-pain interventions from complaint text', () => {
    const wf = runTriageWorkflow(
      makePatient({ presentingComplaint: 'shortness of breath and chest tightness' }),
      'nurse_1',
      3,
      nowIso,
    );
    expect(wf.immediateInterventionsRequired.some((i) => i.includes('Supplemental oxygen'))).toBe(true);
    expect(wf.immediateInterventionsRequired.some((i) => i.includes('12-lead ECG'))).toBe(true);
  });

  it('recommends isolation for infectious patient with low score', () => {
    const wf = runTriageWorkflow(makePatient({ comorbidities: ['COVID positive'] }), 'nurse_1', 2, nowIso);
    expect(wf.recommendedBedType).toBe(BedType.Isolation);
  });
});

describe('reassignBed', () => {
  it('moves a patient to a new bed and cleans the old one', () => {
    const current = makeBed({ id: 'old', status: BedStatus.Occupied, assignedPatientId: 'pat_001' });
    const target = makeBed({ id: 'new', status: BedStatus.Available });
    const result = reassignBed(current, target, makePatient(), 'Closer to nursing station', nowIso);
    expect(result.updatedCurrentBed.status).toBe(BedStatus.Cleaning);
    expect(result.updatedCurrentBed.assignedPatientId).toBeUndefined();
    expect(result.updatedNewBed.status).toBe(BedStatus.Occupied);
    expect(result.updatedPatient.assignedBedId).toBe('new');
  });

  it('throws when the new bed is unavailable', () => {
    const current = makeBed({ id: 'old', status: BedStatus.Occupied });
    const target = makeBed({ id: 'new', status: BedStatus.Occupied });
    expect(() => reassignBed(current, target, makePatient(), 'reason', nowIso)).toThrow(/not available/);
  });

  it('throws when no reason is supplied', () => {
    const current = makeBed({ id: 'old', status: BedStatus.Occupied });
    const target = makeBed({ id: 'new', status: BedStatus.Available });
    expect(() => reassignBed(current, target, makePatient(), '   ', nowIso)).toThrow(AppError);
  });
});

describe('findCoverageForDepartment', () => {
  it('reports adequate when at least one clinician is on duty', () => {
    const staff = [
      makeDoctor({ id: 's1', department: Department.Emergency, status: StaffStatus.OnDuty }),
      makeDoctor({ id: 's2', department: Department.Emergency, status: StaffStatus.OnCall }),
      makeDoctor({ id: 's3', department: Department.General, status: StaffStatus.OnDuty }),
    ];
    const result = findCoverageForDepartment(staff, Department.Emergency, now);
    expect(result.onDuty.map((s) => s.id)).toEqual(['s1']);
    expect(result.onCall.map((s) => s.id)).toEqual(['s2']);
    expect(result.adequate).toBe(true);
  });

  it('reports inadequate when nobody is on duty', () => {
    const staff = [makeDoctor({ id: 's1', department: Department.Emergency, status: StaffStatus.OnCall })];
    const result = findCoverageForDepartment(staff, Department.Emergency, now);
    expect(result.adequate).toBe(false);
  });
});
