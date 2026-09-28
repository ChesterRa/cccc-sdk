import { it } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient } from '../src/index.js';
import type { VoiceDocumentLibraryUpdateOptions } from '../src/index.js';

it('maps library actions and preserves empty move destinations and ordering', async () => {
  const client = await CCCCClient.create({
    endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' },
  });
  const calls: Array<{ op: string; args?: Record<string, unknown> }> = [];
  const result = { folders: [], root_order: [], documents: [{ status: 'archived' }] };
  client.call = async (op, args) => { calls.push({ op, args }); return result; };
  assert.equal(await client.assistantVoiceDocumentLibrary({ groupId: 'g_1' }), result);
  assert.deepEqual(calls.pop(), { op: 'assistant_voice_document_library', args: { group_id: 'g_1' } });
  const cases: Array<[Omit<VoiceDocumentLibraryUpdateOptions, 'groupId'>, Record<string, unknown>]> = [
    [{ action: 'create_folder', name: 'Meetings' }, { action: 'create_folder', name: 'Meetings' }],
    [{ action: 'rename_folder', folderId: 'f_1', name: 'Archive' }, { action: 'rename_folder', folder_id: 'f_1', name: 'Archive' }],
    [{ action: 'remove_folder', folderId: 'f_1' }, { action: 'remove_folder', folder_id: 'f_1' }],
    [{ action: 'reorder_root', rootOrder: ['folder:f_1', 'document:notes.md'] }, { action: 'reorder_root', root_order: ['folder:f_1', 'document:notes.md'] }],
    [{ action: 'reorder_root', rootOrder: [] }, { action: 'reorder_root', root_order: [] }],
    [{ action: 'rename', documentPath: 'notes.md', name: 'Summary' }, { action: 'rename', document_path: 'notes.md', name: 'Summary' }],
    [{ action: 'move', documentPath: 'notes.md', folderId: '' }, { action: 'move', document_path: 'notes.md', folder_id: '' }],
    [{ action: 'restore', documentPath: 'notes.md' }, { action: 'restore', document_path: 'notes.md' }],
  ];
  for (const [input, expected] of cases) {
    assert.equal(await client.assistantVoiceDocumentLibraryUpdate({ groupId: 'g_1', by: 'foreman', ...input }), result);
    assert.deepEqual(calls.pop(), {
      op: 'assistant_voice_document_library_update', args: { group_id: 'g_1', by: 'foreman', ...expected },
    });
  }
  await client.assistantVoiceDocumentLibraryUpdate({ groupId: 'g_1', action: 'reorder_root', rootOrder: [] });
  assert.equal(calls.pop()?.args?.by, 'user');
});

it('does not retry or hide a document deletion failure', async () => {
  const client = await CCCCClient.create({ endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' } });
  let count = 0;
  const failure = new Error('voice_recording_active');
  client.call = async (op, args) => {
    count++;
    assert.equal(op, 'assistant_voice_document_delete');
    assert.deepEqual(args, { group_id: 'g_1', document_path: 'notes.md', by: 'user' });
    throw failure;
  };
  await assert.rejects(client.assistantVoiceDocumentDelete({ groupId: 'g_1', documentPath: 'notes.md' }), error => error === failure);
  assert.equal(count, 1);
});
