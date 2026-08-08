from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


class CCCCSDKError(Exception):
    """Base error for the CCCC client SDK."""


class DaemonUnavailableError(CCCCSDKError):
    """Raised when the daemon endpoint cannot be reached."""


class DaemonConnectionError(DaemonUnavailableError):
    """Connection failed before any request bytes were sent.

    Clients may safely rediscover the endpoint and retry this specific failure.
    """


class OutcomeUnknownError(DaemonUnavailableError):
    """Exchange began, but the daemon result could not be determined."""

    def __init__(self, *, op: str, message: str) -> None:
        self.op = str(op)
        self.reason = str(message)
        super().__init__(f"daemon request outcome is unknown for {self.op}: {self.reason}")


class RequestTooLargeError(CCCCSDKError):
    """The encoded request exceeds the daemon IPC line limit."""


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
