import type { Entity, ISODateString } from '../core/types';
import { invalidTransition, preconditionFailed, validation } from '../core/errors';

export const ImagingModality = {
  XRay: 'XRay',
  CTScan: 'CTScan',
  MRI: 'MRI',
  Ultrasound: 'Ultrasound',
  Fluoroscopy: 'Fluoroscopy',
  NuclearMedicine: 'NuclearMedicine',
  PETScan: 'PETScan',
  Mammography: 'Mammography',
} as const;
export type ImagingModality = (typeof ImagingModality)[keyof typeof ImagingModality];

export const StudyPriority = {
  Routine: 'Routine',
  Urgent: 'Urgent',
  STAT: 'STAT',
} as const;
export type StudyPriority = (typeof StudyPriority)[keyof typeof StudyPriority];

export const StudyStatus = {
  Ordered: 'Ordered',
  Scheduled: 'Scheduled',
  PatientArrived: 'PatientArrived',
  InProgress: 'InProgress',
  Completed: 'Completed',
  Reported: 'Reported',
  Verified: 'Verified',
  Cancelled: 'Cancelled',
} as const;
export type StudyStatus = (typeof StudyStatus)[keyof typeof StudyStatus];

export const FindingSeverity = {
  Normal: 'Normal',
  Incidental: 'Incidental',
  Abnormal: 'Abnormal',
  Critical: 'Critical',
} as const;
export type FindingSeverity = (typeof FindingSeverity)[keyof typeof FindingSeverity];

export interface ImagingStudy extends Entity {
  patientId: string;
  orderId: string;
  modality: ImagingModality;
  bodyPart: string;
  clinicalIndication: string;
  priority: StudyPriority;
  status: StudyStatus;
  scheduledAt?: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  reportedAt?: ISODateString;
  verifiedAt?: ISODateString;
  radiologistId?: string;
  contrastUsed: boolean;
  patientPregnancyStatus?: 'NotPregnant' | 'Pregnant' | 'Unknown';
  radiationDoseMilliSievert?: number;
  accessionNumber: string;
}

export interface RadiologyReport extends Entity {
  studyId: string;
  patientId: string;
  radiologistId: string;
  draftedAt: ISODateString;
  verifiedAt?: ISODateString;
  verifiedBy?: string;
  findings: string;
  impression: string;
  severity: FindingSeverity;
  criticalFindingCommunicatedAt?: ISODateString;
  criticalFindingCommunicatedTo?: string;
  recommendations?: string;
  comparisonStudyId?: string;
}

export interface RadiologyProtocol {
  modality: ImagingModality;
  bodyPart: string;
  contrastRequired: boolean;
  contraindications: string[];
  preparationInstructions: string;
  estimatedDurationMinutes: number;
  radiationDoseMilliSievert: number;
}

const MODALITY_PROTOCOLS: Partial<Record<ImagingModality, Partial<Record<string, RadiologyProtocol>>>> = {
  [ImagingModality.CTScan]: {
    Head: {
      modality: ImagingModality.CTScan,
      bodyPart: 'Head',
      contrastRequired: false,
      contraindications: ['Severe renal impairment with contrast', 'Iodine allergy'],
      preparationInstructions: 'Remove metal objects. Nil by mouth 4 hours if contrast.',
      estimatedDurationMinutes: 15,
      radiationDoseMilliSievert: 2.0,
    },
    Chest: {
      modality: ImagingModality.CTScan,
      bodyPart: 'Chest',
      contrastRequired: false,
      contraindications: [],
      preparationInstructions: 'Remove metal objects.',
      estimatedDurationMinutes: 10,
      radiationDoseMilliSievert: 7.0,
    },
    Abdomen: {
      modality: ImagingModality.CTScan,
      bodyPart: 'Abdomen',
      contrastRequired: true,
      contraindications: ['eGFR <30 mL/min/1.73m²', 'Iodine allergy', 'Metformin use'],
      preparationInstructions: 'Nil by mouth 4 hours. Hydration pre/post if contrast.',
      estimatedDurationMinutes: 20,
      radiationDoseMilliSievert: 10.0,
    },
  },
  [ImagingModality.MRI]: {
    Brain: {
      modality: ImagingModality.MRI,
      bodyPart: 'Brain',
      contrastRequired: false,
      contraindications: ['Metallic implants', 'Pacemaker', 'Cochlear implant', 'Claustrophobia'],
      preparationInstructions: 'Screen for metallic implants. Remove all metal objects.',
      estimatedDurationMinutes: 45,
      radiationDoseMilliSievert: 0,
    },
    Spine: {
      modality: ImagingModality.MRI,
      bodyPart: 'Spine',
      contrastRequired: false,
      contraindications: ['Metallic implants', 'Pacemaker'],
      preparationInstructions: 'Screen for metallic implants.',
      estimatedDurationMinutes: 60,
      radiationDoseMilliSievert: 0,
    },
  },
};

export function getRadiologyProtocol(
  modality: ImagingModality,
  bodyPart: string,
): RadiologyProtocol | undefined {
  return MODALITY_PROTOCOLS[modality]?.[bodyPart];
}

