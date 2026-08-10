import type { CCCCClient } from '../src/index.js';

declare const client: CCCCClient;

void client.assistantVoiceDocumentInstruction({
  groupId: 'g_1',
  documentPath: 'notes/meeting.md',
  requestId: 'voice-ask-1',
  inputAppendId: 'voice-input-1',
  instruction: 'Tighten the summary',
});

void client.assistantVoiceInputAppend({
  groupId: 'g_1',
  kind: 'voice_instruction',
  requestId: 'voice-ask-2',
  inputAppendId: 'voice-input-2',
  instruction: 'Check the latest summary',
  text: 'Include omissions',
  sourceText: 'Current meeting notes',
});

void client.imRevokeChat({
  groupId: 'g_1',
  chatId: 'chat-1',
  threadId: '1710000000.100',
});

void client.systemNotify({
  groupId: 'g_1',
  priority: 'urgent',
  imVisibility: 'public',
});

void client.groupSpaceProviderHealthCheck({ authJson: '{"cookies":[]}' });
void client.groupSpaceProviderAuth({ action: 'disconnect', projected: true });
void client.taskDelete({ groupId: 'g_1', taskId: 't-planned', dryRun: true });
