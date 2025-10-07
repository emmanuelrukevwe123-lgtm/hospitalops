/**
 * Roles and the permissions they may exercise.
 *
 * Permissions are namespaced `domain:action` strings. They are intentionally
 * coarse — enough to gate the operations that matter for safety and audit,
 * without turning into a per-field ACL system.
 */

export const Role = {
  Admin: 'Admin',
  ChiefMedicalOfficer: 'ChiefMedicalOfficer',
  Clinician: 'Clinician',
  Nurse: 'Nurse',
  Pharmacist: 'Pharmacist',
  LabTechnician: 'LabTechnician',
  BillingOfficer: 'BillingOfficer',
  ComplianceOfficer: 'ComplianceOfficer',
  Auditor: 'Auditor',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Permission = {
  // patient flow
  PatientRegister: 'patient:register',
  PatientTriage: 'patient:triage',
  PatientAdmit: 'patient:admit',
  PatientDischarge: 'patient:discharge',
  // beds
  BedAssign: 'bed:assign',
  BedReserve: 'bed:reserve',
  BedOutOfService: 'bed:outOfService',
  // staffing
  StaffSchedule: 'staff:schedule',
  StaffCredential: 'staff:credential',
  // clinical orders
  OrderCreate: 'order:create',
  OrderAcknowledge: 'order:acknowledge',
  OrderCancel: 'order:cancel',
  OrderOverride: 'order:override',
  // pharmacy
  MedicationDispense: 'medication:dispense',
  MedicationVerify: 'medication:verify',
  MedicationOverride: 'medication:override',
  // lab
  LabResult: 'lab:result',
  LabVerify: 'lab:verify',
  LabAcknowledgeCritical: 'lab:acknowledgeCritical',
  // billing
  BillingCharge: 'billing:charge',
  BillingSubmitClaim: 'billing:submitClaim',
  BillingAdjust: 'billing:adjust',
  // compliance
  ComplianceApprovePolicy: 'compliance:approvePolicy',
  ComplianceAudit: 'compliance:audit',
  ComplianceRemediate: 'compliance:remediate',
  // audit
  AuditRead: 'audit:read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_ROLES: readonly Role[] = Object.values(Role);
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);
