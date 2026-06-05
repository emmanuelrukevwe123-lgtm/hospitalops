import { describe, it, expect } from 'vitest';
import {
  resolveNextTier,
  selectOnCallRespondent,
  triggerEscalation,
  buildMETCallCriteria,
  shouldTriggerMET,
  calculateResponseTime,
  buildEscalationPolicy,
  formatEscalationSummary,
  EscalationTier,
  CallType,
  type EscalationEvent,
  type OnCallRoster,
} from '../src/notifications/escalation';
import { Department } from '../src/core/enums';
import { AppError } from '../src/core/errors';

function makeEvent(overrides: Partial<EscalationEvent> = {}): EscalationEvent {
  return {
    id: 'esc_001',
    createdAt: '2026-06-04T12:00:00Z',
    updatedAt: '2026-06-04T12:00:00Z',
    alertId: 'alert_001',
    patientId: 'pat_001',
    department: Department.Emergency,
    initiatedBy: 'nurse_1',
    initiatedAt: '2026-06-04T12:00:00Z',
    currentTier: EscalationTier.Tier1_Bedside,
    tiersActivated: [EscalationTier.Tier1_Bedside],
    status: 'Active',
    ...overrides,
  };
}

function makeRoster(overrides: Partial<OnCallRoster> = {}): OnCallRoster {
  return {
    department: Department.Emergency,
    tier: EscalationTier.Tier2_Registrar,
    staffId: 'reg_1',
    effectiveFrom: '2026-06-04T08:00:00Z',
    effectiveTo: '2026-06-04T20:00:00Z',
    ...overrides,
  };
}

const nowIso = '2026-06-04T12:30:00.000Z';

describe('resolveNextTier', () => {
  it('advances through the tier progression', () => {
    expect(resolveNextTier(EscalationTier.Tier1_Bedside)).toBe(EscalationTier.Tier2_Registrar);
    expect(resolveNextTier(EscalationTier.Tier4_CMO)).toBe(EscalationTier.Tier5_RapidResponseTeam);
  });

  it('returns null at the maximum tier', () => {
    expect(resolveNextTier(EscalationTier.Tier5_RapidResponseTeam)).toBeNull();
  });
});

describe('selectOnCallRespondent', () => {
  it('finds an active respondent for the department and tier', () => {
    const roster = [makeRoster()];
    const result = selectOnCallRespondent(roster, Department.Emergency, EscalationTier.Tier2_Registrar, nowIso);
    expect(result?.staffId).toBe('reg_1');
  });

  it('ignores rosters outside their effective window', () => {
    const roster = [makeRoster({ effectiveTo: '2026-06-04T12:00:00Z' })];
    const result = selectOnCallRespondent(roster, Department.Emergency, EscalationTier.Tier2_Registrar, nowIso);
    expect(result).toBeUndefined();
  });

  it('ignores rosters for other departments', () => {
    const roster = [makeRoster({ department: Department.General })];
    const result = selectOnCallRespondent(roster, Department.Emergency, EscalationTier.Tier2_Registrar, nowIso);
    expect(result).toBeUndefined();
  });
});

describe('triggerEscalation', () => {
  it('advances tier and finds the respondent', () => {
    const { event, respondent } = triggerEscalation(makeEvent(), [makeRoster()], nowIso);
    expect(event.currentTier).toBe(EscalationTier.Tier2_Registrar);
    expect(event.tiersActivated).toContain(EscalationTier.Tier2_Registrar);
    expect(event.updatedAt).toBe(nowIso);
    expect(respondent?.staffId).toBe('reg_1');
  });

  it('returns undefined respondent when none on call', () => {
    const { respondent } = triggerEscalation(makeEvent(), [], nowIso);
    expect(respondent).toBeUndefined();
  });

  it('throws when already at the maximum tier', () => {
    expect(() =>
      triggerEscalation(makeEvent({ currentTier: EscalationTier.Tier5_RapidResponseTeam }), [], nowIso),
    ).toThrow(AppError);
  });
});

describe('buildMETCallCriteria', () => {
  it('returns the standard MET trigger set', () => {
    const criteria = buildMETCallCriteria();
    expect(criteria.length).toBeGreaterThanOrEqual(10);
    expect(criteria.some((c) => c.criterion === 'NEWS2 Score')).toBe(true);
  });
});

describe('shouldTriggerMET', () => {
  it('triggers on high NEWS2 alone', () => {
    expect(shouldTriggerMET(7)).toBe(true);
  });

  it('triggers on physiological derangements', () => {
    expect(shouldTriggerMET(2, 6)).toBe(true);
    expect(shouldTriggerMET(2, 18, 85)).toBe(true);
    expect(shouldTriggerMET(2, 18, 98, 80)).toBe(true);
    expect(shouldTriggerMET(2, 18, 98, 120, 150)).toBe(true);
    expect(shouldTriggerMET(2, 18, 98, 120, 80, 8)).toBe(true);
    expect(shouldTriggerMET(2, 18, 98, 120, 80, 14, 10)).toBe(true);
  });

  it('does not trigger when all parameters normal', () => {
    expect(shouldTriggerMET(2, 18, 98, 120, 80, 15, 50)).toBe(false);
  });
});

describe('calculateResponseTime', () => {
  it('computes minutes between call and arrival', () => {
    expect(calculateResponseTime('2026-06-04T12:00:00Z', '2026-06-04T12:07:00Z')).toBe(7);
  });
});

describe('buildEscalationPolicy', () => {
  it('builds a department-scoped policy', () => {
    const policy = buildEscalationPolicy(Department.Emergency);
    expect(policy.department).toBe(Department.Emergency);
    expect(policy.tiers).toContain(EscalationTier.Tier1_Bedside);
    expect(policy.enabled).toBe(true);
    expect(policy.delayBetweenTiersMinutes).toBe(15);
  });
});

describe('formatEscalationSummary', () => {
  it('renders core fields', () => {
    const summary = formatEscalationSummary(makeEvent());
    expect(summary).toContain('Escalation ID: esc_001');
    expect(summary).toContain('Department: Emergency');
    expect(summary).toContain('Current Tier: Tier1_Bedside');
  });

  it('includes optional call type, response time and outcome when present', () => {
    const summary = formatEscalationSummary(
      makeEvent({ callType: CallType.MET, responseTimeMinutes: 4, outcome: 'Stabilised' }),
    );
    expect(summary).toContain('Call Type: MET');
    expect(summary).toContain('Response Time: 4 min');
    expect(summary).toContain('Outcome: Stabilised');
  });
});
