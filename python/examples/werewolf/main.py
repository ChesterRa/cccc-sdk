#!/usr/bin/env python3
import argparse
import random
import time
from collections import Counter
from typing import Optional

from . import config
from .ai_player import AIPlayer
from .game import GameState, NightResult, Player
from .message_bus import create_message_bus
from .roles import Phase, Role, Team


class GameMaster:
    """Game controller."""

    def __init__(self, mode: str = "standalone"):
        self.mode = mode
        self.state = GameState()
        self.ai_players: dict = {}
        self.message_bus = create_message_bus(mode)

    def setup_game(self):
        """Initialize game."""
        self._print_header("Game Setup")

        # Shuffle role assignment.
        roles = list(config.ROLE_CONFIG)
        random.shuffle(roles)

        for i, (name, role) in enumerate(zip(config.PLAYER_NAMES, roles)):
            player_id = f"P{i+1}"
            player = Player(id=player_id, name=name, role=role)
            self.state.players.append(player)
            self.ai_players[player_id] = AIPlayer(player)
            print(f"  {player_id} {name}: {role.emoji} {role.display_name}")

        print("\nRole assignment complete. Game starts now.\n")
        time.sleep(1)

    def run_game(self):
        """Run game loop."""
        self.setup_game()

        while True:
            # Night phase.
            night_result = self.run_night()

            # Check winner.
            winner = self.state.check_game_over()
            if winner:
                self.end_game(winner)
                break

            # Day phase.
            self.run_day(night_result)

            # Check winner.
            winner = self.state.check_game_over()
            if winner:
                self.end_game(winner)
                break

            self.state.round += 1

    def run_night(self) -> NightResult:
        """Night phase."""
        self._print_header(f"Round {self.state.round} - Night")
        self.state.phase = Phase.NIGHT
        result = NightResult()

        print("Night falls.\n")
        time.sleep(0.5)

        # 1) Werewolf action.
        result.wolf_target = self._wolves_action()

        # 2) Seer action.
        result.seer_check = self._seer_action()

        # 3) Witch action.
        if result.wolf_target:
            dying = self.state.get_player(result.wolf_target)
            result.witch_saved, result.witch_poison_target = self._witch_action(dying)

        print("\nNight ends. Dawn breaks.\n")
        time.sleep(0.5)

        # Resolve deaths.
        for pid in result.deaths:
            player = self.state.kill_player(pid)
            if player:
                self.state.add_event("death", "system", pid, f"{player.name} died")

        return result

    def _wolves_action(self) -> Optional[str]:
        """Werewolf action."""
        print("[Werewolf action]")
        wolves = self.state.alive_wolves
        if not wolves:
            return None

        # Werewolf discussion.
        opinions = []
        for wolf in wolves:
            ai = self.ai_players[wolf.id]
            opinion = ai.wolf_discuss(self.state, " / ".join(opinions))
            opinions.append(f"{wolf.name}: {opinion}")
            print(f"  {wolf.name} (private): {opinion}")
            time.sleep(0.3)

        # First werewolf proposes target.
        ai = self.ai_players[wolves[0].id]
        target = ai.decide_wolf_target(self.state)

        # Validate target.
        valid_targets = [p.id for p in self.state.alive_players if p.role != Role.WOLF]
        if target not in valid_targets and valid_targets:
            target = random.choice(valid_targets)

        target_player = self.state.get_player(target)
        if target_player:
            print(f"  Werewolves target: {target}({target_player.name})")
            self.state.add_event("wolf_kill", "werewolves", target, f"Werewolves targeted {target_player.name}")

        return target

    def _seer_action(self) -> Optional[tuple]:
        """Seer action."""
        print("\n[Seer action]")
        seer = next((p for p in self.state.alive_players if p.role == Role.SEER), None)
        if not seer:
            print("  (seer is dead)")
            return None

        ai = self.ai_players[seer.id]
        target = ai.decide_seer_check(self.state)

        # Validate target.
        valid_targets = [p.id for p in self.state.alive_players if p.id != seer.id]
        if target not in valid_targets and valid_targets:
            target = random.choice(valid_targets)

        target_player = self.state.get_player(target)
        if target_player:
            is_wolf = target_player.role == Role.WOLF
            self.state.seer_state.checked[target] = is_wolf
            result_str = "werewolf" if is_wolf else "villager"
            print(f"  Seer check: {target}({target_player.name}) -> {result_str}")
            self.state.add_event("seer_check", seer.id, target, f"Checked {target_player.name}: {result_str}")
            return (target, is_wolf)

        return None

    def _witch_action(self, dying: Optional[Player]) -> tuple:
        """Witch action; return (saved, poison_target)."""
        print("\n[Witch action]")
        witch = next((p for p in self.state.alive_players if p.role == Role.WITCH), None)
        if not witch:
            print("  (witch is dead)")
            return False, None

        ai = self.ai_players[witch.id]
        saved = False
        poison_target = None

        # Antidote.
        if dying and not self.state.witch_state.save_used:
            print(f"  Tonight's victim: {dying.id}({dying.name})")
            if ai.decide_witch_save(self.state, dying):
                saved = True
                self.state.witch_state.save_used = True
                print(f"  Witch used antidote to save {dying.name}")
                self.state.add_event("witch_save", witch.id, dying.id, f"Witch saved {dying.name}")
            else:
                print("  (witch chose not to save)")

        # Poison.
        if not self.state.witch_state.poison_used:
            poison_target = ai.decide_witch_poison(self.state)
            if poison_target:
                # Validate target.
                valid = [p.id for p in self.state.alive_players if p.id != witch.id]
                if poison_target in valid:
                    self.state.witch_state.poison_used = True
                    target_p = self.state.get_player(poison_target)
                    print(f"  Witch used poison on: {poison_target}({target_p.name})")
                    self.state.add_event("witch_poison", witch.id, poison_target, f"Witch poisoned {target_p.name}")
                else:
                    poison_target = None

        if not saved and not poison_target:
            print("  (witch used no potion)")

        return saved, poison_target

    def run_day(self, night_result: NightResult):
        """Day phase."""
        self._print_header(f"Round {self.state.round} - Day")
        self.state.phase = Phase.DAY
        self.state.speeches = []

        # Announce deaths.
        print("Day begins.\n")
        deaths = []
        for pid in night_result.deaths:
            p = self.state.get_player(pid)
            if p:
                deaths.append(p)

        if deaths:
            print("[Deaths last night]")
            for p in deaths:
                print(f"  {p.id}({p.name}) died, role was {p.role.emoji} {p.role.display_name}")
        else:
            print("[No deaths] Nobody died last night.")

        print()
        time.sleep(0.5)

        # Speech phase.
        print("[Speech phase]")
        for player in self.state.alive_players:
            ai = self.ai_players[player.id]
            speech = ai.make_speech(self.state, deaths)
            self.state.speeches.append({
                "player": player.id,
                "name": player.name,
                "content": speech,
            })
            print(f"\n  {player.emoji} {player.id}({player.name}):")
            print(f"    \"{speech}\"")
            self.state.add_event("speech", player.id, None, speech)
            time.sleep(0.3)

        print()

        # Voting phase.
        self._voting_phase()

    def _voting_phase(self):
        """Voting phase."""
        print("[Voting phase]")
        self.state.phase = Phase.VOTE
        self.state.votes = {}

        for player in self.state.alive_players:
            ai = self.ai_players[player.id]
            vote = ai.cast_vote(self.state)
            self.state.votes[player.id] = vote

            if vote == "abstain":
                print(f"  {player.id}({player.name}) -> abstain")
            else:
                target = self.state.get_player(vote)
                target_name = target.name if target else "?"
                print(f"  {player.id}({player.name}) -> {vote}({target_name})")

            time.sleep(0.2)

        # Count votes.
        print("\n[Vote result]")
        vote_counts = Counter(v for v in self.state.votes.values() if v != "abstain")

        if not vote_counts:
            print("  No valid votes. Execution is skipped.")
            return

        # Find highest vote count.
        max_votes = max(vote_counts.values())
        top_voted = [pid for pid, count in vote_counts.items() if count == max_votes]

        if len(top_voted) > 1:
            print(f"  Tie at {max_votes} votes: {', '.join(top_voted)}. No one is executed.")
            return

        # Execute target.
        executed_id = top_voted[0]
        executed = self.state.kill_player(executed_id)
        if executed:
            print(f"  {executed_id}({executed.name}) is executed with {max_votes} votes.")
            print(f"  Revealed role: {executed.role.emoji} {executed.role.display_name}")
            self.state.add_event("vote_out", "vote", executed_id, f"{executed.name} was voted out")

    def end_game(self, winner: Team):
        """End game."""
        self._print_header("Game Over")
        self.state.phase = Phase.END

        if winner == Team.WOLF:
            print("Werewolf team wins.\n")
        else:
            print("Villager team wins.\n")

        # Show all roles.
        print("[Role reveal]")
        for p in self.state.players:
            status = "alive" if p.is_alive else "dead"
            print(f"  {p.id}({p.name}): {p.role.emoji} {p.role.display_name} [{status}]")

        # Show summary.
        print("\n[Summary]")
        print(f"  Total rounds: {self.state.round}")
        print(f"  Survivors: {len(self.state.alive_players)}")

    def _print_header(self, title: str):
        """Print title divider."""
        line = "=" * 40
        print(f"\n{line}")
        print(f"  {title}")
        print(f"{line}\n")


