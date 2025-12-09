import { describe, it, expect } from 'vitest';
import {
  CaseStatus,
  CaseType,
  validateCaseStatusTransition,
  checkSurgicalConflicts,
  type SurgicalCase,
} from '../src/clinical/surgery';

describe('Surgical Suite & Scheduling Module', () => {
  describe('validateCaseStatusTransition', () => {
    it('allows valid case transitions', () => {
      expect(() => validateCaseStatusTransition(CaseStatus.Scheduled, CaseStatus.PreOpComplete)).not.toThrow();
      expect(() => validateCaseStatusTransition(CaseStatus.InProgress, CaseStatus.Completed)).not.toThrow();
    });

    it('throws error for invalid transitions', () => {
      expect(() => validateCaseStatusTransition(CaseStatus.Completed, CaseStatus.InProgress)).toThrow();
      expect(() => validateCaseStatusTransition(CaseStatus.Scheduled, CaseStatus.Completed)).toThrow();
    });
  });

  describe('checkSurgicalConflicts', () => {
    const activeCase: SurgicalCase = {
      id: 'case_0001',
      createdAt: '2026-06-04T12:00:00Z',
      updatedAt: '2026-06-04T12:00:00Z',
      patientId: 'pat_0001',
      orRoomId: 'or_1',
      surgeonId: 'dr_house',
      anesthesiologistId: 'dr_wilson',
      caseType: CaseType.Elective,
      status: CaseStatus.Scheduled,
      startTime: '2026-06-04T14:00:00Z',
      endTime: '2026-06-04T16:00:00Z',
    };

    it('allows scheduling if there are no overlapping times', () => {
      const newCase = {
        patientId: 'pat_0002',
        orRoomId: 'or_1',
        surgeonId: 'dr_house',
        anesthesiologistId: 'dr_wilson',
        caseType: CaseType.Elective,
        startTime: '2026-06-04T16:30:00Z',
        endTime: '2026-06-04T18:00:00Z',
      };

      expect(() => checkSurgicalConflicts(newCase, [activeCase])).not.toThrow();
    });

    it('throws conflict if OR Room is busy during overlapping window', () => {
      const newCase = {
        patientId: 'pat_0002',
        orRoomId: 'or_1', // Same room
        surgeonId: 'dr_stranger',
        anesthesiologistId: 'dr_somebody',
        caseType: CaseType.Urgent,
        startTime: '2026-06-04T15:00:00Z',
        endTime: '2026-06-04T17:00:00Z',
      };

      expect(() => checkSurgicalConflicts(newCase, [activeCase])).toThrow(/OR room/);
    });

    it('throws conflict if Surgeon is busy during overlapping window', () => {
      const newCase = {
        patientId: 'pat_0002',
        orRoomId: 'or_2',
        surgeonId: 'dr_house', // Same surgeon
        anesthesiologistId: 'dr_somebody',
        caseType: CaseType.Urgent,
        startTime: '2026-06-04T15:00:00Z',
        endTime: '2026-06-04T17:00:00Z',
      };

      expect(() => checkSurgicalConflicts(newCase, [activeCase])).toThrow(/Surgeon/);
    });

    it('throws conflict if Anesthesiologist is busy during overlapping window', () => {
      const newCase = {
        patientId: 'pat_0002',
        orRoomId: 'or_2',
        surgeonId: 'dr_stranger',
        anesthesiologistId: 'dr_wilson', // Same anesthesiologist
        caseType: CaseType.Urgent,
        startTime: '2026-06-04T15:00:00Z',
        endTime: '2026-06-04T17:00:00Z',
      };

      expect(() => checkSurgicalConflicts(newCase, [activeCase])).toThrow(/Anesthesiologist/);
    });
  });
});
