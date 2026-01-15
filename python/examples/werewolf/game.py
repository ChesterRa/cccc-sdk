"""游戏状态管理"""

from dataclasses import dataclass, field
from typing import Optional
from .roles import Role, Phase, Team


@dataclass
class Player:
    """玩家"""
    id: str           # 玩家ID (如 "P1")
    name: str         # 显示名称
    role: Role        # 角色
    is_alive: bool = True

    @property
    def emoji(self) -> str:
        return self.role.emoji if self.is_alive else "💀"


@dataclass
class WitchState:
    """女巫状态"""
    save_used: bool = False    # 解药是否已用
    poison_used: bool = False  # 毒药是否已用
    save_target: Optional[str] = None   # 本轮救的人
    poison_target: Optional[str] = None # 本轮毒的人


@dataclass
class SeerState:
    """预言家状态"""
    checked: dict = field(default_factory=dict)  # {player_id: is_wolf}


@dataclass
class NightResult:
    """夜晚结算结果"""
    wolf_target: Optional[str] = None      # 狼人目标
    witch_saved: bool = False              # 女巫是否救人
    witch_poison_target: Optional[str] = None  # 女巫毒杀目标
    seer_check: Optional[tuple] = None     # (target_id, is_wolf)

    @property
    def deaths(self) -> list:
        """返回本轮死亡玩家ID列表"""
        result = []
        # 狼人杀的人（如果没被救）
        if self.wolf_target and not self.witch_saved:
            result.append(self.wolf_target)
        # 女巫毒杀的人
        if self.witch_poison_target:
            result.append(self.witch_poison_target)
        return result


@dataclass
class GameEvent:
    """游戏事件记录"""
    round: int
    phase: Phase
    event_type: str
    actor: str
    target: Optional[str]
    content: str


@dataclass
class GameState:
    """游戏状态"""
    players: list = field(default_factory=list)
    phase: Phase = Phase.NIGHT
    round: int = 1
    witch_state: WitchState = field(default_factory=WitchState)
    seer_state: SeerState = field(default_factory=SeerState)
    votes: dict = field(default_factory=dict)  # {voter_id: target_id}
    history: list = field(default_factory=list)  # List[GameEvent]
    speeches: list = field(default_factory=list)  # 当轮发言记录

    @property
    def alive_players(self) -> list:
        """存活玩家列表"""
        return [p for p in self.players if p.is_alive]

    @property
    def alive_wolves(self) -> list:
        """存活狼人列表"""
        return [p for p in self.alive_players if p.role == Role.WOLF]

    @property
    def alive_villagers(self) -> list:
        """存活好人列表"""
        return [p for p in self.alive_players if p.role.team == Team.VILLAGER]

    def get_player(self, player_id: str) -> Optional[Player]:
        """根据ID获取玩家"""
        for p in self.players:
            if p.id == player_id:
                return p
        return None

    def kill_player(self, player_id: str) -> Optional[Player]:
        """杀死玩家"""
        player = self.get_player(player_id)
        if player:
            player.is_alive = False
        return player

    def check_game_over(self) -> Optional[Team]:
        """检查游戏是否结束，返回获胜阵营"""
        wolves = len(self.alive_wolves)
        villagers = len(self.alive_villagers)

        if wolves == 0:
            return Team.VILLAGER  # 好人胜
        if villagers <= wolves:
            return Team.WOLF  # 狼人胜
        return None  # 游戏继续

    def add_event(self, event_type: str, actor: str, target: Optional[str], content: str):
        """添加游戏事件"""
        self.history.append(GameEvent(
            round=self.round,
            phase=self.phase,
            event_type=event_type,
            actor=actor,
            target=target,
            content=content
        ))
