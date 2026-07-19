from __future__ import annotations

import json

from cccc_sdk import CCCCClient


def main() -> int:
    c = CCCCClient()
    info = c.assert_compatible(
        require_ipc_v=1,
        require_capabilities={"events_stream": True},
        require_ops=[
            "groups",
            "group_show",
            "send",
            "reply",
            "inbox_list",
            "inbox_mark_read",
            "inbox_mark_all_read",
            "context_get",
            "context_sync",
            "chat_ack",
            "notify_ack",
            "send_cross_group",
            "memory_search",
            "memory_get",
            "memory_write",
            "memory_profile_get",
            "memory_health",
            "actor_new_session",
            "group_reset",
            "group_copy_export_file",
            "terminal_history",
        ],
    )
    print(json.dumps({"ok": True, "daemon": info}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
