from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

from .client import CCCCClient
from .client_chat_ops import MessageHistoryMode, MessageMode, ReplyMessageMode
from .errors import (
    CCCCSDKError,
    DaemonAPIError,
    DaemonConnectionError,
    DaemonUnavailableError,
    IncompatibleDaemonError,
    OutcomeUnknownError,
    RequestTooLargeError,
)


def _detect_version() -> str:
    try:
        return version("cccc-sdk")
    except PackageNotFoundError:
        return "0.0.0"


__version__ = _detect_version()

__all__ = [
    "CCCCClient",
    "MessageMode",
    "ReplyMessageMode",
    "MessageHistoryMode",
    "CCCCSDKError",
    "DaemonAPIError",
    "DaemonConnectionError",
    "DaemonUnavailableError",
    "IncompatibleDaemonError",
    "OutcomeUnknownError",
    "RequestTooLargeError",
    "__version__",
]
