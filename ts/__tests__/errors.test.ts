import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CCCCSDKError,
  DaemonUnavailableError,
  DaemonAPIError,
  IncompatibleDaemonError,
} from '../src/errors.js';

describe('CCCCSDKError', () => {
  it('is an instance of Error', () => {
    const err = new CCCCSDKError('test');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof CCCCSDKError);
    assert.equal(err.name, 'CCCCSDKError');
    assert.equal(err.message, 'test');
  });
});

describe('DaemonUnavailableError', () => {
  it('extends CCCCSDKError', () => {
    const err = new DaemonUnavailableError('connection refused');
    assert.ok(err instanceof CCCCSDKError);
    assert.ok(err instanceof DaemonUnavailableError);
    assert.equal(err.name, 'DaemonUnavailableError');
  });
});

describe('DaemonAPIError', () => {
  it('stores code, details, and raw response', () => {
    const raw = { ok: false as const, error: { code: 'not_found', message: 'gone' } };
    const err = new DaemonAPIError('not_found', 'gone', { id: '123' }, raw);

    assert.ok(err instanceof CCCCSDKError);
    assert.equal(err.code, 'not_found');
    assert.equal(err.details.id, '123');
    assert.equal(err.raw, raw);
    assert.equal(err.name, 'DaemonAPIError');
  });

  it('defaults details to empty object', () => {
    const err = new DaemonAPIError('err', 'msg');
    assert.deepEqual(err.details, {});
    assert.equal(err.raw, undefined);
  });

  it('toString includes code, message, and details', () => {
    const err = new DaemonAPIError('bad', 'reason', { key: 'val' });
    const str = err.toString();
    assert.ok(str.includes('bad'));
    assert.ok(str.includes('key'));
  });

  it('toString omits details when empty', () => {
    const err = new DaemonAPIError('code', 'msg');
    const str = err.toString();
    assert.ok(!str.includes('{'));
  });
});

describe('IncompatibleDaemonError', () => {
  it('extends CCCCSDKError', () => {
    const err = new IncompatibleDaemonError('version mismatch');
    assert.ok(err instanceof CCCCSDKError);
    assert.ok(err instanceof IncompatibleDaemonError);
    assert.equal(err.name, 'IncompatibleDaemonError');
  });
});
