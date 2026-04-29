import { describe, it, expect } from 'vitest';
import {
  shiftDurationHours,
  detectShiftOverlap,
  validateShiftAssignment,
  checkMinimumRestPeriod,
  checkMaxWeeklyHours,
  computeWorkloadSummary,
  findUncoveredShifts,
  ShiftType,
} from '../src/scheduling/roster';
import type { ShiftAssignment, LeaveRequest } from '../src/scheduling/roster';
import { Department } from '../src/core/enums';
import { AppError } from '../src/core/errors';

function makeShift(overrides: Partial<ShiftAssignment> = {}): ShiftAssignment {
  return {
    id: 'shift_001',
    createdAt: '2026-01-01T07:00:00Z',
    updatedAt: '2026-01-01T07:00:00Z',
    rosterId: 'roster_001',
    staffId: 'staff_001',
    department: Department.Emergency,
    shiftType: ShiftType.Day,
    date: '2026-01-05',
    startTime: '2026-01-05T07:00:00Z',
    endTime: '2026-01-05T15:00:00Z',
    isMandatory: false,
    isOnCall: false,
    ...overrides,
  };
}

describe('shiftDurationHours', () => {
  it('calculates 8-hour day shift', () => {
    expect(shiftDurationHours('2026-01-05T07:00:00Z', '2026-01-05T15:00:00Z')).toBe(8);
  });

  it('calculates 12-hour long shift', () => {
    expect(shiftDurationHours('2026-01-05T07:00:00Z', '2026-01-05T19:00:00Z')).toBe(12);
  });
});

describe('detectShiftOverlap', () => {
  const existing = [makeShift({
    staffId: 'staff_001',
    startTime: '2026-01-05T07:00:00Z',
    endTime: '2026-01-05T15:00:00Z',
  })];

  it('detects overlap for same staff at overlapping time', () => {
    const newShift = makeShift({
      id: 'shift_002',
      startTime: '2026-01-05T13:00:00Z',
      endTime: '2026-01-05T21:00:00Z',
    });
    const conflict = detectShiftOverlap(existing, newShift);
    expect(conflict).toBeDefined();
    expect(conflict?.id).toBe('shift_001');
  });

  it('no overlap for different staff', () => {
    const newShift = makeShift({
      id: 'shift_002',
      staffId: 'staff_002',
      startTime: '2026-01-05T13:00:00Z',
      endTime: '2026-01-05T21:00:00Z',
    });
    expect(detectShiftOverlap(existing, newShift)).toBeUndefined();
  });

  it('no overlap for adjacent shifts', () => {
    const newShift = makeShift({
      id: 'shift_002',
      startTime: '2026-01-05T15:00:00Z',
      endTime: '2026-01-05T23:00:00Z',
    });
    expect(detectShiftOverlap(existing, newShift)).toBeUndefined();
  });
});

describe('validateShiftAssignment', () => {
  it('passes for valid non-overlapping shift', () => {
    const newShift = makeShift({
      id: 'shift_002',
      startTime: '2026-01-06T07:00:00Z',
      endTime: '2026-01-06T15:00:00Z',
      date: '2026-01-06',
    });
    expect(() => validateShiftAssignment(newShift, [], [])).not.toThrow();
  });

  it('throws for zero or negative duration', () => {
    const badShift = makeShift({
      startTime: '2026-01-05T15:00:00Z',
      endTime: '2026-01-05T07:00:00Z',
    });
    expect(() => validateShiftAssignment(badShift, [], [])).toThrow(AppError);
  });

  it('throws for shifts exceeding 16 hours', () => {
    const longShift = makeShift({
      startTime: '2026-01-05T00:00:00Z',
      endTime: '2026-01-05T17:00:00Z',
    });
    expect(() => validateShiftAssignment(longShift, [], [])).toThrow(AppError);
  });

  it('throws for overlapping shift', () => {
    const existing = [makeShift()];
    const overlapping = makeShift({
      id: 'shift_002',
      startTime: '2026-01-05T14:00:00Z',
      endTime: '2026-01-05T22:00:00Z',
    });
    expect(() => validateShiftAssignment(overlapping, existing, [])).toThrow(AppError);
  });

  it('throws when staff is on approved leave', () => {
    const leave: LeaveRequest = {
      id: 'leave_001',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      staffId: 'staff_001',
      leaveType: 'Annual',
      startDate: '2026-01-05',
      endDate: '2026-01-09',
      requestedAt: '2026-01-01T00:00:00Z',
      status: 'Approved',
      coverageArranged: false,
    };
    expect(() => validateShiftAssignment(makeShift(), [], [leave])).toThrow(AppError);
  });
});

