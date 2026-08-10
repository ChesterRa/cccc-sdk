import { Buffer } from 'node:buffer';
import {
  compactRecord,
  type BasicGroupActorOptions,
  type CCCC0430Client,
} from './client_0430_shared.js';
import { DaemonAPIError } from './errors.js';
import type {
  GroupCopyExportOptions,
  GroupPreambleResetOptions,
  GroupPreambleSetOptions,
  RemoteAccessConfigureOptions,
  RemoteAccessOptions,
} from './types.js';

const MAX_GROUP_PREAMBLE_BYTES = 512 * 1024;

export interface CCCC0430AdminOps {
  actorNewSession(groupId: string, actorId: string, by?: string): Promise<Record<string, unknown>>;
  actorNewSession(options: BasicGroupActorOptions): Promise<Record<string, unknown>>;
  groupCopyExportFile(options: GroupCopyExportOptions): Promise<Record<string, unknown>>;
  groupPreambleGet(options: { groupId: string }): Promise<Record<string, unknown>>;
  groupPreambleSet(options: GroupPreambleSetOptions): Promise<Record<string, unknown>>;
  groupPreambleReset(options: GroupPreambleResetOptions): Promise<Record<string, unknown>>;
  terminalHistory(options: BasicGroupActorOptions & {
    before?: number;
    limitBytes?: number;
    stripAnsi?: boolean;
    compact?: boolean;
    /** @deprecated Use limitBytes. */
    limit?: number;
    /** @deprecated Use before. Numeric strings are accepted. */
    cursor?: string;
  }): Promise<Record<string, unknown>>;
  terminalSince(options: BasicGroupActorOptions & { after: number; limitBytes?: number }): Promise<Record<string, unknown>>;
  termResize(options: BasicGroupActorOptions & { cols: number; rows: number }): Promise<Record<string, unknown>>;
  imBindChat(options: { groupId: string; key: string }): Promise<Record<string, unknown>>;
  imListAuthorized(options: { groupId: string }): Promise<Record<string, unknown>>;
  imListPending(options: { groupId: string }): Promise<Record<string, unknown>>;
  imRejectPending(options: { groupId: string; key: string }): Promise<Record<string, unknown>>;
  imRevokeChat(options: { groupId: string; chatId: string; threadId?: number | string }): Promise<Record<string, unknown>>;
  remoteAccessState(options?: RemoteAccessOptions): Promise<Record<string, unknown>>;
  remoteAccessConfigure(options: RemoteAccessConfigureOptions): Promise<Record<string, unknown>>;
  remoteAccessStart(options?: RemoteAccessOptions): Promise<Record<string, unknown>>;
  remoteAccessStop(options?: RemoteAccessOptions): Promise<Record<string, unknown>>;
}

const adminOps: CCCC0430AdminOps & ThisType<CCCC0430Client> = {
  async actorNewSession(
    optionsOrGroupId: BasicGroupActorOptions | string,
    legacyActorId?: string,
    legacyBy: string = 'user',
  ) {
    const options: BasicGroupActorOptions = typeof optionsOrGroupId === 'string'
      ? { groupId: optionsOrGroupId, actorId: String(legacyActorId ?? ''), by: legacyBy }
      : optionsOrGroupId;
    return this.call('actor_new_session', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
    });
  },

  async groupCopyExportFile(options) {
    return this.call('group_copy_export_file', compactRecord({
      group_id: options.groupId,
      by: options.by ?? 'user',
    }));
  },

  async groupPreambleGet(options) {
    return this.call('group_preamble_get', { group_id: options.groupId });
  },

  async groupPreambleSet(options) {
    if (typeof options.content !== 'string' || options.content.trim().length === 0) {
      throw new DaemonAPIError('invalid_args', 'groupPreambleSet requires non-empty content', {});
    }
    if (Buffer.byteLength(options.content, 'utf8') > MAX_GROUP_PREAMBLE_BYTES) {
      throw new DaemonAPIError('invalid_args', 'groupPreambleSet content exceeds 512 KiB', {});
    }
    return this.call('group_preamble_set', {
      group_id: options.groupId,
      content: options.content,
      by: options.by ?? 'user',
    });
  },

  async groupPreambleReset(options) {
    if (options.confirm !== 'preamble') {
      throw new DaemonAPIError('invalid_args', "groupPreambleReset requires confirm='preamble'", {});
    }
    return this.call('group_preamble_reset', {
      group_id: options.groupId,
      confirm: 'preamble',
      by: options.by ?? 'user',
    });
  },

  async terminalHistory(options) {
    const cursorBefore = options.cursor === undefined ? undefined : Number(options.cursor);
    return this.call('terminal_history', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      before: options.before ?? (Number.isSafeInteger(cursorBefore) ? cursorBefore : undefined),
      limit_bytes: options.limitBytes ?? options.limit,
      strip_ansi: options.stripAnsi,
      compact: options.compact,
      by: options.by ?? 'user',
    }));
  },

  async terminalSince(options) {
    return this.call('terminal_since', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      after: options.after,
      limit_bytes: options.limitBytes,
      by: options.by ?? 'user',
    }));
  },

  async termResize(options) {
    const args = {
      group_id: options.groupId,
      actor_id: options.actorId,
      cols: options.cols,
      rows: options.rows,
    };
    try {
      return await this.call('term_resize', args);
    } catch (error) {
      if (!(error instanceof DaemonAPIError) || error.code !== 'unknown_op') {
        throw error;
      }
    }
    // Rust CCCC builds prior to contract parity used this legacy alias.
    const legacy = await this.call('terminal_resize', args);
    return {
      group_id: options.groupId,
      actor_id: options.actorId,
      cols: typeof legacy['cols'] === 'number' ? legacy['cols'] : options.cols,
      rows: typeof legacy['rows'] === 'number' ? legacy['rows'] : options.rows,
    };
  },

  async imBindChat(options) {
    return this.call('im_bind_chat', {
      group_id: options.groupId,
      key: options.key,
    });
  },

  async imListAuthorized(options) {
    return this.call('im_list_authorized', { group_id: options.groupId });
  },

  async imListPending(options) {
    return this.call('im_list_pending', { group_id: options.groupId });
  },

  async imRejectPending(options) {
    return this.call('im_reject_pending', {
      group_id: options.groupId,
      key: options.key,
    });
  },

  async imRevokeChat(options) {
    return this.call('im_revoke_chat', compactRecord({
      group_id: options.groupId,
      chat_id: options.chatId,
      thread_id: options.threadId,
    }));
  },

  async remoteAccessState(options = {}) {
    return this.call('remote_access_state', { by: options.by ?? 'user' });
  },

  async remoteAccessConfigure(options) {
    return this.call('remote_access_configure', compactRecord({
      by: options.by ?? 'user',
      provider: options.provider,
      mode: options.mode,
      require_access_token: options.requireAccessToken,
      web_host: options.webHost,
      web_port: options.webPort,
      web_public_url: options.webPublicUrl,
    }));
  },

  async remoteAccessStart(options = {}) {
    return this.call('remote_access_start', { by: options.by ?? 'user' });
  },

  async remoteAccessStop(options = {}) {
    return this.call('remote_access_stop', { by: options.by ?? 'user' });
  },

};

export function installCCCC0430AdminOps(proto: CCCC0430Client & Partial<CCCC0430AdminOps>): void {
  Object.assign(proto, adminOps);
}