export function validateStudyStatusTransition(from: StudyStatus, to: StudyStatus): void {
  const allowed: Record<StudyStatus, readonly StudyStatus[]> = {
    [StudyStatus.Ordered]:        [StudyStatus.Scheduled, StudyStatus.Cancelled],
    [StudyStatus.Scheduled]:      [StudyStatus.PatientArrived, StudyStatus.Cancelled],
    [StudyStatus.PatientArrived]: [StudyStatus.InProgress, StudyStatus.Cancelled],
    [StudyStatus.InProgress]:     [StudyStatus.Completed, StudyStatus.Cancelled],
    [StudyStatus.Completed]:      [StudyStatus.Reported],
    [StudyStatus.Reported]:       [StudyStatus.Verified],
    [StudyStatus.Verified]:       [],
    [StudyStatus.Cancelled]:      [],
  };

  if (!allowed[from].includes(to)) {
    throw invalidTransition('ImagingStudy', from, to);
  }
}

export function checkContrastContraindications(
  study: ImagingStudy,
  patientEgfr?: number,
  patientAllergies: string[] = [],
): void {
  if (!study.contrastUsed) return;

  if (study.patientPregnancyStatus === 'Pregnant') {
    throw preconditionFailed(
      `Contrast administration contraindicated for pregnant patients (study ${study.id})`,
    );
  }

  if (patientAllergies.some((a) => a.toLowerCase().includes('iodine') || a.toLowerCase().includes('contrast'))) {
    throw preconditionFailed(
      `Patient has documented iodine/contrast allergy. Pre-medication protocol required.`,
    );
  }

  if (patientEgfr !== undefined && patientEgfr < 30) {
    throw preconditionFailed(
      `Contrast contraindicated: patient eGFR ${patientEgfr} mL/min/1.73m² is below threshold 30`,
    );
  }
}

export function checkIonisingRadiationPregnancy(
  modality: ImagingModality,
  pregnancyStatus?: 'NotPregnant' | 'Pregnant' | 'Unknown',
): void {
  const ionising: ImagingModality[] = [
    ImagingModality.XRay,
    ImagingModality.CTScan,
    ImagingModality.Fluoroscopy,
    ImagingModality.NuclearMedicine,
    ImagingModality.PETScan,
    ImagingModality.Mammography,
  ];

  if (ionising.includes(modality) && pregnancyStatus === 'Pregnant') {
    throw preconditionFailed(
      `Ionising radiation modality ${modality} requires additional justification for pregnant patients. Consult radiologist before proceeding.`,
    );
  }
}

export function calculateTATMinutes(study: ImagingStudy): number | undefined {
  if (!study.startedAt || !study.reportedAt) return undefined;
  const diff = new Date(study.reportedAt).getTime() - new Date(study.startedAt).getTime();
  return Math.floor(diff / 60_000);
}

export function isCriticalFindingPending(report: RadiologyReport): boolean {
  return (
    report.severity === FindingSeverity.Critical &&
    report.criticalFindingCommunicatedAt === undefined
  );
}

export function validateCriticalFindingCommunication(report: RadiologyReport): void {
  if (isCriticalFindingPending(report)) {
    throw preconditionFailed(
      `Critical radiology finding in study ${report.studyId} has not been communicated to clinical team. Communication is mandatory before report verification.`,
    );
  }
}

export function generateAccessionNumber(modality: ImagingModality, date: ISODateString, seq: number): string {
  const dateStr = new Date(date).toISOString().slice(0, 10).replace(/-/g, '');
  const modalityCode = modality.slice(0, 2).toUpperCase();
  return `${modalityCode}${dateStr}${String(seq).padStart(5, '0')}`;
}

export function summariseRadiationExposure(
  studies: ImagingStudy[],
  patientId: string,
  windowDays: number,
  referenceDate: ISODateString,
): { totalDoseMilliSievert: number; studyCount: number; highExposureFlag: boolean } {
  const refTime = new Date(referenceDate).getTime();
  const windowMs = windowDays * 86_400_000;

  const relevant = studies.filter((s) => {
    if (s.patientId !== patientId) return false;
    if (!s.completedAt) return false;
    const diff = refTime - new Date(s.completedAt).getTime();
    return diff >= 0 && diff <= windowMs;
  });

  const totalDose = relevant.reduce((acc, s) => acc + (s.radiationDoseMilliSievert ?? 0), 0);

  return {
    totalDoseMilliSievert: totalDose,
    studyCount: relevant.length,
    highExposureFlag: totalDose > 100,
  };
}

export function validateBodyPartForModality(modality: ImagingModality, bodyPart: string): void {
  const bodyPartRegex = /^[A-Za-z][A-Za-z\s\-]{1,50}$/;
  if (!bodyPartRegex.test(bodyPart)) {
    throw validation(`Body part '${bodyPart}' is not a valid anatomical description`);
  }

  if (modality === ImagingModality.Mammography && !bodyPart.toLowerCase().includes('breast')) {
    throw validation(`Mammography is only applicable to breast tissue`);
  }
}
