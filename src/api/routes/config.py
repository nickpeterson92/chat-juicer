from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from core.constants import (
    MODEL_CONFIGS,
    MODEL_TOKEN_LIMITS,
    MODELS_WITH_REASONING,
    REASONING_EFFORT_OPTIONS,
    SUPPORTED_MODELS,
)

router = APIRouter()


@router.get("/config")
async def get_config() -> dict[str, Any]:
    """Return model and MCP configuration for the frontend."""
    model_metadata = {m.id: m for m in MODEL_CONFIGS}

    return {
        "models": [
            {
                "id": model_id,
                "name": model_metadata[model_id].display_name,
                "provider": model_metadata[model_id].model_family or "openai",
                "context_window": MODEL_TOKEN_LIMITS.get(model_id, 128000),
                "supports_reasoning": model_id in MODELS_WITH_REASONING,
            }
            for model_id in SUPPORTED_MODELS
        ],
        "reasoning_efforts": REASONING_EFFORT_OPTIONS,
        "mcp_servers": ["sequential-thinking", "fetch"],
        "max_file_size": 50 * 1024 * 1024,
    }
