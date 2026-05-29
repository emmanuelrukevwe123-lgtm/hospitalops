import type { Entity } from '../core/types';
import { invalidTransition, preconditionFailed, validation } from '../core/errors';

export const OrderType = {
  Medication: 'Medication',
  Lab: 'Lab',
  Imaging: 'Imaging',
  Procedure: 'Procedure',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderStatus = {
  Draft: 'Draft',
  Submitted: 'Submitted',
  Acknowledged: 'Acknowledged',
  InProgress: 'InProgress',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  OnHold: 'OnHold',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export interface ClinicalOrder extends Entity {
  patientId: string;
  orderType: OrderType;
  status: OrderStatus;
  details: {
    itemName: string; // e.g. "Penicillin", "CT Scan Head", "CBC"
    dosage?: string;
    route?: string;
    frequency?: string;
    instructions?: string;
  };
  orderedBy: string; // Staff ID
  verbalOrder: boolean;
  verbalVerifiedBy?: string; // Must be co-signed by another clinician/nurse
  overrideReason?: string;
}

/** Validate order lifecycle state transition. */
export function validateOrderStatusTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed: Record<OrderStatus, readonly OrderStatus[]> = {
    [OrderStatus.Draft]: [OrderStatus.Submitted, OrderStatus.Cancelled],
    [OrderStatus.Submitted]: [OrderStatus.Acknowledged, OrderStatus.Cancelled, OrderStatus.OnHold],
    [OrderStatus.Acknowledged]: [OrderStatus.InProgress, OrderStatus.Cancelled, OrderStatus.OnHold],
    [OrderStatus.InProgress]: [OrderStatus.Completed, OrderStatus.Cancelled, OrderStatus.OnHold],
    [OrderStatus.OnHold]: [OrderStatus.InProgress, OrderStatus.Cancelled, OrderStatus.Acknowledged],
    [OrderStatus.Completed]: [],
    [OrderStatus.Cancelled]: [],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('Order', from, to);
  }
}

/** Verify allergy and contraindication. Throws if allergic unless overrideReason is provided. */
export function verifyAllergies(
  patientAllergies: string[],
  itemName: string,
  overrideReason?: string,
): void {
  const isMatch = patientAllergies.some(
    (allergy) => allergy.toLowerCase() === itemName.toLowerCase(),
  );

  if (isMatch && !overrideReason) {
    throw preconditionFailed(
      `Allergy alert: Patient is allergic to ${itemName}. An override reason must be provided to proceed.`,
    );
  }
}

/** Pre-defined protocols/order sets. */
export const CLINICAL_PROTOCOLS = {
  Sepsis: [
    { orderType: OrderType.Lab, details: { itemName: 'Blood Culture x2' } },
    { orderType: OrderType.Lab, details: { itemName: 'Lactate Level' } },
    { orderType: OrderType.Medication, details: { itemName: 'Broad Spectrum Antibiotics', dosage: '1g', route: 'IV' } },
    { orderType: OrderType.Procedure, details: { itemName: 'IV Fluid Resuscitation', instructions: '30mL/kg Crystalloid' } },
  ],
  Stroke: [
    { orderType: OrderType.Imaging, details: { itemName: 'CT Scan Head Non-Contrast' } },
    { orderType: OrderType.Lab, details: { itemName: 'PT/INR Coagulation Panel' } },
    { orderType: OrderType.Procedure, details: { itemName: 'Neurological Assessment' } },
  ],
} as const;

/** Generate auto-orders for a given protocol/diagnosis. */
export function generateProtocolOrders(
  patientId: string,
  orderedBy: string,
  protocolName: keyof typeof CLINICAL_PROTOCOLS,
): Omit<ClinicalOrder, 'id' | 'createdAt' | 'updatedAt'>[] {
  const protocol = CLINICAL_PROTOCOLS[protocolName];
  if (!protocol) {
    throw validation(`Unknown protocol: ${protocolName}`);
  }

  return protocol.map((item) => ({
    patientId,
    orderType: item.orderType,
    status: OrderStatus.Submitted,
    details: item.details,
    orderedBy,
    verbalOrder: false,
  }));
}
