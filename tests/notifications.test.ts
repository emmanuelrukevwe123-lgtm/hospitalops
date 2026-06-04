import { describe, it, expect } from 'vitest';
import {
  getAlertRules,
  findApplicableRule,
  shouldSuppressDuplicate,
  requiresImmediateEscalation,
  acknowledgeAlert,
  resolveAlert,
  escalateAlert,
  suppressAlert,
  prioritiseAlerts,
  buildBedCapacityAlert,
  buildSLABreachAlert,
  AlertCategory,
  AlertSeverity,
  AlertStatus,
} from '../src/notifications/alert';
import {
  resolveNextTier,
  shouldTriggerMET,
  calculateResponseTime,
  buildMETCallCriteria,
  EscalationTier,
} from '../src/notifications/escalation';
import type { ClinicalAlert } from '../src/notifications/alert';

function makeAlert(overrides: Partial<ClinicalAlert> = {}): ClinicalAlert {
  return {
    id: 'alert_001',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
    category: AlertCategory.ClinicalDegradation,
    severity: AlertSeverity.Critical,
    status: AlertStatus.Active,
    title: 'High NEWS2 Score',
    message: 'Patient NEWS2 score is 6',
    generatedAt: '2026-01-01T08:00:00Z',
    autoEscalateAfterMinutes: 15,
    ...overrides,
  };
}

describe('getAlertRules', () => {
  it('returns only enabled rules', () => {
    const rules = getAlertRules();
    expect(rules.every((r) => r.enabled)).toBe(true);
  });

  it('returns at least one rule', () => {
    expect(getAlertRules().length).toBeGreaterThan(0);
  });
});

describe('findApplicableRule', () => {
  it('finds rule for clinical degradation emergency', () => {
    const rule = findApplicableRule(AlertCategory.ClinicalDegradation, AlertSeverity.Emergency);
    expect(rule).toBeDefined();
    expect(rule?.category).toBe(AlertCategory.ClinicalDegradation);
  });

  it('returns undefined for non-existent combination', () => {
    const rule = findApplicableRule(AlertCategory.FallRisk, AlertSeverity.Info);
    expect(rule).toBeUndefined();
  });
});

describe('shouldSuppressDuplicate', () => {
  const now = '2026-01-01T08:05:00Z';
  const recentAlert = makeAlert({ generatedAt: '2026-01-01T08:00:00Z' });

  it('suppresses duplicate within window', () => {
    const suppress = shouldSuppressDuplicate(
      [recentAlert],
      AlertCategory.ClinicalDegradation,
      undefined,
      now,
      30,
    );
    expect(suppress).toBe(true);
  });

  it('does not suppress after window expires', () => {
    const suppress = shouldSuppressDuplicate(
      [recentAlert],
      AlertCategory.ClinicalDegradation,
      undefined,
      '2026-01-01T09:00:00Z',
      30,
    );
    expect(suppress).toBe(false);
  });

  it('does not suppress resolved alerts', () => {
    const resolved = makeAlert({ status: AlertStatus.Resolved, generatedAt: '2026-01-01T08:00:00Z' });
    const suppress = shouldSuppressDuplicate(
      [resolved],
      AlertCategory.ClinicalDegradation,
      undefined,
      now,
      30,
    );
    expect(suppress).toBe(false);
  });

  it('does not suppress for zero window', () => {
    expect(shouldSuppressDuplicate([recentAlert], AlertCategory.ClinicalDegradation, undefined, now, 0)).toBe(false);
  });
});

describe('requiresImmediateEscalation', () => {
  it('requires escalation when past auto-escalate time', () => {
    const alert = makeAlert({ generatedAt: '2026-01-01T07:00:00Z', autoEscalateAfterMinutes: 15 });
    expect(requiresImmediateEscalation(alert, '2026-01-01T08:00:00Z')).toBe(true);
  });

  it('does not require escalation when within window', () => {
    const alert = makeAlert({ generatedAt: '2026-01-01T08:00:00Z', autoEscalateAfterMinutes: 30 });
    expect(requiresImmediateEscalation(alert, '2026-01-01T08:05:00Z')).toBe(false);
  });

  it('does not require escalation for acknowledged alerts', () => {
    const alert = makeAlert({ status: AlertStatus.Acknowledged, generatedAt: '2026-01-01T07:00:00Z', autoEscalateAfterMinutes: 5 });
    expect(requiresImmediateEscalation(alert, '2026-01-01T08:00:00Z')).toBe(false);
  });
});

