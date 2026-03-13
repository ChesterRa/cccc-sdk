from __future__ import annotations

import argparse
import json

from cccc_sdk import CCCCClient


def main() -> int:
    ap = argparse.ArgumentParser(description="Add a coordination note to group context via context_sync.")
    ap.add_argument("--group", required=True, help="group_id")
    ap.add_argument("--content", required=True, help="note summary")
    ap.add_argument("--kind", choices=("decision", "handoff"), default="decision", help="coordination note kind")
    ap.add_argument("--by", default="system", help="principal id used for the context.sync ledger signal")
    args = ap.parse_args()

    c = CCCCClient()
    res = c.context_sync(
        group_id=args.group,
        by=args.by,
        ops=[{"op": "coordination.note.add", "kind": args.kind, "summary": args.content}],
    )
    print(json.dumps(res, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
