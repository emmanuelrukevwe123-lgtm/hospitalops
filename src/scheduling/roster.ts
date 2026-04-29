import type { Entity, ISODateString } from '../core/types';
import { conflict, preconditionFailed, validation } from '../core/errors';
import type { Department } from '../core/enums';

export const ShiftType = {
  Day: 'Day',       // 07:00-15:00
  Evening: 'Evening', // 15:00-23:00
  Night: 'Night',   // 23:00-07:00
  Long: 'Long',     // 12-hour e.g. 07:00-19:00
  OnCall: 'OnCall',
} as const;
export type ShiftType = (typeof ShiftType)[keyof typeof ShiftType];

export const RosterStatus = {
  Draft: 'Draft',
  Published: 'Published',
  Locked: 'Locked',
} as const;
export type RosterStatus = (typeof RosterStatus)[keyof typeof RosterStatus];

export const LeaveType = {
  Annual: 'Annual',
  Sick: 'Sick',
  Maternity: 'Maternity',
  Paternity: 'Paternity',
  Study: 'Study',
  Compassionate: 'Compassionate',
  Unpaid: 'Unpaid',
} as const;
export type LeaveType = (typeof LeaveType)[keyof typeof LeaveType];

export interface RosterPeriod extends Entity {
  department: Department;
  startDate: ISODateString;  // YYYY-MM-DD
  endDate: ISODateString;
  status: RosterStatus;
  publishedAt?: ISODateString;
  publishedBy?: string;
  notes?: string;
}

export interface ShiftAssignment extends Entity {
  rosterId: string;
  staffId: string;
  department: Department;
  shiftType: ShiftType;
  date: ISODateString;           // YYYY-MM-DD
  startTime: ISODateString;
  endTime: ISODateString;
  isMandatory: boolean;
  isOnCall: boolean;
  swappedFromId?: string;
  swappedWithStaffId?: string;
  approvedBy?: string;
  notes?: string;
}

export interface LeaveRequest extends Entity {
  staffId: string;
  leaveType: LeaveType;
  startDate: ISODateString;
  endDate: ISODateString;
  requestedAt: ISODateString;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvedAt?: ISODateString;
  reason?: string;
  coverageArranged: boolean;
}

export interface ShiftSwapRequest extends Entity {
  requesterId: string;
  targetStaffId: string;
  requesterShiftId: string;
  targetShiftId: string;
  reason?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  requestedAt: ISODateString;
}

export interface StaffWorkloadSummary {
  staffId: string;
  period: { start: ISODateString; end: ISODateString };
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  nightShiftCount: number;
  weekendShiftCount: number;
  onCallHours: number;
  leaveHoursTaken: number;
}

export function shiftDurationHours(startTime: ISODateString, endTime: ISODateString): number {
  const diff = new Date(endTime).getTime() - new Date(startTime).getTime();
  return diff / 3_600_000;
}

export function detectShiftOverlap(
  existing: ShiftAssignment[],
  newAssignment: Omit<ShiftAssignment, 'id' | 'createdAt' | 'updatedAt'>,
): ShiftAssignment | undefined {
  const newStart = new Date(newAssignment.startTime).getTime();
  const newEnd = new Date(newAssignment.endTime).getTime();

  return existing.find((s) => {
    if (s.staffId !== newAssignment.staffId) return false;
    const existStart = new Date(s.startTime).getTime();
    const existEnd = new Date(s.endTime).getTime();
    return newStart < existEnd && existStart < newEnd;
  });
}

export function validateShiftAssignment(
  assignment: Omit<ShiftAssignment, 'id' | 'createdAt' | 'updatedAt'>,
  existingAssignments: ShiftAssignment[],
  staffLeave: LeaveRequest[],
): void {
  const duration = shiftDurationHours(assignment.startTime, assignment.endTime);

  if (duration <= 0) {
    throw validation(`Shift end time must be after start time`);
  }
  if (duration > 16) {
    throw validation(`Shift duration ${duration}h exceeds maximum 16 hours per shift`);
  }

  const overlap = detectShiftOverlap(existingAssignments, assignment);
  if (overlap) {
    throw conflict(
      `Shift conflict: staff ${assignment.staffId} already has shift ${overlap.id} during this time`,
    );
  }

  const shiftDate = assignment.date;
  const onLeave = staffLeave.find((l) => {
    if (l.staffId !== assignment.staffId) return false;
    if (l.status !== 'Approved') return false;
    return shiftDate >= l.startDate && shiftDate <= l.endDate;
  });

  if (onLeave) {
    throw preconditionFailed(
      `Staff ${assignment.staffId} is on approved ${onLeave.leaveType} leave on ${shiftDate}`,
    );
  }
}

