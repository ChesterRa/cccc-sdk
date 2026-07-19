import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ErrorCodes,
} from '../src/errors.js';
import type { ErrorCode } from '../src/errors.js';
import {
  isChatMessageEvent,
  isChatReadEvent,
  isChatCrossGroupReceiptEvent,
  isStreamEvent,
  isStreamHeartbeat,
} from '../src/types.js';
import type { CCCSEvent, EventStreamItem } from '../src/types.js';

// ============================================================
// ErrorCodes (B1 / C1)
// ============================================================

describe('ErrorCodes', () => {
  it('contains all daemon protocol error codes', () => {
    assert.equal(ErrorCodes.NOT_FOUND, 'not_found');
    assert.equal(ErrorCodes.INVALID_ARGS, 'invalid_args');
    assert.equal(ErrorCodes.INVALID_OP, 'invalid_op');
    assert.equal(ErrorCodes.UNKNOWN_OP, 'unknown_op');
    assert.equal(ErrorCodes.PERMISSION_DENIED, 'permission_denied');
    assert.equal(ErrorCodes.CONFLICT, 'conflict');
    assert.equal(ErrorCodes.RATE_LIMITED, 'rate_limited');
    assert.equal(ErrorCodes.INTERNAL, 'internal');
    assert.equal(ErrorCodes.UNAVAILABLE, 'unavailable');
    assert.equal(ErrorCodes.INVALID_REQUEST, 'invalid_request_error');
  });

  it('contains SDK-specific error codes', () => {
    assert.equal(ErrorCodes.INVALID_STREAM_DATA, 'invalid_stream_data');
    assert.equal(ErrorCodes.STREAM_ERROR, 'stream_error');
  });

  it('has 12 error codes', () => {
    assert.equal(Object.keys(ErrorCodes).length, 12);
  });

  it('ErrorCode type covers all values', () => {
    // Type-level check: ensure a known code satisfies ErrorCode
    const code: ErrorCode = ErrorCodes.NOT_FOUND;
    assert.equal(code, 'not_found');
  });
});

// ============================================================
// Event type guards (B3)
// ============================================================

describe('isChatMessageEvent', () => {
  it('returns true for chat.message events', () => {
    const event: CCCSEvent = {
      id: 'e1', ts: '2024-01-01T00:00:00Z', kind: 'chat.message',
      group_id: 'g1', data: { text: 'hello' },
    };
    assert.ok(isChatMessageEvent(event));
  });

  it('narrows data type', () => {
    const event: CCCSEvent = {
      id: 'e1', ts: '2024-01-01T00:00:00Z', kind: 'chat.message',
      group_id: 'g1', data: { text: 'hello', priority: 'normal' },
    };
    if (isChatMessageEvent(event)) {
      // These should be accessible without cast
      assert.equal(event.data.text, 'hello');
      assert.equal(event.data.priority, 'normal');
    } else {
      assert.fail('should be chat.message');
    }
  });

  it('returns false for non-chat.message events', () => {
    const event: CCCSEvent = {
      id: 'e2', ts: '2024-01-01T00:00:00Z', kind: 'chat.read',
      group_id: 'g1', data: { actor_id: 'a1', event_id: 'e1' },
    };
    assert.ok(!isChatMessageEvent(event));
  });
});

describe('isChatReadEvent', () => {
  it('returns true for chat.read events', () => {
    const event: CCCSEvent = {
      id: 'e2', ts: '2024-01-01T00:00:00Z', kind: 'chat.read',
      group_id: 'g1', data: { actor_id: 'a1', event_id: 'e1' },
    };
    assert.ok(isChatReadEvent(event));
  });

  it('narrows data type', () => {
    const event: CCCSEvent = {
      id: 'e2', ts: '2024-01-01T00:00:00Z', kind: 'chat.read',
      group_id: 'g1', data: { actor_id: 'a1', event_id: 'e1' },
    };
    if (isChatReadEvent(event)) {
      assert.equal(event.data.actor_id, 'a1');
      assert.equal(event.data.event_id, 'e1');
    } else {
      assert.fail('should be chat.read');
    }
  });

  it('returns false for non-chat.read events', () => {
    const event: CCCSEvent = {
      id: 'e1', ts: '2024-01-01T00:00:00Z', kind: 'chat.message',
      group_id: 'g1', data: { text: 'hi' },
    };
    assert.ok(!isChatReadEvent(event));
  });
});

describe('isChatCrossGroupReceiptEvent', () => {
  it('narrows chat.cross_group_receipt data', () => {
    const event: CCCSEvent = {
      id: 'e3', ts: '2024-01-01T00:00:00Z', kind: 'chat.cross_group_receipt',
      group_id: 'g1', data: { source_event_id: 'e1', dst_group_id: 'g2', status: 'sent' },
    };
    assert.ok(isChatCrossGroupReceiptEvent(event));
    if (isChatCrossGroupReceiptEvent(event)) {
      assert.equal(event.data.source_event_id, 'e1');
      assert.equal(event.data.dst_group_id, 'g2');
      assert.equal(event.data.status, 'sent');
    }
  });
});

// ============================================================
// Stream type guards (C2)
// ============================================================

describe('isStreamEvent', () => {
  it('returns true for event items', () => {
    const item: EventStreamItem = {
      t: 'event',
      event: {
        id: 'e1', ts: '2024-01-01T00:00:00Z', kind: 'chat.message',
        group_id: 'g1', data: { text: 'hi' },
      },
    };
    assert.ok(isStreamEvent(item));
    if (isStreamEvent(item)) {
      assert.equal(item.event.id, 'e1');
    }
  });

  it('returns false for heartbeat items', () => {
    const item: EventStreamItem = { t: 'heartbeat', ts: '2024-01-01T00:00:00Z' };
    assert.ok(!isStreamEvent(item));
  });

  it('returns false for unknown items', () => {
    const item: EventStreamItem = { t: 'unknown_type', foo: 'bar' };
    assert.ok(!isStreamEvent(item));
  });
});

describe('isStreamHeartbeat', () => {
  it('returns true for heartbeat items', () => {
    const item: EventStreamItem = { t: 'heartbeat', ts: '2024-01-01T00:00:00Z' };
    assert.ok(isStreamHeartbeat(item));
    if (isStreamHeartbeat(item)) {
      assert.equal(item.ts, '2024-01-01T00:00:00Z');
    }
  });

  it('returns false for event items', () => {
    const item: EventStreamItem = {
      t: 'event',
      event: {
        id: 'e1', ts: '2024-01-01T00:00:00Z', kind: 'chat.message',
        group_id: 'g1', data: {},
      },
    };
    assert.ok(!isStreamHeartbeat(item));
  });
});
