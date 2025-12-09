import type { Entity, ISODateString } from '../core/types';
import { AppError, invalidTransition, preconditionFailed, validation } from '../core/errors';

export const CaseType = {
  Elective: 'Elective',
  Urgent: 'Urgent',
  Emergency: 'Emergency',
} as const;
export type CaseType = (typeof CaseType)[keyof typeof CaseType];

export const CaseStatus = {
  Scheduled: 'Scheduled',
  PreOpComplete: 'PreOpComplete',
  InProgress: 'InProgress',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Postponed: 'Postponed',
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export interface OperatingRoom extends Entity {
  name: string;
  specialtyClassification: string; // e.g. "Cardiovascular", "Orthopedic", "General"
  equippedInstruments: string[];
}

export interface SurgicalCase extends Entity {
  patientId: string;
  orRoomId: string;
  surgeonId: string;
  anesthesiologistId: string;
  caseType: CaseType;
  status: CaseStatus;
  startTime: ISODateString;
  endTime: ISODateString;
  recoveryBayId?: string;
}

export function validateCaseStatusTransition(from: CaseStatus, to: CaseStatus): void {
  const allowed: Record<CaseStatus, readonly CaseStatus[]> = {
    [CaseStatus.Scheduled]: [CaseStatus.PreOpComplete, CaseStatus.Cancelled, CaseStatus.Postponed],
    [CaseStatus.PreOpComplete]: [CaseStatus.InProgress, CaseStatus.Cancelled, CaseStatus.Postponed],
    [CaseStatus.InProgress]: [CaseStatus.Completed, CaseStatus.Cancelled],
    [CaseStatus.Completed]: [],
    [CaseStatus.Cancelled]: [],
    [CaseStatus.Postponed]: [CaseStatus.Scheduled, CaseStatus.Cancelled],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('SurgicalCase', from, to);
  }
}

/** Check if dates overlap: [s1, e1] and [s2, e2]. */
function isOverlapping(s1: string, e1: string, s2: string, e2: string): boolean {
  const start1 = new Date(s1).getTime();
  const end1 = new Date(e1).getTime();
  const start2 = new Date(s2).getTime();
  const end2 = new Date(e2).getTime();
  return start1 < end2 && start2 < end1;
}

/** Check scheduling conflicts for OR Room, Surgeon, and Anesthesiologist. */
export function checkSurgicalConflicts(
  newCase: Omit<SurgicalCase, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
  existingCases: SurgicalCase[],
): void {
  for (const c of existingCases) {
    if (c.status === CaseStatus.Cancelled || c.status === CaseStatus.Completed) {
      continue;
    }

    if (isOverlapping(newCase.startTime, newCase.endTime, c.startTime, c.endTime)) {
      if (c.orRoomId === newCase.orRoomId) {
        throw preconditionFailed(`Scheduling conflict: OR room ${newCase.orRoomId} is occupied during this time`);
      }
      if (c.surgeonId === newCase.surgeonId) {
        throw preconditionFailed(`Scheduling conflict: Surgeon ${newCase.surgeonId} is scheduled in another case during this time`);
      }
      if (c.anesthesiologistId === newCase.anesthesiologistId) {
        throw preconditionFailed(`Scheduling conflict: Anesthesiologist ${newCase.anesthesiologistId} is scheduled in another case during this time`);
      }
    }
  }
}
