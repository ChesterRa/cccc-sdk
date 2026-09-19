import { compactRecord, type CCCC0430Client } from './client_0430_shared.js';
import type { ConnectCatalogOptions, ConnectSendOptions, ConnectSendFilesOptions } from './types.js';

export interface ConnectOps {
  connectCatalog(options: ConnectCatalogOptions): Promise<Record<string, unknown>>;
  connectSend(options: ConnectSendOptions): Promise<Record<string, unknown>>;
  connectSendFiles(options: ConnectSendFilesOptions): Promise<Record<string, unknown>>;
}

function sendArgs(options: Omit<ConnectSendOptions, 'text'> & { text?: string }): Record<string, unknown> {
  if (!options.clientId.trim() || Buffer.byteLength(options.clientId, 'utf8') > 128) {
    throw new TypeError('clientId must be non-empty and at most 128 UTF-8 bytes');
  }
  return compactRecord({
    group_id: options.groupId,
    instance_id: options.instanceId,
    target_group_id: options.targetGroupId,
    client_id: options.clientId,
    text: options.text ?? '',
    message_mode: options.mode,
    by: options.by ?? 'user',
    to: options.to,
    format: options.format,
    insight: options.insight,
    attachments: options.attachments,
  });
}

const ops: ConnectOps & ThisType<CCCC0430Client> = {
  async connectCatalog(options) {
    return this.call('connect_catalog', compactRecord({
      group_id: options.groupId,
      instance_id: options.instanceId,
      target_group_id: options.targetGroupId,
      by: options.by ?? 'user',
      after: options.after,
      limit: options.limit,
    }));
  },
  async connectSend(options) {
    return this.call('connect_send', sendArgs(options));
  },
  async connectSendFiles(options) {
    if (!options.paths.length || options.paths.some(path => !path.trim())) {
      throw new TypeError('paths must contain one or more non-empty paths');
    }
    return this.call('connect_send_files', { ...sendArgs(options), paths: options.paths });
  },
};
export function installConnectOps(proto: CCCC0430Client & Partial<ConnectOps>): void {
  Object.assign(proto, ops);
}
