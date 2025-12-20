import type { Entity } from '../core/types';
import { AppError, invalidTransition, preconditionFailed, validation } from '../core/errors';

export const ClaimStatus = {
  Draft: 'Draft',
  Submitted: 'Submitted',
  Adjudicated: 'Adjudicated',
  Paid: 'Paid',
  Denied: 'Denied',
  Appealed: 'Appealed',
  WrittenOff: 'Written-Off',
} as const;
export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus];

export interface BillingCharge extends Entity {
  encounterId: string;
  itemCode: string; // e.g. "PROC-99213", "DRUG-ASPIRIN", "SUPP-NEEDLE"
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: 'Pending' | 'Billed' | 'Adjusted';
  adjustedAmount?: number;
  adjustmentReason?: string;
}

export interface InsuranceClaim extends Entity {
  encounterId: string;
  patientId: string;
  payerId: string;
  totalChargeAmount: number;
  allowedAmount?: number;
  paidAmount?: number;
  status: ClaimStatus;
  priorAuthNumber?: string;
  underpaidFlag: boolean;
}

export function validateClaimStatusTransition(from: ClaimStatus, to: ClaimStatus): void {
  const allowed: Record<ClaimStatus, readonly ClaimStatus[]> = {
    [ClaimStatus.Draft]: [ClaimStatus.Submitted, ClaimStatus.WrittenOff],
    [ClaimStatus.Submitted]: [ClaimStatus.Adjudicated, ClaimStatus.Denied, ClaimStatus.WrittenOff],
    [ClaimStatus.Adjudicated]: [ClaimStatus.Paid, ClaimStatus.Denied, ClaimStatus.Appealed],
    [ClaimStatus.Paid]: [],
    [ClaimStatus.Denied]: [ClaimStatus.Appealed, ClaimStatus.WrittenOff],
    [ClaimStatus.Appealed]: [ClaimStatus.Adjudicated, ClaimStatus.Paid, ClaimStatus.Denied, ClaimStatus.WrittenOff],
    [ClaimStatus.WrittenOff]: [],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('InsuranceClaim', from, to);
  }
}

/** Check if insurance claim payment matches contracted rate. */
export function checkContractRateMismatch(
  claim: InsuranceClaim,
  expectedRate: number,
): boolean {
  if (claim.status !== ClaimStatus.Adjudicated && claim.status !== ClaimStatus.Paid) {
    throw preconditionFailed('Claim must be Adjudicated or Paid to check payment mismatch');
  }

  const allowed = claim.allowedAmount ?? 0;
  return allowed < expectedRate;
}
