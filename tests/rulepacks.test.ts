import { describe, it, expect } from 'vitest';
import { getRulepack, getAllRulepacks } from '../src/rules/rulepackIndex';

describe('Rulepack Registry & Loader Module', () => {
  it('registers exactly 47 rulepacks', () => {
    const list = getAllRulepacks();
    expect(list).toHaveLength(47);
  });

  it('retrieves rulepacks correctly by ID', () => {
    const pack1 = getRulepack('pack-01');
    expect(pack1.id).toBe('pack-01');
    expect(pack1.triageAgeRiskLimit).toBe(65);
    expect(pack1.allergyCheckStrictness).toBe('Low');

    const pack47 = getRulepack('pack-47');
    expect(pack47.id).toBe('pack-47');
  });

  it('throws error for unknown rulepack ID', () => {
    expect(() => getRulepack('pack-99')).toThrow(/Rulepack 'pack-99' not found/);
  });
});
