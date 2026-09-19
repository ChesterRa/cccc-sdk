"""Mutating smoke for an explicitly supplied, disposable CCCC_HOME only."""
import os
import sys
import tempfile
from pathlib import Path

from cccc_sdk import CCCCClient
from cccc_sdk.errors import DaemonAPIError, IncompatibleDaemonError

assert os.environ.get('CCCC_HOME'), 'Run only against an isolated CCCC_HOME'
c = CCCCClient()
g = c.group_create(title='SDK release fixture')['group']['group_id']
c.group_set_state(group_id=g, state='paused')
with tempfile.TemporaryDirectory(prefix='cccc-sdk-project-') as folder:
    c.attach(group_id=g, path=folder)
    # Paused Group: this command is never started and no provider is contacted.
    c.actor_add(group_id=g, actor_id='fixture', runtime='custom', command=[sys.executable, '-c', 'pass'])
    event = c.send(group_id=g, text='release mail', message_mode='mail', to=['fixture'])['event']
    c.inbox_read(group_id=g, actor_id='fixture')
    c.reply(group_id=g, reply_to=event['id'], text='reply', by='fixture')
    path = Path(folder) / 'file.txt'
    path.write_text('SDK artifact fixture')
    c.send_files(group_id=g, paths=[str(path)], message_mode='mail', to=['fixture'])
    c.connect_catalog(group_id=g)
    try:
        c.context_sync(group_id=g, by='user', if_version='stale', ops=[{'op': 'coordination.brief.update', 'objective': 'must not persist'}])
    except DaemonAPIError as error:
        assert error.code == 'version_conflict'
    else:
        raise AssertionError('stale context accepted')
    try:
        c.assert_compatible(require_ops=['connect_direct_configure'])
    except IncompatibleDaemonError:
        pass
    else:
        raise AssertionError('unsafe operation falsely verified')
print('Installed Python artifact: Actor, Mail, reply, files, catalog, conflict and safe probes passed')
