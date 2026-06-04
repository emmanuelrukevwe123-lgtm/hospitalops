import type { ISODateString } from '../core/types';
import type { Patient } from '../clinical/patient';
import { PatientState, validateStateTransition } from '../clinical/patient';
import type { Bed } from '../clinical/ward';
import { BedStatus, BedType, validateBedStatusTransition, checkIsolationEnforcement } from '../clinical/ward';
import type { Clinician } from '../clinical/staff';
import { verifyCredentials } from '../clinical/staff';
import { preconditionFailed, validation } from '../core/errors';
import type { Department } from '../core/enums';

export interface AdmissionRequest {
  patientId: string;
  bedId: string;
  assignedDoctorId: string;
  admissionReason: string;
  estimatedLengthOfStayDays?: number;
  isEmergency: boolean;
}

export interface AdmissionResult {
  patient: Patient;
  bed: Bed;
  assignedDoctor: Clinician;
  admittedAt: ISODateString;
  estimatedDischargeDate?: ISODateString;
  warnings: string[];
}

export interface TriageWorkflow {
  patientId: string;
  triageNurseId: string;
  triagedAt: ISODateString;
  newsScore?: number;
  immediateInterventionsRequired: string[];
  recommendedBedType: BedType;
}

export function determineBedTypeFromTriage(
  priorityScore: number,
  hasInfectiousRisk: boolean,
  requiresSurgery: boolean,
  requiresICU: boolean,
): BedType {
  if (requiresICU || priorityScore > 110) return BedType.ICU;
  if (requiresSurgery) return BedType.Surgical;
  if (hasInfectiousRisk) return BedType.Isolation;
  return BedType.General;
}

export function findSuitableBeds(
  availableBeds: Bed[],
  requiredType: BedType,
  isPatientInfectious: boolean,
  requiredPrecautions: string[] = [],
): Bed[] {
  return availableBeds.filter((bed) => {
    if (bed.status !== BedStatus.Available) return false;
    if (bed.type !== requiredType) return false;
    if (isPatientInfectious) {
      if (bed.type !== BedType.Isolation) return false;
      for (const prec of requiredPrecautions) {
        if (!bed.isolationPrecautions.includes(prec)) return false;
      }
    }
    return true;
  });
}

export function selectOptimalBed(beds: Bed[]): Bed | undefined {
  if (beds.length === 0) return undefined;
  // Prefer beds by room number (lower room = closer to nursing station)
  return beds.sort((a, b) => a.roomId.localeCompare(b.roomId))[0];
}

export function validateAdmissionRequest(
  request: AdmissionRequest,
  patient: Patient,
  bed: Bed,
  doctor: Clinician,
  now: Date,
): string[] {
  const warnings: string[] = [];

  // Patient state
  if (
    patient.state !== PatientState.Triaged &&
    patient.state !== PatientState.Registered &&
    !request.isEmergency
  ) {
    throw preconditionFailed(
      `Cannot admit patient in state ${patient.state}. Patient must be triaged or registered.`,
    );
  }

  // Bed availability
  if (bed.status !== BedStatus.Available && bed.status !== BedStatus.Reserved) {
    throw preconditionFailed(`Bed ${bed.id} is not available for admission. Current status: ${bed.status}`);
  }

  // Doctor credentials
  try {
    verifyCredentials(doctor, now);
  } catch {
    warnings.push(`Doctor credentials check failed for ${doctor.id}. Admitting under exception.`);
  }

  // Infection control
  const isInfectious = patient.comorbidities.some((c) =>
    ['mrsa', 'covid', 'vre', 'c.diff', 'tb'].some((pathogen) => c.toLowerCase().includes(pathogen)),
  );
  if (isInfectious && bed.type !== BedType.Isolation) {
    throw preconditionFailed(
      `Patient has infectious risk. An isolation bed is required but bed ${bed.id} is type ${bed.type}.`,
    );
  }
  checkIsolationEnforcement(bed, isInfectious);

  // Emergency bypass
  if (request.isEmergency && patient.state === PatientState.Registered) {
    warnings.push('Emergency bypass: patient admitted without triage completion');
  }

  return warnings;
}

