/**
 * The authorization matrix: which role may exercise which permission.
 *
 * `Admin` is wildcard. Every other role lists its permissions explicitly so the
 * grant is auditable by reading this one file. Keep grants least-privilege:
 * a role gets a permission only where the operational responsibility is real
 * (e.g. only a Pharmacist or CMO may second-verify a high-alert dispense).
 */
import { forbidden } from '../core/errors';
import { ok, err } from '../core/types';
import type { Result } from '../core/types';
import { Permission, Role } from './roles';
import type { Permission as Perm, Role as RoleName } from './roles';

const WILDCARD = '*' as const;

const MATRIX: Record<RoleName, ReadonlySet<Perm> | typeof WILDCARD> = {
  [Role.Admin]: WILDCARD,

  [Role.ChiefMedicalOfficer]: new Set<Perm>([
    Permission.PatientAdmit,
    Permission.PatientDischarge,
    Permission.OrderCreate,
    Permission.OrderAcknowledge,
    Permission.OrderCancel,
    Permission.OrderOverride,
    Permission.MedicationVerify,
    Permission.MedicationOverride,
    Permission.LabAcknowledgeCritical,
    Permission.StaffSchedule,
    Permission.AuditRead,
  ]),

  [Role.Clinician]: new Set<Perm>([
    Permission.PatientAdmit,
    Permission.PatientDischarge,
    Permission.OrderCreate,
    Permission.OrderAcknowledge,
    Permission.OrderCancel,
    Permission.LabAcknowledgeCritical,
    Permission.BedAssign,
  ]),

  [Role.Nurse]: new Set<Perm>([
    Permission.PatientRegister,
    Permission.PatientTriage,
    Permission.OrderAcknowledge,
    Permission.MedicationDispense,
    Permission.BedAssign,
    Permission.BedReserve,
  ]),

  [Role.Pharmacist]: new Set<Perm>([
    Permission.MedicationDispense,
    Permission.MedicationVerify,
    Permission.OrderAcknowledge,
  ]),

  [Role.LabTechnician]: new Set<Perm>([
    Permission.LabResult,
    Permission.LabVerify,
  ]),

  [Role.BillingOfficer]: new Set<Perm>([
    Permission.BillingCharge,
    Permission.BillingSubmitClaim,
    Permission.BillingAdjust,
  ]),

  [Role.ComplianceOfficer]: new Set<Perm>([
    Permission.ComplianceApprovePolicy,
    Permission.ComplianceAudit,
    Permission.ComplianceRemediate,
    Permission.AuditRead,
  ]),

  [Role.Auditor]: new Set<Perm>([Permission.AuditRead]),
};

/** Whether `role` may exercise `permission`. */
export const can = (role: RoleName, permission: Perm): boolean => {
  const granted = MATRIX[role];
  return granted === WILDCARD || granted.has(permission);
};

/**
 * Result-returning gate for call sites that want to short-circuit on failure:
 * `const auth = authorize(role, perm); if (!auth.ok) return auth;`
 */
export const authorize = (role: RoleName, permission: Perm): Result<true> =>
  can(role, permission)
    ? ok(true)
    : err(forbidden(`${role} is not permitted to ${permission}`, { role, permission }));

/** Every permission a role holds (wildcard roles expand to the full set). */
export const permissionsFor = (role: RoleName): Perm[] => {
  const granted = MATRIX[role];
  return granted === WILDCARD ? [...Object.values(Permission)] : [...granted];
};
