import { describe, it, expect } from 'vitest';
import {
  validateStudyStatusTransition,
  checkContrastContraindications,
  checkIonisingRadiationPregnancy,
  generateAccessionNumber,
  summariseRadiationExposure,
  validateBodyPartForModality,
  getRadiologyProtocol,
  calculateTATMinutes,
  isCriticalFindingPending,
  validateCriticalFindingCommunication,
  ImagingModality,
  StudyStatus,
  FindingSeverity,
} from '../src/clinical/radiology';
import type { ImagingStudy, RadiologyReport } from '../src/clinical/radiology';
import { AppError } from '../src/core/errors';

function makeStudy(overrides: Partial<ImagingStudy> = {}): ImagingStudy {
  return {
    id: 'study_001',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
    patientId: 'pat_001',
    orderId: 'ord_001',
    modality: ImagingModality.CTScan,
    bodyPart: 'Head',
    clinicalIndication: 'Head injury',
    priority: 'STAT',
    status: StudyStatus.Ordered,
    contrastUsed: false,
    accessionNumber: 'CT2026010100001',
    ...overrides,
  };
}

function makeReport(overrides: Partial<RadiologyReport> = {}): RadiologyReport {
  return {
    id: 'rep_001',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    studyId: 'study_001',
    patientId: 'pat_001',
    radiologistId: 'rad_001',
    draftedAt: '2026-01-01T10:00:00Z',
    findings: 'No acute intracranial abnormality.',
    impression: 'Normal CT head.',
    severity: FindingSeverity.Normal,
    ...overrides,
  };
}

describe('validateStudyStatusTransition', () => {
  it('allows Ordered → Scheduled', () => {
    expect(() => validateStudyStatusTransition(StudyStatus.Ordered, StudyStatus.Scheduled)).not.toThrow();
  });

  it('allows Completed → Reported', () => {
    expect(() => validateStudyStatusTransition(StudyStatus.Completed, StudyStatus.Reported)).not.toThrow();
  });

  it('throws for Ordered → Completed (skip steps)', () => {
    expect(() => validateStudyStatusTransition(StudyStatus.Ordered, StudyStatus.Completed)).toThrow(AppError);
  });

  it('throws for Verified → any', () => {
    expect(() => validateStudyStatusTransition(StudyStatus.Verified, StudyStatus.Reported)).toThrow(AppError);
  });

  it('allows Ordered → Cancelled', () => {
    expect(() => validateStudyStatusTransition(StudyStatus.Ordered, StudyStatus.Cancelled)).not.toThrow();
  });
});

describe('checkContrastContraindications', () => {
  const contrastStudy = makeStudy({ contrastUsed: true });

  it('passes with no contraindications', () => {
    expect(() => checkContrastContraindications(contrastStudy, 60, [])).not.toThrow();
  });

  it('throws for pregnant patient', () => {
    const study = makeStudy({ contrastUsed: true, patientPregnancyStatus: 'Pregnant' });
    expect(() => checkContrastContraindications(study)).toThrow(AppError);
  });

  it('throws for iodine allergy', () => {
    expect(() =>
      checkContrastContraindications(contrastStudy, 60, ['Iodine allergy']),
    ).toThrow(AppError);
  });

  it('throws for low eGFR', () => {
    expect(() => checkContrastContraindications(contrastStudy, 25)).toThrow(AppError);
  });

  it('passes for non-contrast study', () => {
    const nonContrast = makeStudy({ contrastUsed: false });
    expect(() => checkContrastContraindications(nonContrast, 15, ['Iodine allergy'])).not.toThrow();
  });
});

describe('checkIonisingRadiationPregnancy', () => {
  it('throws for CT with pregnant patient', () => {
    expect(() =>
      checkIonisingRadiationPregnancy(ImagingModality.CTScan, 'Pregnant'),
    ).toThrow(AppError);
  });

  it('throws for X-Ray with pregnant patient', () => {
    expect(() =>
      checkIonisingRadiationPregnancy(ImagingModality.XRay, 'Pregnant'),
    ).toThrow(AppError);
  });

  it('does not throw for MRI (non-ionising) on pregnant patient', () => {
    expect(() =>
      checkIonisingRadiationPregnancy(ImagingModality.MRI, 'Pregnant'),
    ).not.toThrow();
  });

  it('does not throw for CT when not pregnant', () => {
    expect(() =>
      checkIonisingRadiationPregnancy(ImagingModality.CTScan, 'NotPregnant'),
    ).not.toThrow();
  });

  it('does not throw when pregnancy unknown', () => {
    expect(() =>
      checkIonisingRadiationPregnancy(ImagingModality.CTScan, 'Unknown'),
    ).not.toThrow();
  });
});

