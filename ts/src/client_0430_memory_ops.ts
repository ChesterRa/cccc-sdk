import type {
  MemoryRemeCompactOptions,
  MemoryRemeContextCheckOptions,
  MemoryRemeDailyFlushOptions,
  MemoryRemeGetOptions,
  MemoryRemeIndexSyncOptions,
  MemoryRemeLayoutGetOptions,
  MemoryRemeSearchOptions,
  MemoryRemeWriteOptions,
} from './types.js';
import { compactRecord, type CCCC0430Client } from './client_0430_shared.js';

export interface CCCC0430MemoryOps {
  memoryRemeLayoutGet(options: MemoryRemeLayoutGetOptions): Promise<Record<string, unknown>>;
  memoryRemeIndexSync(options: MemoryRemeIndexSyncOptions): Promise<Record<string, unknown>>;
  memoryRemeSearch(options: MemoryRemeSearchOptions): Promise<Record<string, unknown>>;
  memoryRemeGet(options: MemoryRemeGetOptions): Promise<Record<string, unknown>>;
  memoryRemeContextCheck(options: MemoryRemeContextCheckOptions): Promise<Record<string, unknown>>;
  memoryRemeCompact(options: MemoryRemeCompactOptions): Promise<Record<string, unknown>>;
  memoryRemeDailyFlush(options: MemoryRemeDailyFlushOptions): Promise<Record<string, unknown>>;
  memoryRemeWrite(options: MemoryRemeWriteOptions): Promise<Record<string, unknown>>;
}

const memoryOps: CCCC0430MemoryOps & ThisType<CCCC0430Client> = {
  async memoryRemeLayoutGet(options) {
    return this.call('memory_reme_layout_get', { group_id: options.groupId });
  },

  async memoryRemeIndexSync(options) {
    return this.call('memory_reme_index_sync', compactRecord({
      group_id: options.groupId,
      mode: options.mode,
    }));
  },

  async memoryRemeSearch(options) {
    return this.call('memory_reme_search', compactRecord({
      group_id: options.groupId,
      query: options.query,
      max_results: options.maxResults,
      min_score: options.minScore,
      sources: options.sources,
      vector_weight: options.vectorWeight,
      candidate_multiplier: options.candidateMultiplier,
    }));
  },

  async memoryRemeGet(options) {
    return this.call('memory_reme_get', compactRecord({
      group_id: options.groupId,
      path: options.path,
      offset: options.offset,
      limit: options.limit,
    }));
  },

  async memoryRemeContextCheck(options) {
    return this.call('memory_reme_context_check', compactRecord({
      group_id: options.groupId,
      messages: options.messages,
      context_window_tokens: options.contextWindowTokens,
      reserve_tokens: options.reserveTokens,
      keep_recent_tokens: options.keepRecentTokens,
    }));
  },

  async memoryRemeCompact(options) {
    return this.call('memory_reme_compact', compactRecord({
      group_id: options.groupId,
      messages_to_summarize: options.messagesToSummarize,
      turn_prefix_messages: options.turnPrefixMessages,
      previous_summary: options.previousSummary,
      language: options.language,
      return_prompt: options.returnPrompt,
    }));
  },

  async memoryRemeDailyFlush(options) {
    return this.call('memory_reme_daily_flush', compactRecord({
      group_id: options.groupId,
      messages: options.messages,
      date: options.date,
      version: options.version,
      language: options.language,
      return_prompt: options.returnPrompt,
      signal_pack: options.signalPack,
      signal_pack_token_budget: options.signalPackTokenBudget,
      dedup_intent: options.dedupIntent,
      dedup_query: options.dedupQuery,
    }));
  },

  async memoryRemeWrite(options) {
    return this.call('memory_reme_write', compactRecord({
      group_id: options.groupId,
      target: options.target,
      content: options.content,
      date: options.date,
      mode: options.mode,
      idempotency_key: options.idempotencyKey,
      actor_id: options.actorId,
      source_refs: options.sourceRefs,
      tags: options.tags,
      supersedes: options.supersedes,
      dedup_intent: options.dedupIntent,
      dedup_query: options.dedupQuery,
    }));
  },
};

export function installCCCC0430MemoryOps(proto: CCCC0430Client & Partial<CCCC0430MemoryOps>): void {
  Object.assign(proto, memoryOps);
}
