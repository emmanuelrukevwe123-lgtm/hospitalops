import type { Entity, ISODateString } from '../core/types';
import { invalidTransition } from '../core/errors';

export const PolicyStatus = {
  Draft: 'Draft',
  UnderReview: 'UnderReview',
  Approved: 'Approved',
  Superseded: 'Superseded',
  Retired: 'Retired',
} as const;
export type PolicyStatus = (typeof PolicyStatus)[keyof typeof PolicyStatus];

export const RemediationStatus = {
  Open: 'Open',
  Planned: 'Planned',
  InProgress: 'InProgress',
  Blocked: 'Blocked',
  ReadyForReview: 'ReadyForReview',
  Completed: 'Completed',
  Verified: 'Verified',
} as const;
export type RemediationStatus = (typeof RemediationStatus)[keyof typeof RemediationStatus];

export interface Policy extends Entity {
  title: string;
  code: string; // e.g. "POL-001"
  version: number;
  status: PolicyStatus;
  approvedBy?: string;
  approvedAt?: ISODateString;
}

export interface RemediationTask extends Entity {
  standardCode: string; // e.g. "JCI-IPSG.01"
  title: string;
  severity: 'High' | 'Medium' | 'Low';
  status: RemediationStatus;
  assigneeId: string;
  dueDate: ISODateString;
  resolvedAt?: ISODateString;
  escalated: boolean;
}

export function validatePolicyStatusTransition(from: PolicyStatus, to: PolicyStatus): void {
  const allowed: Record<PolicyStatus, readonly PolicyStatus[]> = {
    [PolicyStatus.Draft]: [PolicyStatus.UnderReview],
    [PolicyStatus.UnderReview]: [PolicyStatus.Approved, PolicyStatus.Draft],
    [PolicyStatus.Approved]: [PolicyStatus.Superseded, PolicyStatus.Retired],
    [PolicyStatus.Superseded]: [PolicyStatus.Retired],
    [PolicyStatus.Retired]: [],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('Policy', from, to);
  }
}

export function validateRemediationStatusTransition(
  from: RemediationStatus,
  to: RemediationStatus,
): void {
  const allowed: Record<RemediationStatus, readonly RemediationStatus[]> = {
    [RemediationStatus.Open]: [RemediationStatus.Planned, RemediationStatus.Blocked],
    [RemediationStatus.Planned]: [RemediationStatus.InProgress, RemediationStatus.Blocked],
    [RemediationStatus.InProgress]: [RemediationStatus.ReadyForReview, RemediationStatus.Blocked],
    [RemediationStatus.Blocked]: [RemediationStatus.InProgress, RemediationStatus.Open],
    [RemediationStatus.ReadyForReview]: [RemediationStatus.Completed, RemediationStatus.InProgress],
    [RemediationStatus.Completed]: [RemediationStatus.Verified],
    [RemediationStatus.Verified]: [],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('RemediationTask', from, to);
  }
}

/** Escalate compliance remediation tasks if past due. */
export function checkEscalations(
  tasks: RemediationTask[],
  now: Date,
): RemediationTask[] {
  const nowMs = now.getTime();

  return tasks.map((task) => {
    const isPastDue = new Date(task.dueDate).getTime() < nowMs;
    const isCompleted =
      task.status === RemediationStatus.Completed || task.status === RemediationStatus.Verified;

    if (isPastDue && !isCompleted && !task.escalated) {
      return { ...task, escalated: true };
    }
    return task;
  });
}
