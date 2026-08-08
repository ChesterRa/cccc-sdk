import type {
  CCCSEvent,
  EventStreamItem,
  InboxListOptions,
  ReplyOptions,
  SendAndWaitOptions,
  SendCrossGroupOptions,
  SendFilesOptions,
  SendOptions,
  SendResult,
} from './types.js';
import { DaemonAPIError } from './errors.js';
import { isStreamEvent } from './types.js';

type ClientCall = (op: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;

type ChatClient = {
  call: ClientCall;
  callRaw: (op: string, args?: Record<string, unknown>) => Promise<unknown>;
  eventsStream(options: {
    groupId: string;
    by?: string;
    kinds?: string[];
    sinceTs?: string;
    signal?: AbortSignal;
  }): AsyncGenerator<EventStreamItem>;
};

export interface ChatOps {
  send(options: SendOptions): Promise<Record<string, unknown>>;
  sendFiles(options: SendFilesOptions): Promise<Record<string, unknown>>;
  sendCrossGroup(options: SendCrossGroupOptions): Promise<Record<string, unknown>>;
  reply(options: ReplyOptions): Promise<Record<string, unknown>>;
  chatAck(groupId: string, actorId: string, eventId: string, by?: string): Promise<Record<string, unknown>>;
  sendAndWaitForReply(options: SendAndWaitOptions): Promise<CCCSEvent>;
  inboxList(options: InboxListOptions): Promise<Record<string, unknown>>;
  inboxMarkRead(groupId: string, actorId: string, eventId: string, by?: string): Promise<Record<string, unknown>>;
  inboxMarkAllRead(groupId: string, actorId: string, by?: string, kindFilter?: string): Promise<Record<string, unknown>>;
  notifyAck(groupId: string, actorId: string, notifyEventId: string, by?: string): Promise<Record<string, unknown>>;
}

const chatOps: ChatOps & ThisType<ChatClient & ChatOps> = {
  async send(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;
    if (options.path) args['path'] = options.path;
    if (options.refs) args['refs'] = options.refs;
    if (options.attachments) args['attachments'] = options.attachments;
    if (options.clientId) args['client_id'] = options.clientId;
    if (options.suggestedUserMessage) args['suggested_user_message'] = options.suggestedUserMessage;
    if (options.insight) args['insight'] = options.insight;
    if (options.requirePeerInsight !== undefined) args['require_peer_insight'] = options.requirePeerInsight;

    return this.call('send', args);
  },

  async sendFiles(options) {
    const normalizedPaths = Array.isArray(options.paths)
      ? options.paths.map((path) => String(path).trim())
      : [];
    if (normalizedPaths.length === 0 || normalizedPaths.some((path) => path.length === 0)) {
      throw new DaemonAPIError('invalid_args', 'sendFiles requires one or more non-empty paths', {});
    }
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      paths: normalizedPaths,
      text: options.text ?? '',
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };
    if (options.to) args['to'] = options.to;
    if (options.insight) args['insight'] = options.insight;
    if (options.clientId) args['client_id'] = options.clientId;
    return this.call('send_files', args);
  },

  async sendCrossGroup(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      dst_group_id: options.dstGroupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;
    if (options.insight) args['insight'] = options.insight;
    if (options.requirePeerInsight !== undefined) args['require_peer_insight'] = options.requirePeerInsight;

    return this.call('send_cross_group', args);
  },

  async reply(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      reply_to: options.replyTo,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;
    if (options.refs) args['refs'] = options.refs;
    if (options.attachments) args['attachments'] = options.attachments;
    if (options.clientId) args['client_id'] = options.clientId;
    if (options.suggestedUserMessage) args['suggested_user_message'] = options.suggestedUserMessage;
    if (options.insight) args['insight'] = options.insight;
    if (options.requirePeerInsight !== undefined) args['require_peer_insight'] = options.requirePeerInsight;

    return this.call('reply', args);
  },

  async chatAck(groupId, actorId, eventId, by) {
    return this.call('chat_ack', {
      group_id: groupId,
      actor_id: actorId,
      event_id: eventId,
      by: by ?? actorId,
    });
  },

  async sendAndWaitForReply(options) {
    if (options.signal?.aborted) {
      throw new Error('sendAndWaitForReply aborted');
    }
    // Probe the real streaming upgrade before creating the message side effect.
    // Some daemon builds have advertised events_stream without dispatching it.
    await this.callRaw('events_stream', {
      group_id: options.groupId,
      by: options.listenAs,
    });
    if (options.signal?.aborted) {
      throw new Error('sendAndWaitForReply aborted');
    }
    const waitTimeout = options.waitTimeoutMs ?? 60_000;
    const streamAbort = new AbortController();
    let abortReason: 'caller' | 'timeout' | undefined;
    const abortFromCaller = () => {
      abortReason = 'caller';
      streamAbort.abort();
    };
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      abortReason = 'timeout';
      streamAbort.abort();
    }, waitTimeout);
    const stream = this.eventsStream({
      groupId: options.groupId,
      by: options.listenAs,
      kinds: ['chat.message'],
      sinceTs: new Date().toISOString(),
      signal: streamAbort.signal,
    });
    let nextItem = stream.next();

    try {
      const sendResult = await this.send(options) as unknown as SendResult;
      const sentEventId = sendResult.event.id;
      while (true) {
        const { value: item, done } = await nextItem;
        if (abortReason === 'caller') {
          throw new Error('sendAndWaitForReply aborted');
        }
        if (abortReason === 'timeout') {
          throw new Error(`sendAndWaitForReply timed out after ${waitTimeout}ms`);
        }
        if (done) break;
        nextItem = stream.next();
        if (isStreamEvent(item) && item.event.kind === 'chat.message') {
          const data = item.event.data as Record<string, unknown>;
          if (data['reply_to'] === sentEventId) {
            return item.event;
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
      streamAbort.abort();
      await stream.return(undefined as unknown as EventStreamItem);
    }

    throw new Error('sendAndWaitForReply: stream ended without reply');
  },

  async inboxList(options) {
    return this.call('inbox_list', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      limit: options.limit ?? 50,
      kind_filter: options.kindFilter ?? 'all',
    });
  },

  async inboxMarkRead(groupId, actorId, eventId, by = 'user') {
    return this.call('inbox_mark_read', {
      group_id: groupId,
      actor_id: actorId,
      event_id: eventId,
      by,
    });
  },

  async inboxMarkAllRead(groupId, actorId, by = 'user', kindFilter = 'all') {
    return this.call('inbox_mark_all_read', {
      group_id: groupId,
      actor_id: actorId,
      by,
      kind_filter: kindFilter,
    });
  },

  async notifyAck(groupId, actorId, notifyEventId, by) {
    return this.call('notify_ack', {
      group_id: groupId,
      actor_id: actorId,
      notify_event_id: notifyEventId,
      by: by ?? actorId,
    });
  },
};

export function installChatOps(proto: ChatClient & Partial<ChatOps>): void {
  Object.assign(proto, chatOps);
}
