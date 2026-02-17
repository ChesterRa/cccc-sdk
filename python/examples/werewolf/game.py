"""Game state management."""

from dataclasses import dataclass, field
from typing import Optional
from .roles import Role, Phase, Team


@dataclass
class Player:
    """Player."""

    id: str
    name: str
    role: Role
    is_alive: bool = True

    @property
    def emoji(self) -> str:
        return self.role.emoji if self.is_alive else "DEAD"


@dataclass
class WitchState:
    """Witch state."""

    save_used: bool = False
    poison_used: bool = False
    save_target: Optional[str] = None
    poison_target: Optional[str] = None


@dataclass
class SeerState:
    """Seer state."""

    checked: dict = field(default_factory=dict)


@dataclass
class NightResult:
    """Night resolution result."""

    wolf_target: Optional[str] = None
    witch_saved: bool = False
    witch_poison_target: Optional[str] = None
    seer_check: Optional[tuple] = None

    @property
    def deaths(self) -> list:
        """Return player IDs who died this round."""
        result = []
        # Target killed by werewolves (if not saved by witch).
        if self.wolf_target and not self.witch_saved:
            result.append(self.wolf_target)
        # Target poisoned by witch.
        if self.witch_poison_target:
            result.append(self.witch_poison_target)
        return result


@dataclass
class GameEvent:
    """Game event record."""
    round: int
    phase: Phase
    event_type: str
    actor: str
    target: Optional[str]
    content: str


@dataclass
class GameState:
    """Game state."""

    players: list = field(default_factory=list)
    phase: Phase = Phase.NIGHT
    round: int = 1
    witch_state: WitchState = field(default_factory=WitchState)
    seer_state: SeerState = field(default_factory=SeerState)
    votes: dict = field(default_factory=dict)
    history: list = field(default_factory=list)
    speeches: list = field(default_factory=list)

    @property
    def alive_players(self) -> list:
        """Alive players."""
        return [p for p in self.players if p.is_alive]

    @property
    def alive_wolves(self) -> list:
        """Alive werewolves."""
        return [p for p in self.alive_players if p.role == Role.WOLF]

    @property
    def alive_villagers(self) -> list:
        """Alive villagers."""
        return [p for p in self.alive_players if p.role.team == Team.VILLAGER]

    def get_player(self, player_id: str) -> Optional[Player]:
        """Get player by ID."""
        for p in self.players:
            if p.id == player_id:
                return p
        return None

    def kill_player(self, player_id: str) -> Optional[Player]:
        """Kill player by ID."""
        player = self.get_player(player_id)
        if player:
            player.is_alive = False
        return player

    def check_game_over(self) -> Optional[Team]:
        """Check game-over state and return winner team."""
        wolves = len(self.alive_wolves)
        villagers = len(self.alive_villagers)

        if wolves == 0:
            return Team.VILLAGER
        if villagers <= wolves:
            return Team.WOLF
        return None

    def add_event(self, event_type: str, actor: str, target: Optional[str], content: str):
        """Add game event."""
        self.history.append(GameEvent(
            round=self.round,
            phase=self.phase,
            event_type=event_type,
            actor=actor,
            target=target,
            content=content
        ))
