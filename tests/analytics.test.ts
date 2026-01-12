import { describe, it, expect } from 'vitest';
import {
  calculateSLAAttainment,
  calculateBedOccupancy,
  calculateReadmissionRate,
} from '../src/analytics/analytics';
import { type Patient, PatientState } from '../src/clinical/patient';
import { BedType, BedStatus, type Bed } from '../src/clinical/ward';

describe('Reporting & Analytics Module', () => {
  describe('calculateSLAAttainment', () => {
    it('calculates the SLA attainment percentage correctly', () => {
      const patients: Patient[] = [
        {
          id: 'pat_0001',
          createdAt: '2026-06-04T12:00:00Z',
          updatedAt: '2026-06-04T12:00:00Z',
          name: 'Patient One',
          gender: 'M',
          birthdate: '1980-01-01',
          presentingComplaint: 'Chest Pain',
          arrivalSource: 'WalkIn',
          state: PatientState.Admitted,
          comorbidities: [],
          triageTime: '2026-06-04T12:00:00.000Z',
          admittedAt: '2026-06-04T12:10:00.000Z',
          triageToDoctorSLA: '2026-06-04T12:15:00.000Z', // Met
        },
        {
          id: 'pat_0002',
          createdAt: '2026-06-04T12:00:00Z',
          updatedAt: '2026-06-04T12:00:00Z',
          name: 'Patient Two',
          gender: 'F',
          birthdate: '1980-01-01',
          presentingComplaint: 'Fever',
          arrivalSource: 'WalkIn',
          state: PatientState.Admitted,
          comorbidities: [],
          triageTime: '2026-06-04T12:00:00.000Z',
          admittedAt: '2026-06-04T12:20:00.000Z',
          triageToDoctorSLA: '2026-06-04T12:15:00.000Z', // Breached
        },
      ];

      const report = calculateSLAAttainment(patients);
      expect(report.totalPatients).toBe(2);
      expect(report.triageToDoctorMet).toBe(1);
      expect(report.triageToDoctorTotal).toBe(2);
      expect(report.triageToDoctorRate).toBe(0.5);
    });
  });

  describe('calculateBedOccupancy', () => {
    it('returns zero for empty beds list', () => {
      expect(calculateBedOccupancy([])).toBe(0);
    });

    it('calculates the occupancy percentage correctly', () => {
      const beds: Bed[] = [
        {
          id: 'bed_1',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          wardId: 'w1',
          roomId: 'r1',
          bedNumber: '1',
          type: BedType.General,
          status: BedStatus.Occupied,
          isolationPrecautions: [],
        },
        {
          id: 'bed_2',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          wardId: 'w1',
          roomId: 'r1',
          bedNumber: '2',
          type: BedType.General,
          status: BedStatus.Available,
          isolationPrecautions: [],
        },
      ];

      expect(calculateBedOccupancy(beds)).toBe(0.5);
    });
  });

  describe('calculateReadmissionRate', () => {
    it('calculates 30-day readmissions correctly', () => {
      const discharges = [
        { patientId: 'pat_1', dischargeDate: '2026-05-01T12:00:00Z' },
        { patientId: 'pat_2', dischargeDate: '2026-05-01T12:00:00Z' },
      ];
      const admissions = [
        { patientId: 'pat_1', admissionDate: '2026-05-15T12:00:00Z' }, // Readmitted in 14 days
        { patientId: 'pat_2', admissionDate: '2026-06-15T12:00:00Z' }, // Not readmitted (45 days later)
      ];

      const rate = calculateReadmissionRate(admissions, discharges);
      expect(rate).toBe(0.5);
    });
  });
});
