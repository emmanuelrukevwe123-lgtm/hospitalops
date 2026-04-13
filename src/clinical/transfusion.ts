import type { Entity, ISODateString } from '../core/types';
import { preconditionFailed, validation, conflict } from '../core/errors';

export const BloodGroup = {
  APositive: 'A+',
  ANegative: 'A-',
  BPositive: 'B+',
  BNegative: 'B-',
  ABPositive: 'AB+',
  ABNegative: 'AB-',
  OPositive: 'O+',
  ONegative: 'O-',
} as const;
export type BloodGroup = (typeof BloodGroup)[keyof typeof BloodGroup];

export const BloodComponent = {
  PackedRBC: 'PackedRBC',
  FreshFrozenPlasma: 'FreshFrozenPlasma',
  Platelets: 'Platelets',
  Cryoprecipitate: 'Cryoprecipitate',
  WholeBlood: 'WholeBlood',
  Albumin: 'Albumin',
  IVIG: 'IVIG',
} as const;
export type BloodComponent = (typeof BloodComponent)[keyof typeof BloodComponent];

export const TransfusionStatus = {
  Requested: 'Requested',
  Crossmatched: 'CrossMatched',
  Issued: 'Issued',
  InProgress: 'InProgress',
  Completed: 'Completed',
  Terminated: 'Terminated',
  Returned: 'Returned',
} as const;
export type TransfusionStatus = (typeof TransfusionStatus)[keyof typeof TransfusionStatus];

export const TransfusionReaction = {
  None: 'None',
  FebrileNonHaemolytic: 'FebrileNonHaemolytic',
  AllergicMild: 'AllergicMild',
  AllergicSevere: 'AllergicSevere',
  AcuteHaemolytic: 'AcuteHaemolytic',
  DelayedHaemolytic: 'DelayedHaemolytic',
  TACO: 'TACO',             // Transfusion-Associated Circulatory Overload
  TRALI: 'TRALI',           // Transfusion-Related Acute Lung Injury
  Sepsis: 'Sepsis',
} as const;
export type TransfusionReaction = (typeof TransfusionReaction)[keyof typeof TransfusionReaction];

export interface BloodUnit extends Entity {
  component: BloodComponent;
  bloodGroup: BloodGroup;
  donorId: string;
  collectedAt: ISODateString;
  expiresAt: ISODateString;
  volumeMl: number;
  isIrradiated: boolean;
  isLeukodepleted: boolean;
  isCytomegalovirusNegative: boolean;
  isAvailable: boolean;
  crossmatchedForPatientId?: string;
}

export interface TransfusionRequest extends Entity {
  patientId: string;
  encounterId: string;
  requestedBy: string;
  requestedAt: ISODateString;
  component: BloodComponent;
  unitsRequested: number;
  urgency: 'Routine' | 'Urgent' | 'MassiveHaemorrhage';
  clinicalIndication: string;
  patientBloodGroup: BloodGroup;
  status: TransfusionStatus;
  crossmatchedUnitIds: string[];
  issuedUnitIds: string[];
}

export interface TransfusionAdministration extends Entity {
  requestId: string;
  unitId: string;
  patientId: string;
  administeredBy: string;
  witnessedBy: string;
  startedAt: ISODateString;
  completedAt?: ISODateString;
  terminatedAt?: ISODateString;
  terminationReason?: string;
  reactionObserved: TransfusionReaction;
  preTransfusionTemp?: number;
  preTransfusionBP?: string;
  postTransfusionTemp?: number;
  postTransfusionBP?: string;
  volumeInfusedMl: number;
}

const COMPATIBLE_DONORS: Record<BloodGroup, readonly BloodGroup[]> = {
  'A+':  ['A+', 'A-', 'O+', 'O-'],
  'A-':  ['A-', 'O-'],
  'B+':  ['B+', 'B-', 'O+', 'O-'],
  'B-':  ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+':  ['O+', 'O-'],
  'O-':  ['O-'],
};

export function checkBloodGroupCompatibility(
  recipientGroup: BloodGroup,
  donorGroup: BloodGroup,
): boolean {
  return COMPATIBLE_DONORS[recipientGroup].includes(donorGroup);
}

export function validateCrossMatch(
  unit: BloodUnit,
  request: TransfusionRequest,
): void {
  if (!unit.isAvailable) {
    throw preconditionFailed(
      `Blood unit ${unit.id} is not available for crossmatch (already issued or reserved)`,
    );
  }

  if (!checkBloodGroupCompatibility(request.patientBloodGroup, unit.bloodGroup)) {
    throw preconditionFailed(
      `Blood group incompatibility: patient ${request.patientBloodGroup} cannot receive from donor ${unit.bloodGroup}`,
    );
  }

  const now = new Date();
  if (new Date(unit.expiresAt) < now) {
    throw preconditionFailed(
      `Blood unit ${unit.id} (component ${unit.component}) has expired at ${unit.expiresAt}`,
    );
  }
}