def main():
    parser = argparse.ArgumentParser(description="AI Werewolf demo")
    parser.add_argument("--mode", choices=["standalone", "sdk"],
                        default="standalone", help="Run mode")
    args = parser.parse_args()

    print(
        """
========================================
  AI Werewolf Demo
  Multi-AI Agent Collaboration
========================================
"""
    )

    # Display LLM configuration.
    llm_config = config.get_llm_config()
    if llm_config["provider"] == "none":
        print("Warning: no LLM API key found. Running with random fallback strategy.")
        print("Supported environment variables:")
        print("   - DEEPSEEK_API_KEY  (DeepSeek)")
        print("   - ANTHROPIC_API_KEY (Claude)")
        print("   - OPENAI_API_KEY    (OpenAI)")
        print("   - LLM_PROVIDER      (preferred provider)\n")
    else:
        provider_names = {
            "anthropic": "Claude (Anthropic)",
            "deepseek": "DeepSeek",
            "openai": "OpenAI",
            "openai_compatible": "OpenAI Compatible",
        }
        print(f"LLM: {provider_names.get(llm_config['provider'], llm_config['provider'])}")
        print(f"   Model: {llm_config['model']}\n")

    game = GameMaster(mode=args.mode)
    game.run_game()


if __name__ == "__main__":
    main()
