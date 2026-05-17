/**
 * CCCC SDK error classes and error code constants
 */

import type { DaemonResponse } from './types.js';

/**
 * Well-known daemon error codes.
 * Use these constants instead of raw strings to match against {@link DaemonAPIError.code}.
 *
 * ```ts
 * import { ErrorCodes, DaemonAPIError } from 'cccc-sdk';
 * try { ... }
 * catch (e) {
 *   if (e instanceof DaemonAPIError && e.code === ErrorCodes.NOT_FOUND) { ... }
 * }
 * ```
 */
export const ErrorCodes = {
  // ---- daemon protocol errors ----
  NOT_FOUND: 'not_found',
  INVALID_ARGS: 'invalid_args',
  INVALID_OP: 'invalid_op',
  UNKNOWN_OP: 'unknown_op',
  PERMISSION_DENIED: 'permission_denied',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  INTERNAL: 'internal',
  UNAVAILABLE: 'unavailable',
  INVALID_REQUEST: 'invalid_request_error',

  // ---- SDK-specific codes ----
  /** Unparseable JSON line in event stream */
  INVALID_STREAM_DATA: 'invalid_stream_data',
  /** Daemon sent an error object inside the event stream */
  STREAM_ERROR: 'stream_error',
} as const;

/** Union of all known error code string values. */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Base error class for all CCCC SDK errors.
 * All SDK-specific errors extend this class, so callers can use
 * `catch (e) { if (e instanceof CCCCSDKError) ... }` for broad matching.
 */
export class CCCCSDKError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CCCCSDKError';
    // Fix instanceof checks for transpiled targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the daemon cannot be reached (connection refused, timeout, write failure, etc.).
 */
export class DaemonUnavailableError extends CCCCSDKError {
  constructor(message: string) {
    super(message);
    this.name = 'DaemonUnavailableError';
  }
}

/**
 * Thrown when the daemon returns `ok: false` with a structured error payload.
 * Contains the error {@link code}, human-readable {@link message}, and optional {@link details}.
 */
export class DaemonAPIError extends CCCCSDKError {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly raw?: DaemonResponse;

  constructor(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
    raw?: DaemonResponse
  ) {
    super(`${code}: ${message}`);
    this.name = 'DaemonAPIError';
    this.code = code;
    this.details = details;
    this.raw = raw;
  }

  toString(): string {
    const detailsStr = Object.keys(this.details).length > 0
      ? ` (${JSON.stringify(this.details)})`
      : '';
    return `${this.code}: ${this.message}${detailsStr}`;
  }
}

/**
 * Thrown by {@link CCCCClient.assertCompatible} when the daemon does not meet
 * the caller's IPC version, capability, or operation requirements.
 */
export class IncompatibleDaemonError extends CCCCSDKError {
  constructor(message: string) {
    super(message);
    this.name = 'IncompatibleDaemonError';
  }
}
