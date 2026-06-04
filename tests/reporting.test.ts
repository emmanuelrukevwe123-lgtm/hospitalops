import { describe, it, expect } from 'vitest';
import {
  computeBedManagementKPIs,
  computeLabKPIs,
  computeSurgicalKPIs,
  computeFinancialKPIs,
  benchmarkKPI,
  STANDARD_BENCHMARKS,
} from '../src/reporting/kpi';
import {
  generateDashboardKPIs,
  renderAsPlainText,
  renderAsCSV,
  buildDailyOperationsReport,
  formatPatientSummaryCSV,
  generateBedUtilisationReport,
} from '../src/reporting/reports';
import type { Bed } from '../src/clinical/ward';
import type { Patient } from '../src/clinical/patient';
import type { LabSample } from '../src/clinical/lab';
import type { SurgicalCase } from '../src/clinical/surgery';
import { BedStatus, BedType } from '../src/clinical/ward';
import { PatientState } from '../src/clinical/patient';
import { SampleStatus } from '../src/clinical/lab';
import { CaseStatus } from '../src/clinical/surgery';

function makeBed(id: string, status: typeof BedStatus[keyof typeof BedStatus], type: typeof BedType[keyof typeof BedType]): Bed {
  return {
    id,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    wardId: 'ward_001',
    roomId: 'room_001',
    bedNumber: id,
    type,
    status,
    isolationPrecautions: [],
  };
}

function makePatient(id: string, state: PatientState = PatientState.Admitted, admittedAt?: string, dischargedAt?: string): Patient {
  return {
    id,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    name: `Patient ${id}`,
    gender: 'M',
    birthdate: '1970-01-01',
    presentingComplaint: 'Test',
    arrivalSource: 'WalkIn',
    state,
    comorbidities: [],
    admittedAt,
    dischargedAt,
  };
}

function makeLabSample(id: string, overrides: Partial<LabSample> = {}): LabSample {
  return {
    id,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    patientId: 'pat_001',
    testType: 'Troponin',
    status: SampleStatus.Verified,
    collectedAt: '2026-01-01T08:00:00Z',
    criticalValueAlert: false,
    criticalValueAcknowledged: false,
    tatSLAThresholdMinutes: 60,
    ...overrides,
  };
}

function makeSurgicalCase(id: string, status: typeof CaseStatus[keyof typeof CaseStatus]): SurgicalCase {
  return {
    id,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    patientId: 'pat_001',
    orRoomId: 'or_001',
    surgeonId: 'staff_001',
    anesthesiologistId: 'staff_002',
    caseType: 'Elective',
    status,
    startTime: '2026-01-05T08:00:00Z',
    endTime: '2026-01-05T10:00:00Z',
  };
}

describe('computeBedManagementKPIs', () => {
  const beds: Bed[] = [
    makeBed('b1', BedStatus.Occupied, BedType.General),
    makeBed('b2', BedStatus.Occupied, BedType.ICU),
    makeBed('b3', BedStatus.Available, BedType.General),
    makeBed('b4', BedStatus.Available, BedType.ICU),
  ];

  it('calculates correct occupancy rate', () => {
    const kpis = computeBedManagementKPIs(beds, [], 30);
    expect(kpis.occupancyRate).toBe(0.5);
    expect(kpis.occupiedBeds).toBe(2);
    expect(kpis.availableBeds).toBe(2);
  });

  it('calculates average LOS for discharged patients', () => {
    const patients = [
      makePatient('p1', PatientState.Discharged, '2026-01-01T08:00:00Z', '2026-01-04T08:00:00Z'),
    ];
    const kpis = computeBedManagementKPIs(beds, patients, 30);
    expect(kpis.averageLengthOfStayDays).toBe(3);
  });

  it('returns zero occupancy for empty bed list', () => {
    const kpis = computeBedManagementKPIs([], [], 30);
    expect(kpis.occupancyRate).toBe(0);
  });
});

describe('computeLabKPIs', () => {
  const samples: LabSample[] = [
    makeLabSample('s1', {
      collectedAt: '2026-01-01T08:00:00Z',
      resultedAt: '2026-01-01T09:00:00Z',
      tatSLAThresholdMinutes: 60,
    }),
    makeLabSample('s2', {
      collectedAt: '2026-01-01T08:00:00Z',
      resultedAt: '2026-01-01T10:00:00Z',
      tatSLAThresholdMinutes: 60, // 120 min — breached
    }),
    makeLabSample('s3', { criticalValueAlert: true, criticalValueAcknowledged: true }),
    makeLabSample('s4', { criticalValueAlert: true, criticalValueAcknowledged: false }),
    makeLabSample('s5', { status: SampleStatus.Rejected }),
  ];

  it('calculates average TAT', () => {
    const kpis = computeLabKPIs(samples);
    expect(kpis.averageTATMinutes).toBe(90); // (60+120)/2
  });

  it('calculates TAT SLA attainment', () => {
    const kpis = computeLabKPIs(samples);
    expect(kpis.tatSLAAttainmentRate).toBe(0.5); // 1/2 met SLA
  });

  it('calculates critical value notification rate', () => {
    const kpis = computeLabKPIs(samples);
    expect(kpis.criticalValueNotificationRate).toBe(0.5); // 1 of 2 acknowledged
  });

  it('counts critical results pending', () => {
    const kpis = computeLabKPIs(samples);
    expect(kpis.criticalResultsPending).toBe(1);
  });

  it('calculates sample rejection rate', () => {
    const kpis = computeLabKPIs(samples);
    expect(kpis.sampleRejectionRate).toBeCloseTo(0.2, 2); // 1/5
  });
});

