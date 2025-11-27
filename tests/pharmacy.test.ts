import { describe, it, expect } from 'vitest';
import {
  StockStatus,
  InventoryLocation,
  verifyDispensation,
  type MedicationStock,
} from '../src/clinical/pharmacy';

describe('Pharmacy & Medication Module', () => {
  const normalMed: MedicationStock = {
    id: 'med_0001',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    itemName: 'Ibuprofen',
    quantity: 100,
    location: InventoryLocation.Formulary,
    status: StockStatus.InStock,
    isHighAlert: false,
    isControlled: false,
  };

  const highAlertMed: MedicationStock = {
    id: 'med_0002',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    itemName: 'Insulin',
    quantity: 50,
    location: InventoryLocation.Formulary,
    status: StockStatus.InStock,
    isHighAlert: true,
    isControlled: false,
  };

  describe('verifyDispensation', () => {
    it('allows normal medication dispensing by authorized staff', () => {
      expect(() => verifyDispensation(normalMed, 10, 'Pharmacist')).not.toThrow();
      expect(() => verifyDispensation(normalMed, 10, 'Nurse')).not.toThrow();
    });

    it('denies dispensing by unauthorized roles', () => {
      expect(() => verifyDispensation(normalMed, 10, 'LabTechnician')).toThrow(
        /not authorized to dispense/,
      );
    });

    it('denies dispensing if out of stock', () => {
      const outOfStock = { ...normalMed, status: StockStatus.OutOfStock, quantity: 0 };
      expect(() => verifyDispensation(outOfStock, 5, 'Pharmacist')).toThrow(
        /out of stock or has insufficient/,
      );
    });

    it('denies dispensing recalled medication', () => {
      const recalled = { ...normalMed, status: StockStatus.Recalled };
      expect(() => verifyDispensation(recalled, 5, 'Pharmacist')).toThrow(/Recalled/);
    });

    it('denies high-alert medication dispensing without double-verification', () => {
      expect(() => verifyDispensation(highAlertMed, 1, 'Nurse')).toThrow(
        /requires dual clinician verification/,
      );
    });

    it('allows high-alert medication dispensing with a valid verifier', () => {
      expect(() => verifyDispensation(highAlertMed, 1, 'Nurse', 'Pharmacist')).not.toThrow();
      expect(() => verifyDispensation(highAlertMed, 1, 'Nurse', 'ChiefMedicalOfficer')).not.toThrow();
    });

    it('denies high-alert dispensing if verifier lacks credentials', () => {
      expect(() => verifyDispensation(highAlertMed, 1, 'Nurse', 'Nurse')).toThrow(
        /not authorized to double-verify/,
      );
    });
  });
});
