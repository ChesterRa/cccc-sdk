"""消息总线抽象层 - 支持独立模式和SDK模式"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
from collections import defaultdict


@dataclass
class Message:
    """消息"""
    sender: str
    content: str
    recipients: Optional[list] = None  # None = 广播
    msg_type: str = "chat"


class MessageBus(ABC):
    """消息总线抽象基类"""

    @abstractmethod
    def send(self, sender: str, content: str, recipients: Optional[list] = None):
        """发送消息"""
        pass

    @abstractmethod
    def get_messages(self, recipient: str) -> list:
        """获取指定接收者的消息"""
        pass

    @abstractmethod
    def broadcast(self, sender: str, content: str):
        """广播消息"""
        pass


class StandaloneMessageBus(MessageBus):
    """独立模式消息总线 - 使用内存队列"""

    def __init__(self):
        self.messages: list = []
        self.private_messages: dict = defaultdict(list)

    def send(self, sender: str, content: str, recipients: Optional[list] = None):
        msg = Message(sender=sender, content=content, recipients=recipients)
        if recipients:
            # 私聊
            for r in recipients:
                self.private_messages[r].append(msg)
        else:
            # 广播
            self.messages.append(msg)

    def get_messages(self, recipient: str) -> list:
        """获取所有消息（公开+私聊）"""
        result = list(self.messages)
        result.extend(self.private_messages.get(recipient, []))
        return result

    def broadcast(self, sender: str, content: str):
        self.send(sender, content, None)

    def clear(self):
        """清空消息"""
        self.messages.clear()
        self.private_messages.clear()


class SDKMessageBus(MessageBus):
    """SDK模式消息总线 - 使用 CCCCClient"""

    def __init__(self, group_id: str):
        # 延迟导入，避免在独立模式下报错
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
        # SDK模式下通过 events_stream 获取，这里简化处理
        return []

    def broadcast(self, sender: str, content: str):
        self.send(sender, content, None)


def create_message_bus(mode: str = "standalone", group_id: str = "") -> MessageBus:
    """工厂函数：创建消息总线"""
    if mode == "sdk":
        return SDKMessageBus(group_id)
    return StandaloneMessageBus()
