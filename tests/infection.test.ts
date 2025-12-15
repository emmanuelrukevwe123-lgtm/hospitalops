import { describe, it, expect } from 'vitest';
import {
  checkOutbreakTriggers,
  traceContacts,
  type Pathogen,
  type InfectionReport,
  type PatientMovement,
} from '../src/clinical/infection';

describe('Infection Control & Outbreak Module', () => {
  const pathogens: Pathogen[] = [
    {
      id: 'path_0001',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      name: 'COVID-19',
      transmissionRoute: 'Airborne',
      riskLevel: 'Critical',
      outbreakThresholdCount: 2,
    },
    {
      id: 'path_0002',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      name: 'MRSA',
      transmissionRoute: 'Contact',
      riskLevel: 'High',
      outbreakThresholdCount: 3,
    },
  ];

  const now = new Date('2026-06-04T12:00:00.000Z');

  describe('checkOutbreakTriggers', () => {
    it('detects outbreak if case count matches or exceeds threshold', () => {
      const reports: InfectionReport[] = [
        {
          id: 'inf_1',
          createdAt: '2026-06-04T00:00:00Z',
          updatedAt: '2026-06-04T00:00:00Z',
          patientId: 'pat_1',
          pathogenId: 'path_0001',
          wardId: 'ward_icu',
          diagnosedAt: '2026-06-04T01:00:00Z',
        },
        {
          id: 'inf_2',
          createdAt: '2026-06-04T00:00:00Z',
          updatedAt: '2026-06-04T00:00:00Z',
          patientId: 'pat_2',
          pathogenId: 'path_0001',
          wardId: 'ward_icu',
          diagnosedAt: '2026-06-04T02:00:00Z',
        },
      ];

      const triggers = checkOutbreakTriggers(reports, pathogens, 7, now);
      expect(triggers).toHaveLength(1);
      expect(triggers[0].wardId).toBe('ward_icu');
      expect(triggers[0].caseCount).toBe(2);
    });

    it('does not trigger outbreak if cases do not reach threshold', () => {
      const reports: InfectionReport[] = [
        {
          id: 'inf_1',
          createdAt: '2026-06-04T00:00:00Z',
          updatedAt: '2026-06-04T00:00:00Z',
          patientId: 'pat_1',
          pathogenId: 'path_0002',
          wardId: 'ward_icu',
          diagnosedAt: '2026-06-04T01:00:00Z',
        },
      ];

      const triggers = checkOutbreakTriggers(reports, pathogens, 7, now);
      expect(triggers).toHaveLength(0);
    });
  });

  describe('traceContacts', () => {
    const movements: PatientMovement[] = [
      {
        id: 'mov_1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        patientId: 'pat_target',
        locationId: 'room_101',
        startTime: '2026-06-04T10:00:00.000Z',
        endTime: '2026-06-04T12:00:00.000Z',
      },
      {
        id: 'mov_2',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        patientId: 'pat_contact1',
        locationId: 'room_101',
        startTime: '2026-06-04T11:00:00.000Z',
        endTime: '2026-06-04T13:00:00.000Z',
      },
      {
        id: 'mov_3',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        patientId: 'pat_no_contact',
        locationId: 'room_101',
        startTime: '2026-06-04T15:00:00.000Z',
        endTime: '2026-06-04T17:00:00.000Z',
      },
    ];

    it('returns patients who shared the location within timeframe', () => {
      const contacts = traceContacts('pat_target', movements);
      expect(contacts).toContain('pat_contact1');
      expect(contacts).not.toContain('pat_no_contact');
    });
  });
});
