import type { AgentRuntime, CCCCClient, VoiceDocumentLibraryResult, VoiceDocumentLibraryUpdateOptions } from '../src/index.js';

declare const client: CCCCClient;
const grok: Extract<AgentRuntime, 'grok_web_model'> = 'grok_web_model';
const deepseek: Extract<AgentRuntime, 'deepseek'> = 'deepseek';
void client.actorAdd({ groupId: 'g_1', runtime: grok });
void client.actorAdd({ groupId: 'g_1', runtime: deepseek });
const update: VoiceDocumentLibraryUpdateOptions = { groupId: 'g_1', action: 'move', documentPath: 'notes.md', folderId: '' };
const result: Promise<VoiceDocumentLibraryResult> = client.assistantVoiceDocumentLibraryUpdate(update);
void result;
void client.assistantVoiceDocumentLibrary({ groupId: 'g_1' });
void client.assistantVoiceDocumentDelete({ groupId: 'g_1', documentPath: 'notes.md', by: 'user' });
// @ts-expect-error Permanent deletion is a separate operation, not a library action.
void client.assistantVoiceDocumentLibraryUpdate({ groupId: 'g_1', action: 'delete', documentPath: 'notes.md' });
