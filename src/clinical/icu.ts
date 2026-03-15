import type { Entity, ISODateString } from '../core/types';
import { preconditionFailed, validation } from '../core/errors';
import type { RiskBand } from '../core/enums';

export const VentilatorMode = {
  AC_VC: 'AC_VC',         // Assist Control Volume Control
  AC_PC: 'AC_PC',         // Assist Control Pressure Control
  SIMV: 'SIMV',
  CPAP: 'CPAP',
  PSV: 'PSV',             // Pressure Support Ventilation
  HFOV: 'HFOV',           // High Frequency Oscillatory
  NIV: 'NIV',             // Non-Invasive Ventilation
} as const;
export type VentilatorMode = (typeof VentilatorMode)[keyof typeof VentilatorMode];

export const VasopressorAgent = {
  Norepinephrine: 'Norepinephrine',
  Epinephrine: 'Epinephrine',
  Dopamine: 'Dopamine',
  Vasopressin: 'Vasopressin',
  Dobutamine: 'Dobutamine',
  Phenylephrine: 'Phenylephrine',
} as const;
export type VasopressorAgent = (typeof VasopressorAgent)[keyof typeof VasopressorAgent];

export const ICUAdmissionReason = {
  PostOperative: 'PostOperative',
  RespiratoryFailure: 'RespiratoryFailure',
  SepticShock: 'SepticShock',
  CardiacArrest: 'CardiacArrest',
  AcuteKidneyInjury: 'AcuteKidneyInjury',
  Trauma: 'Trauma',
  Neurological: 'Neurological',
  Toxicological: 'Toxicological',
} as const;
export type ICUAdmissionReason = (typeof ICUAdmissionReason)[keyof typeof ICUAdmissionReason];

export interface VentilatorSettings extends Entity {
  patientId: string;
  icuEncounterId: string;
  mode: VentilatorMode;
  tidalVolumeML: number;
  respiratoryRateSet: number;
  peepCmH2O: number;
  fio2Percent: number;
  pressureSupportCmH2O?: number;
  inspiratoryPressureCmH2O?: number;
  ieRatio?: string;         // e.g. "1:2"
  startedAt: ISODateString;
  discontinuedAt?: ISODateString;
  settingsChangedAt?: ISODateString;
  changedBy?: string;
}

export interface VasopressorInfusion extends Entity {
  patientId: string;
  icuEncounterId: string;
  agent: VasopressorAgent;
  rateUgKgMin: number;
  startedAt: ISODateString;
  discontinuedAt?: ISODateString;
  peakRate?: number;
  indicationMAP?: number; // MAP target this agent is running for
}

export interface ICUEncounter extends Entity {
  patientId: string;
  bedId: string;
  admissionReason: ICUAdmissionReason;
  admittedAt: ISODateString;
  dischargedAt?: ISODateString;
  sofaScoreOnAdmission?: number;
  currentSofaScore?: number;
  apacheIIScore?: number;
  isOnVentilator: boolean;
  isOnVasopressors: boolean;
  isOnRRT: boolean;           // Renal Replacement Therapy
  isOnECMO: boolean;
  dailyFluidBalanceMl: number;
  cumulativeFluidBalanceMl: number;
  lengthOfStayDays?: number;
  infectionSuspected: boolean;
  culturesSent: boolean;
  antibioticsStartedAt?: ISODateString;
}

export interface SOFAComponents {
  respiration: number;      // PaO2/FiO2 ratio score 0-4
  coagulation: number;      // Platelet count score 0-4
  liver: number;            // Bilirubin score 0-4
  cardiovascular: number;   // MAP/vasopressors score 0-4
  cns: number;              // GCS score 0-4
  renal: number;            // Creatinine / urine output score 0-4
}

export interface SofaAssessment extends Entity {
  icuEncounterId: string;
  patientId: string;
  assessedAt: ISODateString;
  assessedBy: string;
  components: SOFAComponents;
  totalScore: number;
  predictedMortality: number; // percentage
  riskBand: RiskBand;
}

export function calculateSOFAScore(components: SOFAComponents): number {
  return (
    components.respiration +
    components.coagulation +
    components.liver +
    components.cardiovascular +
    components.cns +
    components.renal
  );
}

export function sofaMortalityEstimate(totalScore: number): number {
  if (totalScore < 1) return 0.001;
  if (totalScore <= 6) return 0.10;
  if (totalScore <= 9) return 0.15;
  if (totalScore <= 11) return 0.20;
  if (totalScore <= 14) return 0.40;
  return 0.80;
}

export function sofaRiskBand(totalScore: number): RiskBand {
  if (totalScore >= 11) return 'Critical';
  if (totalScore >= 7)  return 'High';
  if (totalScore >= 3)  return 'Moderate';
  return 'Low';
}

export function scoreSOFARespiration(pao2Fio2Ratio: number): number {
  if (pao2Fio2Ratio < 100) return 4;
  if (pao2Fio2Ratio < 200) return 3;
  if (pao2Fio2Ratio < 300) return 2;
  if (pao2Fio2Ratio < 400) return 1;
  return 0;
}

export function scoreSOFACoagulation(plateletCountx10_9: number): number {
  if (plateletCountx10_9 < 20)  return 4;
  if (plateletCountx10_9 < 50)  return 3;
  if (plateletCountx10_9 < 100) return 2;
  if (plateletCountx10_9 < 150) return 1;
  return 0;
}

export function scoreSOFALiver(bilirubinUmolL: number): number {
  if (bilirubinUmolL >= 204) return 4;
  if (bilirubinUmolL >= 102) return 3;
  if (bilirubinUmolL >= 33)  return 2;
  if (bilirubinUmolL >= 20)  return 1;
  return 0;
}

