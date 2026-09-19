import unittest
from unittest.mock import Mock

from cccc_sdk import CCCCClient
from cccc_sdk.errors import IncompatibleDaemonError, OutcomeUnknownError
from cccc_sdk.transport import DaemonEndpoint


class ConnectContractTests(unittest.TestCase):
    def setUp(self):
        self.client = CCCCClient(endpoint=DaemonEndpoint(transport='tcp', host='127.0.0.1', port=1))
        self.client.call = Mock(return_value={'accepted': True, 'delivery_state': 'pending'})
        self.send = dict(group_id='local', instance_id='peer', target_group_id='remote',
                         client_id='caller-key', text='hello', message_mode='mail')

    def test_qualified_target_mode_and_key_survive_uncertain_outcome(self):
        self.client.call.side_effect = [OutcomeUnknownError(op='connect_send', message='closed'), {'accepted': True}]
        with self.assertRaises(OutcomeUnknownError):
            self.client.connect_send(**self.send)
        self.assertEqual(self.client.call.call_count, 1)
        self.client.connect_send(**self.send)
        self.assertEqual(self.client.call.call_args_list[0], self.client.call.call_args_list[1])
        self.assertEqual(self.client.call.call_args.args, ('connect_send', {**self.send, 'by': 'user'}))

    def test_file_retry_does_not_read_client_files(self):
        args = {k:v for k,v in self.send.items() if k != 'text'}
        self.client.connect_send_files(**args, paths=['missing-on-client.txt'])
        self.assertEqual(self.client.call.call_args.args[1]['paths'], ['missing-on-client.txt'])

    def test_utf8_key_limit_and_empty_paths_fail_before_ipc(self):
        for key in ['', ' ', '界' * 43]:
            with self.assertRaises(ValueError):
                self.client.connect_send(**{**self.send, 'client_id': key})
        with self.assertRaises(ValueError):
            self.client.connect_send_files(**self.send, paths=[])
        self.client.call.assert_not_called()

    def test_actor_runtime_determines_runner(self):
        self.client.actor_add(group_id="local", actor_id="agent", runtime="custom", command=["true"])
        self.assertNotIn("runner", self.client.call.call_args.args[1])

    def test_catalog_context_and_terminal_cursors(self):
        self.client.connect_catalog(group_id='local', instance_id='peer', target_group_id='remote', after='cursor', limit=2)
        self.assertEqual(self.client.call.call_args.args[1]['target_group_id'], 'remote')
        self.client.context_sync(group_id='local', ops=[], if_version='version')
        self.assertEqual(self.client.call.call_args.args[1]['if_version'], 'version')
        self.client.terminal_history(group_id='local', actor_id='agent', before=40, render_before=100)
        self.assertEqual(self.client.call.call_args.args[1]['render_before'], 100)

    def test_capability_failure_and_unprobeable_support_are_explicit(self):
        self.client.call_raw = Mock(return_value={'result': {'ipc_v': 1, 'capabilities': {'term_attach': False}}})
        with self.assertRaisesRegex(IncompatibleDaemonError, 'does not support'):
            self.client.assert_compatible(require_ops=['term_attach'])
        self.assertEqual(self.client.call_raw.call_count, 1)
        self.client.call_raw.return_value['result']['capabilities']['term_attach'] = True
        self.client.assert_compatible(require_ops=['term_attach'])
        self.assertEqual(self.client.call_raw.call_count, 2)
