from __future__ import annotations

from typing import Any, Dict, Optional


class GroupSpaceProviderOpsMixin:
    def group_space_provider_credential_status(self, *, provider: str = "notebooklm", by: str = "user") -> Dict[str, Any]:
        return self.call("group_space_provider_credential_status", {"provider": str(provider), "by": str(by)})

    def group_space_provider_credential_update(
        self,
        *,
        provider: str = "notebooklm",
        by: str = "user",
        auth_json: str = "",
        clear: bool = False,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"provider": str(provider), "by": str(by), "clear": bool(clear)}
        if auth_json:
            args["auth_json"] = str(auth_json)
        return self.call("group_space_provider_credential_update", args)

    def group_space_provider_health_check(
        self,
        *,
        provider: str = "notebooklm",
        by: str = "user",
        auth_json: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"provider": str(provider), "by": str(by)}
        if auth_json:
            args["auth_json"] = str(auth_json)
        return self.call("group_space_provider_health_check", args)

    def group_space_provider_auth(
        self,
        *,
        provider: str = "notebooklm",
        action: str = "status",
        timeout_seconds: Optional[int] = None,
        projected: Optional[bool] = None,
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"provider": str(provider), "action": str(action), "by": str(by)}
        if timeout_seconds is not None:
            args["timeout_seconds"] = int(timeout_seconds)
        if projected is not None:
            args["projected"] = bool(projected)
        return self.call("group_space_provider_auth", args)