export function performPreTransfusionChecks(
  unit: BloodUnit,
  request: TransfusionRequest,
  administeredBy: string,
  witnessedBy: string,
): void {
  if (administeredBy === witnessedBy) {
    throw validation(
      `Transfusion requires two separate clinicians: administrator (${administeredBy}) and witness must be different individuals`,
    );
  }

  if (!request.issuedUnitIds.includes(unit.id)) {
    throw preconditionFailed(
      `Unit ${unit.id} was not issued for request ${request.id}. Only issued units may be administered.`,
    );
  }

  if (unit.crossmatchedForPatientId && unit.crossmatchedForPatientId !== request.patientId) {
    throw conflict(
      `Unit ${unit.id} was crossmatched for patient ${unit.crossmatchedForPatientId}, not for ${request.patientId}`,
    );
  }
}

export function handleTransfusionReaction(
  reaction: TransfusionReaction,
): { stopImmediately: boolean; returnUnit: boolean; escalationRequired: boolean; actions: string[] } {
  switch (reaction) {
    case TransfusionReaction.None:
      return { stopImmediately: false, returnUnit: false, escalationRequired: false, actions: [] };

    case TransfusionReaction.FebrileNonHaemolytic:
      return {
        stopImmediately: false,
        returnUnit: false,
        escalationRequired: false,
        actions: ['Slow infusion rate', 'Administer paracetamol 1g PO', 'Monitor closely'],
      };

    case TransfusionReaction.AllergicMild:
      return {
        stopImmediately: true,
        returnUnit: true,
        escalationRequired: false,
        actions: ['Stop transfusion', 'Administer chlorphenamine 10mg IV', 'Send unit back to blood bank', 'Monitor 30 minutes'],
      };

    case TransfusionReaction.AllergicSevere:
    case TransfusionReaction.AcuteHaemolytic:
      return {
        stopImmediately: true,
        returnUnit: true,
        escalationRequired: true,
        actions: [
          'Stop transfusion immediately',
          'Maintain IV access with 0.9% NaCl',
          'Administer adrenaline 0.5mg IM if anaphylaxis',
          'Send blood unit and patient samples to blood bank',
          'Call senior clinician urgently',
          'Document and report haemovigilance incident',
        ],
      };

    case TransfusionReaction.TACO:
      return {
        stopImmediately: true,
        returnUnit: true,
        escalationRequired: true,
        actions: [
          'Stop transfusion',
          'Sit patient upright',
          'Administer furosemide 40mg IV',
          'Supplemental oxygen',
          'Cardiology review',
        ],
      };

    case TransfusionReaction.TRALI:
      return {
        stopImmediately: true,
        returnUnit: true,
        escalationRequired: true,
        actions: [
          'Stop transfusion immediately',
          'Supplemental oxygen / ventilatory support',
          'Avoid diuretics',
          'ICU transfer likely required',
          'Report to blood bank and haemovigilance',
        ],
      };

    default:
      return {
        stopImmediately: true,
        returnUnit: true,
        escalationRequired: true,
        actions: ['Stop transfusion', 'Notify physician', 'Return unit to blood bank', 'Document reaction'],
      };
  }
}

export function calculateMassiveTransfusionRatio(
  unitsRBC: number,
  unitsFFP: number,
  unitsPlatelets: number,
): { rbc: number; ffp: number; platelets: number; balanced: boolean } {
  const total = unitsRBC + unitsFFP + unitsPlatelets;
  if (total === 0) return { rbc: 0, ffp: 0, platelets: 0, balanced: true };

  const rbc = unitsRBC / total;
  const ffp = unitsFFP / total;
  const platelets = unitsPlatelets / total;

  // 1:1:1 ratio is considered balanced massive transfusion protocol
  const balanced = rbc <= 0.5 && ffp >= 0.25 && platelets >= 0.15;
  return { rbc, ffp, platelets, balanced };
}

export function checkSpecialRequirements(
  component: BloodComponent,
  requiresIrradiated: boolean,
  requiresCMVNegative: boolean,
  unit: BloodUnit,
): void {
  if (requiresIrradiated && !unit.isIrradiated) {
    throw preconditionFailed(
      `Patient requires irradiated blood products. Unit ${unit.id} is not irradiated.`,
    );
  }
  if (requiresCMVNegative && !unit.isCytomegalovirusNegative) {
    throw preconditionFailed(
      `Patient requires CMV-negative blood products. Unit ${unit.id} is not CMV-negative.`,
    );
  }
}
