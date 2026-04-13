import { describe, it, expect } from 'vitest';
import {
  checkBloodGroupCompatibility,
  validateCrossMatch,
  performPreTransfusionChecks,
  handleTransfusionReaction,
  calculateMassiveTransfusionRatio,
  checkSpecialRequirements,
  BloodGroup,
  BloodComponent,
  TransfusionReaction,
  TransfusionStatus,
} from '../src/clinical/transfusion';
import type { BloodUnit, TransfusionRequest } from '../src/clinical/transfusion';
import { AppError } from '../src/core/errors';

function makeUnit(overrides: Partial<BloodUnit> = {}): BloodUnit {
  return {
    id: 'unit_001',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    component: BloodComponent.PackedRBC,
    bloodGroup: BloodGroup.OPositive,
    donorId: 'donor_001',
    collectedAt: '2026-01-01T06:00:00Z',
    expiresAt: '2030-02-01T00:00:00Z',
    volumeMl: 300,
    isIrradiated: false,
    isLeukodepleted: true,
    isCytomegalovirusNegative: false,
    isAvailable: true,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<TransfusionRequest> = {}): TransfusionRequest {
  return {
    id: 'req_001',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
    patientId: 'pat_001',
    encounterId: 'enc_001',
    requestedBy: 'dr_001',
    requestedAt: '2026-01-01T08:00:00Z',
    component: BloodComponent.PackedRBC,
    unitsRequested: 2,
    urgency: 'Routine',
    clinicalIndication: 'Anaemia, Hb 68 g/L',
    patientBloodGroup: BloodGroup.OPositive,
    status: TransfusionStatus.Crossmatched,
    crossmatchedUnitIds: ['unit_001'],
    issuedUnitIds: ['unit_001'],
    ...overrides,
  };
}

describe('checkBloodGroupCompatibility', () => {
  it('O- can receive from O- only', () => {
    expect(checkBloodGroupCompatibility(BloodGroup.ONegative, BloodGroup.ONegative)).toBe(true);
    expect(checkBloodGroupCompatibility(BloodGroup.ONegative, BloodGroup.OPositive)).toBe(false);
  });

  it('AB+ is universal recipient', () => {
    expect(checkBloodGroupCompatibility(BloodGroup.ABPositive, BloodGroup.ANegative)).toBe(true);
    expect(checkBloodGroupCompatibility(BloodGroup.ABPositive, BloodGroup.BPositive)).toBe(true);
    expect(checkBloodGroupCompatibility(BloodGroup.ABPositive, BloodGroup.ONegative)).toBe(true);
  });

  it('O+ can receive from O+ and O-', () => {
    expect(checkBloodGroupCompatibility(BloodGroup.OPositive, BloodGroup.OPositive)).toBe(true);
    expect(checkBloodGroupCompatibility(BloodGroup.OPositive, BloodGroup.ONegative)).toBe(true);
    expect(checkBloodGroupCompatibility(BloodGroup.OPositive, BloodGroup.APositive)).toBe(false);
  });

  it('A- can only receive from A- and O-', () => {
    expect(checkBloodGroupCompatibility(BloodGroup.ANegative, BloodGroup.ANegative)).toBe(true);
    expect(checkBloodGroupCompatibility(BloodGroup.ANegative, BloodGroup.ONegative)).toBe(true);
    expect(checkBloodGroupCompatibility(BloodGroup.ANegative, BloodGroup.APositive)).toBe(false);
  });
});

describe('validateCrossMatch', () => {
  it('passes for compatible, available, non-expired unit', () => {
    const unit = makeUnit();
    const request = makeRequest();
    expect(() => validateCrossMatch(unit, request)).not.toThrow();
  });

  it('throws if unit is not available', () => {
    const unit = makeUnit({ isAvailable: false });
    expect(() => validateCrossMatch(unit, makeRequest())).toThrow(AppError);
  });

  it('throws for incompatible blood groups', () => {
    const unit = makeUnit({ bloodGroup: BloodGroup.BPositive });
    const request = makeRequest({ patientBloodGroup: BloodGroup.APositive });
    expect(() => validateCrossMatch(unit, request)).toThrow(AppError);
  });

  it('throws for expired unit', () => {
    const unit = makeUnit({ expiresAt: '2020-01-01T00:00:00Z', isAvailable: true });
    expect(() => validateCrossMatch(unit, makeRequest())).toThrow(AppError);
  });
});

describe('performPreTransfusionChecks', () => {
  it('passes with valid two-person check', () => {
    const unit = makeUnit();
    const request = makeRequest();
    expect(() => performPreTransfusionChecks(unit, request, 'nurse_A', 'nurse_B')).not.toThrow();
  });

  it('throws when administrator and witness are same person', () => {
    const unit = makeUnit();
    const request = makeRequest();
    expect(() => performPreTransfusionChecks(unit, request, 'nurse_A', 'nurse_A')).toThrow(AppError);
  });

  it('throws when unit was not issued to this request', () => {
    const unit = makeUnit({ id: 'unit_999' });
    const request = makeRequest(); // issuedUnitIds: ['unit_001']
    expect(() => performPreTransfusionChecks(unit, request, 'nurse_A', 'nurse_B')).toThrow(AppError);
  });

  it('throws if unit crossmatched for different patient', () => {
    const unit = makeUnit({ crossmatchedForPatientId: 'pat_other' });
    expect(() => performPreTransfusionChecks(unit, makeRequest(), 'nurse_A', 'nurse_B')).toThrow(AppError);
  });
});

describe('handleTransfusionReaction', () => {
  it('no actions for no reaction', () => {
    const result = handleTransfusionReaction(TransfusionReaction.None);
    expect(result.stopImmediately).toBe(false);
    expect(result.actions).toHaveLength(0);
  });

  it('provides management steps for febrile reaction', () => {
    const result = handleTransfusionReaction(TransfusionReaction.FebrileNonHaemolytic);
    expect(result.stopImmediately).toBe(false);
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('requires immediate stop for acute haemolytic reaction', () => {
    const result = handleTransfusionReaction(TransfusionReaction.AcuteHaemolytic);
    expect(result.stopImmediately).toBe(true);
    expect(result.escalationRequired).toBe(true);
  });

  it('handles TACO with diuretics and upright positioning', () => {
    const result = handleTransfusionReaction(TransfusionReaction.TACO);
    expect(result.stopImmediately).toBe(true);
    expect(result.actions.some((a) => a.toLowerCase().includes('furosemide'))).toBe(true);
  });

  it('handles TRALI without diuretics', () => {
    const result = handleTransfusionReaction(TransfusionReaction.TRALI);
    expect(result.actions.some((a) => a.toLowerCase().includes('diuretics'))).toBe(true);
  });
});

describe('calculateMassiveTransfusionRatio', () => {
  it('identifies balanced 1:1:1 ratio', () => {
    const result = calculateMassiveTransfusionRatio(6, 6, 6);
    expect(result.balanced).toBe(true);
  });

  it('identifies unbalanced ratio heavy on RBCs', () => {
    const result = calculateMassiveTransfusionRatio(10, 2, 1);
    expect(result.balanced).toBe(false);
  });

  it('returns zeros for no units', () => {
    const result = calculateMassiveTransfusionRatio(0, 0, 0);
    expect(result.rbc).toBe(0);
    expect(result.balanced).toBe(true);
  });
});

describe('checkSpecialRequirements', () => {
  it('passes when irradiation not required', () => {
    const unit = makeUnit({ isIrradiated: false });
    expect(() =>
      checkSpecialRequirements(BloodComponent.PackedRBC, false, false, unit),
    ).not.toThrow();
  });

  it('throws if irradiation required but unit not irradiated', () => {
    const unit = makeUnit({ isIrradiated: false });
    expect(() =>
      checkSpecialRequirements(BloodComponent.PackedRBC, true, false, unit),
    ).toThrow(AppError);
  });

  it('throws if CMV-negative required but unit is not CMV-negative', () => {
    const unit = makeUnit({ isCytomegalovirusNegative: false });
    expect(() =>
      checkSpecialRequirements(BloodComponent.PackedRBC, false, true, unit),
    ).toThrow(AppError);
  });

  it('passes all checks for irradiated CMV-negative unit', () => {
    const unit = makeUnit({ isIrradiated: true, isCytomegalovirusNegative: true });
    expect(() =>
      checkSpecialRequirements(BloodComponent.PackedRBC, true, true, unit),
    ).not.toThrow();
  });
});
