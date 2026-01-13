from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


class CCCCSDKError(Exception):
    """Base error for the CCCC client SDK."""


class DaemonUnavailableError(CCCCSDKError):
    """Raised when the daemon endpoint cannot be reached."""


@dataclass(frozen=True)
class DaemonAPIError(CCCCSDKError):
    """Raised when the daemon returns ok=false."""

    code: str
    message: str
    details: Dict[str, Any]
    raw: Optional[Dict[str, Any]] = None

    def __str__(self) -> str:
        base = f"{self.code}: {self.message}"
        if self.details:
            return f"{base} ({self.details})"
        return base


class IncompatibleDaemonError(CCCCSDKError):
    """Raised when the connected daemon does not satisfy SDK requirements."""
