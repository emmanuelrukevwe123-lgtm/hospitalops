import { describe, it, expect } from 'vitest';
import {
  BedType,
  BedStatus,
  validateBedStatusTransition,
  checkIsolationEnforcement,
  type Bed,
} from '../src/clinical/ward';

describe('Ward & Bed Management Module', () => {
  describe('validateBedStatusTransition', () => {
    it('allows valid bed status transitions', () => {
      expect(() => validateBedStatusTransition(BedStatus.Available, BedStatus.Occupied)).not.toThrow();
      expect(() => validateBedStatusTransition(BedStatus.Occupied, BedStatus.Cleaning)).not.toThrow();
      expect(() => validateBedStatusTransition(BedStatus.Cleaning, BedStatus.Available)).not.toThrow();
    });

    it('throws error for invalid bed status transitions', () => {
      expect(() => validateBedStatusTransition(BedStatus.Available, BedStatus.Cleaning)).toThrow(
        /cannot move from 'Available' to 'Cleaning'/,
      );
      expect(() => validateBedStatusTransition(BedStatus.Occupied, BedStatus.Available)).toThrow();
    });
  });

  describe('checkIsolationEnforcement', () => {
    const regularBed: Bed = {
      id: 'bed_0001',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      wardId: 'ward_0001',
      roomId: 'room_101',
      bedNumber: '1A',
      type: BedType.General,
      status: BedStatus.Available,
      isolationPrecautions: [],
    };

    const isolationBed: Bed = {
      id: 'bed_0002',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      wardId: 'ward_0001',
      roomId: 'room_102',
      bedNumber: '1B',
      type: BedType.Isolation,
      status: BedStatus.Available,
      isolationPrecautions: ['Contact', 'Droplet'],
    };

    it('allows non-infectious patient to go to a regular bed', () => {
      expect(() => checkIsolationEnforcement(regularBed, false)).not.toThrow();
    });

    it('denies infectious patient to go to a regular bed', () => {
      expect(() => checkIsolationEnforcement(regularBed, true)).toThrow(
        /Infectious patient must be assigned to an Isolation bed/,
      );
    });

    it('allows infectious patient to go to an isolation bed', () => {
      expect(() => checkIsolationEnforcement(isolationBed, true)).not.toThrow();
    });

    it('denies infectious patient if isolation bed lacks specific pathogen precautions required', () => {
      expect(() => checkIsolationEnforcement(isolationBed, true, 'Airborne')).toThrow(
        /does not support required precaution: Airborne/,
      );
    });

    it('allows infectious patient if isolation bed has specific pathogen precautions required', () => {
      expect(() => checkIsolationEnforcement(isolationBed, true, 'Contact')).not.toThrow();
    });
  });
});
