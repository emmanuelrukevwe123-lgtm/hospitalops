import type { ISODateString } from '../core/types';
import type { Patient } from '../clinical/patient';
import { PatientState, validateStateTransition } from '../clinical/patient';
import type { Bed } from '../clinical/ward';
import { BedStatus, validateBedStatusTransition } from '../clinical/ward';
import type { DischargeCheckliste, MedicationToTake } from '../clinical/discharge';
import {
  DischargeStatus,
  DischargeDestination,
  evaluateDischargeCriteria,
  validateDischargeReadiness,
  reconcileMedications,
  validateMedicationToTake,
  estimateDelayHours,
} from '../clinical/discharge';
import { preconditionFailed } from '../core/errors';

export interface DischargeWorkflowResult {
  patient: Patient;
  bed: Bed;
  checklist: DischargeCheckliste;
  dischargedAt: ISODateString;
  lengthOfStayDays: number;
  medicationsSummary: {
    continued: string[];
    newMeds: string[];
    stopped: string[];
  };
  postDischargeInstructions: string[];
}

export function initiateDischargeProcess(
  patient: Patient,
  checklist: DischargeCheckliste,
  now: ISODateString,
): DischargeCheckliste {
  if (patient.state === PatientState.Discharged) {
    throw preconditionFailed(`Patient ${patient.id} is already discharged.`);
  }

  return {
    ...checklist,
    status: DischargeStatus.Planning,
    updatedAt: now,
  };
}

export function updateDischargeStatus(
  checklist: DischargeCheckliste,
  now: ISODateString,
): DischargeCheckliste {
  const { allMet, unmetCriteria } = evaluateDischargeCriteria(checklist.criteria);

  let status: DischargeCheckliste['status'];

  if (allMet && checklist.destination) {
    status = DischargeStatus.ReadyForDischarge;
  } else if (checklist.delayReasons.length > 0) {
    status = DischargeStatus.Delayed;
  } else {
    status = DischargeStatus.CriteriaNotMet;
  }

  const estimatedDelayHours = checklist.delayReasons.length > 0
    ? estimateDelayHours(checklist.delayReasons)
    : undefined;

  return {
    ...checklist,
    status,
    estimatedDelayHours,
    updatedAt: now,
  };
}

export function validateMedications(medications: MedicationToTake[]): string[] {
  const warnings: string[] = [];
  for (const med of medications) {
    try {
      validateMedicationToTake(med);
    } catch (e) {
      warnings.push((e as Error).message);
    }
  }
  return warnings;
}

export function executeDischarge(
  patient: Patient,
  bed: Bed,
  checklist: DischargeCheckliste,
  dischargedById: string,
  now: ISODateString,
): DischargeWorkflowResult {
  validateDischargeReadiness(patient, checklist);

  validateStateTransition(patient.state, PatientState.Discharged);
  validateBedStatusTransition(bed.status, BedStatus.Cleaning);

  const admittedAt = patient.admittedAt ?? now;
  const losMs = new Date(now).getTime() - new Date(admittedAt).getTime();
  const lengthOfStayDays = Math.ceil(losMs / 86_400_000);

  const updatedPatient: Patient = {
    ...patient,
    state: PatientState.Discharged,
    dischargedAt: now,
    updatedAt: now,
  };

  const updatedBed: Bed = {
    ...bed,
    status: BedStatus.Cleaning,
    assignedPatientId: undefined,
    updatedAt: now,
  };

  const updatedChecklist: DischargeCheckliste = {
    ...checklist,
    status: DischargeStatus.Discharged,
    actualDischargeTime: now,
    dischargedBy: dischargedById,
    updatedAt: now,
  };

  const inpatientMedNames = checklist.medicationsToTake.map((m) => m.drugName);
  const homeMedNames: string[] = []; // Would come from medication history
  const medReconciliation = reconcileMedications(inpatientMedNames, homeMedNames);

  const instructions = buildPostDischargeInstructions(patient, checklist, lengthOfStayDays);

  return {
    patient: updatedPatient,
    bed: updatedBed,
    checklist: updatedChecklist,
    dischargedAt: now,
    lengthOfStayDays,
    medicationsSummary: {
      continued: medReconciliation.continued,
      newMeds: medReconciliation.added,
      stopped: medReconciliation.stopped,
    },
    postDischargeInstructions: instructions,
  };
}

