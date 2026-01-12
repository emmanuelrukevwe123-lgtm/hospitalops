import type { Patient } from '../clinical/patient';
import type { Bed } from '../clinical/ward';
import { BedStatus } from '../clinical/ward';

export interface SLAAttainmentReport {
  totalPatients: number;
  triageToDoctorMet: number;
  triageToDoctorTotal: number;
  triageToDoctorRate: number;
}

/** Calculate SLA attainment for patient triage-to-doctor times. */
export function calculateSLAAttainment(patients: Patient[]): SLAAttainmentReport {
  let met = 0;
  let total = 0;

  for (const pat of patients) {
    if (pat.triageTime && pat.admittedAt && pat.triageToDoctorSLA) {
      total++;
      const admitTime = new Date(pat.admittedAt).getTime();
      const slaTime = new Date(pat.triageToDoctorSLA).getTime();

      if (admitTime <= slaTime) {
        met++;
      }
    }
  }

  return {
    totalPatients: patients.length,
    triageToDoctorMet: met,
    triageToDoctorTotal: total,
    triageToDoctorRate: total > 0 ? met / total : 1,
  };
}

/** Compute bed occupancy rate percentage. */
export function calculateBedOccupancy(beds: Bed[]): number {
  if (beds.length === 0) return 0;
  const occupied = beds.filter((b) => b.status === BedStatus.Occupied).length;
  return occupied / beds.length;
}

/** Calculate readmission rate percentage (readmitted within 30 days). */
export function calculateReadmissionRate(
  allAdmissions: { patientId: string; admissionDate: string }[],
  allDischarges: { patientId: string; dischargeDate: string }[],
): number {
  if (allDischarges.length === 0) return 0;

  let readmittedCount = 0;

  for (const dis of allDischarges) {
    const disTime = new Date(dis.dischargeDate).getTime();

    // Check if there is an admission for the same patient within 30 days after discharge
    const readmission = allAdmissions.find((adm) => {
      if (adm.patientId !== dis.patientId) return false;
      const admTime = new Date(adm.admissionDate).getTime();
      const diffMs = admTime - disTime;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      return diffMs > 0 && diffMs <= thirtyDaysMs;
    });

    if (readmission) {
      readmittedCount++;
    }
  }

  return readmittedCount / allDischarges.length;
}
