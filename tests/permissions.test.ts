import { describe, expect, it } from 'vitest';
import { authorize, can, permissionsFor } from '../src/auth/permissions';
import { ALL_PERMISSIONS, Permission, Role } from '../src/auth/roles';

describe('authorization matrix', () => {
  it('grants Admin every permission', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(Role.Admin, permission)).toBe(true);
    }
    expect(permissionsFor(Role.Admin)).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('lets a Nurse register and triage but not discharge', () => {
    expect(can(Role.Nurse, Permission.PatientRegister)).toBe(true);
    expect(can(Role.Nurse, Permission.PatientTriage)).toBe(true);
    expect(can(Role.Nurse, Permission.PatientDischarge)).toBe(false);
  });

  it('reserves medication second-verification for pharmacist and CMO', () => {
    expect(can(Role.Pharmacist, Permission.MedicationVerify)).toBe(true);
    expect(can(Role.ChiefMedicalOfficer, Permission.MedicationVerify)).toBe(true);
    expect(can(Role.Nurse, Permission.MedicationVerify)).toBe(false);
    expect(can(Role.Clinician, Permission.MedicationVerify)).toBe(false);
  });

  it('restricts order override to senior clinical roles', () => {
    expect(can(Role.ChiefMedicalOfficer, Permission.OrderOverride)).toBe(true);
    expect(can(Role.Clinician, Permission.OrderOverride)).toBe(false);
  });

  it('gives an Auditor read-only audit access and nothing else', () => {
    expect(permissionsFor(Role.Auditor)).toEqual([Permission.AuditRead]);
    expect(can(Role.Auditor, Permission.BillingCharge)).toBe(false);
  });

  it('authorize returns an ok result when permitted', () => {
    const result = authorize(Role.BillingOfficer, Permission.BillingSubmitClaim);
    expect(result.ok).toBe(true);
  });

  it('authorize returns a FORBIDDEN error when not permitted', () => {
    const result = authorize(Role.LabTechnician, Permission.BillingSubmitClaim);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.details).toMatchObject({
        role: Role.LabTechnician,
        permission: Permission.BillingSubmitClaim,
      });
    }
  });
});