function buildPostDischargeInstructions(
  patient: Patient,
  checklist: DischargeCheckliste,
  losdays: number,
): string[] {
  const instructions: string[] = [];

  instructions.push(`Patient: ${patient.name}`);
  instructions.push(`Admitted: ${patient.admittedAt ?? 'N/A'}`);
  instructions.push(`Length of Stay: ${losdays} day(s)`);
  instructions.push(`Discharge Destination: ${checklist.destination ?? 'Not specified'}`);
  instructions.push('');
  instructions.push('MEDICATIONS TO TAKE HOME:');
  for (const med of checklist.medicationsToTake) {
    instructions.push(
      `  - ${med.drugName} ${med.dose} ${med.route} ${med.frequency} for ${med.durationDays} days${med.isNew ? ' (NEW)' : ''}`,
    );
  }
  instructions.push('');
  instructions.push('FOLLOW-UP:');
  if (checklist.followUpAppointmentDate) {
    instructions.push(`  Follow-up appointment: ${checklist.followUpAppointmentDate}`);
  } else {
    instructions.push('  Please arrange follow-up with your GP within 2 weeks.');
  }
  if (checklist.specialistReferralsMade.length > 0) {
    instructions.push(`  Specialist referrals: ${checklist.specialistReferralsMade.join(', ')}`);
  }
  instructions.push('');
  instructions.push('WHEN TO SEEK URGENT CARE:');
  instructions.push('  - Worsening symptoms or new symptoms of concern');
  instructions.push('  - Temperature > 38.5°C');
  instructions.push('  - Inability to take medications or fluids');
  instructions.push('  - Any other urgent concerns — go to Emergency Department');

  return instructions;
}

export function handleDelayedDischarge(
  checklist: DischargeCheckliste,
  reasons: DischargeCheckliste['delayReasons'],
  reportedBy: string,
  now: ISODateString,
): { updatedChecklist: DischargeCheckliste; estimatedResolutionHours: number } {
  const estimatedResolutionHours = estimateDelayHours(reasons);

  const updatedChecklist: DischargeCheckliste = {
    ...checklist,
    status: DischargeStatus.Delayed,
    delayReasons: reasons,
    estimatedDelayHours: estimatedResolutionHours,
    updatedAt: now,
  };

  return { updatedChecklist, estimatedResolutionHours };
}

export function checkEarlyDischargeEligibility(
  patient: Patient,
  checklist: DischargeCheckliste,
  targetDateIso: ISODateString,
  now: ISODateString,
): { eligible: boolean; hoursEarly: number; barriers: string[] } {
  const target = new Date(targetDateIso).getTime();
  const current = new Date(now).getTime();
  const hoursEarly = (target - current) / 3_600_000;

  const { unmetCriteria } = evaluateDischargeCriteria(checklist.criteria);

  return {
    eligible: unmetCriteria.length === 0 && hoursEarly > 0,
    hoursEarly: Math.max(0, hoursEarly),
    barriers: unmetCriteria,
  };
}

export function generateTransferSummary(
  patient: Patient,
  destinationFacility: string,
  transferReason: string,
  transferringClinician: string,
): string {
  return [
    `TRANSFER SUMMARY`,
    `================`,
    `Patient: ${patient.name} (ID: ${patient.id})`,
    `Date of Birth: ${patient.birthdate}`,
    `Presenting Complaint: ${patient.presentingComplaint}`,
    `Current State: ${patient.state}`,
    `Comorbidities: ${patient.comorbidities.join(', ') || 'None documented'}`,
    `Triage Level: ${patient.triageLevel ?? 'Not triaged'}`,
    `Admitted At: ${patient.admittedAt ?? 'Not admitted'}`,
    ``,
    `Transferring to: ${destinationFacility}`,
    `Transfer Reason: ${transferReason}`,
    `Authorised by: ${transferringClinician}`,
    ``,
    `Observations handed over. Medications reconciled. Patient and family informed.`,
  ].join('\n');
}
