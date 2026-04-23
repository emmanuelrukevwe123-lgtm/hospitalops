import { describe, it, expect } from 'vitest';
import {
  calculateBMI,
  interpretBMI,
  calculateMUSTScore,
  malnutritionRiskFromMUST,
  calculateIdealBodyWeight,
  calculateTargetCalories,
  calculateTargetProtein,
  assessRefeedingSyndromeRisk,
  recommendFeedingRoute,
  validateEntericFeedingSafety,
  validateTPNOrder,
  NutritionRoute,
  MalnutritionRisk,
} from '../src/clinical/nutrition';
import type { EntericFeedingPlan, TPNOrder } from '../src/clinical/nutrition';
import { AppError } from '../src/core/errors';

describe('calculateBMI', () => {
  it('calculates BMI correctly', () => {
    expect(calculateBMI(175, 70)).toBeCloseTo(22.9, 1);
  });

  it('handles obese case', () => {
    expect(calculateBMI(165, 100)).toBeGreaterThan(30);
  });

  it('throws for zero height', () => {
    expect(() => calculateBMI(0, 70)).toThrow(AppError);
  });

  it('throws for zero weight', () => {
    expect(() => calculateBMI(175, 0)).toThrow(AppError);
  });
});

describe('interpretBMI', () => {
  it('interprets underweight', () => expect(interpretBMI(17)).toBe('Underweight'));
  it('interprets normal', () => expect(interpretBMI(22)).toBe('Normal Weight'));
  it('interprets overweight', () => expect(interpretBMI(27)).toBe('Overweight'));
  it('interprets obese class I', () => expect(interpretBMI(32)).toBe('Obese Class I'));
  it('interprets severe underweight', () => expect(interpretBMI(15)).toBe('Severe Underweight'));
  it('interprets morbidly obese', () => expect(interpretBMI(42)).toBe('Obese Class III (Morbidly Obese)'));
});

describe('calculateMUSTScore', () => {
  it('returns 0 for normal BMI, no weight loss, no acute illness', () => {
    expect(calculateMUSTScore(23, 0, 0)).toBe(0);
  });

  it('adds 2 for BMI < 18.5', () => {
    expect(calculateMUSTScore(17, 0, 0)).toBe(2);
  });

  it('adds 1 for BMI 18.5-20', () => {
    expect(calculateMUSTScore(19, 0, 0)).toBe(1);
  });

  it('adds 2 for weight loss > 10%', () => {
    expect(calculateMUSTScore(23, 12, 0)).toBe(2);
  });

  it('adds 1 for weight loss 5-10%', () => {
    expect(calculateMUSTScore(23, 7, 0)).toBe(1);
  });

  it('adds acute illness severity score', () => {
    expect(calculateMUSTScore(23, 0, 2)).toBe(2);
  });

  it('calculates combined high-risk score', () => {
    const score = calculateMUSTScore(17, 12, 2); // 2 + 2 + 2
    expect(score).toBe(6);
  });
});

describe('malnutritionRiskFromMUST', () => {
  it('maps 0 to Low', () => expect(malnutritionRiskFromMUST(0)).toBe(MalnutritionRisk.Low));
  it('maps 1 to Medium', () => expect(malnutritionRiskFromMUST(1)).toBe(MalnutritionRisk.Medium));
  it('maps 2 to High', () => expect(malnutritionRiskFromMUST(2)).toBe(MalnutritionRisk.High));
  it('maps 5 to High', () => expect(malnutritionRiskFromMUST(5)).toBe(MalnutritionRisk.High));
});

describe('calculateIdealBodyWeight', () => {
  it('calculates IBW for male at 180cm', () => {
    const ibw = calculateIdealBodyWeight(180, 'M');
    expect(ibw).toBeGreaterThan(60);
    expect(ibw).toBeLessThan(90);
  });

  it('calculates lower IBW for female', () => {
    const male = calculateIdealBodyWeight(170, 'M');
    const female = calculateIdealBodyWeight(170, 'F');
    expect(female).toBeLessThan(male);
  });
});

describe('calculateTargetCalories', () => {
  it('calculates higher calories for non-critically ill', () => {
    const normal = calculateTargetCalories(70, 1.0, false);
    const icu = calculateTargetCalories(70, 1.0, true);
    expect(normal).toBeGreaterThan(icu);
  });

  it('scales with activity factor', () => {
    const base = calculateTargetCalories(70, 1.0, false);
    const active = calculateTargetCalories(70, 1.5, false);
    expect(active).toBeGreaterThan(base);
  });
});

describe('calculateTargetProtein', () => {
  it('gives higher protein for critically ill', () => {
    const normal = calculateTargetProtein(70, 'Normal');
    const icu = calculateTargetProtein(70, 'CriticallyIll');
    expect(icu).toBeGreaterThan(normal);
  });

  it('gives highest protein for burns', () => {
    const burn = calculateTargetProtein(70, 'Burn');
    const icu = calculateTargetProtein(70, 'CriticallyIll');
    expect(burn).toBeGreaterThan(icu);
  });
});

