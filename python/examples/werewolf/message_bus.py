"""Message bus abstraction for standalone and SDK modes."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
from collections import defaultdict


@dataclass
class Message:
    """Message."""

    sender: str
    content: str
    recipients: Optional[list] = None  # None = broadcast
    msg_type: str = "chat"


class MessageBus(ABC):
    """Abstract base class for message bus."""

    @abstractmethod
    def send(self, sender: str, content: str, recipients: Optional[list] = None):
        """Send message."""
        pass

    @abstractmethod
    def get_messages(self, recipient: str) -> list:
        """Get messages visible to a recipient."""
        pass

    @abstractmethod
    def broadcast(self, sender: str, content: str):
        """Broadcast message."""
        pass


class StandaloneMessageBus(MessageBus):
    """Standalone message bus backed by in-memory queues."""

    def __init__(self):
        self.messages: list = []
        self.private_messages: dict = defaultdict(list)

    def send(self, sender: str, content: str, recipients: Optional[list] = None):
        msg = Message(sender=sender, content=content, recipients=recipients)
        if recipients:
            # Direct message.
            for r in recipients:
                self.private_messages[r].append(msg)
        else:
            # Broadcast.
            self.messages.append(msg)

    def get_messages(self, recipient: str) -> list:
        """Get all messages (public + direct)."""
        result = list(self.messages)
        result.extend(self.private_messages.get(recipient, []))
        return result

    def broadcast(self, sender: str, content: str):
        self.send(sender, content, None)

    def clear(self):
        """Clear all buffered messages."""
        self.messages.clear()
        self.private_messages.clear()


class SDKMessageBus(MessageBus):
    """SDK message bus implemented via CCCCClient."""

    def __init__(self, group_id: str):
        # Lazy import to avoid dependency requirement in standalone mode.
        from cccc_sdk import CCCCClient
        self.client = CCCCClient()
        self.group_id = group_id

    def send(self, sender: str, content: str, recipients: Optional[list] = None):
        self.client.send(
            group_id=self.group_id,
            text=content,
            by=sender,
            to=recipients
        )

    def get_messages(self, recipient: str) -> list:
        # In SDK mode this should use events_stream; simplified here.
        return []

    def broadcast(self, sender: str, content: str):
        self.send(sender, content, None)


def create_message_bus(mode: str = "standalone", group_id: str = "") -> MessageBus:
    """Factory: create message bus instance."""
    if mode == "sdk":
        return SDKMessageBus(group_id)
    return StandaloneMessageBus()
