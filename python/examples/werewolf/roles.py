"""角色和阵营定义"""

from enum import Enum, auto


class Team(Enum):
    """阵营"""
    WOLF = auto()      # 狼人阵营
    VILLAGER = auto()  # 好人阵营


class Role(Enum):
    """角色"""
    WOLF = ("狼人", Team.WOLF, "🐺")
    SEER = ("预言家", Team.VILLAGER, "🔮")
    WITCH = ("女巫", Team.VILLAGER, "🧙")
    VILLAGER = ("村民", Team.VILLAGER, "👤")

    def __init__(self, cn_name: str, team: Team, emoji: str):
        self.cn_name = cn_name
        self.team = team
        self.emoji = emoji

    @property
    def is_wolf(self) -> bool:
        return self.team == Team.WOLF

    @property
    def is_god(self) -> bool:
        """是否是神职（预言家/女巫）"""
        return self in (Role.SEER, Role.WITCH)


class Phase(Enum):
    """游戏阶段"""
    NIGHT = "夜晚"
    DAY = "白天"
    VOTE = "投票"
    END = "结束"
