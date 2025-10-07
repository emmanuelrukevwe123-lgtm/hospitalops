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
