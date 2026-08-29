import type {
  CCCSEvent,
  EventStreamItem,
  InboxOptions,
  MessageHistoryOptions,
  MessageDeliverOptions,
  ReplyOptions,
  ReplyRequestCancelOptions,
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
  replyRequestCancel(options: ReplyRequestCancelOptions): Promise<Record<string, unknown>>;
  messageDeliver(options: MessageDeliverOptions): Promise<Record<string, unknown>>;
  sendAndWaitForReply(options: SendAndWaitOptions): Promise<CCCSEvent>;
  inboxPeek(options: InboxOptions): Promise<Record<string, unknown>>;
  inboxRead(options: InboxOptions): Promise<Record<string, unknown>>;
  messageHistory(options: MessageHistoryOptions): Promise<Record<string, unknown>>;
}

const chatOps: ChatOps & ThisType<ChatClient & ChatOps> = {
  async send(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      text: options.text,
      by: options.by ?? 'user',
      message_mode: options.mode,
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
      message_mode: options.mode,
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
      message_mode: options.mode,
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
      message_mode: options.mode ?? 'send',
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

  async replyRequestCancel(options) {
    return this.call('reply_request_cancel', {
      group_id: options.groupId,
      source_event_id: options.sourceEventId,
      by: options.by ?? 'user',
    });
  },

  async messageDeliver(options) {
    const actorIds = Array.isArray(options.actorIds)
      ? options.actorIds.map((actorId) => String(actorId).trim())
      : [];
    if (actorIds.length === 0 || actorIds.some((actorId) => actorId.length === 0)) {
      throw new DaemonAPIError('invalid_args', 'messageDeliver requires one or more non-empty actorIds', {});
    }
    return this.call('message_deliver', {
      group_id: options.groupId,
      source_event_id: options.sourceEventId,
      actor_ids: actorIds,
      by: options.by ?? 'user',
      force_ambiguous: options.forceAmbiguous ?? false,
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
      const sendResult = await this.send({ ...options, mode: 'request_reply' }) as unknown as SendResult;
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

  async inboxPeek(options) {
    return this.call('inbox_peek', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      limit: options.limit ?? 50,
    });
  },

  async inboxRead(options) {
    return this.call('inbox_read', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      limit: options.limit ?? 50,
    });
  },

  async messageHistory(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      mode: options.mode ?? 'all',
      limit: options.limit ?? 50,
    };
    if (options.query) args['query'] = options.query;
    if (options.beforeEventId) args['before_event_id'] = options.beforeEventId;
    return this.call('message_history', args);
  },
};

export function installChatOps(proto: ChatClient & Partial<ChatOps>): void {
  Object.assign(proto, chatOps);
}
