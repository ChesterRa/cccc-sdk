#!/usr/bin/env python3
"""AI 狼人杀 - 游戏主控制器"""

import random
import time
import argparse
from collections import Counter
from typing import Optional

from .roles import Role, Phase, Team
from .game import GameState, Player, NightResult
from .ai_player import AIPlayer
from .message_bus import create_message_bus
from . import config


class GameMaster:
    """游戏主控制器（上帝）"""

    def __init__(self, mode: str = "standalone"):
        self.mode = mode
        self.state = GameState()
        self.ai_players: dict = {}
        self.message_bus = create_message_bus(mode)

    def setup_game(self):
        """初始化游戏"""
        self._print_header("游戏初始化")

        # 随机分配角色
        roles = list(config.ROLE_CONFIG)
        random.shuffle(roles)

        for i, (name, role) in enumerate(zip(config.PLAYER_NAMES, roles)):
            player_id = f"P{i+1}"
            player = Player(id=player_id, name=name, role=role)
            self.state.players.append(player)
            self.ai_players[player_id] = AIPlayer(player)
            print(f"  {player_id} {name}: {role.emoji} {role.cn_name}")

        print("\n角色分配完成！游戏即将开始...\n")
        time.sleep(1)

    def run_game(self):
        """运行游戏主循环"""
        self.setup_game()

        while True:
            # 夜晚阶段
            night_result = self.run_night()

            # 检查胜负
            winner = self.state.check_game_over()
            if winner:
                self.end_game(winner)
                break

            # 白天阶段
            self.run_day(night_result)

            # 检查胜负
            winner = self.state.check_game_over()
            if winner:
                self.end_game(winner)
                break

            self.state.round += 1

    def run_night(self) -> NightResult:
        """夜晚阶段"""
        self._print_header(f"第 {self.state.round} 轮 - 夜晚")
        self.state.phase = Phase.NIGHT
        result = NightResult()

        print("🌙 天黑请闭眼...\n")
        time.sleep(0.5)

        # 1. 狼人行动
        result.wolf_target = self._wolves_action()

        # 2. 预言家行动
        result.seer_check = self._seer_action()

        # 3. 女巫行动
        if result.wolf_target:
            dying = self.state.get_player(result.wolf_target)
            result.witch_saved, result.witch_poison_target = self._witch_action(dying)

        print("\n夜晚结束，天亮了...\n")
        time.sleep(0.5)

        # 结算死亡
        for pid in result.deaths:
            player = self.state.kill_player(pid)
            if player:
                self.state.add_event("death", "系统", pid,
                    f"{player.name} 死亡")

        return result

    def _wolves_action(self) -> Optional[str]:
        """狼人行动"""
        print("【狼人行动】")
        wolves = self.state.alive_wolves
        if not wolves:
            return None

        # 狼人讨论
        opinions = []
        for wolf in wolves:
            ai = self.ai_players[wolf.id]
            opinion = ai.wolf_discuss(self.state, " / ".join(opinions))
            opinions.append(f"{wolf.name}: {opinion}")
            print(f"  🐺 {wolf.name}（密语）: {opinion}")
            time.sleep(0.3)

        # 第一个狼人选择目标
        ai = self.ai_players[wolves[0].id]
        target = ai.decide_wolf_target(self.state)

        # 验证目标有效性
        valid_targets = [p.id for p in self.state.alive_players if p.role != Role.WOLF]
        if target not in valid_targets and valid_targets:
            target = random.choice(valid_targets)

        target_player = self.state.get_player(target)
        if target_player:
            print(f"  💀 狼人选择击杀: {target}({target_player.name})")
            self.state.add_event("wolf_kill", "狼人", target,
                f"狼人选择击杀 {target_player.name}")

        return target

    def _seer_action(self) -> Optional[tuple]:
        """预言家行动"""
        print("\n【预言家行动】")
        seer = next((p for p in self.state.alive_players if p.role == Role.SEER), None)
        if not seer:
            print("  （预言家已死亡）")
            return None

        ai = self.ai_players[seer.id]
        target = ai.decide_seer_check(self.state)

        # 验证目标有效性
        valid_targets = [p.id for p in self.state.alive_players if p.id != seer.id]
        if target not in valid_targets and valid_targets:
            target = random.choice(valid_targets)

        target_player = self.state.get_player(target)
        if target_player:
            is_wolf = target_player.role == Role.WOLF
            self.state.seer_state.checked[target] = is_wolf
            result_str = "狼人" if is_wolf else "好人"
            print(f"  🔮 预言家查验: {target}({target_player.name}) → {result_str}")
            self.state.add_event("seer_check", seer.id, target,
                f"查验 {target_player.name}，结果是{result_str}")
            return (target, is_wolf)

        return None

    def _witch_action(self, dying: Optional[Player]) -> tuple:
        """女巫行动，返回 (是否救人, 毒杀目标)"""
        print("\n【女巫行动】")
        witch = next((p for p in self.state.alive_players if p.role == Role.WITCH), None)
        if not witch:
            print("  （女巫已死亡）")
            return False, None

        ai = self.ai_players[witch.id]
        saved = False
        poison_target = None

        # 解药
        if dying and not self.state.witch_state.save_used:
            print(f"  💊 今晚被杀: {dying.id}({dying.name})")
            if ai.decide_witch_save(self.state, dying):
                saved = True
                self.state.witch_state.save_used = True
                print(f"  ✨ 女巫使用解药救了 {dying.name}")
                self.state.add_event("witch_save", witch.id, dying.id,
                    f"女巫救了 {dying.name}")
            else:
                print("  （女巫选择不救）")

        # 毒药
        if not self.state.witch_state.poison_used:
            poison_target = ai.decide_witch_poison(self.state)
            if poison_target:
                # 验证目标
                valid = [p.id for p in self.state.alive_players if p.id != witch.id]
                if poison_target in valid:
                    self.state.witch_state.poison_used = True
                    target_p = self.state.get_player(poison_target)
                    print(f"  ☠️ 女巫使用毒药毒杀: {poison_target}({target_p.name})")
                    self.state.add_event("witch_poison", witch.id, poison_target,
                        f"女巫毒杀 {target_p.name}")
                else:
                    poison_target = None

        if not saved and not poison_target:
            print("  （女巫未使用药物）")

        return saved, poison_target

    def run_day(self, night_result: NightResult):
        """白天阶段"""
        self._print_header(f"第 {self.state.round} 轮 - 白天")
        self.state.phase = Phase.DAY
        self.state.speeches = []

        # 宣布死亡
        print("☀️ 天亮了！\n")
        deaths = []
        for pid in night_result.deaths:
            p = self.state.get_player(pid)
            if p:
                deaths.append(p)

        if deaths:
            print("【昨晚死亡公告】")
            for p in deaths:
                print(f"  💀 {p.id}({p.name}) 死亡，身份是 {p.role.emoji} {p.role.cn_name}")
        else:
            print("【平安夜】昨晚无人死亡！")

        print()
        time.sleep(0.5)

        # 发言阶段
        print("【发言阶段】")
        for player in self.state.alive_players:
            ai = self.ai_players[player.id]
            speech = ai.make_speech(self.state, deaths)
            self.state.speeches.append({
                "player": player.id,
                "name": player.name,
                "content": speech
            })
            print(f"\n  {player.emoji} {player.id}({player.name}):")
            print(f"    「{speech}」")
            self.state.add_event("speech", player.id, None, speech)
            time.sleep(0.3)

        print()

        # 投票阶段
        self._voting_phase()

    def _voting_phase(self):
        """投票阶段"""
        print("【投票阶段】")
        self.state.phase = Phase.VOTE
        self.state.votes = {}

        for player in self.state.alive_players:
            ai = self.ai_players[player.id]
            vote = ai.cast_vote(self.state)
            self.state.votes[player.id] = vote

            if vote == "弃票":
                print(f"  {player.id}({player.name}) → 弃票")
            else:
                target = self.state.get_player(vote)
                target_name = target.name if target else "?"
                print(f"  {player.id}({player.name}) → {vote}({target_name})")

            time.sleep(0.2)

        # 统计票数
        print("\n【投票结果】")
        vote_counts = Counter(v for v in self.state.votes.values() if v != "弃票")

        if not vote_counts:
            print("  无人被投票，跳过处决")
            return

        # 找出最高票
        max_votes = max(vote_counts.values())
        top_voted = [pid for pid, count in vote_counts.items() if count == max_votes]

        if len(top_voted) > 1:
            print(f"  平票（{max_votes}票）：{', '.join(top_voted)}，无人出局")
            return

        # 处决
        executed_id = top_voted[0]
        executed = self.state.kill_player(executed_id)
        if executed:
            print(f"  🗳️ {executed_id}({executed.name}) 以 {max_votes} 票被投出")
            print(f"  📜 身份揭晓: {executed.role.emoji} {executed.role.cn_name}")
            self.state.add_event("vote_out", "投票", executed_id,
                f"{executed.name} 被投出，身份是{executed.role.cn_name}")

    def end_game(self, winner: Team):
        """游戏结束"""
        self._print_header("游戏结束")
        self.state.phase = Phase.END

        if winner == Team.WOLF:
            print("🐺🐺🐺 狼人阵营获胜！🐺🐺🐺\n")
        else:
            print("🎉🎉🎉 好人阵营获胜！🎉🎉🎉\n")

        # 显示所有玩家身份
        print("【身份揭晓】")
        for p in self.state.players:
            status = "存活" if p.is_alive else "死亡"
            print(f"  {p.id}({p.name}): {p.role.emoji} {p.role.cn_name} [{status}]")

        # 显示游戏统计
        print(f"\n【游戏统计】")
        print(f"  总回合数: {self.state.round}")
        print(f"  存活人数: {len(self.state.alive_players)}")

    def _print_header(self, title: str):
        """打印分隔标题"""
        line = "═" * 40
        print(f"\n{line}")
        print(f"  {title}")
        print(f"{line}\n")


