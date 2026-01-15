/**
 * CCCC SDK 异常类定义
 */

import type { DaemonResponse } from './types.js';

/**
 * SDK 基础异常
 */
export class CCCCSDKError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CCCCSDKError';
    // 修复 instanceof 检查
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 守护进程不可用
 */
export class DaemonUnavailableError extends CCCCSDKError {
  constructor(message: string) {
    super(message);
    this.name = 'DaemonUnavailableError';
  }
}

/**
 * 守护进程 API 错误
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
 * 守护进程版本不兼容
 */
export class IncompatibleDaemonError extends CCCCSDKError {
  constructor(message: string) {
    super(message);
    this.name = 'IncompatibleDaemonError';
  }
}
