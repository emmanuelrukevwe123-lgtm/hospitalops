import type { Entity, ISODateString } from '../core/types';
import type { Department } from '../core/enums';
import { preconditionFailed } from '../core/errors';

export const EscalationTier = {
  Tier1_Bedside: 'Tier1_Bedside',
  Tier2_Registrar: 'Tier2_Registrar',
  Tier3_Consultant: 'Tier3_Consultant',
  Tier4_CMO: 'Tier4_CMO',
  Tier5_RapidResponseTeam: 'Tier5_RapidResponseTeam',
} as const;
export type EscalationTier = (typeof EscalationTier)[keyof typeof EscalationTier];

export const CallType = {
  MET: 'MET',             // Medical Emergency Team
  CodeBlue: 'CodeBlue',   // Cardiac arrest
  RapidResponse: 'RapidResponse',
  Trauma: 'Trauma',
  Stroke: 'Stroke',
  Sepsis: 'Sepsis',
} as const;
export type CallType = (typeof CallType)[keyof typeof CallType];

export interface EscalationPolicy {
  id: string;
  name: string;
  department: Department;
  triggerConditions: string[];
  tiers: EscalationTier[];
  delayBetweenTiersMinutes: number;
  enabled: boolean;
}

export interface EscalationEvent extends Entity {
  alertId: string;
  patientId?: string;
  department: Department;
  initiatedBy: string;
  initiatedAt: ISODateString;
  currentTier: EscalationTier;
  tiersActivated: EscalationTier[];
  status: 'Active' | 'Resolved' | 'Cancelled';
  resolvedAt?: ISODateString;
  resolvedBy?: string;
  callType?: CallType;
  responseTimeMinutes?: number;
  outcome?: string;
  notes?: string;
}

export interface OnCallRoster {
  department: Department;
  tier: EscalationTier;
  staffId: string;
  effectiveFrom: ISODateString;
  effectiveTo: ISODateString;
  backupStaffId?: string;
}

export function resolveNextTier(currentTier: EscalationTier): EscalationTier | null {
  const progression: EscalationTier[] = [
    EscalationTier.Tier1_Bedside,
    EscalationTier.Tier2_Registrar,
    EscalationTier.Tier3_Consultant,
    EscalationTier.Tier4_CMO,
    EscalationTier.Tier5_RapidResponseTeam,
  ];
  const idx = progression.indexOf(currentTier);
  return idx >= 0 && idx < progression.length - 1 ? progression[idx + 1] : null;
}

export function selectOnCallRespondent(
  roster: OnCallRoster[],
  department: Department,
  tier: EscalationTier,
  now: ISODateString,
): OnCallRoster | undefined {
  const nowMs = new Date(now).getTime();
  return roster.find(
    (r) =>
      r.department === department &&
      r.tier === tier &&
      new Date(r.effectiveFrom).getTime() <= nowMs &&
      new Date(r.effectiveTo).getTime() > nowMs,
  );
}

export function triggerEscalation(
  event: EscalationEvent,
  roster: OnCallRoster[],
  now: ISODateString,
): { event: EscalationEvent; respondent: OnCallRoster | undefined } {
  const nextTier = resolveNextTier(event.currentTier);
  if (!nextTier) {
    throw preconditionFailed(
      `Escalation has reached the maximum tier (${event.currentTier}) for patient ${event.patientId ?? 'unknown'}. All channels exhausted.`,
    );
  }

  const respondent = selectOnCallRespondent(roster, event.department, nextTier, now);

  const updatedEvent: EscalationEvent = {
    ...event,
    currentTier: nextTier,
    tiersActivated: [...event.tiersActivated, nextTier],
    updatedAt: now,
  };

  return { event: updatedEvent, respondent };
}

export function buildMETCallCriteria(): { criterion: string; triggerValue: string }[] {
  return [
    { criterion: 'Threatened Airway', triggerValue: 'Any' },
    { criterion: 'Respiratory Rate', triggerValue: '< 8 or > 30 breaths/min' },
    { criterion: 'SpO2', triggerValue: '< 90% despite O2' },
    { criterion: 'Systolic BP', triggerValue: '< 90 mmHg' },
    { criterion: 'Heart Rate', triggerValue: '< 40 or > 140 bpm' },
    { criterion: 'GCS', triggerValue: 'Drop > 2 points or < 9' },
    { criterion: 'Urine Output', triggerValue: '< 50mL in 4 hours' },
    { criterion: 'NEWS2 Score', triggerValue: '≥ 7' },
    { criterion: 'Severe Pain', triggerValue: 'Unresponsive to treatment' },
    { criterion: 'Staff Concern', triggerValue: 'Any clinical concern' },
  ];
}

export function shouldTriggerMET(
  newsScore: number,
  respiratoryRate?: number,
  spo2?: number,
  systolicBP?: number,
  heartRate?: number,
  gcsScore?: number,
  urineOutputMlPerHr?: number,
): boolean {
  if (newsScore >= 7) return true;
  if (respiratoryRate !== undefined && (respiratoryRate < 8 || respiratoryRate > 30)) return true;
  if (spo2 !== undefined && spo2 < 90) return true;
  if (systolicBP !== undefined && systolicBP < 90) return true;
  if (heartRate !== undefined && (heartRate < 40 || heartRate > 140)) return true;
  if (gcsScore !== undefined && gcsScore < 9) return true;
  if (urineOutputMlPerHr !== undefined && urineOutputMlPerHr < 12.5) return true; // <50mL/4h
  return false;
}

export function calculateResponseTime(
  callInitiatedAt: ISODateString,
  teamArrivedAt: ISODateString,
): number {
  const diff = new Date(teamArrivedAt).getTime() - new Date(callInitiatedAt).getTime();
  return Math.round(diff / 60_000);
}

export function buildEscalationPolicy(department: Department): EscalationPolicy {
  return {
    id: `policy_${department}`,
    name: `${department} Escalation Policy`,
    department,
    triggerConditions: [
      'NEWS2 ≥ 5',
      'Clinical staff concern',
      'SLA breach > 30 minutes',
    ],
    tiers: [
      EscalationTier.Tier1_Bedside,
      EscalationTier.Tier2_Registrar,
      EscalationTier.Tier3_Consultant,
      EscalationTier.Tier4_CMO,
    ],
    delayBetweenTiersMinutes: 15,
    enabled: true,
  };
}

export function formatEscalationSummary(event: EscalationEvent): string {
  const lines = [
    `Escalation ID: ${event.id}`,
    `Patient: ${event.patientId ?? 'N/A'}`,
    `Department: ${event.department}`,
    `Initiated: ${event.initiatedAt} by ${event.initiatedBy}`,
    `Current Tier: ${event.currentTier}`,
    `Tiers Activated: ${event.tiersActivated.join(' → ')}`,
    `Status: ${event.status}`,
  ];
  if (event.callType) lines.push(`Call Type: ${event.callType}`);
  if (event.responseTimeMinutes !== undefined) lines.push(`Response Time: ${event.responseTimeMinutes} min`);
  if (event.outcome) lines.push(`Outcome: ${event.outcome}`);
  return lines.join('\n');
}
