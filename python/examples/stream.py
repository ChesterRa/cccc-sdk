from __future__ import annotations

import argparse
import json

from cccc_sdk import CCCCClient


def main() -> int:
    ap = argparse.ArgumentParser(description="Print events_stream items as they arrive.")
    ap.add_argument("--group", required=True, help="group_id to subscribe")
    ap.add_argument("--by", default="user", help="principal id (default: user)")
    args = ap.parse_args()

    c = CCCCClient()
    for item in c.events_stream(group_id=args.group, by=args.by):
        print(json.dumps(item, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

