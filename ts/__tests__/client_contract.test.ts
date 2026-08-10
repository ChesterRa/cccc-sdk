import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient } from '../src/client.js';
import { DaemonAPIError, IncompatibleDaemonError } from '../src/errors.js';

async function captureCall(
  invoke: (client: CCCCClient) => Promise<unknown>
): Promise<{ op: string; args: Record<string, unknown> }> {
  const client = await CCCCClient.create({
    endpoint: { transport: 'tcp', host: '127.0.0.1', port: 9, path: '' },
  });
  let captured: { op: string; args: Record<string, unknown> } | undefined;
  client.callRaw = async (op: string, args?: Record<string, unknown>) => {
    captured = { op, args: args ?? {} };
    return { ok: true, result: {} };
  };

  await invoke(client);

  assert.ok(captured, 'expected a daemon call to be captured');
  return captured;
}

describe('CCCCClient newer CCCC operation wrappers', () => {
  it('trackedSend maps to tracked_send with task metadata', async () => {
    const call = await captureCall((client) => client.trackedSend({
      groupId: 'g1',
      title: 'Update SDK',
      text: 'please handle',
      outcome: 'all tests pass',
      assignee: 'peer-impl',
      checklist: [{ text: 'write tests', status: 'pending' }],
      by: 'user',
      to: ['peer-impl'],
      priority: 'attention',
      replyRequired: true,
      waitingOn: 'actor',
      insight: 'This task closes the release gap.',
      requirePeerInsight: true,
    }));

    assert.equal(call.op, 'tracked_send');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      title: 'Update SDK',
      text: 'please handle',
      outcome: 'all tests pass',
      assignee: 'peer-impl',
      checklist: [{ text: 'write tests', status: 'pending' }],
      by: 'user',
      to: ['peer-impl'],
      priority: 'attention',
      reply_required: true,
      waiting_on: 'actor',
      insight: 'This task closes the release gap.',
      require_peer_insight: true,
    });
  });

  it('trackedSend defaults reply_required to true', async () => {
    const call = await captureCall((client) => client.trackedSend({
      groupId: 'g1',
      title: 'Review SDK',
      text: 'please review',
    }));

    assert.equal(call.op, 'tracked_send');
    assert.equal(call.args.reply_required, true);
  });

  it('coordinationBriefUpdate emits context_sync coordination.brief.update', async () => {
    const call = await captureCall((client) => client.coordinationBriefUpdate({
      groupId: 'g1',
      by: 'foreman',
      objective: 'ship',
      currentFocus: 'compat',
      constraints: ['no regressions'],
      projectBrief: 'sdk',
      projectBriefStale: false,
      dryRun: true,
    }));

    assert.equal(call.op, 'context_sync');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      by: 'foreman',
      dry_run: true,
      ops: [{
        op: 'coordination.brief.update',
        objective: 'ship',
        current_focus: 'compat',
        constraints: ['no regressions'],
        project_brief: 'sdk',
        project_brief_stale: false,
      }],
    });
  });

  it('taskMove emits context_sync task.move', async () => {
    const call = await captureCall((client) => client.taskMove({
      groupId: 'g1',
      taskId: 't1',
      status: 'done',
      by: 'foreman',
    }));

    assert.equal(call.op, 'context_sync');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      by: 'foreman',
      dry_run: false,
      ops: [{ op: 'task.move', task_id: 't1', status: 'done' }],
    });
  });

  it('taskDelete emits context_sync task.delete', async () => {
    const call = await captureCall((client) => client.taskDelete({
      groupId: 'g1',
      taskId: 't-planned',
      by: 'foreman',
      dryRun: true,
    }));

    assert.equal(call.op, 'context_sync');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      by: 'foreman',
      dry_run: true,
      ops: [{ op: 'task.delete', task_id: 't-planned' }],
    });
  });

  it('agentStateUpdate emits context_sync agent_state.update', async () => {
    const call = await captureCall((client) => client.agentStateUpdate({
      groupId: 'g1',
      actorId: 'peer-impl',
      focus: 'coding',
      blockers: [],
      by: 'peer-impl',
    }));

    assert.equal(call.op, 'context_sync');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      by: 'peer-impl',
      dry_run: false,
      ops: [{
        op: 'agent_state.update',
        actor_id: 'peer-impl',
        focus: 'coding',
        blockers: [],
      }],
    });
  });

  it('capabilitySearch maps camelCase options to daemon snake_case', async () => {
    const call = await captureCall((client) => client.capabilitySearch({
      query: 'docs',
      groupId: 'g1',
      actorId: 'foreman',
      includeExternal: true,
      trustTier: 'local',
      limit: 5,
    }));

    assert.equal(call.op, 'capability_search');
    assert.deepEqual(call.args, {
      query: 'docs',
      group_id: 'g1',
      actor_id: 'foreman',
      by: 'user',
      include_external: true,
      trust_tier: 'local',
      limit: 5,
    });
  });

  it('memorySearch maps to first-class memory_search', async () => {
    const call = await captureCall((client) => client.memorySearch({
      groupId: 'g1',
      actorId: 'worker',
      query: 'recent decisions',
      limit: 3,
      maxResults: 7,
      vectorWeight: 0.6,
      candidateMultiplier: 4,
      minScore: 0.2,
      tags: ['reply-style'],
      target: 'memory',
    }));

    assert.equal(call.op, 'memory_search');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      actor_id: 'worker',
      query: 'recent decisions',
      limit: 3,
      max_results: 7,
      vector_weight: 0.6,
      candidate_multiplier: 4,
      min_score: 0.2,
      tags: ['reply-style'],
      target: 'memory',
    });
  });

  it('memoryGet maps to first-class memory_get with path pagination', async () => {
    const call = await captureCall((client) => client.memoryGet({
      groupId: 'g1',
      actorId: 'worker',
      path: 'state/memory/MEMORY.md',
      offset: 10,
      limit: 25,
    }));

    assert.equal(call.op, 'memory_get');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      actor_id: 'worker',
      path: 'state/memory/MEMORY.md',
      offset: 10,
      limit: 25,
    });
  });

  it('memoryWrite maps to first-class memory_write', async () => {
    const call = await captureCall((client) => client.memoryWrite({
      groupId: 'g1',
      actorId: 'worker',
      target: 'daily',
      content: 'user: hi\nassistant: hello',
      tags: ['dingtalk-auto-reply'],
      sourceRefs: ['message:m1'],
      idempotencyKey: 'reply:m1',
      dedupIntent: 'update',
      dedupQuery: 'message m1',
    }));

    assert.equal(call.op, 'memory_write');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      actor_id: 'worker',
      target: 'daily',
      content: 'user: hi\nassistant: hello',
      tags: ['dingtalk-auto-reply'],
      source_refs: ['message:m1'],
      idempotency_key: 'reply:m1',
      dedup_intent: 'update',
      dedup_query: 'message m1',
    });
  });

  it('memoryHealth maps to first-class memory_health', async () => {
    const call = await captureCall((client) => client.memoryHealth({ groupId: 'g1' }));

    assert.equal(call.op, 'memory_health');
    assert.deepEqual(call.args, { group_id: 'g1' });
  });

  it('memoryProfileGet maps to tagged memory_profile_get', async () => {
    const call = await captureCall((client) => client.memoryProfileGet({
      groupId: 'g1',
      actorId: 'worker',
      userId: 'waterbang',
      tags: ['dingtalk-profile', 'reply-style'],
    }));

    assert.equal(call.op, 'memory_profile_get');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      actor_id: 'worker',
      user_id: 'waterbang',
      tags: ['dingtalk-profile', 'reply-style'],
    });
  });

  it('explicit ReMe helpers preserve low-level controls', async () => {
    const search = await captureCall((client) => client.memoryRemeSearch({
      groupId: 'g1',
      query: 'recent decisions',
      maxResults: 3,
      vectorWeight: 0.6,
      candidateMultiplier: 4,
      minScore: 0.2,
      sources: ['memory'],
    }));
    assert.equal(search.op, 'memory_reme_search');
    assert.deepEqual(search.args, {
      group_id: 'g1',
      query: 'recent decisions',
      max_results: 3,
      vector_weight: 0.6,
      candidate_multiplier: 4,
      min_score: 0.2,
      sources: ['memory'],
    });

    const get = await captureCall((client) => client.memoryRemeGet({
      groupId: 'g1',
      path: 'state/memory/MEMORY.md',
      offset: 10,
      limit: 25,
    }));
    assert.equal(get.op, 'memory_reme_get');
    assert.deepEqual(get.args, {
      group_id: 'g1',
      path: 'state/memory/MEMORY.md',
      offset: 10,
      limit: 25,
    });
  });

  it('capabilityUse enables before optional tool call and uses daemon arguments field', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 9, path: '' },
    });
    const calls: Array<{ op: string; args: Record<string, unknown> }> = [];
    client.callRaw = async (op: string, args?: Record<string, unknown>) => {
      calls.push({ op, args: args ?? {} });
      return { ok: true, result: {} };
    };

    await client.capabilityUse({
      groupId: 'g1',
      actorId: 'foreman',
      capabilityId: 'cap.docs',
      toolName: 'docs_search',
      toolArguments: { q: 'memory' },
      scope: 'session',
      by: 'foreman',
    });

    assert.deepEqual(calls, [
      {
        op: 'capability_enable',
        args: {
          capability_id: 'cap.docs',
          group_id: 'g1',
          actor_id: 'foreman',
          by: 'foreman',
          scope: 'session',
          enabled: true,
          cleanup: false,
        },
      },
      {
        op: 'capability_tool_call',
        args: {
          group_id: 'g1',
          actor_id: 'foreman',
          by: 'foreman',
          tool_name: 'docs_search',
          arguments: { q: 'memory' },
        },
      },
    ]);
  });

  it('capabilityUse without toolName returns the enable result', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 9, path: '' },
    });
    const calls: Array<{ op: string; args: Record<string, unknown> }> = [];
    client.callRaw = async (op: string, args?: Record<string, unknown>) => {
      calls.push({ op, args: args ?? {} });
      return { ok: true, result: { state: 'runnable' } };
    };

    const result = await client.capabilityUse({
      groupId: 'g1',
      capabilityId: 'cap.docs',
    });

    assert.deepEqual(result, { state: 'runnable' });
    assert.deepEqual(calls, [{
      op: 'capability_enable',
      args: {
        group_id: 'g1',
        capability_id: 'cap.docs',
        scope: 'session',
        enabled: true,
        cleanup: false,
        by: 'user',
      },
    }]);
  });

  it('sendAndWaitForReply starts the event stream before sending', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 9, path: '' },
    });
    const order: string[] = [];
    client.callRaw = async (op) => {
      assert.equal(op, 'events_stream');
      order.push('probe');
      return { ok: true, result: {} };
    };
    client.eventsStream = async function* () {
      order.push('stream-start');
      yield {
        t: 'event',
        event: {
          id: 'reply-1',
          ts: '2026-05-17T00:00:00Z',
          kind: 'chat.message',
          group_id: 'g1',
          data: { text: 'ok', reply_to: 'sent-1' },
        },
      };
    };
    client.send = async () => {
      order.push('send');
      return {
        event: {
          id: 'sent-1',
          ts: '2026-05-17T00:00:00Z',
          kind: 'chat.message',
          group_id: 'g1',
          data: { text: 'question' },
        },
        ack_event: null,
      };
    };

    const reply = await client.sendAndWaitForReply({
      groupId: 'g1',
      listenAs: 'user',
      text: 'question',
    });

    assert.equal(reply.id, 'reply-1');
    assert.deepEqual(order, ['probe', 'stream-start', 'send']);
  });

  it('sendAndWaitForReply does not send when events_stream is unavailable', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 9, path: '' },
    });
    let sent = false;
    client.callRaw = async () => {
      throw new DaemonAPIError('unknown_op', 'unknown operation: events_stream');
    };
    client.send = async () => {
      sent = true;
      return {};
    };

    await assert.rejects(
      client.sendAndWaitForReply({ groupId: 'g1', listenAs: 'user', text: 'question' }),
      DaemonAPIError
    );
    assert.equal(sent, false);
  });

  it('sendAndWaitForReply enforces its timeout while the stream is quiet', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 9, path: '' },
    });
    client.callRaw = async () => ({ v: 1, ok: true, result: {} });
    client.eventsStream = async function* (options) {
      await new Promise<void>((resolve) => {
        options.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
    };
    client.send = async () => ({
      event: {
        id: 'sent-1',
        ts: '2026-08-08T00:00:00Z',
        kind: 'chat.message',
        group_id: 'g1',
        data: { text: 'question' },
      },
      ack_event: null,
    });

    await assert.rejects(
      client.sendAndWaitForReply({
        groupId: 'g1',
        listenAs: 'user',
        text: 'question',
        waitTimeoutMs: 20,
      }),
      /timed out after 20ms/,
    );
  });

  it('assertCompatible probes events_stream instead of trusting the capability flag', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 9, path: '' },
    });
    client.ping = async () => ({ ipc_v: 1, capabilities: { events_stream: true } });
    client.callRaw = async (op) => {
      assert.equal(op, 'events_stream');
      throw new DaemonAPIError('unknown_op', 'unknown operation: events_stream');
    };

    await assert.rejects(
      client.assertCompatible({ requireOps: ['events_stream'] }),
      IncompatibleDaemonError
    );
  });
});
