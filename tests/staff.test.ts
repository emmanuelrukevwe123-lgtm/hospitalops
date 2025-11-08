import { describe, it, expect } from 'vitest';
import { Department } from '../src/core/enums';
import {
  StaffStatus,
  verifyCredentials,
  escalateCall,
  type Clinician,
} from '../src/clinical/staff';

describe('Staff Scheduling & Credentialing Module', () => {
  const now = new Date('2026-06-04T12:00:00.000Z');

  describe('verifyCredentials', () => {
    it('allows clinician with active and valid certificate', () => {
      const doc: Clinician = {
        id: 'staff_0001',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        name: 'Dr. House',
        specialty: 'Diagnostic Medicine',
        licenseNumber: 'MD12345',
        certExpiry: '2027-01-01',
        status: StaffStatus.OnDuty,
        department: Department.General,
      };

      expect(() => verifyCredentials(doc, now)).not.toThrow();
    });

    it('throws error if clinician is suspended', () => {
      const doc: Clinician = {
        id: 'staff_0001',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        name: 'Dr. House',
        specialty: 'Diagnostic Medicine',
        licenseNumber: 'MD12345',
        certExpiry: '2027-01-01',
        status: StaffStatus.Suspended,
        department: Department.General,
      };

      expect(() => verifyCredentials(doc, now)).toThrow(/credentials suspended/);
    });

    it('throws error if clinician certificate has expired', () => {
      const doc: Clinician = {
        id: 'staff_0001',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        name: 'Dr. House',
        specialty: 'Diagnostic Medicine',
        licenseNumber: 'MD12345',
        certExpiry: '2025-01-01',
        status: StaffStatus.OnDuty,
        department: Department.General,
      };

      expect(() => verifyCredentials(doc, now)).toThrow(/certificate has expired/);
    });
  });

  describe('escalateCall', () => {
    const primary: Clinician = {
      id: 'staff_0001',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      name: 'Dr. House',
      specialty: 'General',
      licenseNumber: 'MD1',
      certExpiry: '2027-01-01',
      status: StaffStatus.OffDuty,
      department: Department.General,
    };

    const backupOnCall: Clinician = {
      id: 'staff_0002',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      name: 'Dr. Wilson',
      specialty: 'General',
      licenseNumber: 'MD2',
      certExpiry: '2027-01-01',
      status: StaffStatus.OnCall,
      department: Department.General,
    };

    it('returns primary clinician if they are OnDuty', () => {
      const doc = { ...primary, status: StaffStatus.OnDuty };
      const resolved = escalateCall(doc.id, [doc, backupOnCall], Department.General, 'General');
      expect(resolved.id).toBe(doc.id);
    });

    it('escalates to on-call clinician if primary is OffDuty', () => {
      const resolved = escalateCall(primary.id, [primary, backupOnCall], Department.General, 'General');
      expect(resolved.id).toBe(backupOnCall.id);
    });

    it('throws error if no clinician is available', () => {
      expect(() => escalateCall(primary.id, [primary], Department.General, 'General')).toThrow(
        /No available clinician/,
      );
    });
  });
});
