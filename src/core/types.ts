/**
 * Shared value types used across every module.
 */
import type { AppError } from './errors';

/** ISO-8601 timestamp string, e.g. "2025-01-01T08:30:00.000Z". */
export type ISODateString = string;

/**
 * A discriminated result. Operations that can fail in an expected way return
 * `Result` rather than throwing, so callers must acknowledge the error path.
 */
export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;

export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;

/** Unwrap a result, throwing the error if it is not `ok`. Use sparingly. */
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (r.ok) return r.value;
  throw r.error;
};

/** Base shape every stored entity shares. */
export interface Entity {
  readonly id: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
