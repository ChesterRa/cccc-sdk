"""Role and team definitions."""

from enum import Enum, auto


class Team(Enum):
    """Team."""

    WOLF = auto()
    VILLAGER = auto()


class Role(Enum):
    """Role."""

    WOLF = ("Werewolf", Team.WOLF, "WLF")
    SEER = ("Seer", Team.VILLAGER, "SER")
    WITCH = ("Witch", Team.VILLAGER, "WIT")
    VILLAGER = ("Villager", Team.VILLAGER, "VIL")

    def __init__(self, display_name: str, team: Team, emoji: str):
        self.display_name = display_name
        self.team = team
        self.emoji = emoji

    @property
    def is_wolf(self) -> bool:
        return self.team == Team.WOLF

    @property
    def is_god(self) -> bool:
        """Whether the role is a special role (seer/witch)."""
        return self in (Role.SEER, Role.WITCH)


class Phase(Enum):
    """Game phase."""

    NIGHT = "Night"
    DAY = "Day"
    VOTE = "Vote"
    END = "End"