export function scoreSOFACardiovascular(
  meanArterialPressure: number,
  vasopressorAgents: { agent: VasopressorAgent; rateUgKgMin: number }[],
): number {
  if (vasopressorAgents.some((v) => v.agent === VasopressorAgent.Norepinephrine && v.rateUgKgMin > 0.1)) return 4;
  if (vasopressorAgents.some((v) => v.agent === VasopressorAgent.Epinephrine && v.rateUgKgMin > 0.1)) return 4;
  if (vasopressorAgents.some((v) => v.agent === VasopressorAgent.Norepinephrine && v.rateUgKgMin <= 0.1)) return 3;
  if (vasopressorAgents.some((v) => v.agent === VasopressorAgent.Dopamine && v.rateUgKgMin > 15)) return 3;
  if (vasopressorAgents.some((v) => v.agent === VasopressorAgent.Dopamine && v.rateUgKgMin > 5)) return 2;
  if (vasopressorAgents.some((v) => v.agent === VasopressorAgent.Dopamine)) return 2;
  if (meanArterialPressure < 70) return 1;
  return 0;
}

export function scoreSOFACNS(glasgowComaScale: number): number {
  if (glasgowComaScale < 6)  return 4;
  if (glasgowComaScale < 9)  return 3;
  if (glasgowComaScale < 12) return 2;
  if (glasgowComaScale < 14) return 1;
  return 0;
}

export function scoreSOFARenal(creatinineUmolL: number, urineOutputMlPerHr?: number): number {
  if (creatinineUmolL >= 440 || (urineOutputMlPerHr !== undefined && urineOutputMlPerHr < 20)) return 4;
  if (creatinineUmolL >= 300 || (urineOutputMlPerHr !== undefined && urineOutputMlPerHr < 30)) return 3;
  if (creatinineUmolL >= 171) return 2;
  if (creatinineUmolL >= 110) return 1;
  return 0;
}

export function validateVentilatorSettings(settings: Omit<VentilatorSettings, 'id' | 'createdAt' | 'updatedAt'>): void {
  if (settings.tidalVolumeML < 100 || settings.tidalVolumeML > 1200) {
    throw validation(`Tidal volume ${settings.tidalVolumeML} mL is outside safe range 100-1200 mL`);
  }
  if (settings.fio2Percent < 21 || settings.fio2Percent > 100) {
    throw validation(`FiO2 ${settings.fio2Percent}% must be between 21% and 100%`);
  }
  if (settings.peepCmH2O < 0 || settings.peepCmH2O > 25) {
    throw validation(`PEEP ${settings.peepCmH2O} cmH2O is outside safe range 0-25 cmH2O`);
  }
  if (settings.respiratoryRateSet < 0 || settings.respiratoryRateSet > 40) {
    throw validation(`Set respiratory rate ${settings.respiratoryRateSet} is outside plausible range 0-40 breaths/min`);
  }
}

export function validateVasopressorRate(agent: VasopressorAgent, rateUgKgMin: number): void {
  const maxRates: Record<VasopressorAgent, number> = {
    Norepinephrine: 1.0,
    Epinephrine: 0.5,
    Dopamine: 50,
    Vasopressin: 0.06,
    Dobutamine: 20,
    Phenylephrine: 4.0,
  };
  const max = maxRates[agent];
  if (rateUgKgMin < 0 || rateUgKgMin > max) {
    throw validation(
      `Vasopressor ${agent} rate ${rateUgKgMin} μg/kg/min exceeds safe maximum ${max} μg/kg/min`,
    );
  }
}

export function calculateFluidBalance(
  totalIntakeMl: number,
  totalOutputMl: number,
): number {
  return totalIntakeMl - totalOutputMl;
}

export function assessAKIStage(
  baselineCreatinineUmolL: number,
  currentCreatinineUmolL: number,
  urineOutputMlKgHr?: number,
): 0 | 1 | 2 | 3 {
  const ratio = currentCreatinineUmolL / baselineCreatinineUmolL;

  if (ratio >= 3.0 || currentCreatinineUmolL >= 354 || (urineOutputMlKgHr !== undefined && urineOutputMlKgHr < 0.3)) return 3;
  if (ratio >= 2.0 || (urineOutputMlKgHr !== undefined && urineOutputMlKgHr < 0.5)) return 2;
  if (ratio >= 1.5 || currentCreatinineUmolL - baselineCreatinineUmolL >= 26.5) return 1;
  return 0;
}

export function isSepsisBundle6HourComplete(encounter: ICUEncounter): boolean {
  return (
    encounter.culturesSent &&
    encounter.antibioticsStartedAt !== undefined &&
    encounter.isOnVasopressors !== undefined
  );
}

export function requireIntubationPrecheck(
  patientAllergies: string[],
  npoStatus: boolean,
  hemodynamicallyStable: boolean,
): void {
  if (patientAllergies.some((a) => a.toLowerCase().includes('succinylcholine'))) {
    throw preconditionFailed(
      `Patient has succinylcholine allergy — use rocuronium for RSI instead`,
    );
  }
  if (!npoStatus) {
    throw preconditionFailed(
      `Patient is not confirmed NPO. Aspiration risk must be acknowledged prior to intubation`,
    );
  }
  if (!hemodynamicallyStable) {
    throw preconditionFailed(
      `Patient is hemodynamically unstable. Consider ketamine for RSI induction to maintain MAP`,
    );
  }
}

export function calculatePressureSupportWeaning(
  currentPSCmH2O: number,
  targetPSCmH2O: number,
  stepCmH2O: number = 2,
): number {
  const next = currentPSCmH2O - stepCmH2O;
  return Math.max(next, targetPSCmH2O);
}
