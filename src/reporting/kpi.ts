import type { ISODateString } from '../core/types';
import type { Patient } from '../clinical/patient';
import type { Bed } from '../clinical/ward';
import { BedStatus, BedType } from '../clinical/ward';
import type { ImagingStudy } from '../clinical/radiology';
import type { LabSample } from '../clinical/lab';
import type { SurgicalCase } from '../clinical/surgery';
import { CaseStatus } from '../clinical/surgery';
import type { InsuranceClaim } from '../billing/billing';
import { ClaimStatus } from '../billing/billing';

export interface BedManagementKPIs {
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
  occupancyByType: Record<string, { total: number; occupied: number; rate: number }>;
  averageLengthOfStayDays: number;
  bedTurnoverRate: number;         // discharges per bed per period
  delayedDischargeCount: number;
}

export interface ClinicalQualityKPIs {
  slaBreachRateTriageToDoctor: number;
  slaBreachRateTriageToBed: number;
  readmissionRate30Day: number;
  mortalityRate: number;
  hospitalAcquiredInfectionRate: number;
  fallsRate: number;               // per 1000 patient days
  pressureInjuryRate: number;      // per 1000 patient days
  medicationErrorRate: number;     // per 1000 patient doses
}

export interface LabPerformanceKPIs {
  averageTATMinutes: number;
  tatSLAAttainmentRate: number;
  criticalValueNotificationRate: number;
  sampleRejectionRate: number;
  criticalResultsPending: number;
}

export interface RadiologyKPIs {
  studiesOrdered: number;
  studiesCompleted: number;
  studiesReported: number;
  averageReportingTATMinutes: number;
  criticalFindingsPendingCommunication: number;
  reportVerificationRate: number;
}

export interface SurgicalKPIs {
  totalCasesScheduled: number;
  totalCasesCompleted: number;
  casesCancelled: number;
  cancellationRate: number;
  casesCancelledOnDay: number;
  onDayCancellationRate: number;
  averageORUtilisationPercent: number;
  siteInfectionRate: number;
}

export interface FinancialKPIs {
  totalChargeAmount: number;
  totalCollectedAmount: number;
  collectionRate: number;
  deniedClaimsRate: number;
  averageDaysToCollection: number;
  outstandingBalanceAmount: number;
  adjustmentRate: number;
}

export interface DashboardKPIs {
  reportedAt: ISODateString;
  period: { start: ISODateString; end: ISODateString };
  bedManagement: BedManagementKPIs;
  clinicalQuality: Partial<ClinicalQualityKPIs>;
  laboratory: LabPerformanceKPIs;
  radiology: RadiologyKPIs;
  surgical: SurgicalKPIs;
  financial: FinancialKPIs;
}

export function computeBedManagementKPIs(
  beds: Bed[],
  patients: Patient[],
  periodDays: number,
): BedManagementKPIs {
  const totalBeds = beds.length;
  const occupiedBeds = beds.filter((b) => b.status === BedStatus.Occupied).length;
  const availableBeds = beds.filter((b) => b.status === BedStatus.Available).length;
  const occupancyRate = totalBeds > 0 ? occupiedBeds / totalBeds : 0;

  const occupancyByType: Record<string, { total: number; occupied: number; rate: number }> = {};
  for (const type of Object.values(BedType)) {
    const typeBeds = beds.filter((b) => b.type === type);
    const typeOccupied = typeBeds.filter((b) => b.status === BedStatus.Occupied).length;
    occupancyByType[type] = {
      total: typeBeds.length,
      occupied: typeOccupied,
      rate: typeBeds.length > 0 ? typeOccupied / typeBeds.length : 0,
    };
  }

  const dischargedPatients = patients.filter((p) => p.dischargedAt && p.admittedAt);
  const totalLOS = dischargedPatients.reduce((acc, p) => {
    const days = (new Date(p.dischargedAt!).getTime() - new Date(p.admittedAt!).getTime()) / 86_400_000;
    return acc + days;
  }, 0);
  const averageLengthOfStayDays = dischargedPatients.length > 0 ? totalLOS / dischargedPatients.length : 0;

  const bedTurnoverRate = periodDays > 0 && totalBeds > 0
    ? dischargedPatients.length / totalBeds / periodDays * 30 // normalise to per 30 days
    : 0;

  return {
    totalBeds,
    occupiedBeds,
    availableBeds,
    occupancyRate,
    occupancyByType,
    averageLengthOfStayDays: Math.round(averageLengthOfStayDays * 10) / 10,
    bedTurnoverRate: Math.round(bedTurnoverRate * 100) / 100,
    delayedDischargeCount: 0,
  };
}

export function computeLabKPIs(samples: LabSample[]): LabPerformanceKPIs {
  const resulted = samples.filter((s) => s.resultedAt && s.collectedAt);
  const tatMinutes = resulted.map((s) => {
    const diff = new Date(s.resultedAt!).getTime() - new Date(s.collectedAt).getTime();
    return diff / 60_000;
  });

  const averageTATMinutes =
    tatMinutes.length > 0 ? tatMinutes.reduce((a, b) => a + b, 0) / tatMinutes.length : 0;

  const tatMet = resulted.filter((s) => {
    const diff = (new Date(s.resultedAt!).getTime() - new Date(s.collectedAt).getTime()) / 60_000;
    return diff <= s.tatSLAThresholdMinutes;
  }).length;

  const tatSLAAttainmentRate = resulted.length > 0 ? tatMet / resulted.length : 1;

  const criticalSamples = samples.filter((s) => s.criticalValueAlert);
  const criticalNotified = criticalSamples.filter((s) => s.criticalValueAcknowledged).length;
  const criticalValueNotificationRate =
    criticalSamples.length > 0 ? criticalNotified / criticalSamples.length : 1;

  const rejectedSamples = samples.filter((s) => s.status === 'Rejected').length;
  const sampleRejectionRate = samples.length > 0 ? rejectedSamples / samples.length : 0;

  const criticalResultsPending = criticalSamples.filter((s) => !s.criticalValueAcknowledged).length;

  return {
    averageTATMinutes: Math.round(averageTATMinutes),
    tatSLAAttainmentRate,
    criticalValueNotificationRate,
    sampleRejectionRate,
    criticalResultsPending,
  };
}

