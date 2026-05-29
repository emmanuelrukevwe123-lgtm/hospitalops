import type { Entity, ISODateString } from '../core/types';
import { preconditionFailed } from '../core/errors';
import { Department } from '../core/enums';

export const StaffStatus = {
  OnDuty: 'OnDuty',
  OffDuty: 'OffDuty',
  OnLeave: 'OnLeave',
  Suspended: 'Suspended',
  OnCall: 'OnCall',
} as const;
export type StaffStatus = (typeof StaffStatus)[keyof typeof StaffStatus];

export interface Clinician extends Entity {
  name: string;
  specialty: string;
  licenseNumber: string;
  certExpiry: ISODateString; // YYYY-MM-DD
  status: StaffStatus;
  department: Department;
}

export interface Shift extends Entity {
  staffId: string;
  department: Department;
  startTime: ISODateString;
  endTime: ISODateString;
}

/** Check if a clinician has active credentials (not expired, not suspended). */
export function verifyCredentials(clinician: Clinician, now: Date): void {
  if (clinician.status === StaffStatus.Suspended) {
    throw preconditionFailed(`Clinician ${clinician.id} credentials suspended`);
  }

  const expiry = new Date(clinician.certExpiry);
  if (expiry.getTime() < now.getTime()) {
    throw preconditionFailed(`Clinician ${clinician.id} certificate has expired on ${clinician.certExpiry}`);
  }
}

/** Escalate to the next available on-call clinician if the primary is unavailable. */
export function escalateCall(
  primaryId: string,
  staffList: Clinician[],
  department: Department,
  specialty: string,
): Clinician {
  const primary = staffList.find((s) => s.id === primaryId);
  if (primary && primary.status === StaffStatus.OnDuty) {
    return primary;
  }

  // Primary not available, look for OnCall staff of same department and specialty
  const backup = staffList.find(
    (s) =>
      s.id !== primaryId &&
      s.department === department &&
      s.specialty === specialty &&
      s.status === StaffStatus.OnCall,
  );

  if (backup) {
    return backup;
  }

  // Try OnDuty of same department & specialty next
  const onDutyBackup = staffList.find(
    (s) =>
      s.id !== primaryId &&
      s.department === department &&
      s.specialty === specialty &&
      s.status === StaffStatus.OnDuty,
  );

  if (onDutyBackup) {
    return onDutyBackup;
  }

  throw preconditionFailed(
    `No available clinician in ${department} specialty ${specialty} to escalate on-call`,
  );
}
