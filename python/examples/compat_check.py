from __future__ import annotations

import json

from cccc_sdk import CCCCClient


def main() -> int:
    c = CCCCClient()
    daemon = c.ping()
    implementation = str(daemon.get("implementation") or "")
    required_ops = [
        "groups",
        "group_show",
        "group_preamble_get",
        "group_preamble_set",
        "group_preamble_reset",
        "send",
        "send_files",
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
        "term_resize",
        "web_model_delivery_preferences_get",
        "web_model_delivery_preferences_update",
        "web_model_runtime_recover_turn",
    ]
    if implementation == "rust":
        required_ops.extend(["terminal_since", "terminal_snapshot"])
    info = c.assert_compatible(
        require_ipc_v=1,
        require_ops=required_ops,
    )
    print(json.dumps({"ok": True, "daemon": info}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