describe('alert lifecycle', () => {
  const now = '2026-01-01T09:00:00Z';

  it('acknowledges an active alert', () => {
    const alert = makeAlert();
    const acked = acknowledgeAlert(alert, 'nurse_001', now);
    expect(acked.status).toBe(AlertStatus.Acknowledged);
    expect(acked.acknowledgedBy).toBe('nurse_001');
  });

  it('resolves an alert', () => {
    const alert = makeAlert({ status: AlertStatus.Acknowledged });
    const resolved = resolveAlert(alert, 'dr_001', now);
    expect(resolved.status).toBe(AlertStatus.Resolved);
    expect(resolved.resolvedBy).toBe('dr_001');
  });

  it('escalates an alert', () => {
    const alert = makeAlert();
    const escalated = escalateAlert(alert, 'consultant_001', now);
    expect(escalated.status).toBe(AlertStatus.Escalated);
    expect(escalated.escalatedTo).toBe('consultant_001');
  });

  it('suppresses an alert', () => {
    const alert = makeAlert();
    const suppressed = suppressAlert(alert, 'admin_001', 'Planned procedure', '2026-01-01T10:00:00Z', now);
    expect(suppressed.status).toBe(AlertStatus.Suppressed);
    expect(suppressed.suppressionReason).toBe('Planned procedure');
  });
});

describe('prioritiseAlerts', () => {
  it('orders emergency before critical before warning', () => {
    const alerts: ClinicalAlert[] = [
      makeAlert({ id: 'a1', severity: AlertSeverity.Warning, generatedAt: '2026-01-01T08:00:00Z' }),
      makeAlert({ id: 'a2', severity: AlertSeverity.Emergency, generatedAt: '2026-01-01T08:01:00Z' }),
      makeAlert({ id: 'a3', severity: AlertSeverity.Critical, generatedAt: '2026-01-01T08:02:00Z' }),
    ];
    const sorted = prioritiseAlerts(alerts);
    expect(sorted[0]!.id).toBe('a2');
    expect(sorted[1]!.id).toBe('a3');
    expect(sorted[2]!.id).toBe('a1');
  });

  it('excludes resolved alerts', () => {
    const alerts: ClinicalAlert[] = [
      makeAlert({ id: 'a1' }),
      makeAlert({ id: 'a2', status: AlertStatus.Resolved }),
    ];
    const sorted = prioritiseAlerts(alerts);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.id).toBe('a1');
  });
});

describe('buildBedCapacityAlert', () => {
  it('builds warning for 90% occupancy', () => {
    const alert = buildBedCapacityAlert(0.90, 100, 90, '2026-01-01T08:00:00Z');
    expect(alert.severity).toBe(AlertSeverity.Warning);
  });

  it('builds emergency for 100% occupancy', () => {
    const alert = buildBedCapacityAlert(1.0, 100, 100, '2026-01-01T08:00:00Z');
    expect(alert.severity).toBe(AlertSeverity.Emergency);
  });
});

describe('buildSLABreachAlert', () => {
  it('builds SLA breach alert', () => {
    const alert = buildSLABreachAlert('pat_001', 'TriageToDoctor', '2026-01-01T08:15:00Z', '2026-01-01T08:30:00Z');
    expect(alert.category).toBe(AlertCategory.SLABreach);
    expect(alert.patientId).toBe('pat_001');
  });
});

describe('escalation — resolveNextTier', () => {
  it('progresses from tier 1 to tier 2', () => {
    expect(resolveNextTier(EscalationTier.Tier1_Bedside)).toBe(EscalationTier.Tier2_Registrar);
  });

  it('progresses from tier 4 to RRT', () => {
    expect(resolveNextTier(EscalationTier.Tier4_CMO)).toBe(EscalationTier.Tier5_RapidResponseTeam);
  });

  it('returns null at max tier', () => {
    expect(resolveNextTier(EscalationTier.Tier5_RapidResponseTeam)).toBeNull();
  });
});

describe('shouldTriggerMET', () => {
  it('triggers for NEWS ≥7', () => {
    expect(shouldTriggerMET(7)).toBe(true);
  });

  it('does not trigger for low NEWS with normal obs', () => {
    expect(shouldTriggerMET(3, 16, 97, 110, 80, 15, 40)).toBe(false);
  });

  it('triggers for low respiratory rate', () => {
    expect(shouldTriggerMET(4, 6)).toBe(true);
  });

  it('triggers for critical low heart rate', () => {
    expect(shouldTriggerMET(3, undefined, undefined, undefined, 35)).toBe(true);
  });
});

describe('calculateResponseTime', () => {
  it('calculates 8-minute response time', () => {
    const time = calculateResponseTime('2026-01-01T08:00:00Z', '2026-01-01T08:08:00Z');
    expect(time).toBe(8);
  });
});

describe('buildMETCallCriteria', () => {
  it('returns at least 10 criteria', () => {
    expect(buildMETCallCriteria().length).toBeGreaterThanOrEqual(10);
  });
});
