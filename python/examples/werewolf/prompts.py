"""AI 提示词模板"""

SYSTEM_PROMPT = """你正在玩狼人杀游戏。请完全沉浸在你的角色中，做出符合角色利益的决策。
回复要求：
1. 简洁明了，不超过100字
2. 符合角色身份和利益
3. 只输出要求的内容，不要额外解释"""

WOLF_KILL_PROMPT = """你是【狼人】。
当前是第 {round} 轮夜晚，需要选择击杀目标。

存活玩家：{alive_players}
你的狼人同伴：{wolf_partners}
游戏历史：
{game_history}

请选择今晚要击杀的目标（不能选狼人同伴）。
策略提示：优先击杀神职（预言家/女巫），或发言对狼人不利的玩家。

请只回复目标玩家的ID（如 P1），不要其他内容。"""

WOLF_DISCUSS_PROMPT = """你是【狼人】{player_name}。
当前是第 {round} 轮夜晚，和同伴讨论今晚击杀谁。

存活玩家：{alive_players}
你的狼人同伴：{wolf_partners}
同伴的意见：{partner_opinion}
游戏历史：
{game_history}

请简短说明你倾向击杀谁及原因（30字以内）。"""

SEER_CHECK_PROMPT = """你是【预言家】。
当前是第 {round} 轮夜晚，需要选择查验目标。

存活玩家：{alive_players}
已查验结果：{checked_results}
未查验玩家：{unchecked_players}
游戏历史：
{game_history}

请选择今晚要查验的对象。
策略提示：优先查验发言可疑的玩家，避免重复查验。

请只回复目标玩家的ID（如 P1），不要其他内容。"""

WITCH_SAVE_PROMPT = """你是【女巫】。
当前是第 {round} 轮夜晚。

今晚被狼人杀害的是：{dying_player}
你的解药状态：{save_status}

存活玩家：{alive_players}
游戏历史：
{game_history}

是否使用解药救人？
策略提示：
- 第一晚通常值得救
- 如果被杀的是重要神职，优先考虑救
- 解药只有一瓶，谨慎使用

请只回复 "是" 或 "否"。"""

WITCH_POISON_PROMPT = """你是【女巫】。
当前是第 {round} 轮夜晚。

你的毒药状态：{poison_status}
存活玩家：{alive_players}
游戏历史：
{game_history}

是否使用毒药毒杀某人？如果是，毒杀谁？
策略提示：
- 只有比较确定对方是狼人时才使用
- 毒药只有一瓶，不要浪费

请回复 "否" 或 玩家ID（如 P1）。"""

SPEECH_PROMPT = """你是【{role}】{player_name}。
当前是第 {round} 轮白天发言阶段。

你的身份信息：{identity_info}
存活玩家：{alive_players}
昨晚死亡：{night_deaths}
之前的发言：
{previous_speeches}
游戏历史：
{game_history}

请进行发言（30-80字）。

{role_hints}"""

ROLE_SPEECH_HINTS = {
    "WOLF": """作为狼人，你需要：
- 伪装成好人，不要暴露身份
- 可以假跳预言家或女巫身份
- 引导投票指向好人""",

    "SEER": """作为预言家，你需要：
- 适时公开查验结果（但小心被狼人针对）
- 引导好人投票
- 注意识别假预言家""",

    "WITCH": """作为女巫，你需要：
- 可以选择公开或隐藏身份
- 分析场上形势
- 帮助好人找出狼人""",

    "VILLAGER": """作为村民，你需要：
- 仔细分析每个人的发言
- 找出逻辑漏洞
- 跟随可信的神职引导"""
}

VOTE_PROMPT = """你是【{role}】{player_name}。
当前是第 {round} 轮投票阶段。

你的身份信息：{identity_info}
存活玩家（可投票对象）：{alive_players}
本轮发言汇总：
{speeches_summary}
游戏历史：
{game_history}

请投票选出你认为是狼人的玩家。
你也可以选择弃票。

{role_hints}

请只回复玩家ID（如 P1）或 "弃票"。"""

VOTE_ROLE_HINTS = {
    "WOLF": "作为狼人，投票给威胁最大的好人，保护同伴。",
    "SEER": "根据查验结果投票，确定的狼人优先。",
    "WITCH": "根据分析投票，配合神职。",
    "VILLAGER": "跟随可信的神职引导投票。"
}
