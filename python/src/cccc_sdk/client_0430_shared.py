from __future__ import annotations

from typing import Any, Dict


def _compact(args: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in args.items() if v is not None}
