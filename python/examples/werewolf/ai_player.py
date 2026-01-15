"""AI 玩家决策模块 - 支持多种 LLM API"""

import re
from typing import Optional
from .game import Player, GameState
from .roles import Role
from . import prompts
from . import config


class LLMClient:
    """统一的 LLM 客户端封装"""

    def __init__(self):
        self.config = config.get_llm_config()
        self.provider = self.config["provider"]
        self._client = None

    @property
    def is_available(self) -> bool:
        return self.provider != "none" and self.config["api_key"]

    def _get_client(self):
        """延迟初始化客户端"""
        if self._client is not None:
            return self._client

        if self.provider == "anthropic":
            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=self.config["api_key"])
            except ImportError:
                raise ImportError("请安装 anthropic: pip install anthropic")

        elif self.provider in ("openai", "deepseek", "openai_compatible"):
            try:
                import openai
                kwargs = {"api_key": self.config["api_key"]}
                if self.config["api_base"]:
                    kwargs["base_url"] = self.config["api_base"]
                self._client = openai.OpenAI(**kwargs)
            except ImportError:
                raise ImportError("请安装 openai: pip install openai")

        return self._client

    def chat(self, prompt: str, system: str = "") -> str:
        """调用 LLM"""
        client = self._get_client()
        if client is None:
            return ""

        if self.provider == "anthropic":
            response = client.messages.create(
                model=self.config["model"],
                max_tokens=200,
                system=system,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text.strip()

        else:  # OpenAI 兼容 API (openai, deepseek, openai_compatible)
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            response = client.chat.completions.create(
                model=self.config["model"],
                max_tokens=200,
                messages=messages
            )
            return response.choices[0].message.content.strip()


# 全局 LLM 客户端（单例）
_llm_client: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client


class AIPlayer:
    """AI 玩家"""

    def __init__(self, player: Player):
        self.player = player
        self.llm = get_llm_client()

    def _call_llm(self, prompt: str) -> str:
        """调用 LLM 获取响应"""
        if not self.llm.is_available:
            return self._fallback_response(prompt)

        try:
            return self.llm.chat(prompt, prompts.SYSTEM_PROMPT)
        except Exception as e:
            print(f"  [LLM Error: {e}]")
            return self._fallback_response(prompt)

    def _fallback_response(self, prompt: str) -> str:
        """无API时的回退响应"""
        import random
        # 从prompt中提取可能的选项
        if "请只回复目标玩家的ID" in prompt or "请只回复玩家ID" in prompt:
            # 提取 P1-P6 格式的ID
            ids = re.findall(r'P\d+', prompt)
            if ids:
                return random.choice(ids)
        if "请只回复 \"是\" 或 \"否\"" in prompt:
            return random.choice(["是", "否"])
        if "弃票" in prompt:
            ids = re.findall(r'P\d+', prompt)
            return random.choice(ids + ["弃票"]) if ids else "弃票"
        return "我觉得场上形势复杂，需要仔细分析。"

    def _format_history(self, state: GameState, limit: int = 5) -> str:
        """格式化游戏历史"""
        if not state.history:
            return "（游戏刚开始）"
        recent = state.history[-limit:]
        lines = []
        for e in recent:
            lines.append(f"[第{e.round}轮{e.phase.value}] {e.actor}: {e.content}")
        return "\n".join(lines)

    def _format_players(self, players: list) -> str:
        """格式化玩家列表"""
        return ", ".join([f"{p.id}({p.name})" for p in players])

    def decide_wolf_target(self, state: GameState, partner_opinion: str = "") -> str:
        """狼人选择击杀目标"""
        wolves = [p for p in state.alive_wolves if p.id != self.player.id]
        non_wolves = [p for p in state.alive_players if p.role != Role.WOLF]

        prompt = prompts.WOLF_KILL_PROMPT.format(
            round=state.round,
            alive_players=self._format_players(non_wolves),
            wolf_partners=self._format_players(wolves),
            game_history=self._format_history(state)
        )
        return self._call_llm(prompt)

    def wolf_discuss(self, state: GameState, partner_opinion: str = "") -> str:
        """狼人讨论"""
        wolves = [p for p in state.alive_wolves if p.id != self.player.id]
        non_wolves = [p for p in state.alive_players if p.role != Role.WOLF]

        prompt = prompts.WOLF_DISCUSS_PROMPT.format(
            player_name=self.player.name,
            round=state.round,
            alive_players=self._format_players(non_wolves),
            wolf_partners=self._format_players(wolves),
            partner_opinion=partner_opinion or "（你先发言）",
            game_history=self._format_history(state)
        )
        return self._call_llm(prompt)

    def decide_seer_check(self, state: GameState) -> str:
        """预言家选择查验目标"""
        checked = state.seer_state.checked
        checked_str = ", ".join([
            f"{pid}({'狼人' if is_wolf else '好人'})"
            for pid, is_wolf in checked.items()
        ]) or "（尚未查验）"

        unchecked = [p for p in state.alive_players
                     if p.id not in checked and p.role != Role.SEER]

        prompt = prompts.SEER_CHECK_PROMPT.format(
            round=state.round,
            alive_players=self._format_players(state.alive_players),
            checked_results=checked_str,
            unchecked_players=self._format_players(unchecked),
            game_history=self._format_history(state)
        )
        return self._call_llm(prompt)

    def decide_witch_save(self, state: GameState, dying_player: Player) -> bool:
        """女巫决定是否救人"""
        prompt = prompts.WITCH_SAVE_PROMPT.format(
            round=state.round,
            dying_player=f"{dying_player.id}({dying_player.name})",
            save_status="已使用" if state.witch_state.save_used else "未使用",
            alive_players=self._format_players(state.alive_players),
            game_history=self._format_history(state)
        )
        response = self._call_llm(prompt)
        return "是" in response

    def decide_witch_poison(self, state: GameState) -> Optional[str]:
        """女巫决定是否使用毒药"""
        prompt = prompts.WITCH_POISON_PROMPT.format(
            round=state.round,
            poison_status="已使用" if state.witch_state.poison_used else "未使用",
            alive_players=self._format_players(state.alive_players),
            game_history=self._format_history(state)
        )
        response = self._call_llm(prompt)
        if "否" in response.lower():
            return None
        # 提取玩家ID
        match = re.search(r'P\d+', response)
        return match.group(0) if match else None

    def make_speech(self, state: GameState, night_deaths: list) -> str:
        """发言"""
        role = self.player.role

        # 构建身份信息
        if role == Role.WOLF:
            wolves = [p for p in state.alive_wolves if p.id != self.player.id]
            identity_info = f"你的同伴是: {self._format_players(wolves)}"
        elif role == Role.SEER:
            checked = state.seer_state.checked
            identity_info = "查验结果: " + ", ".join([
                f"{pid}({'狼人' if is_wolf else '好人'})"
                for pid, is_wolf in checked.items()
            ]) or "（尚未查验）"
        elif role == Role.WITCH:
            identity_info = f"解药: {'已用' if state.witch_state.save_used else '未用'}, 毒药: {'已用' if state.witch_state.poison_used else '未用'}"
        else:
            identity_info = "你是普通村民，没有特殊信息"

        # 之前的发言
        prev_speeches = "\n".join([
            f"{s['player']}({s['name']}): {s['content']}"
            for s in state.speeches
        ]) or "（你是第一个发言）"

        # 死亡信息
        deaths_str = ", ".join([f"{p.id}({p.name})" for p in night_deaths]) or "平安夜"

        prompt = prompts.SPEECH_PROMPT.format(
            role=role.cn_name,
            player_name=self.player.name,
            round=state.round,
            identity_info=identity_info,
            alive_players=self._format_players(state.alive_players),
            night_deaths=deaths_str,
            previous_speeches=prev_speeches,
            game_history=self._format_history(state),
            role_hints=prompts.ROLE_SPEECH_HINTS.get(role.name, "")
        )
        return self._call_llm(prompt)

    def cast_vote(self, state: GameState) -> str:
        """投票"""
        role = self.player.role

        # 身份信息（同发言）
        if role == Role.WOLF:
            wolves = [p for p in state.alive_wolves if p.id != self.player.id]
            identity_info = f"同伴: {self._format_players(wolves)}"
        elif role == Role.SEER:
            checked = state.seer_state.checked
            identity_info = "查验: " + ", ".join([
                f"{pid}({'狼' if is_wolf else '好'})"
                for pid, is_wolf in checked.items()
            ])
        else:
            identity_info = ""

        # 发言汇总
        speeches_summary = "\n".join([
            f"{s['player']}({s['name']}): {s['content']}"
            for s in state.speeches
        ])

        # 投票候选人（不能投自己）
        candidates = [p for p in state.alive_players if p.id != self.player.id]

        prompt = prompts.VOTE_PROMPT.format(
            role=role.cn_name,
            player_name=self.player.name,
            round=state.round,
            identity_info=identity_info,
            alive_players=self._format_players(candidates),
            speeches_summary=speeches_summary,
            game_history=self._format_history(state),
            role_hints=prompts.VOTE_ROLE_HINTS.get(role.name, "")
        )
        response = self._call_llm(prompt)

        # 解析投票结果
        if "弃票" in response:
            return "弃票"
        match = re.search(r'P\d+', response)
        return match.group(0) if match else "弃票"
