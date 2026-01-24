/**
 * Public barrel for the platform. Modules add their exports here as they land.
 */
export * from './core/types';
export * from './core/errors';
export * from './core/ids';
export * from './core/enums';
export * from './core/clock';

export * from './storage/repository';
export * from './storage/memoryStore';
export * from './storage/fileStore';

export * from './audit/auditLog';

export * from './auth/roles';
export * from './auth/permissions';

export * from './clinical/patient';
export * from './clinical/ward';
export * from './clinical/staff';
export * from './clinical/order';
export * from './clinical/pharmacy';
export * from './clinical/lab';
export * from './clinical/surgery';
export * from './clinical/infection';

export * from './billing/billing';
export * from './safety/safety';
export * from './compliance/compliance';
export * from './analytics/analytics';

export * from './rules/rulepackIndex';