export function checkMinimumRestPeriod(
  previousShiftEnd: ISODateString,
  newShiftStart: ISODateString,
  minRestHours: number = 11,
): void {
  const restMs = new Date(newShiftStart).getTime() - new Date(previousShiftEnd).getTime();
  const restHours = restMs / 3_600_000;

  if (restHours < minRestHours) {
    throw preconditionFailed(
      `Insufficient rest between shifts: ${restHours.toFixed(1)}h. Minimum required: ${minRestHours}h (EU Working Time Directive compliance)`,
    );
  }
}

export function checkMaxWeeklyHours(
  staffId: string,
  assignments: ShiftAssignment[],
  weekStartDate: ISODateString,
  maxHoursPerWeek: number = 48,
): void {
  const weekStart = new Date(weekStartDate).getTime();
  const weekEnd = weekStart + 7 * 86_400_000;

  const weekHours = assignments
    .filter((a) => {
      if (a.staffId !== staffId) return false;
      const shiftTime = new Date(a.startTime).getTime();
      return shiftTime >= weekStart && shiftTime < weekEnd;
    })
    .reduce((acc, a) => acc + shiftDurationHours(a.startTime, a.endTime), 0);

  if (weekHours > maxHoursPerWeek) {
    throw preconditionFailed(
      `Assigning this shift would bring ${staffId} to ${weekHours.toFixed(1)}h in this week, exceeding the ${maxHoursPerWeek}h limit`,
    );
  }
}

export function computeWorkloadSummary(
  staffId: string,
  assignments: ShiftAssignment[],
  leaveRequests: LeaveRequest[],
  periodStart: ISODateString,
  periodEnd: ISODateString,
): StaffWorkloadSummary {
  const startMs = new Date(periodStart).getTime();
  const endMs = new Date(periodEnd).getTime();

  const periodAssignments = assignments.filter((a) => {
    if (a.staffId !== staffId) return false;
    const t = new Date(a.startTime).getTime();
    return t >= startMs && t <= endMs;
  });

  let totalHours = 0;
  let nightShiftCount = 0;
  let weekendShiftCount = 0;
  let onCallHours = 0;

  for (const a of periodAssignments) {
    const duration = shiftDurationHours(a.startTime, a.endTime);
    totalHours += duration;

    if (a.shiftType === ShiftType.Night) nightShiftCount++;
    if (a.isOnCall) onCallHours += duration;

    const dayOfWeek = new Date(a.date).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) weekendShiftCount++;
  }

  const standardWeeklyHours = 37.5;
  const periodWeeks = (endMs - startMs) / (7 * 86_400_000);
  const regularHoursCap = standardWeeklyHours * periodWeeks;
  const regularHours = Math.min(totalHours, regularHoursCap);
  const overtimeHours = Math.max(0, totalHours - regularHoursCap);

  const periodLeave = leaveRequests.filter((l) => {
    if (l.staffId !== staffId) return false;
    if (l.status !== 'Approved') return false;
    return l.startDate <= periodEnd && l.endDate >= periodStart;
  });

  const leaveHoursTaken = periodLeave.reduce((acc, l) => {
    const leaveStart = new Date(Math.max(new Date(l.startDate).getTime(), startMs));
    const leaveEnd = new Date(Math.min(new Date(l.endDate).getTime(), endMs));
    const leaveDays = Math.ceil((leaveEnd.getTime() - leaveStart.getTime()) / 86_400_000);
    return acc + leaveDays * 7.5; // 7.5 working hours per day
  }, 0);

  return {
    staffId,
    period: { start: periodStart, end: periodEnd },
    totalHours,
    regularHours,
    overtimeHours,
    nightShiftCount,
    weekendShiftCount,
    onCallHours,
    leaveHoursTaken,
  };
}

export function findUncoveredShifts(
  shifts: ShiftAssignment[],
  minimumCoverageByType: Partial<Record<ShiftType, number>>,
): { date: string; shiftType: ShiftType; assigned: number; required: number }[] {
  const coverage = new Map<string, Map<ShiftType, number>>();

  for (const shift of shifts) {
    const key = shift.date;
    if (!coverage.has(key)) coverage.set(key, new Map());
    const dayMap = coverage.get(key)!;
    dayMap.set(shift.shiftType, (dayMap.get(shift.shiftType) ?? 0) + 1);
  }

  const uncovered: { date: string; shiftType: ShiftType; assigned: number; required: number }[] = [];

  for (const [date, typeMap] of coverage) {
    for (const [type, required] of Object.entries(minimumCoverageByType) as [ShiftType, number][]) {
      const assigned = typeMap.get(type) ?? 0;
      if (assigned < required) {
        uncovered.push({ date, shiftType: type, assigned, required });
      }
    }
  }

  return uncovered;
}
