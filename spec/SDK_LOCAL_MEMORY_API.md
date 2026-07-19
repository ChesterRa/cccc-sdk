# SDK Local Memory API

This document describes the SDK-owned wrapper surface for CCCC local memory.
It is not one of the three mirrored CCCC standards files. The runtime source of
truth is `cccc.daemon.memory.memory_sdk_ops`; callers should also probe the
required operation names with `assert_compatible` / `assertCompatible`.

The surface below was verified against CCCC 0.4.32. Every operation is scoped
to one CCCC group, so `group_id` / `groupId` is required by both SDKs.

## First-class operations

### `memory_search`

Required arguments are `group_id` and `query`. Optional arguments are:

- `actor_id`
- `limit` or `max_results` (`max_results` wins when both are present)
- `vector_weight`, `candidate_multiplier`, and `min_score`
- `tags`
- `target`: `memory` or `daily`

The result contains `provider: "cccc-memory"`, `source: "local-index"`,
`latencyMs`, and normalized `hits`. The daemon reuses the ReMe index; it does
not maintain a second memory index.

### `memory_get`

Required argument: `group_id`. Select content with either an explicit `path`
or `target` (`memory` / `daily`) plus an optional `date`. `offset` and `limit`
control the returned slice.

The result contains `provider`, `source: "local-file"`, `latencyMs`, `path`,
`offset`, `limit`, and `content`.

### `memory_write`

Required arguments are `group_id`, `target` (`memory` or `daily`), and
`content`. Optional metadata includes `actor_id`, `tags`, `source_refs`,
`idempotency_key`, `dedup_intent`, and `dedup_query`.

Use a stable `idempotency_key` in polling or retrying workers. The result
reports `status` (`written` or `silent`), `path`, and deduplication metadata.

### `memory_profile_get`

Required argument: `group_id`. Optional `actor_id`, `user_id`, and `tags` are
used to build a profile-oriented local-memory query. The result contains the
joined `profile` text and its underlying hits.

### `memory_health`

Required argument: `group_id`. The result reports `status`, `indexReady`,
`writable`, and `memoryRoot`, plus optional index timing/error details.

Common mapped errors include `memory_group_missing`, `memory_index_missing`,
`memory_write_failed`, and `memory_permission_denied`.

## Lower-level ReMe compatibility

Before the first-class operations were added, the SDK methods named
`memory_search` and `memory_get` called `memory_reme_search` and
`memory_reme_get`. The first-class methods now map to their matching daemon op
names. Callers that need raw ReMe result shapes or `sources` control should use
the explicit compatibility methods:

- Python: `memory_reme_search(...)`, `memory_reme_get(...)`
- TypeScript: `memoryRemeSearch(...)`, `memoryRemeGet(...)`

This explicit split avoids silently routing one public method to different
daemon operations based on which optional fields happen to be present.
