"""AI prompt templates."""

SYSTEM_PROMPT = """You are playing Werewolf. Fully stay in character and make decisions that maximize your side's chance to win.
Response rules:
1. Be concise.
2. Align with your role incentives.
3. Output only what is requested, with no extra explanation."""

WOLF_KILL_PROMPT = """You are a WEREWOLF.
Round {round}, night phase. Choose a kill target.

Alive players: {alive_players}
Your werewolf partners: {wolf_partners}
Game history:
{game_history}

Choose one target for tonight (cannot be your werewolf partner).
Strategy hint: prioritize special roles (seer/witch) or players hostile to werewolves.

Reply with target player ID only (e.g. P1)."""

WOLF_DISCUSS_PROMPT = """You are WEREWOLF {player_name}.
Round {round}, night phase. Discuss with your partner who to kill tonight.

Alive players: {alive_players}
Your werewolf partners: {wolf_partners}
Partner opinion: {partner_opinion}
Game history:
{game_history}

Briefly explain your preferred target and reason (within 25 words)."""

SEER_CHECK_PROMPT = """You are the SEER.
Round {round}, night phase. Choose a player to check.

Alive players: {alive_players}
Checked results so far: {checked_results}
Unchecked players: {unchecked_players}
Game history:
{game_history}

Pick one player to check tonight.
Strategy hint: prioritize suspicious speakers and avoid repeat checks.

Reply with target player ID only (e.g. P1)."""

WITCH_SAVE_PROMPT = """You are the WITCH.
Round {round}, night phase.

Tonight's victim: {dying_player}
Antidote status: {save_status}

Alive players: {alive_players}
Game history:
{game_history}

Do you use antidote to save the victim?
Strategy hints:
- Saving on early rounds is often strong.
- Saving a likely special role can be high value.
- You only have one antidote.

Reply with "yes" or "no" only."""

WITCH_POISON_PROMPT = """You are the WITCH.
Round {round}, night phase.

Poison status: {poison_status}
Alive players: {alive_players}
Game history:
{game_history}

Will you use poison tonight? If yes, who?
Strategy hints:
- Use poison only when confidence is reasonably high.
- You only have one poison.

Reply with "no" or a player ID (e.g. P1)."""

SPEECH_PROMPT = """You are {role} {player_name}.
Round {round}, day speech phase.

Your role info: {identity_info}
Alive players: {alive_players}
Deaths last night: {night_deaths}
Previous speeches:
{previous_speeches}
Game history:
{game_history}

Give a speech (30-80 words).

{role_hints}"""

ROLE_SPEECH_HINTS = {
    "WOLF": """As a werewolf:
- Blend in as a villager.
- You may fake seer/witch claims when useful.
- Steer votes onto villagers.""",
    "SEER": """As a seer:
- Reveal checks at the right timing.
- Lead villagers toward informed votes.
- Watch for fake seer claims.""",
    "WITCH": """As a witch:
- Decide carefully when to reveal identity.
- Read board dynamics before using items.
- Help villagers identify werewolves.""",
    "VILLAGER": """As a villager:
- Analyze speeches carefully.
- Look for logic gaps and contradictions.
- Follow credible role signals."""
}

VOTE_PROMPT = """You are {role} {player_name}.
Round {round}, voting phase.

Your role info: {identity_info}
Alive players (valid vote targets): {alive_players}
Speech summary this round:
{speeches_summary}
Game history:
{game_history}

Vote for the player you believe is a werewolf.
You may also abstain.

{role_hints}

Reply with a player ID (e.g. P1) or "abstain" only."""

VOTE_ROLE_HINTS = {
    "WOLF": "As a werewolf, vote out high-threat villagers while protecting your partner.",
    "SEER": "Use your check results: confirmed werewolves first.",
    "WITCH": "Vote from board reads and coordination with trusted information.",
    "VILLAGER": "Follow the most credible, evidence-based village direction."
}
