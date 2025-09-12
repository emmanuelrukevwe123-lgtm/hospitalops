/**
 * Application error model.
 *
 * Every failure that callers are expected to handle carries a stable `code`
 * so it can be branched on without string-matching the message. Helper
 * constructors keep call sites terse and consistent.
 */

export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INVALID_TRANSITION'
  | 'PRECONDITION_FAILED';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export const notFound = (entity: string, id: string): AppError =>
  new AppError('NOT_FOUND', `${entity} '${id}' was not found`, { entity, id });

export const validation = (message: string, details?: Record<string, unknown>): AppError =>
  new AppError('VALIDATION', message, details);

export const conflict = (message: string, details?: Record<string, unknown>): AppError =>
  new AppError('CONFLICT', message, details);

export const forbidden = (message: string, details?: Record<string, unknown>): AppError =>
  new AppError('FORBIDDEN', message, details);

export const invalidTransition = (entity: string, from: string, to: string): AppError =>
  new AppError('INVALID_TRANSITION', `${entity} cannot move from '${from}' to '${to}'`, {
    entity,
    from,
    to,
  });

export const preconditionFailed = (
  message: string,
  details?: Record<string, unknown>,
): AppError => new AppError('PRECONDITION_FAILED', message, details);
