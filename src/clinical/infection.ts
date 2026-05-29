import type { Entity, ISODateString } from '../core/types';
import { Department } from '../core/enums';

export interface Pathogen extends Entity {
  name: string; // e.g. "MRSA", "COVID-19", "C. Diff"
  transmissionRoute: 'Contact' | 'Droplet' | 'Airborne';
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  outbreakThresholdCount: number; // e.g. 3 cases
}

export interface InfectionReport extends Entity {
  patientId: string;
  pathogenId: string;
  wardId: string;
  diagnosedAt: ISODateString;
}

export interface PatientMovement extends Entity {
  patientId: string;
  locationId: string; // Ward or room or bed ID
  startTime: ISODateString;
  endTime: ISODateString;
}

export interface HandHygieneObservation extends Entity {
  observerId: string;
  observedStaffId: string;
  department: Department;
  compliant: boolean;
  timestamp: ISODateString;
}

/** Check if there is an outbreak (exceeding threshold cases of same pathogen in same ward within window). */
export function checkOutbreakTriggers(
  reports: InfectionReport[],
  pathogens: Pathogen[],
  windowDays: number,
  now: Date,
): { wardId: string; pathogenId: string; caseCount: number }[] {
  const outbreaks: { wardId: string; pathogenId: string; caseCount: number }[] = [];
  const cutoffTime = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

  // Group reports by pathogen and ward
  const groups = new Map<string, InfectionReport[]>();
  for (const r of reports) {
    const diagTime = new Date(r.diagnosedAt).getTime();
    if (diagTime < cutoffTime) continue;

    const key = `${r.pathogenId}:${r.wardId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const [key, cases] of groups.entries()) {
    const parts = key.split(':');
    const pathogenId = parts[0];
    const wardId = parts[1];
    if (!pathogenId || !wardId) continue;
    const pathogen = pathogens.find((p) => p.id === pathogenId);
    if (!pathogen) continue;

    if (cases.length >= pathogen.outbreakThresholdCount) {
      outbreaks.push({
        wardId,
        pathogenId,
        caseCount: cases.length,
      });
    }
  }

  return outbreaks;
}

/** Trace patient contact. Returns list of patient IDs who were in the same location overlapping in time. */
export function traceContacts(
  targetPatientId: string,
  allMovements: PatientMovement[],
  bufferMinutes: number = 30,
): string[] {
  const targetMovements = allMovements.filter((m) => m.patientId === targetPatientId);
  const contacts = new Set<string>();

  for (const tm of targetMovements) {
    const tmStart = new Date(tm.startTime).getTime() - bufferMinutes * 60 * 1000;
    const tmEnd = new Date(tm.endTime).getTime() + bufferMinutes * 60 * 1000;

    for (const om of allMovements) {
      if (om.patientId === targetPatientId) continue;
      if (om.locationId !== tm.locationId) continue;

      const omStart = new Date(om.startTime).getTime();
      const omEnd = new Date(om.endTime).getTime();

      // Check overlap
      if (tmStart < omEnd && omStart < tmEnd) {
        contacts.add(om.patientId);
      }
    }
  }

  return [...contacts];
}
