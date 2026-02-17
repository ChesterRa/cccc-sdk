"""AI player decision module supporting multiple LLM APIs."""

import re
from typing import Optional

from . import config
from . import prompts
from .game import GameState, Player
from .roles import Role


class LLMClient:
    """Unified LLM client wrapper."""

    def __init__(self):
        self.config = config.get_llm_config()
        self.provider = self.config["provider"]
        self._client = None

    @property
    def is_available(self) -> bool:
        return self.provider != "none" and self.config["api_key"]

    def _get_client(self):
        """Lazily initialize API client."""
        if self._client is not None:
            return self._client

        if self.provider == "anthropic":
            try:
                import anthropic

                self._client = anthropic.Anthropic(api_key=self.config["api_key"])
            except ImportError:
                raise ImportError("Please install anthropic: pip install anthropic")

        elif self.provider in ("openai", "deepseek", "openai_compatible"):
            try:
                import openai

                kwargs = {"api_key": self.config["api_key"]}
                if self.config["api_base"]:
                    kwargs["base_url"] = self.config["api_base"]
                self._client = openai.OpenAI(**kwargs)
            except ImportError:
                raise ImportError("Please install openai: pip install openai")

        return self._client

    def chat(self, prompt: str, system: str = "") -> str:
        """Call LLM."""
        client = self._get_client()
        if client is None:
            return ""

        if self.provider == "anthropic":
            response = client.messages.create(
                model=self.config["model"],
                max_tokens=200,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = client.chat.completions.create(
            model=self.config["model"],
            max_tokens=200,
            messages=messages,
        )
        return response.choices[0].message.content.strip()


# Global singleton LLM client.
_llm_client: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client


class AIPlayer:
    """AI player."""

    def __init__(self, player: Player):
        self.player = player
        self.llm = get_llm_client()

    def _call_llm(self, prompt: str) -> str:
        """Call LLM and return response text."""
        if not self.llm.is_available:
            return self._fallback_response(prompt)

        try:
            return self.llm.chat(prompt, prompts.SYSTEM_PROMPT)
        except Exception as e:
            print(f"  [LLM Error: {e}]")
            return self._fallback_response(prompt)

    def _fallback_response(self, prompt: str) -> str:
        """Fallback response when API is unavailable."""
        import random

        if "player ID only" in prompt or "Reply with a player ID" in prompt:
            ids = re.findall(r"P\d+", prompt)
            if ids:
                return random.choice(ids)
        if '"yes" or "no"' in prompt:
            return random.choice(["yes", "no"])
        if "abstain" in prompt.lower():
            ids = re.findall(r"P\d+", prompt)
            return random.choice(ids + ["abstain"]) if ids else "abstain"
        return "The board is complex and I need more evidence."

    def _format_history(self, state: GameState, limit: int = 5) -> str:
        """Format recent game history."""
        if not state.history:
            return "(game just started)"
        recent = state.history[-limit:]
        lines = []
        for event in recent:
            lines.append(f"[R{event.round} {event.phase.value}] {event.actor}: {event.content}")
        return "\n".join(lines)

    def _format_players(self, players: list) -> str:
        """Format player list."""
        return ", ".join([f"{p.id}({p.name})" for p in players])

    def decide_wolf_target(self, state: GameState, partner_opinion: str = "") -> str:
        """Decide kill target as werewolf."""
        wolves = [p for p in state.alive_wolves if p.id != self.player.id]
        non_wolves = [p for p in state.alive_players if p.role != Role.WOLF]
        prompt = prompts.WOLF_KILL_PROMPT.format(
            round=state.round,
            alive_players=self._format_players(non_wolves),
            wolf_partners=self._format_players(wolves),
            game_history=self._format_history(state),
        )
        return self._call_llm(prompt)

    def wolf_discuss(self, state: GameState, partner_opinion: str = "") -> str:
        """Generate werewolf discussion line."""
        wolves = [p for p in state.alive_wolves if p.id != self.player.id]
        non_wolves = [p for p in state.alive_players if p.role != Role.WOLF]
        prompt = prompts.WOLF_DISCUSS_PROMPT.format(
            player_name=self.player.name,
            round=state.round,
            alive_players=self._format_players(non_wolves),
            wolf_partners=self._format_players(wolves),
            partner_opinion=partner_opinion or "(you speak first)",
            game_history=self._format_history(state),
        )
        return self._call_llm(prompt)

    def decide_seer_check(self, state: GameState) -> str:
        """Decide check target as seer."""
        checked = state.seer_state.checked
        checked_str = ", ".join(
            [f"{pid}({'werewolf' if is_wolf else 'villager'})" for pid, is_wolf in checked.items()]
        ) or "(none yet)"
        unchecked = [p for p in state.alive_players if p.id not in checked and p.role != Role.SEER]
        prompt = prompts.SEER_CHECK_PROMPT.format(
            round=state.round,
            alive_players=self._format_players(state.alive_players),
            checked_results=checked_str,
            unchecked_players=self._format_players(unchecked),
            game_history=self._format_history(state),
        )
        return self._call_llm(prompt)

    def decide_witch_save(self, state: GameState, dying_player: Player) -> bool:
        """Decide whether witch uses antidote."""
        prompt = prompts.WITCH_SAVE_PROMPT.format(
            round=state.round,
            dying_player=f"{dying_player.id}({dying_player.name})",
            save_status="used" if state.witch_state.save_used else "unused",
            alive_players=self._format_players(state.alive_players),
            game_history=self._format_history(state),
        )
        answer = self._call_llm(prompt).strip().lower()
        if answer.startswith("y"):
            return True
        if answer.startswith("n"):
            return False
        return "yes" in answer and "no" not in answer

    def decide_witch_poison(self, state: GameState) -> Optional[str]:
        """Decide whether witch uses poison and return target ID."""
        prompt = prompts.WITCH_POISON_PROMPT.format(
            round=state.round,
            poison_status="used" if state.witch_state.poison_used else "unused",
            alive_players=self._format_players(state.alive_players),
            game_history=self._format_history(state),
        )
        response = self._call_llm(prompt).strip()
        low = response.lower()
        if low.startswith("n") or "no" in low:
            return None
        match = re.search(r"P\d+", response)
        return match.group(0) if match else None

    def make_speech(self, state: GameState, night_deaths: list) -> str:
        """Generate day-phase speech."""
        role = self.player.role

        if role == Role.WOLF:
            wolves = [p for p in state.alive_wolves if p.id != self.player.id]
            identity_info = f"Your partner: {self._format_players(wolves)}"
        elif role == Role.SEER:
            checked = state.seer_state.checked
            summary = ", ".join(
                [f"{pid}({'werewolf' if is_wolf else 'villager'})" for pid, is_wolf in checked.items()]
            ) or "(none yet)"
            identity_info = f"Check results: {summary}"
        elif role == Role.WITCH:
            antidote = "used" if state.witch_state.save_used else "unused"
            poison = "used" if state.witch_state.poison_used else "unused"
            identity_info = f"Antidote: {antidote}, Poison: {poison}"
        else:
            identity_info = "You are a villager with no private information."

        previous_speeches = "\n".join(
            [f"{s['player']}({s['name']}): {s['content']}" for s in state.speeches]
        ) or "(you speak first)"
        deaths_str = ", ".join([f"{p.id}({p.name})" for p in night_deaths]) or "No deaths"

        prompt = prompts.SPEECH_PROMPT.format(
            role=role.display_name,
            player_name=self.player.name,
            round=state.round,
            identity_info=identity_info,
            alive_players=self._format_players(state.alive_players),
            night_deaths=deaths_str,
            previous_speeches=previous_speeches,
            game_history=self._format_history(state),
            role_hints=prompts.ROLE_SPEECH_HINTS.get(role.name, ""),
        )
        return self._call_llm(prompt)

    def cast_vote(self, state: GameState) -> str:
        """Cast vote."""
        role = self.player.role

        if role == Role.WOLF:
            wolves = [p for p in state.alive_wolves if p.id != self.player.id]
            identity_info = f"Partner: {self._format_players(wolves)}"
        elif role == Role.SEER:
            checked = state.seer_state.checked
            checked_str = ", ".join(
                [f"{pid}({'wolf' if is_wolf else 'villager'})" for pid, is_wolf in checked.items()]
            )
            identity_info = f"Checks: {checked_str}" if checked_str else "Checks: none"
        else:
            identity_info = ""

        speeches_summary = "\n".join([f"{s['player']}({s['name']}): {s['content']}" for s in state.speeches])
        candidates = [p for p in state.alive_players if p.id != self.player.id]
        prompt = prompts.VOTE_PROMPT.format(
            role=role.display_name,
            player_name=self.player.name,
            round=state.round,
            identity_info=identity_info,
            alive_players=self._format_players(candidates),
            speeches_summary=speeches_summary,
            game_history=self._format_history(state),
            role_hints=prompts.VOTE_ROLE_HINTS.get(role.name, ""),
        )
        response = self._call_llm(prompt).strip()
        if "abstain" in response.lower():
            return "abstain"
        match = re.search(r"P\d+", response)
        return match.group(0) if match else "abstain"
