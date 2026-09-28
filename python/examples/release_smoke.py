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

    # Metadata changes retain Markdown paths; archive/restore differs from delete.
    document = 'notes/sdk.md'
    c.assistant_voice_document_save(group_id=g, document_path=document, content='# SDK fixture')
    library = c.assistant_voice_document_library_update(group_id=g, action='create_folder', name='Meetings')
    folder_id = library['folders'][0]['folder_id']
    c.assistant_voice_document_library_update(group_id=g, action='rename_folder', folder_id=folder_id, name='Notes')
    c.assistant_voice_document_library_update(group_id=g, action='rename', document_path=document, name='Summary')
    c.assistant_voice_document_library_update(group_id=g, action='move', document_path=document, folder_id=folder_id)
    c.assistant_voice_document_archive(group_id=g, document_path=document)
    library = c.assistant_voice_document_library(group_id=g)
    assert library['documents'][0]['status'] == 'archived'
    assert (Path(folder) / document).read_text() == '# SDK fixture'
    library = c.assistant_voice_document_library_update(group_id=g, action='restore', document_path=document)
    assert library['documents'][0]['folder_id'] == folder_id
    assert library['documents'][0]['status'] == 'active'
    c.assistant_voice_document_library_update(group_id=g, action='move', document_path=document, folder_id='')
    order = [f'folder:{folder_id}', f'document:{document}']
    library = c.assistant_voice_document_library_update(group_id=g, action='reorder_root', root_order=order)
    assert library['root_order'] == order
    library = c.assistant_voice_document_library_update(group_id=g, action='reorder_root', root_order=[])
    assert library['root_order'] == []
    c.assistant_voice_document_library_update(group_id=g, action='remove_folder', folder_id=folder_id)
    deleted = c.assistant_voice_document_delete(group_id=g, document_path=document)
    assert deleted['event']['data']['action'] == 'deleted'
    assert not (Path(folder) / document).exists()
    assert c.assistant_voice_document_library(group_id=g)['documents'] == []
    try:
        c.assistant_voice_document_library_update(group_id=g, action='restore', document_path=document)
    except DaemonAPIError:
        pass
    else:
        raise AssertionError('permanently deleted document restored')

    # Persist runtime configuration only; the paused Group starts no provider/browser.
    for actor_id, runtime in [('chat1', 'web_model'), ('chat2', 'web_model'), ('bot', 'grok_web_model')]:
        actor = c.actor_add(group_id=g, actor_id=actor_id, runtime=runtime)['actor']
        assert actor['runtime'] == runtime and actor['runner'] == 'headless'
    assert c.group_show(group_id=g)['group']['state'] == 'paused'
print('Installed Python artifact: messaging, files, conflicts, safe probes, Voice library lifecycle and Web Model configuration passed')
