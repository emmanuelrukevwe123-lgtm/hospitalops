import type { Entity, ISODateString } from '../core/types';

export const AlertSeverity = {
  Info: 'Info',
  Warning: 'Warning',
  Critical: 'Critical',
  Emergency: 'Emergency',
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const AlertCategory = {
  ClinicalDegradation: 'ClinicalDegradation',
  CriticalLabValue: 'CriticalLabValue',
  CriticalImaging: 'CriticalImaging',
  MedicationSafety: 'MedicationSafety',
  SLABreach: 'SLABreach',
  BedCapacity: 'BedCapacity',
  InfectionControl: 'InfectionControl',
  EquipmentFailure: 'EquipmentFailure',
  StaffSafety: 'StaffSafety',
  FallRisk: 'FallRisk',
  TransfusionReaction: 'TransfusionReaction',
  DischargeDelay: 'DischargeDelay',
} as const;
export type AlertCategory = (typeof AlertCategory)[keyof typeof AlertCategory];

export const AlertStatus = {
  Active: 'Active',
  Acknowledged: 'Acknowledged',
  Resolved: 'Resolved',
  Escalated: 'Escalated',
  Suppressed: 'Suppressed',
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export interface ClinicalAlert extends Entity {
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  patientId?: string;
  entityType?: string;
  entityId?: string;
  generatedAt: ISODateString;
  acknowledgedAt?: ISODateString;
  acknowledgedBy?: string;
  resolvedAt?: ISODateString;
  resolvedBy?: string;
  escalatedAt?: ISODateString;
  escalatedTo?: string;
  autoEscalateAfterMinutes?: number;
  suppressedUntil?: ISODateString;
  suppressedBy?: string;
  suppressionReason?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertRecipient {
  staffId: string;
  channel: 'InApp' | 'SMS' | 'Pager' | 'Email';
  deliveredAt?: ISODateString;
  readAt?: ISODateString;
}

export interface AlertNotification extends Entity {
  alertId: string;
  recipients: AlertRecipient[];
  sentAt: ISODateString;
  retryCount: number;
  deliveryStatus: 'Pending' | 'Sent' | 'Failed' | 'PartiallyDelivered';
}

export interface AlertRule {
  id: string;
  name: string;
  category: AlertCategory;
  severity: AlertSeverity;
  condition: string;                // Human-readable description of condition
  autoEscalateAfterMinutes: number;
  suppressDuplicateWindowMinutes: number;
  recipientRoles: string[];
  enabled: boolean;
}

const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule_news_critical',
    name: 'NEWS2 Score ≥ 7',
    category: AlertCategory.ClinicalDegradation,
    severity: AlertSeverity.Emergency,
    condition: 'NEWS2 aggregate score is 7 or above',
    autoEscalateAfterMinutes: 5,
    suppressDuplicateWindowMinutes: 15,
    recipientRoles: ['Nurse', 'ChiefMedicalOfficer', 'Intensivist'],
    enabled: true,
  },
  {
    id: 'rule_news_high',
    name: 'NEWS2 Score 5-6',
    category: AlertCategory.ClinicalDegradation,
    severity: AlertSeverity.Critical,
    condition: 'NEWS2 aggregate score is between 5 and 6',
    autoEscalateAfterMinutes: 15,
    suppressDuplicateWindowMinutes: 30,
    recipientRoles: ['Nurse', 'Doctor'],
    enabled: true,
  },
  {
    id: 'rule_critical_troponin',
    name: 'Critical Troponin',
    category: AlertCategory.CriticalLabValue,
    severity: AlertSeverity.Critical,
    condition: 'Troponin > 0.04 μg/L',
    autoEscalateAfterMinutes: 10,
    suppressDuplicateWindowMinutes: 60,
    recipientRoles: ['Doctor', 'Cardiologist'],
    enabled: true,
  },
  {
    id: 'rule_critical_potassium',
    name: 'Critical Potassium',
    category: AlertCategory.CriticalLabValue,
    severity: AlertSeverity.Critical,
    condition: 'Potassium < 3.0 or > 6.0 mmol/L',
    autoEscalateAfterMinutes: 10,
    suppressDuplicateWindowMinutes: 60,
    recipientRoles: ['Doctor'],
    enabled: true,
  },
  {
    id: 'rule_sla_triage_doctor',
    name: 'Triage to Doctor SLA Breach',
    category: AlertCategory.SLABreach,
    severity: AlertSeverity.Warning,
    condition: 'Patient has not been seen by a doctor within the SLA window post-triage',
    autoEscalateAfterMinutes: 30,
    suppressDuplicateWindowMinutes: 30,
    recipientRoles: ['Nurse', 'Doctor', 'Admin'],
    enabled: true,
  },
  {
    id: 'rule_bed_capacity_90',
    name: 'Bed Occupancy ≥ 90%',
    category: AlertCategory.BedCapacity,
    severity: AlertSeverity.Warning,
    condition: 'Hospital bed occupancy has reached or exceeded 90%',
    autoEscalateAfterMinutes: 60,
    suppressDuplicateWindowMinutes: 120,
    recipientRoles: ['Admin', 'BedManager'],
    enabled: true,
  },
  {
    id: 'rule_bed_capacity_100',
    name: 'Bed Occupancy 100%',
    category: AlertCategory.BedCapacity,
    severity: AlertSeverity.Emergency,
    condition: 'Hospital bed occupancy has reached 100%',
    autoEscalateAfterMinutes: 15,
    suppressDuplicateWindowMinutes: 60,
    recipientRoles: ['Admin', 'BedManager', 'ChiefMedicalOfficer'],
    enabled: true,
  },
  {
    id: 'rule_transfusion_reaction',
    name: 'Transfusion Reaction',
    category: AlertCategory.TransfusionReaction,
    severity: AlertSeverity.Emergency,
    condition: 'A transfusion reaction has been reported',
    autoEscalateAfterMinutes: 5,
    suppressDuplicateWindowMinutes: 0,
    recipientRoles: ['Nurse', 'Doctor', 'Haematologist'],
    enabled: true,
  },
];

export function getAlertRules(): AlertRule[] {
  return DEFAULT_ALERT_RULES.filter((r) => r.enabled);
}

export function findApplicableRule(
  category: AlertCategory,
  severity: AlertSeverity,
): AlertRule | undefined {
  return DEFAULT_ALERT_RULES.find(
    (r) => r.category === category && r.severity === severity && r.enabled,
  );
}

export function shouldSuppressDuplicate(
  existingAlerts: ClinicalAlert[],
  category: AlertCategory,
  patientId: string | undefined,
  now: ISODateString,
  windowMinutes: number,
): boolean {
  if (windowMinutes <= 0) return false;
  const windowMs = windowMinutes * 60_000;
  const nowMs = new Date(now).getTime();

  return existingAlerts.some((a) => {
    if (a.category !== category) return false;
    if (a.patientId !== patientId) return false;
    if (a.status === AlertStatus.Resolved || a.status === AlertStatus.Suppressed) return false;
    const generatedMs = new Date(a.generatedAt).getTime();
    return nowMs - generatedMs < windowMs;
  });
}

export function requiresImmediateEscalation(alert: ClinicalAlert, now: ISODateString): boolean {
  if (alert.status !== AlertStatus.Active) return false;
  if (!alert.autoEscalateAfterMinutes) return false;
  const ageMs = new Date(now).getTime() - new Date(alert.generatedAt).getTime();
  return ageMs > alert.autoEscalateAfterMinutes * 60_000;
}

export function acknowledgeAlert(
  alert: ClinicalAlert,
  acknowledgedBy: string,
  now: ISODateString,
): ClinicalAlert {
  return {
    ...alert,
    status: AlertStatus.Acknowledged,
    acknowledgedAt: now,
    acknowledgedBy,
    updatedAt: now,
  };
}

export function resolveAlert(
  alert: ClinicalAlert,
  resolvedBy: string,
  now: ISODateString,
): ClinicalAlert {
  return {
    ...alert,
    status: AlertStatus.Resolved,
    resolvedAt: now,
    resolvedBy,
    updatedAt: now,
  };
}

export function escalateAlert(
  alert: ClinicalAlert,
  escalatedTo: string,
  now: ISODateString,
): ClinicalAlert {
  return {
    ...alert,
    status: AlertStatus.Escalated,
    escalatedAt: now,
    escalatedTo,
    updatedAt: now,
  };
}

export function suppressAlert(
  alert: ClinicalAlert,
  suppressedBy: string,
  reason: string,
  untilTime: ISODateString,
  now: ISODateString,
): ClinicalAlert {
  return {
    ...alert,
    status: AlertStatus.Suppressed,
    suppressedBy,
    suppressionReason: reason,
    suppressedUntil: untilTime,
    updatedAt: now,
  };
}

export function prioritiseAlerts(alerts: ClinicalAlert[]): ClinicalAlert[] {
  const severityOrder: Record<AlertSeverity, number> = {
    Emergency: 0,
    Critical: 1,
    Warning: 2,
    Info: 3,
  };

  return [...alerts]
    .filter((a) => a.status === AlertStatus.Active || a.status === AlertStatus.Escalated)
    .sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime();
    });
}

