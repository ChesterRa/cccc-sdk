"""游戏配置"""

import os
from .roles import Role

# ============================================================
# LLM 配置 - 支持多种提供商
# ============================================================

# LLM 提供商: "anthropic", "openai", "deepseek", "openai_compatible"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")

# API Keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

# 自定义 OpenAI 兼容 API（如本地部署、其他提供商）
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "")  # 如 "http://localhost:8000/v1"
OPENAI_COMPATIBLE_KEY = os.getenv("OPENAI_COMPATIBLE_KEY", "")

# 模型配置
LLM_MODELS = {
    "anthropic": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
    "openai": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    "deepseek": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
    "openai_compatible": os.getenv("OPENAI_COMPATIBLE_MODEL", ""),
}

# DeepSeek API 地址
DEEPSEEK_API_BASE = "https://api.deepseek.com"

# ============================================================
# 游戏配置
# ============================================================

PLAYER_NAMES = ["张三", "李四", "王五", "赵六", "钱七", "孙八"]

# 角色分配 (6人局)
ROLE_CONFIG = [
    Role.WOLF,      # 2 狼人
    Role.WOLF,
    Role.SEER,      # 1 预言家
    Role.WITCH,     # 1 女巫
    Role.VILLAGER,  # 2 村民
    Role.VILLAGER,
]

# 显示配置
DELAY_BETWEEN_ACTIONS = 0.5  # 动作间延迟（秒）
SHOW_AI_THINKING = True      # 是否显示AI思考过程


def get_llm_config():
    """获取当前 LLM 配置"""
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
        # 回退：自动检测可用的 key
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