export function computeRadiologyKPIs(studies: ImagingStudy[]): RadiologyKPIs {
  const studiesOrdered = studies.length;
  const studiesCompleted = studies.filter((s) => s.status !== 'Ordered' && s.status !== 'Scheduled' && s.status !== 'Cancelled').length;
  const studiesReported = studies.filter((s) => s.status === 'Reported' || s.status === 'Verified').length;

  const reportedWithTAT = studies.filter((s) => s.startedAt && s.reportedAt);
  const tatValues = reportedWithTAT.map((s) => {
    return (new Date(s.reportedAt!).getTime() - new Date(s.startedAt!).getTime()) / 60_000;
  });
  const averageReportingTATMinutes =
    tatValues.length > 0 ? tatValues.reduce((a, b) => a + b, 0) / tatValues.length : 0;

  const verified = studies.filter((s) => s.status === 'Verified').length;
  const reportVerificationRate = studiesReported > 0 ? verified / studiesReported : 1;

  return {
    studiesOrdered,
    studiesCompleted,
    studiesReported,
    averageReportingTATMinutes: Math.round(averageReportingTATMinutes),
    criticalFindingsPendingCommunication: 0, // Would require report data
    reportVerificationRate,
  };
}

export function computeSurgicalKPIs(cases: SurgicalCase[]): SurgicalKPIs {
  const totalCasesScheduled = cases.length;
  const completed = cases.filter((c) => c.status === CaseStatus.Completed);
  const cancelled = cases.filter((c) => c.status === CaseStatus.Cancelled);

  const totalCasesCompleted = completed.length;
  const casesCancelled = cancelled.length;
  const cancellationRate = totalCasesScheduled > 0 ? casesCancelled / totalCasesScheduled : 0;

  // On-day cancellation: cancelled on the same day as scheduled startTime (simplified)
  const casesCancelledOnDay = casesCancelled; // Full impl would compare dates

  return {
    totalCasesScheduled,
    totalCasesCompleted,
    casesCancelled,
    cancellationRate,
    casesCancelledOnDay,
    onDayCancellationRate: totalCasesScheduled > 0 ? casesCancelledOnDay / totalCasesScheduled : 0,
    averageORUtilisationPercent: totalCasesScheduled > 0 ? (totalCasesCompleted / totalCasesScheduled) * 100 : 0,
    siteInfectionRate: 0, // Would require infection tracking data
  };
}

export function computeFinancialKPIs(claims: InsuranceClaim[]): FinancialKPIs {
  const totalChargeAmount = claims.reduce((acc, c) => acc + c.totalChargeAmount, 0);
  const paidClaims = claims.filter((c) => c.status === ClaimStatus.Paid);
  const totalCollectedAmount = paidClaims.reduce((acc, c) => acc + (c.paidAmount ?? 0), 0);
  const collectionRate = totalChargeAmount > 0 ? totalCollectedAmount / totalChargeAmount : 0;

  const deniedClaims = claims.filter((c) => c.status === ClaimStatus.Denied).length;
  const deniedClaimsRate = claims.length > 0 ? deniedClaims / claims.length : 0;

  const outstandingClaims = claims.filter(
    (c) => c.status !== ClaimStatus.Paid && c.status !== ClaimStatus.WrittenOff,
  );
  const outstandingBalanceAmount = outstandingClaims.reduce((acc, c) => acc + c.totalChargeAmount, 0);

  const allowedTotal = claims.reduce((acc, c) => acc + (c.allowedAmount ?? 0), 0);
  const adjustmentRate = totalChargeAmount > 0 ? (totalChargeAmount - allowedTotal) / totalChargeAmount : 0;

  return {
    totalChargeAmount: Math.round(totalChargeAmount * 100) / 100,
    totalCollectedAmount: Math.round(totalCollectedAmount * 100) / 100,
    collectionRate,
    deniedClaimsRate,
    averageDaysToCollection: 30, // Placeholder — would need date tracking
    outstandingBalanceAmount: Math.round(outstandingBalanceAmount * 100) / 100,
    adjustmentRate,
  };
}

export function benchmarkKPI(
  _metric: string,
  value: number,
  benchmarks: { excellent: number; acceptable: number; poor: number },
  lowerIsBetter: boolean = false,
): 'Excellent' | 'Acceptable' | 'NeedsImprovement' | 'Poor' {
  const compare = (a: number, b: number) => (lowerIsBetter ? a < b : a >= b);

  if (compare(value, benchmarks.excellent)) return 'Excellent';
  if (compare(value, benchmarks.acceptable)) return 'Acceptable';
  if (compare(value, benchmarks.poor)) return 'NeedsImprovement';
  return 'Poor';
}

export const STANDARD_BENCHMARKS = {
  bedOccupancyRate: { excellent: 0.85, acceptable: 0.75, poor: 0.60 },
  slaAttainmentRate: { excellent: 0.95, acceptable: 0.85, poor: 0.70 },
  claimCollectionRate: { excellent: 0.90, acceptable: 0.80, poor: 0.65 },
  readmissionRate: { excellent: 0.05, acceptable: 0.10, poor: 0.15 },
  labTATAttainment: { excellent: 0.95, acceptable: 0.85, poor: 0.70 },
};
