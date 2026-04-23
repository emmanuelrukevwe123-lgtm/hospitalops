import type { Entity, ISODateString } from '../core/types';
import { validation, preconditionFailed } from '../core/errors';

export const NutritionRoute = {
  Oral: 'Oral',
  NasogastricTube: 'NasogastricTube',
  NasoJejunalTube: 'NasoJejunalTube',
  TotalParenteralNutrition: 'TotalParenteralNutrition',
  SupplementalParenteral: 'SupplementalParenteral',
} as const;
export type NutritionRoute = (typeof NutritionRoute)[keyof typeof NutritionRoute];

export const MalnutritionRisk = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
} as const;
export type MalnutritionRisk = (typeof MalnutritionRisk)[keyof typeof MalnutritionRisk];

export const DietaryRestriction = {
  DiabeticDiet: 'DiabeticDiet',
  RenalDiet: 'RenalDiet',
  HepaticDiet: 'HepaticDiet',
  LowSodium: 'LowSodium',
  LowFat: 'LowFat',
  GlutenFree: 'GlutenFree',
  Lactose_Free: 'LactoseFree',
  Halal: 'Halal',
  Kosher: 'Kosher',
  Vegan: 'Vegan',
  Vegetarian: 'Vegetarian',
  TextureModified: 'TextureModified',
  ThickenedFluids: 'ThickenedFluids',
  NilByMouth: 'NilByMouth',
} as const;
export type DietaryRestriction = (typeof DietaryRestriction)[keyof typeof DietaryRestriction];

export interface NutritionalAssessment extends Entity {
  patientId: string;
  encounterId: string;
  assessedAt: ISODateString;
  assessedBy: string;
  heightCm: number;
  weightKg: number;
  bmi: number;
  weightLossPercent?: number;         // Weight loss in past 3-6 months
  reducedIntake: boolean;             // Reduced oral intake in past week
  acuteDiseasePresentSeverity: 0 | 1 | 2; // 0=none, 1=moderate, 2=severe
  mustScore?: number;
  nutritionRisk: MalnutritionRisk;
  dietaryRestrictions: DietaryRestriction[];
  foodAllergies: string[];
  swallowingAssessmentRequired: boolean;
  swallowingAssessmentCompleted: boolean;
  dietitianReferral: boolean;
  targetCaloriesKcalPerDay: number;
  targetProteinGPerDay: number;
  targetFluidMlPerDay: number;
  supplementsRecommended: string[];
}

export interface EntericFeedingPlan extends Entity {
  patientId: string;
  encounterId: string;
  route: NutritionRoute;
  formulaName: string;
  targetRateMlPerHr: number;
  currentRateMlPerHr: number;
  caloriesPerMl: number;
  proteinGPerHundredMl: number;
  startedAt: ISODateString;
  discontinuedAt?: ISODateString;
  totalVolumeInfusedMl: number;
  aspirateCheckedHourly: boolean;
  lastResidualVolumeMl?: number;
  raisedHeadDegrees: number;
}

export interface TPNOrder extends Entity {
  patientId: string;
  encounterId: string;
  prescribedBy: string;
  pharmacistVerifiedBy: string;
  startedAt: ISODateString;
  discontinuedAt?: ISODateString;
  glucoseGPerDay: number;
  aminoAcidGPerDay: number;
  lipidGPerDay: number;
  totalCaloriesKcalPerDay: number;
  sodiumMeqPerDay: number;
  potassiumMeqPerDay: number;
  magnesiumMmolPerDay: number;
  phosphateMmolPerDay: number;
  calciumMmolPerDay: number;
  traceElements: boolean;
  vitamins: boolean;
  infusionRateMlPerHr: number;
  centralLineRequired: boolean;
  centralLineId?: string;
}

export function calculateBMI(heightCm: number, weightKg: number): number {
  if (heightCm <= 0) throw validation('Height must be positive');
  if (weightKg <= 0) throw validation('Weight must be positive');
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function interpretBMI(bmi: number): string {
  if (bmi < 16)   return 'Severe Underweight';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25)   return 'Normal Weight';
  if (bmi < 30)   return 'Overweight';
  if (bmi < 35)   return 'Obese Class I';
  if (bmi < 40)   return 'Obese Class II';
  return 'Obese Class III (Morbidly Obese)';
}