export function buildBedCapacityAlert(
  occupancyRate: number,
  totalBeds: number,
  occupiedBeds: number,
  now: ISODateString,
): Partial<ClinicalAlert> {
  const isEmergency = occupancyRate >= 1.0;
  return {
    category: AlertCategory.BedCapacity,
    severity: isEmergency ? AlertSeverity.Emergency : AlertSeverity.Warning,
    title: isEmergency ? 'Hospital at Full Capacity' : 'High Bed Occupancy',
    message: `Bed occupancy is at ${(occupancyRate * 100).toFixed(1)}% (${occupiedBeds}/${totalBeds} beds occupied)`,
    generatedAt: now,
    status: AlertStatus.Active,
    metadata: { occupancyRate, occupiedBeds, totalBeds },
  };
}

export function buildSLABreachAlert(
  patientId: string,
  slaType: string,
  breachTime: ISODateString,
  now: ISODateString,
): Partial<ClinicalAlert> {
  return {
    category: AlertCategory.SLABreach,
    severity: AlertSeverity.Warning,
    title: `SLA Breach: ${slaType}`,
    message: `Patient ${patientId} has breached the ${slaType} SLA (target: ${breachTime})`,
    patientId,
    generatedAt: now,
    status: AlertStatus.Active,
    metadata: { slaType, breachTime },
  };
}
