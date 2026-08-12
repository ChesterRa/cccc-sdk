import { compactRecord, type CCCC0430Client } from './client_0430_shared.js';
import type {
  WebModelRuntimeCompleteTurnOptions,
  WebModelRuntimeWaitNextTurnOptions,
} from './types.js';

export interface CCCC0430RuntimeOps {
  webModelRuntimeWaitNextTurn(
    options: WebModelRuntimeWaitNextTurnOptions
  ): Promise<Record<string, unknown>>;
  webModelRuntimeCompleteTurn(
    options: WebModelRuntimeCompleteTurnOptions
  ): Promise<Record<string, unknown>>;
}

const runtimeOps: CCCC0430RuntimeOps & ThisType<CCCC0430Client> = {
  async webModelRuntimeWaitNextTurn(options) {
    return this.call('web_model_runtime_wait_next_turn', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? options.actorId,
      limit: Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 20),
      kind_filter: options.kindFilter ?? 'all',
    });
  },

  async webModelRuntimeCompleteTurn(options) {
    return this.call('web_model_runtime_complete_turn', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? options.actorId,
      turn_id: options.turnId,
      delivery_id: options.deliveryId,
      event_ids: options.eventIds,
      latest_event_id: options.latestEventId,
      status: options.status ?? 'done',
      summary: options.summary,
    }));
  },
};

export function installCCCC0430RuntimeOps(
  proto: CCCC0430Client & Partial<CCCC0430RuntimeOps>
): void {
  Object.assign(proto, runtimeOps);
}
