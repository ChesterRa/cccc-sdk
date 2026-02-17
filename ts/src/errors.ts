/**
 * CCCC SDK error classes
 */

import type { DaemonResponse } from './types.js';

/**
 * Base SDK error
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
 * Daemon unavailable
 */
export class DaemonUnavailableError extends CCCCSDKError {
  constructor(message: string) {
    super(message);
    this.name = 'DaemonUnavailableError';
  }
}

/**
 * Daemon API error
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
 * Incompatible daemon version/capabilities
 */
export class IncompatibleDaemonError extends CCCCSDKError {
  constructor(message: string) {
    super(message);
    this.name = 'IncompatibleDaemonError';
  }
}
