import { describe, it, expect } from 'vitest';
import {
  ClaimStatus,
  validateClaimStatusTransition,
  checkContractRateMismatch,
  type InsuranceClaim,
} from '../src/billing/billing';

describe('Billing & Insurance Claims Module', () => {
  describe('validateClaimStatusTransition', () => {
    it('allows valid claim transitions', () => {
      expect(() => validateClaimStatusTransition(ClaimStatus.Draft, ClaimStatus.Submitted)).not.toThrow();
      expect(() => validateClaimStatusTransition(ClaimStatus.Submitted, ClaimStatus.Adjudicated)).not.toThrow();
      expect(() => validateClaimStatusTransition(ClaimStatus.Denied, ClaimStatus.Appealed)).not.toThrow();
    });

    it('throws error for invalid claim transitions', () => {
      expect(() => validateClaimStatusTransition(ClaimStatus.Draft, ClaimStatus.Paid)).toThrow();
      expect(() => validateClaimStatusTransition(ClaimStatus.Paid, ClaimStatus.Draft)).toThrow();
    });
  });

  describe('checkContractRateMismatch', () => {
    const baseClaim: InsuranceClaim = {
      id: 'claim_0001',
      createdAt: '2026-06-04T12:00:00Z',
      updatedAt: '2026-06-04T12:00:00Z',
      encounterId: 'enc_0001',
      patientId: 'pat_0001',
      payerId: 'payer_bluecross',
      totalChargeAmount: 500,
      status: ClaimStatus.Adjudicated,
      allowedAmount: 400,
      underpaidFlag: false,
    };

    it('returns true if allowed amount is less than contracted rate', () => {
      // Contracted rate is 450, but payer allowed 400
      const isMismatch = checkContractRateMismatch(baseClaim, 450);
      expect(isMismatch).toBe(true);
    });

    it('returns false if allowed amount matches or exceeds contracted rate', () => {
      // Contracted rate is 380, payer allowed 400
      const isMismatch = checkContractRateMismatch(baseClaim, 380);
      expect(isMismatch).toBe(false);
    });

    it('throws error if claim is not in correct status', () => {
      const draftClaim = { ...baseClaim, status: ClaimStatus.Draft };
      expect(() => checkContractRateMismatch(draftClaim, 450)).toThrow(/must be Adjudicated or Paid/);
    });
  });
});
