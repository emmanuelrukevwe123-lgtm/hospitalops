import type { Entity } from '../core/types';
import { preconditionFailed } from '../core/errors';

export const InventoryLocation = {
  Formulary: 'Formulary',
  WardStock: 'WardStock',
  CrashCart: 'CrashCart',
} as const;
export type InventoryLocation = (typeof InventoryLocation)[keyof typeof InventoryLocation];

export const StockStatus = {
  InStock: 'InStock',
  LowStock: 'LowStock',
  OutOfStock: 'OutOfStock',
  Recalled: 'Recalled',
  Expired: 'Expired',
} as const;
export type StockStatus = (typeof StockStatus)[keyof typeof StockStatus];

export interface MedicationStock extends Entity {
  itemName: string;
  quantity: number;
  location: InventoryLocation;
  status: StockStatus;
  isHighAlert: boolean;
  isControlled: boolean;
}

export interface ChainOfCustodyEntry extends Entity {
  medicationId: string;
  dispensedTo: string; // Patient ID or Clinician ID
  dispensedBy: string; // Pharmacist ID
  witnessId?: string; // Witness clinician ID (required for controlled substances)
  quantity: number;
  reason?: string;
}

export interface ReplenishmentRequest extends Entity {
  medicationId: string;
  requestedQty: number;
  requestedBy: string; // Staff ID
  approvedBy?: string; // Pharmacist or Admin ID
  status: 'Pending' | 'Approved' | 'Rejected';
}

/** Validate medication dispensing rules. */
export function verifyDispensation(
  med: MedicationStock,
  qtyToDispense: number,
  dispenserRole: string,
  verifierRole?: string,
): void {
  if (med.status === StockStatus.OutOfStock || med.quantity < qtyToDispense) {
    throw preconditionFailed(`Medication ${med.itemName} is out of stock or has insufficient quantity`);
  }
  if (med.status === StockStatus.Recalled) {
    throw preconditionFailed(`Medication ${med.itemName} is Recalled and cannot be dispensed`);
  }
  if (med.status === StockStatus.Expired) {
    throw preconditionFailed(`Medication ${med.itemName} is Expired and cannot be dispensed`);
  }

  // High-alert requires double verification
  if (med.isHighAlert) {
    if (!verifierRole) {
      throw preconditionFailed(`Medication ${med.itemName} is high-alert and requires dual clinician verification`);
    }
    const authorizedVerifiers = ['Pharmacist', 'ChiefMedicalOfficer'];
    if (!authorizedVerifiers.includes(verifierRole)) {
      throw preconditionFailed(`Role ${verifierRole} is not authorized to double-verify high-alert medication`);
    }
  }

  // Nurse or Pharmacist or CMO required to dispense
  const authorizedDispensers = ['Pharmacist', 'Nurse', 'ChiefMedicalOfficer'];
  if (!authorizedDispensers.includes(dispenserRole)) {
    throw preconditionFailed(`Role ${dispenserRole} is not authorized to dispense medication`);
  }
}
