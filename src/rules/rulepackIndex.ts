import { preconditionFailed } from '../core/errors';

export interface Rulepack {
  id: string;
  name: string;
  description: string;
  triageAgeRiskLimit: number;
  escalationTimeoutMinutes: number;
  allergyCheckStrictness: 'High' | 'Low';
  complianceAuditIntervalDays: number;
}

const rulepacks = new Map<string, Rulepack>();

// Populate pack-01 to pack-47
for (let i = 1; i <= 47; i++) {
  const padId = String(i).padStart(2, '0');
  const id = `pack-${padId}`;
  
  rulepacks.set(id, {
    id,
    name: `Hospital Protocol Pack ${padId}`,
    description: `Standard operating threshold parameters for clinical unit configuration ${padId}.`,
    triageAgeRiskLimit: i % 2 === 0 ? 60 : 65,
    escalationTimeoutMinutes: 10 + (i % 5) * 5, // 10, 15, 20, 25, 30
    allergyCheckStrictness: i % 3 === 0 ? 'High' : 'Low',
    complianceAuditIntervalDays: 30 + (i % 4) * 15, // 30, 45, 60, 75
  });
}

/** Retrieve a rulepack by its ID. Throws if not found. */
export function getRulepack(id: string): Rulepack {
  const pack = rulepacks.get(id);
  if (!pack) {
    throw preconditionFailed(`Rulepack '${id}' not found in registry`);
  }
  return pack;
}

/** Retrieve a rulepack by ID, falling back to pack-01 when the requested pack is missing. */
export function getRulepackOrDefault(id: string): Rulepack {
  return rulepacks.get(id) ?? rulepacks.get('pack-01')!;
}

/** Get all registered rulepacks sorted by id. */
export function getAllRulepacks(): Rulepack[] {
  return Array.from(rulepacks.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/** List all registered rulepack IDs. */
export function listRulepackIds(): string[] {
  return getAllRulepacks().map((p) => p.id);
}
