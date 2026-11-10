import type { ActorInfo } from '../src/index.js';

const oldActor: ActorInfo = { id: 'peer' };
const noReplacement: ActorInfo = {
  id: 'peer',
  runtime_session_replaced_at: null,
  runtime_session_replaced_reasons: null,
};
const replacement: ActorInfo = {
  id: 'peer',
  runtime_session_replaced_at: '2026-11-10T10:00:00Z',
  runtime_session_replaced_reasons: ['launch_path', 'future_reason'],
};
const noKnownReason: ActorInfo = {
  id: 'peer',
  runtime_session_replaced_at: '2026-11-10T10:00:00Z',
  runtime_session_replaced_reasons: [],
};

declare const actor: ActorInfo;
const recordedAt: string | null | undefined = actor.runtime_session_replaced_at;
const reasons: string[] | null | undefined = actor.runtime_session_replaced_reasons;

// @ts-expect-error The daemon returns an array of reasons, not one reason string.
const wrongReasons: ActorInfo = { id: 'peer', runtime_session_replaced_reasons: 'launch_path' };
// @ts-expect-error The record time is a string, not an epoch number.
const wrongTime: ActorInfo = { id: 'peer', runtime_session_replaced_at: 1 };
void [oldActor, noReplacement, replacement, noKnownReason, recordedAt, reasons, wrongReasons, wrongTime];