export function executeAdmission(
  patient: Patient,
  bed: Bed,
  doctor: Clinician,
  request: AdmissionRequest,
  now: ISODateString,
  warnings: string[],
): AdmissionResult {
  const targetState = PatientState.Admitted;
  if (patient.state !== targetState) {
    validateStateTransition(patient.state, targetState);
  }

  const updatedPatient: Patient = {
    ...patient,
    state: PatientState.Admitted,
    assignedBedId: bed.id,
    assignedDoctorId: doctor.id,
    admittedAt: now,
    updatedAt: now,
  };

  if (request.estimatedLengthOfStayDays) {
    const dischargeDateMs = new Date(now).getTime() + request.estimatedLengthOfStayDays * 86_400_000;
    updatedPatient.dischargeTargetSLA = new Date(dischargeDateMs).toISOString();
  }

  const updatedBed: Bed = {
    ...bed,
    status: BedStatus.Occupied,
    assignedPatientId: patient.id,
    updatedAt: now,
  };

  const estimatedDischargeDate = updatedPatient.dischargeTargetSLA;

  return {
    patient: updatedPatient,
    bed: updatedBed,
    assignedDoctor: doctor,
    admittedAt: now,
    estimatedDischargeDate,
    warnings,
  };
}

export function runTriageWorkflow(
  patient: Patient,
  triageNurseId: string,
  assessedNewsScore: number,
  now: ISODateString,
): TriageWorkflow {
  const immediateInterventions: string[] = [];

  if (assessedNewsScore >= 7) {
    immediateInterventions.push('Activate MET/Rapid Response immediately');
    immediateInterventions.push('Continuous monitoring');
    immediateInterventions.push('IV access x2 large bore');
  } else if (assessedNewsScore >= 5) {
    immediateInterventions.push('Urgent medical review within 30 minutes');
    immediateInterventions.push('IV access');
    immediateInterventions.push('12-lead ECG');
  }

  const hasRespiratoryComplaint = patient.presentingComplaint.toLowerCase().includes('breath') ||
    patient.presentingComplaint.toLowerCase().includes('respiratory');
  if (hasRespiratoryComplaint) {
    immediateInterventions.push('Supplemental oxygen to maintain SpO2 ≥94%');
  }

  const hasChestPain = patient.presentingComplaint.toLowerCase().includes('chest');
  if (hasChestPain) {
    immediateInterventions.push('12-lead ECG within 10 minutes');
    immediateInterventions.push('Troponin level, serial ECGs');
  }

  const requiresICU = assessedNewsScore >= 7;
  const isInfectious = patient.comorbidities.some((c) =>
    ['mrsa', 'covid', 'vre'].some((p) => c.toLowerCase().includes(p)),
  );
  const recommendedBedType = requiresICU
    ? BedType.ICU
    : isInfectious
    ? BedType.Isolation
    : BedType.General;

  return {
    patientId: patient.id,
    triageNurseId,
    triagedAt: now,
    newsScore: assessedNewsScore,
    immediateInterventionsRequired: immediateInterventions,
    recommendedBedType,
  };
}

export function reassignBed(
  currentBed: Bed,
  newBed: Bed,
  patient: Patient,
  reason: string,
  now: ISODateString,
): { updatedCurrentBed: Bed; updatedNewBed: Bed; updatedPatient: Patient } {
  if (newBed.status !== BedStatus.Available) {
    throw preconditionFailed(
      `Cannot reassign to bed ${newBed.id}: bed is not available (status: ${newBed.status})`,
    );
  }
  if (!reason.trim()) {
    throw validation('A reason for bed reassignment must be provided');
  }

  validateBedStatusTransition(currentBed.status, BedStatus.Cleaning);
  validateBedStatusTransition(newBed.status, BedStatus.Occupied);

  return {
    updatedCurrentBed: {
      ...currentBed,
      status: BedStatus.Cleaning,
      assignedPatientId: undefined,
      updatedAt: now,
    },
    updatedNewBed: {
      ...newBed,
      status: BedStatus.Occupied,
      assignedPatientId: patient.id,
      updatedAt: now,
    },
    updatedPatient: {
      ...patient,
      assignedBedId: newBed.id,
      updatedAt: now,
    },
  };
}

export function findCoverageForDepartment(
  staff: Clinician[],
  department: Department,
  _now: Date,
): { onDuty: Clinician[]; onCall: Clinician[]; adequate: boolean } {
  const onDuty = staff.filter(
    (s) => s.department === department && s.status === 'OnDuty',
  );
  const onCall = staff.filter(
    (s) => s.department === department && s.status === 'OnCall',
  );
  return {
    onDuty,
    onCall,
    adequate: onDuty.length > 0,
  };
}
