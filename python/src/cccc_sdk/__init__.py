from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

from .client import CCCCClient
from .errors import CCCCSDKError, DaemonAPIError, DaemonUnavailableError, IncompatibleDaemonError


def _detect_version() -> str:
    try:
        return version("cccc-sdk")
    except PackageNotFoundError:
        return "0.0.0"


__version__ = _detect_version()

__all__ = [
    "CCCCClient",
    "CCCCSDKError",
    "DaemonAPIError",
    "DaemonUnavailableError",
    "IncompatibleDaemonError",
    "__version__",
]
