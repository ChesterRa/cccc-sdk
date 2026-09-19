import type { CCCCClient, ConnectGroupRef, ConnectSendOptions, ConnectSendFilesOptions, ContextSyncOptions, TerminalHistoryOptions } from '../src/index.js';
declare const client: CCCCClient;
const send: ConnectSendOptions = { groupId: 'g', instanceId: 'i', targetGroupId: 'g2', clientId: 'key', text: '', mode: 'request_reply' };
const files: ConnectSendFilesOptions = { ...send, paths: ['README.md'] };
const ref: ConnectGroupRef = { kind: 'connect_group_ref', instance_id: 'i', group_id: 'g2', group_title: 'Team' };
const context: ContextSyncOptions = { groupId: 'g', ops: [], ifVersion: 'v' };
const terminal: TerminalHistoryOptions = { groupId: 'g', actorId: 'a', before: 40, renderBefore: 80 };
client.connectSend(send); client.connectSendFiles(files); client.contextSync(context); client.terminalHistory(terminal);
client.send({ groupId: 'g', text: 'Contact this Group', mode: 'send', refs: [ref] });
// @ts-expect-error A remote send always requires a caller-owned retry key.
const missingKey: ConnectSendOptions = { groupId: 'g', instanceId: 'i', targetGroupId: 'g2', text: '', mode: 'send' };
void missingKey;

// @ts-expect-error Runner is derived from the Runtime; it is not selectable.
client.actorAdd({ groupId: 'g', runtime: 'codex', runner: 'pty' });