def main():
    parser = argparse.ArgumentParser(description="AI 狼人杀")
    parser.add_argument("--mode", choices=["standalone", "sdk"],
                        default="standalone", help="运行模式")
    args = parser.parse_args()

    print("""
    ╔══════════════════════════════════════╗
    ║         🐺 AI 狼人杀 🐺              ║
    ║    多 AI Agent 协作游戏 Demo         ║
    ╚══════════════════════════════════════╝
    """)

    # 显示 LLM 配置信息
    llm_config = config.get_llm_config()
    if llm_config["provider"] == "none":
        print("⚠️  未检测到 LLM API Key，将使用随机策略模式")
        print("   支持的环境变量:")
        print("   - DEEPSEEK_API_KEY  (DeepSeek)")
        print("   - ANTHROPIC_API_KEY (Claude)")
        print("   - OPENAI_API_KEY    (OpenAI)")
        print("   - LLM_PROVIDER      (指定优先使用的提供商)\n")
    else:
        provider_names = {
            "anthropic": "Claude (Anthropic)",
            "deepseek": "DeepSeek",
            "openai": "OpenAI",
            "openai_compatible": "OpenAI Compatible"
        }
        print(f"🤖 LLM: {provider_names.get(llm_config['provider'], llm_config['provider'])}")
        print(f"   模型: {llm_config['model']}\n")

    game = GameMaster(mode=args.mode)
    game.run_game()


if __name__ == "__main__":
    main()
