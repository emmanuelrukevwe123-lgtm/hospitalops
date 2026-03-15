import { describe, it, expect } from 'vitest';
import {
  calculateSOFAScore,
  sofaMortalityEstimate,
  sofaRiskBand,
  scoreSOFARespiration,
  scoreSOFACoagulation,
  scoreSOFALiver,
  scoreSOFACardiovascular,
  scoreSOFACNS,
  scoreSOFARenal,
  validateVentilatorSettings,
  validateVasopressorRate,
  calculateFluidBalance,
  assessAKIStage,
  requireIntubationPrecheck,
  calculatePressureSupportWeaning,
  VentilatorMode,
  VasopressorAgent,
} from '../src/clinical/icu';
import { AppError } from '../src/core/errors';

describe('SOFA scoring', () => {
  describe('calculateSOFAScore', () => {
    it('sums all six components', () => {
      const score = calculateSOFAScore({ respiration: 2, coagulation: 1, liver: 1, cardiovascular: 2, cns: 0, renal: 1 });
      expect(score).toBe(7);
    });

    it('returns 0 for all normal', () => {
      const score = calculateSOFAScore({ respiration: 0, coagulation: 0, liver: 0, cardiovascular: 0, cns: 0, renal: 0 });
      expect(score).toBe(0);
    });

    it('returns max 24 for all at maximum', () => {
      const score = calculateSOFAScore({ respiration: 4, coagulation: 4, liver: 4, cardiovascular: 4, cns: 4, renal: 4 });
      expect(score).toBe(24);
    });
  });

  describe('sofaMortalityEstimate', () => {
    it('returns low mortality for score 0', () => {
      expect(sofaMortalityEstimate(0)).toBeLessThan(0.05);
    });
    it('returns high mortality for score 15', () => {
      expect(sofaMortalityEstimate(15)).toBeGreaterThan(0.5);
    });
  });

  describe('sofaRiskBand', () => {
    it('maps 0-2 to Low', () => expect(sofaRiskBand(2)).toBe('Low'));
    it('maps 3-6 to Moderate', () => expect(sofaRiskBand(5)).toBe('Moderate'));
    it('maps 7-10 to High', () => expect(sofaRiskBand(8)).toBe('High'));
    it('maps 11+ to Critical', () => expect(sofaRiskBand(11)).toBe('Critical'));
  });
});

describe('SOFA component scoring', () => {
  describe('scoreSOFARespiration', () => {
    it('returns 0 for normal PaO2/FiO2', () => expect(scoreSOFARespiration(450)).toBe(0));
    it('returns 1 for 300-400', () => expect(scoreSOFARespiration(350)).toBe(1));
    it('returns 2 for 200-300', () => expect(scoreSOFARespiration(250)).toBe(2));
    it('returns 3 for 100-200', () => expect(scoreSOFARespiration(150)).toBe(3));
    it('returns 4 for < 100', () => expect(scoreSOFARespiration(80)).toBe(4));
  });

  describe('scoreSOFACoagulation', () => {
    it('returns 0 for normal platelets', () => expect(scoreSOFACoagulation(200)).toBe(0));
    it('returns 1 for 100-150', () => expect(scoreSOFACoagulation(120)).toBe(1));
    it('returns 4 for < 20', () => expect(scoreSOFACoagulation(15)).toBe(4));
  });

  describe('scoreSOFALiver', () => {
    it('returns 0 for normal bilirubin', () => expect(scoreSOFALiver(15)).toBe(0));
    it('returns 4 for severe hyperbilirubinaemia', () => expect(scoreSOFALiver(250)).toBe(4));
  });

  describe('scoreSOFACardiovascular', () => {
    it('returns 0 for MAP ≥70 and no vasopressors', () => {
      expect(scoreSOFACardiovascular(75, [])).toBe(0);
    });
    it('returns 1 for MAP < 70', () => {
      expect(scoreSOFACardiovascular(65, [])).toBe(1);
    });
    it('returns 4 for high-dose norepinephrine', () => {
      expect(scoreSOFACardiovascular(80, [{ agent: VasopressorAgent.Norepinephrine, rateUgKgMin: 0.2 }])).toBe(4);
    });
  });

  describe('scoreSOFACNS', () => {
    it('returns 0 for GCS 15', () => expect(scoreSOFACNS(15)).toBe(0));
    it('returns 1 for GCS 13-14', () => expect(scoreSOFACNS(13)).toBe(1));
    it('returns 4 for GCS < 6', () => expect(scoreSOFACNS(5)).toBe(4));
  });

  describe('scoreSOFARenal', () => {
    it('returns 0 for normal creatinine', () => expect(scoreSOFARenal(80)).toBe(0));
    it('returns 4 for very high creatinine', () => expect(scoreSOFARenal(500)).toBe(4));
    it('returns 4 for critically low urine output', () => expect(scoreSOFARenal(100, 10)).toBe(4));
  });
});

