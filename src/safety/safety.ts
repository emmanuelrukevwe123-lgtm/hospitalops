import type { Entity, ISODateString } from '../core/types';
import { AppError, validation } from '../core/errors';
import { Department } from '../core/enums';
import { addMinutes } from '../core/clock';

export const SeverityLevel = {
  NearMiss: 'NearMiss',
  Minor: 'Minor',
  Moderate: 'Moderate',
  Serious: 'Serious',
  Sentinel: 'Sentinel',
} as const;
export type SeverityLevel = (typeof SeverityLevel)[keyof typeof SeverityLevel];

export interface SafetyIncident extends Entity {
  title: string;
  eventType: 'NearMiss' | 'AdverseEvent' | 'SentinelEvent';
  severity: SeverityLevel;
  unit: Department;
  reportedBy: string; // Staff ID
  reportedAt: ISODateString;
  description: string;
  rootCauseAnalysis?: string;
  correctiveActions: string[];
  regulatoryDeadline?: ISODateString;
  regulatoryReportedAt?: ISODateString;
}

/** Calculate regulatory reporting deadline from severity and occurrence time. */
export function calculateRegulatoryDeadline(
  severity: SeverityLevel,
  reportedAt: ISODateString,
): ISODateString | undefined {
  if (severity === SeverityLevel.Sentinel) {
    // 24 hours = 1440 minutes
    return addMinutes(reportedAt, 1440);
  }
  if (severity === SeverityLevel.Serious) {
    // 7 days = 10080 minutes
    return addMinutes(reportedAt, 10080);
  }
  return undefined;
}

/** Returns incident IDs that are overdue for regulatory reporting. */
export function getOverdueIncidents(
  incidents: SafetyIncident[],
  now: Date,
): string[] {
  const overdue: string[] = [];
  const nowMs = now.getTime();

  for (const inc of incidents) {
    if (inc.regulatoryDeadline && !inc.regulatoryReportedAt) {
      const deadlineMs = new Date(inc.regulatoryDeadline).getTime();
      if (nowMs > deadlineMs) {
        overdue.push(inc.id);
      }
    }
  }

  return overdue;
}
