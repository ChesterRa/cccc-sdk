import { Buffer } from 'node:buffer';
import {
  compactRecord,
  type BasicGroupActorOptions,
  type CCCC0430Client,
  type GroupScopedOptions,
} from './client_0430_shared.js';
import { DaemonAPIError } from './errors.js';
import type { GroupPreambleResetOptions, GroupPreambleSetOptions } from './types.js';

const MAX_GROUP_PREAMBLE_BYTES = 512 * 1024;

export interface CCCC0430AdminOps {
  actorNewSession(groupId: string, actorId: string, by?: string): Promise<Record<string, unknown>>;
  actorNewSession(options: BasicGroupActorOptions & { clearSavedSession?: boolean }): Promise<Record<string, unknown>>;
  groupCopyExportFile(options: { groupId: string; includeBlobs?: boolean }): Promise<Record<string, unknown>>;
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
  imBindChat(options: { groupId: string; platform: string; chatId: string; threadId?: number; by?: string }): Promise<Record<string, unknown>>;
  imListAuthorized(options?: { platform?: string }): Promise<Record<string, unknown>>;
  imListPending(options?: { platform?: string }): Promise<Record<string, unknown>>;
  imRejectPending(options: { platform?: string; key: string; by?: string }): Promise<Record<string, unknown>>;
  imRevokeChat(options: { platform?: string; chatId: string; threadId?: number; by?: string }): Promise<Record<string, unknown>>;
  remoteAccessState(options?: GroupScopedOptions): Promise<Record<string, unknown>>;
  remoteAccessConfigure(options: GroupScopedOptions & { config: Record<string, unknown> }): Promise<Record<string, unknown>>;
  remoteAccessStart(options?: GroupScopedOptions): Promise<Record<string, unknown>>;
  remoteAccessStop(options?: GroupScopedOptions): Promise<Record<string, unknown>>;
  blueprintGenerate(options: { groupId: string; taskId: string; variant?: number }): Promise<Record<string, unknown>>;
}

const adminOps: CCCC0430AdminOps & ThisType<CCCC0430Client> = {
  async actorNewSession(
    optionsOrGroupId: (BasicGroupActorOptions & { clearSavedSession?: boolean }) | string,
    legacyActorId?: string,
    legacyBy: string = 'user',
  ) {
    const options: BasicGroupActorOptions & { clearSavedSession?: boolean } = typeof optionsOrGroupId === 'string'
      ? { groupId: optionsOrGroupId, actorId: String(legacyActorId ?? ''), by: legacyBy }
      : optionsOrGroupId;
    return this.call('actor_new_session', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      clear_saved_session: options.clearSavedSession,
    }));
  },

  async groupCopyExportFile(options) {
    return this.call('group_copy_export_file', compactRecord({
      group_id: options.groupId,
      include_blobs: options.includeBlobs,
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
    return this.call('terminal_resize', {
      group_id: options.groupId,
      actor_id: options.actorId,
      cols: options.cols,
      rows: options.rows,
    });
  },

  async imBindChat(options) {
    return this.call('im_bind_chat', compactRecord({
      group_id: options.groupId,
      platform: options.platform,
      chat_id: options.chatId,
      thread_id: options.threadId,
      by: options.by ?? 'user',
    }));
  },

  async imListAuthorized(options = {}) {
    return this.call('im_list_authorized', compactRecord({ platform: options.platform }));
  },

  async imListPending(options = {}) {
    return this.call('im_list_pending', compactRecord({ platform: options.platform }));
  },

  async imRejectPending(options) {
    return this.call('im_reject_pending', compactRecord({
      platform: options.platform,
      key: options.key,
      by: options.by ?? 'user',
    }));
  },

  async imRevokeChat(options) {
    return this.call('im_revoke_chat', compactRecord({
      platform: options.platform,
      chat_id: options.chatId,
      thread_id: options.threadId,
      by: options.by ?? 'user',
    }));
  },

  async remoteAccessState(options = {}) {
    return this.call('remote_access_state', compactRecord({
      group_id: options.groupId,
      by: options.by,
    }));
  },

  async remoteAccessConfigure(options) {
    return this.call('remote_access_configure', compactRecord({
      group_id: options.groupId,
      by: options.by ?? 'user',
      config: options.config,
    }));
  },

  async remoteAccessStart(options = {}) {
    return this.call('remote_access_start', compactRecord({
      group_id: options.groupId,
      by: options.by ?? 'user',
    }));
  },

  async remoteAccessStop(options = {}) {
    return this.call('remote_access_stop', compactRecord({
      group_id: options.groupId,
      by: options.by ?? 'user',
    }));
  },

  async blueprintGenerate(options) {
    return this.call('blueprint_generate', compactRecord({
      group_id: options.groupId,
      task_id: options.taskId,
      variant: options.variant,
    }));
  },
};

export function installCCCC0430AdminOps(proto: CCCC0430Client & Partial<CCCC0430AdminOps>): void {
  Object.assign(proto, adminOps);
}
