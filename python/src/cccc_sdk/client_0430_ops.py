from __future__ import annotations

from .client_0430_admin_ops import CCCC0430AdminOpsMixin
from .client_0430_assistant_ops import CCCC0430AssistantOpsMixin


class CCCC0430OpsMixin(
    CCCC0430AdminOpsMixin,
    CCCC0430AssistantOpsMixin,
):
    pass