export function calculateMUSTScore(
  bmi: number,
  weightLossPercent: number,
  acuteIllnessSeverity: 0 | 1 | 2,
): number {
  let score = 0;
  if (bmi < 18.5) score += 2;
  else if (bmi < 20) score += 1;

  if (weightLossPercent > 10) score += 2;
  else if (weightLossPercent >= 5) score += 1;

  score += acuteIllnessSeverity;
  return score;
}

export function malnutritionRiskFromMUST(mustScore: number): MalnutritionRisk {
  if (mustScore >= 2) return MalnutritionRisk.High;
  if (mustScore === 1) return MalnutritionRisk.Medium;
  return MalnutritionRisk.Low;
}

export function calculateIdealBodyWeight(
  heightCm: number,
  gender: 'M' | 'F',
): number {
  const heightInches = heightCm / 2.54;
  const base = gender === 'M' ? 50 : 45.5;
  const additionalPerInch = 2.3;
  return base + additionalPerInch * Math.max(0, heightInches - 60);
}

export function calculateTargetCalories(
  weightKg: number,
  activityFactor: number,
  isCriticallyIll: boolean,
): number {
  // Harris-Benedict-derived simplified formula
  const baseKcalPerKg = isCriticallyIll ? 25 : 30;
  return Math.round(weightKg * baseKcalPerKg * activityFactor);
}

export function calculateTargetProtein(
  weightKg: number,
  clinicalCondition: 'Normal' | 'Stressed' | 'CriticallyIll' | 'Burn',
): number {
  const gPerKg: Record<string, number> = {
    Normal: 1.0,
    Stressed: 1.5,
    CriticallyIll: 2.0,
    Burn: 2.5,
  };
  return Math.round(weightKg * (gPerKg[clinicalCondition] ?? 1.2) * 10) / 10;
}

export function validateEntericFeedingSafety(
  plan: EntericFeedingPlan,
  lastResidualVolumeMl: number,
): void {
  if (plan.raisedHeadDegrees < 30) {
    throw preconditionFailed(
      `Head of bed must be elevated ≥30° during enteral feeding. Current: ${plan.raisedHeadDegrees}°`,
    );
  }
  if (lastResidualVolumeMl > 250) {
    throw preconditionFailed(
      `Gastric residual volume ${lastResidualVolumeMl} mL exceeds 250 mL threshold. Hold feed and reassess.`,
    );
  }
}

export function validateTPNOrder(order: TPNOrder): void {
  if (!order.centralLineRequired) return;
  if (!order.centralLineId) {
    throw preconditionFailed(
      `TPN requires central venous access. A central line ID must be recorded before TPN initiation.`,
    );
  }
  if (order.totalCaloriesKcalPerDay < 500 || order.totalCaloriesKcalPerDay > 4000) {
    throw validation(
      `TPN total calories ${order.totalCaloriesKcalPerDay} kcal/day is outside plausible range 500-4000`,
    );
  }
}

export function recommendFeedingRoute(
  patient: { isSedated: boolean; hasIleusOrObstruction: boolean; gcsScore: number; npoStatus: boolean },
): NutritionRoute {
  if (patient.npoStatus) return NutritionRoute.TotalParenteralNutrition;
  if (patient.hasIleusOrObstruction) return NutritionRoute.TotalParenteralNutrition;
  if (patient.isSedated || patient.gcsScore < 8) return NutritionRoute.NasogastricTube;
  return NutritionRoute.Oral;
}

export function assessRefeedingSyndromeRisk(
  weightKg: number,
  bmi: number,
  daysNilByMouth: number,
  serumPhosphateMmolL?: number,
  serumPotassiumMmolL?: number,
  serumMagnesiumMmolL?: number,
): { highRisk: boolean; actions: string[] } {
  const highRisk =
    bmi < 16 ||
    daysNilByMouth > 5 ||
    (serumPhosphateMmolL !== undefined && serumPhosphateMmolL < 0.6) ||
    (serumPotassiumMmolL !== undefined && serumPotassiumMmolL < 3.0) ||
    (serumMagnesiumMmolL !== undefined && serumMagnesiumMmolL < 0.5);

  const actions: string[] = [];
  if (highRisk) {
    actions.push('Start at 5-10 kcal/kg/day; increase slowly over 4-7 days');
    actions.push('Correct electrolyte deficiencies before feeding');
    actions.push('Administer thiamine 200-300mg daily before feeding');
    actions.push('Monitor electrolytes daily for first 2 weeks');
    actions.push('Dietitian review required');
  }

  return { highRisk, actions };
}
