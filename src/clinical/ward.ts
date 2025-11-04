import type { Entity } from '../core/types';
import { AppError, invalidTransition, preconditionFailed, validation } from '../core/errors';

export const BedType = {
  ICU: 'ICU',
  General: 'General',
  Isolation: 'Isolation',
  Surgical: 'Surgical',
  Maternity: 'Maternity',
} as const;
export type BedType = (typeof BedType)[keyof typeof BedType];

export const BedStatus = {
  Available: 'Available',
  Occupied: 'Occupied',
  Reserved: 'Reserved',
  OutOfService: 'OutOfService',
  Cleaning: 'Cleaning',
} as const;
export type BedStatus = (typeof BedStatus)[keyof typeof BedStatus];

export interface Ward extends Entity {
  name: string;
  type: BedType;
  maxCapacity: number;
}

export interface Bed extends Entity {
  wardId: string;
  roomId: string;
  bedNumber: string;
  type: BedType;
  status: BedStatus;
  assignedPatientId?: string;
  isolationPrecautions: string[]; // e.g. "Contact", "Droplet", "Airborne"
}

/** Validate bed status transition. */
export function validateBedStatusTransition(from: BedStatus, to: BedStatus): void {
  const allowed: Record<BedStatus, readonly BedStatus[]> = {
    [BedStatus.Available]: [BedStatus.Occupied, BedStatus.Reserved, BedStatus.OutOfService],
    [BedStatus.Occupied]: [BedStatus.Cleaning, BedStatus.OutOfService],
    [BedStatus.Reserved]: [BedStatus.Occupied, BedStatus.Available, BedStatus.OutOfService],
    [BedStatus.Cleaning]: [BedStatus.Available, BedStatus.OutOfService],
    [BedStatus.OutOfService]: [BedStatus.Cleaning, BedStatus.Available],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('Bed', from, to);
  }
}

/** Enforce isolation bed assignment. */
export function checkIsolationEnforcement(
  bed: Bed,
  patientInfectious: boolean,
  pathogenPrecautionType?: 'Contact' | 'Droplet' | 'Airborne',
): void {
  if (patientInfectious) {
    if (bed.type !== BedType.Isolation) {
      throw preconditionFailed(
        `Infectious patient must be assigned to an Isolation bed. Selected bed ${bed.id} is of type ${bed.type}`,
      );
    }
    if (pathogenPrecautionType && !bed.isolationPrecautions.includes(pathogenPrecautionType)) {
      throw preconditionFailed(
        `Bed ${bed.id} does not support required precaution: ${pathogenPrecautionType}`,
      );
    }
  }
}
