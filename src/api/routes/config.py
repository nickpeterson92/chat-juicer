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
    """Return model and MCP configuration for the frontend.

    Response format matches frontend expectations for ModelSelector component.
    """
    model_metadata = {m.id: m for m in MODEL_CONFIGS}
    default_model = SUPPORTED_MODELS[0] if SUPPORTED_MODELS else "gpt-4o"

    return {
        "success": True,
        # Models in format expected by ModelSelector
        "models": [
            {
                "value": model_id,
                "label": model_metadata[model_id].display_name,
                "isDefault": model_id == default_model,
                "supportsReasoning": model_id in MODELS_WITH_REASONING,
                # Also include additional metadata for flexibility
                "provider": model_metadata[model_id].model_family or "openai",
                "context_window": MODEL_TOKEN_LIMITS.get(model_id, 128000),
            }
            for model_id in SUPPORTED_MODELS
        ],
        # Reasoning levels in format expected by ModelSelector
        "reasoning_levels": [
            {"value": level, "label": level.capitalize(), "isDefault": level == "medium"}
            for level in REASONING_EFFORT_OPTIONS
        ],
        # Additional config
        "mcp_servers": ["sequential-thinking", "fetch"],
        "max_file_size": 50 * 1024 * 1024,
    }