describe('computeSurgicalKPIs', () => {
  const cases: SurgicalCase[] = [
    makeSurgicalCase('c1', CaseStatus.Completed),
    makeSurgicalCase('c2', CaseStatus.Completed),
    makeSurgicalCase('c3', CaseStatus.Cancelled),
  ];

  it('calculates cancellation rate', () => {
    const kpis = computeSurgicalKPIs(cases);
    expect(kpis.casesCancelled).toBe(1);
    expect(kpis.cancellationRate).toBeCloseTo(1 / 3, 5);
  });

  it('calculates completion count', () => {
    const kpis = computeSurgicalKPIs(cases);
    expect(kpis.totalCasesCompleted).toBe(2);
  });
});

describe('computeFinancialKPIs', () => {
  const claims = [
    {
      id: 'c1', createdAt: '', updatedAt: '',
      encounterId: 'e1', patientId: 'p1', payerId: 'payer_a',
      totalChargeAmount: 10000, allowedAmount: 8000, paidAmount: 8000,
      status: 'Paid' as const, underpaidFlag: false,
    },
    {
      id: 'c2', createdAt: '', updatedAt: '',
      encounterId: 'e2', patientId: 'p2', payerId: 'payer_a',
      totalChargeAmount: 5000,
      status: 'Denied' as const, underpaidFlag: false,
    },
  ];

  it('calculates total charges', () => {
    const kpis = computeFinancialKPIs(claims);
    expect(kpis.totalChargeAmount).toBe(15000);
  });

  it('calculates collection rate', () => {
    const kpis = computeFinancialKPIs(claims);
    expect(kpis.collectionRate).toBeCloseTo(8000 / 15000, 5);
  });

  it('calculates denial rate', () => {
    const kpis = computeFinancialKPIs(claims);
    expect(kpis.deniedClaimsRate).toBe(0.5);
  });
});

describe('benchmarkKPI', () => {
  it('rates excellent occupancy', () => {
    const rating = benchmarkKPI('bedOccupancy', 0.88, STANDARD_BENCHMARKS.bedOccupancyRate);
    expect(rating).toBe('Excellent');
  });

  it('rates poor collection rate', () => {
    const rating = benchmarkKPI('collection', 0.50, STANDARD_BENCHMARKS.claimCollectionRate);
    expect(rating).toBe('Poor');
  });

  it('rates acceptable SLA', () => {
    const rating = benchmarkKPI('sla', 0.87, STANDARD_BENCHMARKS.slaAttainmentRate);
    expect(rating).toBe('Acceptable');
  });
});

describe('renderAsPlainText', () => {
  const now = '2026-01-01T00:00:00Z';
  const kpis = generateDashboardKPIs([], [], [], [], [], [], '2026-01-01T00:00:00Z', '2026-01-31T00:00:00Z', now);

  it('produces non-empty report', () => {
    const text = renderAsPlainText(kpis);
    expect(text.length).toBeGreaterThan(100);
  });

  it('includes all major sections', () => {
    const text = renderAsPlainText(kpis);
    expect(text).toContain('BED MANAGEMENT');
    expect(text).toContain('LABORATORY');
    expect(text).toContain('RADIOLOGY');
    expect(text).toContain('SURGICAL');
    expect(text).toContain('FINANCIAL');
  });
});

describe('renderAsCSV', () => {
  const now = '2026-01-01T00:00:00Z';
  const kpis = generateDashboardKPIs([], [], [], [], [], [], '2026-01-01T00:00:00Z', '2026-01-31T00:00:00Z', now);

  it('produces CSV with header row', () => {
    const csv = renderAsCSV(kpis);
    expect(csv.split('\n')[0]).toContain('category,metric,value,unit');
  });

  it('contains multiple data rows', () => {
    const csv = renderAsCSV(kpis);
    expect(csv.split('\n').length).toBeGreaterThan(5);
  });
});

describe('buildDailyOperationsReport', () => {
  const patients = [
    makePatient('p1', PatientState.Admitted, '2026-01-05T09:00:00Z'),
    makePatient('p2', PatientState.Discharged, '2026-01-04T09:00:00Z', '2026-01-05T14:00:00Z'),
  ];
  const beds = [
    makeBed('b1', BedStatus.Occupied, BedType.General),
    makeBed('b2', BedStatus.Available, BedType.General),
  ];

  it('counts admissions on the given date', () => {
    const report = buildDailyOperationsReport('2026-01-05T00:00:00Z', patients, beds);
    expect(report.admissions).toBe(1);
  });

  it('counts discharges on the given date', () => {
    const report = buildDailyOperationsReport('2026-01-05T00:00:00Z', patients, beds);
    expect(report.discharges).toBe(1);
  });

  it('calculates bed occupancy rate', () => {
    const report = buildDailyOperationsReport('2026-01-05T00:00:00Z', patients, beds);
    expect(report.bedOccupancyRate).toBe(0.5);
  });
});

describe('formatPatientSummaryCSV', () => {
  it('produces CSV with header', () => {
    const patients = [makePatient('p1')];
    const csv = formatPatientSummaryCSV(patients);
    expect(csv.split('\n')[0]).toContain('id,name');
  });

  it('includes all patients', () => {
    const patients = [makePatient('p1'), makePatient('p2')];
    const csv = formatPatientSummaryCSV(patients);
    expect(csv.split('\n').length).toBe(3); // header + 2 rows
  });
});

describe('generateBedUtilisationReport', () => {
  it('produces report with bed rows', () => {
    const beds = [makeBed('b1', BedStatus.Occupied, BedType.ICU)];
    const report = generateBedUtilisationReport(beds, '2026-01-01T00:00:00Z');
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]!.bedId).toBe('b1');
  });
});
