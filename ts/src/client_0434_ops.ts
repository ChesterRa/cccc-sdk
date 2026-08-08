import {
  compactRecord,
  type CCCC0430Client,
} from './client_0430_shared.js';
import type {
  TerminalSnapshotOptions,
  TerminalSnapshotResult,
  WebModelDeliveryPreferencesGetOptions,
  WebModelDeliveryPreferencesResult,
  WebModelDeliveryPreferencesUpdateOptions,
  WebModelRuntimeRecoverTurnOptions,
  WebModelRuntimeRecoverTurnResult,
} from './types.js';

export interface CCCC0434Ops {
  terminalSnapshot(options: TerminalSnapshotOptions): Promise<TerminalSnapshotResult>;
  webModelDeliveryPreferencesGet(
    options: WebModelDeliveryPreferencesGetOptions,
  ): Promise<WebModelDeliveryPreferencesResult>;
  webModelDeliveryPreferencesUpdate(
    options: WebModelDeliveryPreferencesUpdateOptions,
  ): Promise<WebModelDeliveryPreferencesResult>;
  webModelRuntimeRecoverTurn(
    options: WebModelRuntimeRecoverTurnOptions,
  ): Promise<WebModelRuntimeRecoverTurnResult>;
}

const ops: CCCC0434Ops & ThisType<CCCC0430Client> = {
  async terminalSnapshot(options) {
    const result = await this.call('terminal_snapshot', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      limit_bytes: options.limitBytes,
    }));
    return result as unknown as TerminalSnapshotResult;
  },

  async webModelDeliveryPreferencesGet(options) {
    const result = await this.call('web_model_delivery_preferences_get', {
      group_id: options.groupId,
      actor_id: options.actorId,
    });
    return result as unknown as WebModelDeliveryPreferencesResult;
  },

  async webModelDeliveryPreferencesUpdate(options) {
    const result = await this.call('web_model_delivery_preferences_update', {
      group_id: options.groupId,
      actor_id: options.actorId,
      mode: options.mode,
      by: options.by ?? 'user',
    });
    return result as unknown as WebModelDeliveryPreferencesResult;
  },

  async webModelRuntimeRecoverTurn(options) {
    if (options.eventIds.length === 0 || options.eventIds.some((eventId) => eventId.trim().length === 0)) {
      throw new TypeError('eventIds must contain at least one non-empty event id');
    }
    const result = await this.call('web_model_runtime_recover_turn', {
      group_id: options.groupId,
      actor_id: options.actorId,
      event_ids: options.eventIds,
    });
    return result as unknown as WebModelRuntimeRecoverTurnResult;
  },
};

export function installCCCC0434Ops(proto: CCCC0430Client & Partial<CCCC0434Ops>): void {
  Object.assign(proto, ops);
}