describe('checkMinimumRestPeriod', () => {
  it('passes for 11+ hours rest', () => {
    expect(() =>
      checkMinimumRestPeriod('2026-01-05T15:00:00Z', '2026-01-06T07:00:00Z'),
    ).not.toThrow();
  });

  it('throws for less than 11 hours rest', () => {
    expect(() =>
      checkMinimumRestPeriod('2026-01-05T15:00:00Z', '2026-01-05T23:00:00Z'),
    ).toThrow(AppError);
  });
});

describe('checkMaxWeeklyHours', () => {
  it('passes when under 48 hours', () => {
    const shifts: ShiftAssignment[] = [
      makeShift({ startTime: '2026-01-05T07:00:00Z', endTime: '2026-01-05T15:00:00Z' }),
      makeShift({ id: 's2', startTime: '2026-01-06T07:00:00Z', endTime: '2026-01-06T15:00:00Z', date: '2026-01-06' }),
    ];
    expect(() => checkMaxWeeklyHours('staff_001', shifts, '2026-01-05T00:00:00Z')).not.toThrow();
  });

  it('throws when accumulating over 48 hours in a week', () => {
    const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];
    const shifts: ShiftAssignment[] = dates.map((d, i) =>
      makeShift({
        id: `s${i}`,
        startTime: `${d}T07:00:00Z`,
        endTime: `${d}T15:00:00Z`,
        date: d,
      }),
    );
    // 7 days × 8 hours = 56 hours, exceeds 48
    expect(() => checkMaxWeeklyHours('staff_001', shifts, '2026-01-05T00:00:00Z')).toThrow(AppError);
  });
});

describe('computeWorkloadSummary', () => {
  const shifts = [
    makeShift({ date: '2026-01-05', startTime: '2026-01-05T07:00:00Z', endTime: '2026-01-05T15:00:00Z' }),
    makeShift({ id: 's2', date: '2026-01-06', startTime: '2026-01-06T23:00:00Z', endTime: '2026-01-07T07:00:00Z', shiftType: ShiftType.Night }),
  ];

  it('sums total hours correctly', () => {
    const summary = computeWorkloadSummary('staff_001', shifts, [], '2026-01-05T00:00:00Z', '2026-01-12T00:00:00Z');
    expect(summary.totalHours).toBe(16); // 8 + 8
  });

  it('counts night shifts', () => {
    const summary = computeWorkloadSummary('staff_001', shifts, [], '2026-01-05T00:00:00Z', '2026-01-12T00:00:00Z');
    expect(summary.nightShiftCount).toBe(1);
  });

  it('ignores other staff', () => {
    const summary = computeWorkloadSummary('staff_999', shifts, [], '2026-01-05T00:00:00Z', '2026-01-12T00:00:00Z');
    expect(summary.totalHours).toBe(0);
  });
});

describe('findUncoveredShifts', () => {
  it('detects uncovered shifts', () => {
    const shifts = [makeShift({ shiftType: ShiftType.Day })];
    const coverage = findUncoveredShifts(shifts, { Night: 1 });
    expect(coverage.length).toBeGreaterThan(0);
    expect(coverage[0].shiftType).toBe(ShiftType.Night);
  });

  it('returns empty when coverage is met', () => {
    const shifts = [makeShift({ shiftType: ShiftType.Day })];
    const coverage = findUncoveredShifts(shifts, { Day: 1 });
    expect(coverage).toHaveLength(0);
  });
});
