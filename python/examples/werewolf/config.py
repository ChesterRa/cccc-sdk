"""Game configuration."""

import os
from .roles import Role

# ============================================================
# LLM configuration (multiple providers)
# ============================================================

# LLM provider: "anthropic", "openai", "deepseek", "openai_compatible"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")

# API Keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

# Custom OpenAI-compatible API (e.g. self-hosted or third-party gateway)
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "")  # e.g. "http://localhost:8000/v1"
OPENAI_COMPATIBLE_KEY = os.getenv("OPENAI_COMPATIBLE_KEY", "")

# Model configuration
LLM_MODELS = {
    "anthropic": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
    "openai": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    "deepseek": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
    "openai_compatible": os.getenv("OPENAI_COMPATIBLE_MODEL", ""),
}

# DeepSeek API base URL
DEEPSEEK_API_BASE = "https://api.deepseek.com"

# ============================================================
# Game configuration
# ============================================================

PLAYER_NAMES = ["Alex", "Blake", "Casey", "Drew", "Emery", "Flynn"]

# Role setup (6 players)
ROLE_CONFIG = [
    Role.WOLF,      # 2 werewolves
    Role.WOLF,
    Role.SEER,      # 1 seer
    Role.WITCH,     # 1 witch
    Role.VILLAGER,  # 2 villagers
    Role.VILLAGER,
]

# Display configuration
DELAY_BETWEEN_ACTIONS = 0.5  # Delay between actions (seconds)
SHOW_AI_THINKING = True      # Whether to display AI thinking traces


def get_llm_config():
    """Get active LLM configuration."""
    provider = LLM_PROVIDER.lower()

    if provider == "deepseek" and DEEPSEEK_API_KEY:
        return {
            "provider": "deepseek",
            "api_key": DEEPSEEK_API_KEY,
            "api_base": DEEPSEEK_API_BASE,
            "model": LLM_MODELS["deepseek"],
        }
    elif provider == "openai" and OPENAI_API_KEY:
        return {
            "provider": "openai",
            "api_key": OPENAI_API_KEY,
            "api_base": None,
            "model": LLM_MODELS["openai"],
        }
    elif provider == "openai_compatible" and OPENAI_COMPATIBLE_KEY:
        return {
            "provider": "openai_compatible",
            "api_key": OPENAI_COMPATIBLE_KEY,
            "api_base": OPENAI_API_BASE,
            "model": LLM_MODELS["openai_compatible"],
        }
    elif ANTHROPIC_API_KEY:
        return {
            "provider": "anthropic",
            "api_key": ANTHROPIC_API_KEY,
            "api_base": None,
            "model": LLM_MODELS["anthropic"],
        }
    else:
        # Fallback: auto-detect any available key.
        if DEEPSEEK_API_KEY:
            return {
                "provider": "deepseek",
                "api_key": DEEPSEEK_API_KEY,
                "api_base": DEEPSEEK_API_BASE,
                "model": LLM_MODELS["deepseek"],
            }
        if OPENAI_API_KEY:
            return {
                "provider": "openai",
                "api_key": OPENAI_API_KEY,
                "api_base": None,
                "model": LLM_MODELS["openai"],
            }
        return {"provider": "none", "api_key": "", "api_base": None, "model": ""}