describe('recommendFeedingRoute', () => {
  it('recommends oral for alert mobile patient', () => {
    expect(recommendFeedingRoute({ isSedated: false, hasIleusOrObstruction: false, gcsScore: 15, npoStatus: false }))
      .toBe(NutritionRoute.Oral);
  });

  it('recommends NGT for sedated patient', () => {
    expect(recommendFeedingRoute({ isSedated: true, hasIleusOrObstruction: false, gcsScore: 8, npoStatus: false }))
      .toBe(NutritionRoute.NasogastricTube);
  });

  it('recommends TPN for ileus', () => {
    expect(recommendFeedingRoute({ isSedated: false, hasIleusOrObstruction: true, gcsScore: 15, npoStatus: false }))
      .toBe(NutritionRoute.TotalParenteralNutrition);
  });

  it('recommends TPN for NPO status', () => {
    expect(recommendFeedingRoute({ isSedated: false, hasIleusOrObstruction: false, gcsScore: 15, npoStatus: true }))
      .toBe(NutritionRoute.TotalParenteralNutrition);
  });
});

describe('validateEntericFeedingSafety', () => {
  const validPlan: EntericFeedingPlan = {
    id: 'feed_001',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
    patientId: 'pat_001',
    encounterId: 'enc_001',
    route: NutritionRoute.NasogastricTube,
    formulaName: 'Ensure Plus',
    targetRateMlPerHr: 80,
    currentRateMlPerHr: 60,
    caloriesPerMl: 1.5,
    proteinGPerHundredMl: 6,
    startedAt: '2026-01-01T08:00:00Z',
    totalVolumeInfusedMl: 0,
    aspirateCheckedHourly: true,
    raisedHeadDegrees: 35,
  };

  it('passes for safe feeding setup', () => {
    expect(() => validateEntericFeedingSafety(validPlan, 100)).not.toThrow();
  });

  it('throws when head is not raised sufficiently', () => {
    expect(() => validateEntericFeedingSafety({ ...validPlan, raisedHeadDegrees: 20 }, 100)).toThrow(AppError);
  });

  it('throws when gastric residual is too high', () => {
    expect(() => validateEntericFeedingSafety(validPlan, 300)).toThrow(AppError);
  });
});

describe('assessRefeedingSyndromeRisk', () => {
  it('identifies high risk for malnourished patient', () => {
    const { highRisk, actions } = assessRefeedingSyndromeRisk(50, 14, 7);
    expect(highRisk).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.toLowerCase().includes('thiamine'))).toBe(true);
  });

  it('identifies low risk for well-nourished patient', () => {
    const { highRisk } = assessRefeedingSyndromeRisk(80, 22, 1, 0.9, 4.0, 0.8);
    expect(highRisk).toBe(false);
  });

  it('flags risk from low phosphate', () => {
    const { highRisk } = assessRefeedingSyndromeRisk(70, 22, 0, 0.4);
    expect(highRisk).toBe(true);
  });
});

describe('validateTPNOrder', () => {
  const validTPN: TPNOrder = {
    id: 'tpn_001',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
    patientId: 'pat_001',
    encounterId: 'enc_001',
    prescribedBy: 'dr_001',
    pharmacistVerifiedBy: 'pharm_001',
    startedAt: '2026-01-01T10:00:00Z',
    glucoseGPerDay: 200,
    aminoAcidGPerDay: 80,
    lipidGPerDay: 50,
    totalCaloriesKcalPerDay: 2000,
    sodiumMeqPerDay: 80,
    potassiumMeqPerDay: 60,
    magnesiumMmolPerDay: 10,
    phosphateMmolPerDay: 20,
    calciumMmolPerDay: 5,
    traceElements: true,
    vitamins: true,
    infusionRateMlPerHr: 80,
    centralLineRequired: true,
    centralLineId: 'line_001',
  };

  it('passes for valid TPN order with central line', () => {
    expect(() => validateTPNOrder(validTPN)).not.toThrow();
  });

  it('throws when central line required but not documented', () => {
    expect(() => validateTPNOrder({ ...validTPN, centralLineId: undefined })).toThrow(AppError);
  });

  it('throws for implausibly high caloric prescription', () => {
    expect(() => validateTPNOrder({ ...validTPN, totalCaloriesKcalPerDay: 5000 })).toThrow(AppError);
  });

  it('passes when peripheral TPN (no central line required)', () => {
    const peripheral = { ...validTPN, centralLineRequired: false, centralLineId: undefined };
    expect(() => validateTPNOrder(peripheral)).not.toThrow();
  });
});
