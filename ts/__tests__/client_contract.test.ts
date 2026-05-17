import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient } from '../src/client.js';

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
      include_external: true,
      trust_tier: 'local',
      limit: 5,
    });
  });

  it('memorySearch maps to memory_reme_search', async () => {
    const call = await captureCall((client) => client.memorySearch({
      groupId: 'g1',
      query: 'recent decisions',
      limit: 3,
      vectorWeight: 0.2,
    }));

    assert.equal(call.op, 'memory_reme_search');
    assert.deepEqual(call.args, {
      group_id: 'g1',
      query: 'recent decisions',
      max_results: 3,
      vector_weight: 0.2,
    });
  });

  it('memoryGet maps to memory_reme_get with path pagination', async () => {
    const call = await captureCall((client) => client.memoryGet({
      groupId: 'g1',
      path: 'state/memory/MEMORY.md',
      offset: 10,
      limit: 25,
    }));

    assert.equal(call.op, 'memory_reme_get');
    assert.deepEqual(call.args, {
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
      args: { capability_id: 'cap.docs', group_id: 'g1' },
    }]);
  });

  it('sendAndWaitForReply starts the event stream before sending', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 9, path: '' },
    });
    const order: string[] = [];
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
    assert.deepEqual(order, ['stream-start', 'send']);
  });
});
