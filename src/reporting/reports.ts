import type { ISODateString } from '../core/types';
import type { Patient } from '../clinical/patient';
import type { Bed } from '../clinical/ward';
import type { LabSample } from '../clinical/lab';
import type { ImagingStudy } from '../clinical/radiology';
import type { SurgicalCase } from '../clinical/surgery';
import type { InsuranceClaim } from '../billing/billing';
import type { DashboardKPIs } from './kpi';
import {
  computeBedManagementKPIs,
  computeLabKPIs,
  computeRadiologyKPIs,
  computeSurgicalKPIs,
  computeFinancialKPIs,
} from './kpi';

export const ReportFormat = {
  JSON: 'JSON',
  CSV: 'CSV',
  PlainText: 'PlainText',
} as const;
export type ReportFormat = (typeof ReportFormat)[keyof typeof ReportFormat];

export const ReportType = {
  DailyOperations: 'DailyOperations',
  WeeklyClinicalQuality: 'WeeklyClinicalQuality',
  MonthlyFinancial: 'MonthlyFinancial',
  BedManagement: 'BedManagement',
  InfectionControl: 'InfectionControl',
  PatientSafety: 'PatientSafety',
  LabTurnaround: 'LabTurnaround',
  SurgicalPerformance: 'SurgicalPerformance',
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export interface ReportRequest {
  type: ReportType;
  format: ReportFormat;
  periodStart: ISODateString;
  periodEnd: ISODateString;
  requestedBy: string;
  requestedAt: ISODateString;
  filters?: Record<string, string>;
}

export interface ReportOutput {
  request: ReportRequest;
  generatedAt: ISODateString;
  rowCount: number;
  content: string;
  summary: Record<string, number | string>;
}

export interface DailyOperationsReport {
  date: ISODateString;
  admissions: number;
  discharges: number;
  transfers: number;
  deaths: number;
  averageLOS: number;
  bedOccupancyRate: number;
  newPatients: number;
  pendingDischarges: number;
  slaBreaches: number;
  criticalAlerts: number;
}

export function generateDashboardKPIs(
  patients: Patient[],
  beds: Bed[],
  labSamples: LabSample[],
  imagingStudies: ImagingStudy[],
  surgicalCases: SurgicalCase[],
  insuranceClaims: InsuranceClaim[],
  periodStart: ISODateString,
  periodEnd: ISODateString,
  now: ISODateString,
): DashboardKPIs {
  const periodDays = Math.ceil(
    (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86_400_000,
  );

  return {
    reportedAt: now,
    period: { start: periodStart, end: periodEnd },
    bedManagement: computeBedManagementKPIs(beds, patients, periodDays),
    clinicalQuality: {},
    laboratory: computeLabKPIs(labSamples),
    radiology: computeRadiologyKPIs(imagingStudies),
    surgical: computeSurgicalKPIs(surgicalCases),
    financial: computeFinancialKPIs(insuranceClaims),
  };
}

export function renderAsPlainText(kpis: DashboardKPIs): string {
  const lines: string[] = [];
  lines.push('='.repeat(60));
  lines.push(`  HOSPITAL OPERATIONS DASHBOARD`);
  lines.push(`  Report Period: ${kpis.period.start.slice(0, 10)} to ${kpis.period.end.slice(0, 10)}`);
  lines.push(`  Generated: ${kpis.reportedAt}`);
  lines.push('='.repeat(60));

  lines.push('');
  lines.push('BED MANAGEMENT');
  lines.push('-'.repeat(40));
  const bm = kpis.bedManagement;
  lines.push(`  Total Beds:          ${bm.totalBeds}`);
  lines.push(`  Occupied Beds:       ${bm.occupiedBeds}`);
  lines.push(`  Available Beds:      ${bm.availableBeds}`);
  lines.push(`  Occupancy Rate:      ${(bm.occupancyRate * 100).toFixed(1)}%`);
  lines.push(`  Avg Length of Stay:  ${bm.averageLengthOfStayDays.toFixed(1)} days`);
  lines.push(`  Bed Turnover Rate:   ${bm.bedTurnoverRate.toFixed(2)}`);

  lines.push('');
  lines.push('LABORATORY');
  lines.push('-'.repeat(40));
  const lab = kpis.laboratory;
  lines.push(`  Avg TAT:             ${lab.averageTATMinutes} min`);
  lines.push(`  TAT SLA Rate:        ${(lab.tatSLAAttainmentRate * 100).toFixed(1)}%`);
  lines.push(`  Critical Notif Rate: ${(lab.criticalValueNotificationRate * 100).toFixed(1)}%`);
  lines.push(`  Rejection Rate:      ${(lab.sampleRejectionRate * 100).toFixed(2)}%`);
  lines.push(`  Critical Pending:    ${lab.criticalResultsPending}`);

  lines.push('');
  lines.push('RADIOLOGY');
  lines.push('-'.repeat(40));
  const rad = kpis.radiology;
  lines.push(`  Studies Ordered:     ${rad.studiesOrdered}`);
  lines.push(`  Studies Completed:   ${rad.studiesCompleted}`);
  lines.push(`  Reports Verified:    ${(rad.reportVerificationRate * 100).toFixed(1)}%`);
  lines.push(`  Avg Report TAT:      ${rad.averageReportingTATMinutes} min`);

  lines.push('');
  lines.push('SURGICAL');
  lines.push('-'.repeat(40));
  const surg = kpis.surgical;
  lines.push(`  Cases Scheduled:     ${surg.totalCasesScheduled}`);
  lines.push(`  Cases Completed:     ${surg.totalCasesCompleted}`);
  lines.push(`  Cancellation Rate:   ${(surg.cancellationRate * 100).toFixed(1)}%`);
  lines.push(`  OR Utilisation:      ${surg.averageORUtilisationPercent.toFixed(1)}%`);

  lines.push('');
  lines.push('FINANCIAL');
  lines.push('-'.repeat(40));
  const fin = kpis.financial;
  lines.push(`  Total Charges:       $${fin.totalChargeAmount.toLocaleString()}`);
  lines.push(`  Total Collected:     $${fin.totalCollectedAmount.toLocaleString()}`);
  lines.push(`  Collection Rate:     ${(fin.collectionRate * 100).toFixed(1)}%`);
  lines.push(`  Denial Rate:         ${(fin.deniedClaimsRate * 100).toFixed(1)}%`);
  lines.push(`  Outstanding:         $${fin.outstandingBalanceAmount.toLocaleString()}`);

  lines.push('');
  lines.push('='.repeat(60));
  return lines.join('\n');
}

export function renderAsCSV(kpis: DashboardKPIs): string {
  const rows: string[] = ['category,metric,value,unit'];
  const bm = kpis.bedManagement;
  rows.push(`BedManagement,TotalBeds,${bm.totalBeds},count`);
  rows.push(`BedManagement,OccupiedBeds,${bm.occupiedBeds},count`);
  rows.push(`BedManagement,OccupancyRate,${(bm.occupancyRate * 100).toFixed(2)},%`);
  rows.push(`BedManagement,AvgLOS,${bm.averageLengthOfStayDays.toFixed(2)},days`);

  const lab = kpis.laboratory;
  rows.push(`Laboratory,AvgTATMinutes,${lab.averageTATMinutes},minutes`);
  rows.push(`Laboratory,TATSLARate,${(lab.tatSLAAttainmentRate * 100).toFixed(2)},%`);
  rows.push(`Laboratory,CriticalPending,${lab.criticalResultsPending},count`);

  const rad = kpis.radiology;
  rows.push(`Radiology,StudiesOrdered,${rad.studiesOrdered},count`);
  rows.push(`Radiology,ReportVerificationRate,${(rad.reportVerificationRate * 100).toFixed(2)},%`);

  const fin = kpis.financial;
  rows.push(`Financial,TotalCharges,${fin.totalChargeAmount.toFixed(2)},USD`);
  rows.push(`Financial,CollectionRate,${(fin.collectionRate * 100).toFixed(2)},%`);
  rows.push(`Financial,DenialRate,${(fin.deniedClaimsRate * 100).toFixed(2)},%`);

  return rows.join('\n');
}

export function buildDailyOperationsReport(
  date: ISODateString,
  patients: Patient[],
  beds: Bed[],
): DailyOperationsReport {
  const dateStr = date.slice(0, 10);
  const dayStart = new Date(dateStr + 'T00:00:00.000Z').getTime();
  const dayEnd = dayStart + 86_400_000;

  const admissions = patients.filter((p) => {
    if (!p.admittedAt) return false;
    const t = new Date(p.admittedAt).getTime();
    return t >= dayStart && t < dayEnd;
  }).length;

  const discharges = patients.filter((p) => {
    if (!p.dischargedAt) return false;
    const t = new Date(p.dischargedAt).getTime();
    return t >= dayStart && t < dayEnd;
  }).length;

  const deaths = patients.filter((p) => p.state === 'Deceased').length;

  const dischargedWithLOS = patients.filter((p) => p.admittedAt && p.dischargedAt);
  const totalLOS = dischargedWithLOS.reduce((acc, p) => {
    return acc + (new Date(p.dischargedAt!).getTime() - new Date(p.admittedAt!).getTime()) / 86_400_000;
  }, 0);
  const averageLOS = dischargedWithLOS.length > 0 ? totalLOS / dischargedWithLOS.length : 0;

  const occupiedBeds = beds.filter((b) => b.status === 'Occupied').length;
  const bedOccupancyRate = beds.length > 0 ? occupiedBeds / beds.length : 0;

  return {
    date,
    admissions,
    discharges,
    transfers: 0,
    deaths,
    averageLOS: Math.round(averageLOS * 10) / 10,
    bedOccupancyRate,
    newPatients: admissions,
    pendingDischarges: 0,
    slaBreaches: 0,
    criticalAlerts: 0,
  };
}

export function formatPatientSummaryCSV(patients: Patient[]): string {
  const header = 'id,name,gender,state,triageLevel,priorityScore,admittedAt,dischargedAt,los';
  const rows = patients.map((p) => {
    const los =
      p.admittedAt && p.dischargedAt
        ? Math.ceil(
            (new Date(p.dischargedAt).getTime() - new Date(p.admittedAt).getTime()) / 86_400_000,
          )
        : '';
    return [
      p.id,
      `"${p.name}"`,
      p.gender,
      p.state,
      p.triageLevel ?? '',
      p.priorityScore ?? '',
      p.admittedAt ?? '',
      p.dischargedAt ?? '',
      los,
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

export function generateBedUtilisationReport(
  beds: Bed[],
  reportDate: ISODateString,
): { reportDate: ISODateString; rows: { bedId: string; type: string; status: string; assignedTo: string | null }[] } {
  return {
    reportDate,
    rows: beds.map((b) => ({
      bedId: b.id,
      type: b.type,
      status: b.status,
      assignedTo: b.assignedPatientId ?? null,
    })),
  };
}
