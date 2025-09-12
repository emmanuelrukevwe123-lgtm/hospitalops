/**
 * Cross-cutting enumerations shared by several modules. Module-specific states
 * (bed status, order lifecycle, …) live with their module; only the values that
 * genuinely span modules belong here.
 *
 * Enumerations use `as const` objects rather than `enum` so they erase cleanly
 * under isolated-modules transpilation and the literal union is easy to reuse.
 */

export const Department = {
  Emergency: 'Emergency',
  ICU: 'ICU',
  Surgery: 'Surgery',
  Maternity: 'Maternity',
  Pharmacy: 'Pharmacy',
  Laboratory: 'Laboratory',
  Radiology: 'Radiology',
  General: 'General',
} as const;
export type Department = (typeof Department)[keyof typeof Department];

/** Banding used by analytics and several scoring rules. */
export const RiskBand = {
  Low: 'Low',
  Moderate: 'Moderate',
  High: 'High',
  Critical: 'Critical',
} as const;
export type RiskBand = (typeof RiskBand)[keyof typeof RiskBand];

export const ALL_DEPARTMENTS: readonly Department[] = Object.values(Department);
export const ALL_RISK_BANDS: readonly RiskBand[] = Object.values(RiskBand);