describe('generateAccessionNumber', () => {
  it('generates formatted accession number', () => {
    const acc = generateAccessionNumber(ImagingModality.CTScan, '2026-06-04T10:00:00Z', 1);
    expect(acc).toBe('CT2026060400001');
  });

  it('pads sequence to 5 digits', () => {
    const acc = generateAccessionNumber(ImagingModality.XRay, '2026-01-01T00:00:00Z', 42);
    expect(acc).toBe('XR2026010100042');
  });
});

describe('summariseRadiationExposure', () => {
  const studies: ImagingStudy[] = [
    makeStudy({ patientId: 'pat_001', completedAt: '2026-01-01T10:00:00Z', radiationDoseMilliSievert: 7 }),
    makeStudy({ id: 'study_002', patientId: 'pat_001', completedAt: '2026-01-05T10:00:00Z', radiationDoseMilliSievert: 10 }),
    makeStudy({ id: 'study_003', patientId: 'pat_002', completedAt: '2026-01-02T10:00:00Z', radiationDoseMilliSievert: 50 }),
  ];

  it('sums dose for the correct patient', () => {
    const result = summariseRadiationExposure(studies, 'pat_001', 30, '2026-01-10T00:00:00Z');
    expect(result.totalDoseMilliSievert).toBe(17);
    expect(result.studyCount).toBe(2);
  });

  it('does not include other patient studies', () => {
    const result = summariseRadiationExposure(studies, 'pat_002', 30, '2026-01-10T00:00:00Z');
    expect(result.totalDoseMilliSievert).toBe(50);
  });

  it('flags high exposure over 100 mSv', () => {
    const highStudies = [
      ...studies,
      makeStudy({ id: 's4', patientId: 'pat_001', completedAt: '2026-01-07T00:00:00Z', radiationDoseMilliSievert: 90 }),
    ];
    const result = summariseRadiationExposure(highStudies, 'pat_001', 30, '2026-01-10T00:00:00Z');
    expect(result.highExposureFlag).toBe(true);
  });
});

describe('calculateTATMinutes', () => {
  it('calculates TAT correctly', () => {
    const study = makeStudy({
      startedAt: '2026-01-01T08:00:00Z',
      reportedAt: '2026-01-01T09:30:00Z',
    });
    expect(calculateTATMinutes(study)).toBe(90);
  });

  it('returns undefined when startedAt or reportedAt missing', () => {
    expect(calculateTATMinutes(makeStudy())).toBeUndefined();
  });
});

describe('critical finding reporting', () => {
  it('detects pending critical finding', () => {
    const report = makeReport({ severity: FindingSeverity.Critical });
    expect(isCriticalFindingPending(report)).toBe(true);
  });

  it('reports finding as not pending when communicated', () => {
    const report = makeReport({
      severity: FindingSeverity.Critical,
      criticalFindingCommunicatedAt: '2026-01-01T11:00:00Z',
    });
    expect(isCriticalFindingPending(report)).toBe(false);
  });

  it('throws validation error when pending critical finding not communicated', () => {
    const report = makeReport({ severity: FindingSeverity.Critical });
    expect(() => validateCriticalFindingCommunication(report)).toThrow(AppError);
  });

  it('does not throw for normal finding', () => {
    const report = makeReport({ severity: FindingSeverity.Normal });
    expect(() => validateCriticalFindingCommunication(report)).not.toThrow();
  });
});

describe('getRadiologyProtocol', () => {
  it('returns CT Head protocol', () => {
    const protocol = getRadiologyProtocol(ImagingModality.CTScan, 'Head');
    expect(protocol).toBeDefined();
    expect(protocol?.contrastRequired).toBe(false);
    expect(protocol?.estimatedDurationMinutes).toBe(15);
  });

  it('returns undefined for unrecognised combination', () => {
    const protocol = getRadiologyProtocol(ImagingModality.CTScan, 'Ankle');
    expect(protocol).toBeUndefined();
  });
});

describe('validateBodyPartForModality', () => {
  it('accepts valid body part', () => {
    expect(() => validateBodyPartForModality(ImagingModality.CTScan, 'Chest')).not.toThrow();
  });

  it('throws for mammography on non-breast body part', () => {
    expect(() =>
      validateBodyPartForModality(ImagingModality.Mammography, 'Chest'),
    ).toThrow(AppError);
  });

  it('accepts mammography of breast', () => {
    expect(() =>
      validateBodyPartForModality(ImagingModality.Mammography, 'Left Breast'),
    ).not.toThrow();
  });
});
