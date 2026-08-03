import { compactRecord, type CCCC0430Client, type GroupScopedOptions } from './client_0430_shared.js';

type MemoryRemeReadOptions = {
  groupId?: string;
  actorId?: string;
  path?: string;
  target?: string;
  date?: string;
  offset?: number;
  limit?: number;
};

export interface CCCC0430MemoryOps {
  memoryRemeLayoutGet(options?: GroupScopedOptions): Promise<Record<string, unknown>>;
  memoryRemeSearch(options: {
    query: string;
    groupId?: string;
    actorId?: string;
    limit?: number;
    maxResults?: number;
    tags?: string[];
    target?: string;
    vectorWeight?: number;
  }): Promise<Record<string, unknown>>;
  memoryRemeGet(options: MemoryRemeReadOptions): Promise<Record<string, unknown>>;
  memoryRemeWrite(options: {
    target: string;
    content: string;
    groupId?: string;
    actorId?: string;
    tags?: string[];
    sourceRefs?: string[];
    idempotencyKey?: string;
    dedupIntent?: string;
    dedupQuery?: string;
    date?: string;
  }): Promise<Record<string, unknown>>;
  memoryRemeIndexSync(options?: GroupScopedOptions & { force?: boolean }): Promise<Record<string, unknown>>;
  memoryRemeContextCheck(options: GroupScopedOptions & { messages: Array<Record<string, unknown>> }): Promise<Record<string, unknown>>;
  memoryRemeCompact(options: GroupScopedOptions & { messages: Array<Record<string, unknown>>; returnPrompt?: boolean }): Promise<Record<string, unknown>>;
  memoryRemeDailyFlush(options?: GroupScopedOptions & { date?: string }): Promise<Record<string, unknown>>;
}

const memoryOps: CCCC0430MemoryOps & ThisType<CCCC0430Client> = {
  async memoryRemeLayoutGet(options = {}) {
    return this.call('memory_reme_layout_get', compactRecord({
      group_id: options.groupId,
      by: options.by,
    }));
  },

  async memoryRemeSearch(options) {
    return this.call('memory_reme_search', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      query: options.query,
      limit: options.limit,
      max_results: options.maxResults,
      tags: options.tags,
      target: options.target,
      vector_weight: options.vectorWeight,
    }));
  },

  async memoryRemeGet(options) {
    return this.call('memory_reme_get', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      path: options.path,
      target: options.target,
      date: options.date,
      offset: options.offset,
      limit: options.limit,
    }));
  },

  async memoryRemeWrite(options) {
    return this.call('memory_reme_write', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      target: options.target,
      content: options.content,
      tags: options.tags,
      source_refs: options.sourceRefs,
      idempotency_key: options.idempotencyKey,
      dedup_intent: options.dedupIntent,
      dedup_query: options.dedupQuery,
      date: options.date,
    }));
  },

  async memoryRemeIndexSync(options = {}) {
    return this.call('memory_reme_index_sync', compactRecord({
      group_id: options.groupId,
      by: options.by,
      force: options.force,
    }));
  },

  async memoryRemeContextCheck(options) {
    return this.call('memory_reme_context_check', compactRecord({
      group_id: options.groupId,
      by: options.by,
      messages: options.messages,
    }));
  },

  async memoryRemeCompact(options) {
    return this.call('memory_reme_compact', compactRecord({
      group_id: options.groupId,
      by: options.by,
      messages: options.messages,
      return_prompt: options.returnPrompt,
    }));
  },

  async memoryRemeDailyFlush(options = {}) {
    return this.call('memory_reme_daily_flush', compactRecord({
      group_id: options.groupId,
      by: options.by,
      date: options.date,
    }));
  },
};

export function installCCCC0430MemoryOps(proto: CCCC0430Client & Partial<CCCC0430MemoryOps>): void {
  Object.assign(proto, memoryOps);
}