describe('validateVentilatorSettings', () => {
  const validSettings = {
    patientId: 'pat_001',
    icuEncounterId: 'enc_001',
    mode: VentilatorMode.AC_VC,
    tidalVolumeML: 450,
    respiratoryRateSet: 14,
    peepCmH2O: 5,
    fio2Percent: 40,
    startedAt: '2026-01-01T08:00:00Z',
  };

  it('accepts valid settings', () => {
    expect(() => validateVentilatorSettings(validSettings)).not.toThrow();
  });

  it('throws for tidal volume below 100', () => {
    expect(() => validateVentilatorSettings({ ...validSettings, tidalVolumeML: 50 })).toThrow(AppError);
  });

  it('throws for FiO2 below 21%', () => {
    expect(() => validateVentilatorSettings({ ...validSettings, fio2Percent: 15 })).toThrow(AppError);
  });

  it('throws for PEEP above 25', () => {
    expect(() => validateVentilatorSettings({ ...validSettings, peepCmH2O: 30 })).toThrow(AppError);
  });
});

describe('validateVasopressorRate', () => {
  it('accepts safe norepinephrine rate', () => {
    expect(() => validateVasopressorRate(VasopressorAgent.Norepinephrine, 0.05)).not.toThrow();
  });

  it('throws for norepinephrine rate above max', () => {
    expect(() => validateVasopressorRate(VasopressorAgent.Norepinephrine, 1.5)).toThrow(AppError);
  });

  it('accepts vasopressin at therapeutic dose', () => {
    expect(() => validateVasopressorRate(VasopressorAgent.Vasopressin, 0.04)).not.toThrow();
  });

  it('throws for negative rate', () => {
    expect(() => validateVasopressorRate(VasopressorAgent.Dopamine, -5)).toThrow(AppError);
  });
});

describe('calculateFluidBalance', () => {
  it('returns positive balance when intake exceeds output', () => {
    expect(calculateFluidBalance(3000, 1500)).toBe(1500);
  });

  it('returns negative balance when output exceeds intake', () => {
    expect(calculateFluidBalance(1000, 2000)).toBe(-1000);
  });

  it('returns zero for equal intake and output', () => {
    expect(calculateFluidBalance(2000, 2000)).toBe(0);
  });
});

describe('assessAKIStage', () => {
  it('returns 0 for normal creatinine', () => {
    expect(assessAKIStage(80, 90)).toBe(0);
  });

  it('returns 1 for 1.5x baseline rise', () => {
    expect(assessAKIStage(80, 130)).toBe(1);
  });

  it('returns 2 for 2x baseline rise', () => {
    expect(assessAKIStage(80, 170)).toBe(2);
  });

  it('returns 3 for 3x baseline rise', () => {
    expect(assessAKIStage(80, 250)).toBe(3);
  });

  it('returns 3 for very low urine output', () => {
    expect(assessAKIStage(80, 85, 0.2)).toBe(3);
  });
});

describe('requireIntubationPrecheck', () => {
  it('does not throw when conditions are safe', () => {
    expect(() => requireIntubationPrecheck([], true, true)).not.toThrow();
  });

  it('throws for succinylcholine allergy', () => {
    expect(() =>
      requireIntubationPrecheck(['Succinylcholine allergy'], true, true),
    ).toThrow(AppError);
  });

  it('throws if patient is not NPO', () => {
    expect(() => requireIntubationPrecheck([], false, true)).toThrow(AppError);
  });

  it('throws if hemodynamically unstable', () => {
    expect(() => requireIntubationPrecheck([], true, false)).toThrow(AppError);
  });
});

describe('calculatePressureSupportWeaning', () => {
  it('reduces PS by default step of 2', () => {
    expect(calculatePressureSupportWeaning(12, 5)).toBe(10);
  });

  it('does not go below target', () => {
    expect(calculatePressureSupportWeaning(7, 5)).toBe(5);
  });

  it('respects custom step size', () => {
    expect(calculatePressureSupportWeaning(14, 5, 4)).toBe(10);
  });
});
