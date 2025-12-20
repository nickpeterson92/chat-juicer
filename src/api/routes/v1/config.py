"""
Configuration endpoints (v1).

Provides application configuration for the frontend with consistent
response patterns and comprehensive OpenAPI documentation.
"""

from __future__ import annotations

from fastapi import APIRouter

from core.constants import MODEL_METADATA, MODELS_WITH_REASONING, get_settings
from models.schemas.config import ConfigResponse, MCPServerConfig, ModelConfigItem

router = APIRouter()


@router.get(
    "/config",
    response_model=ConfigResponse,
    summary="Get configuration",
    description="Get application configuration including available models, reasoning efforts, and MCP servers.",
    responses={
        200: {
            "description": "Configuration retrieved successfully",
            "content": {
                "application/json": {
                    "example": {
                        "models": [
                            {
                                "id": "gpt-4o",
                                "name": "GPT-4o",
                                "provider": "azure",
                                "context_window": 128000,
                                "supports_reasoning": True,
                            }
                        ],
                        "reasoning_efforts": ["none", "low", "medium", "high"],
                        "mcp_servers": [
                            {
                                "id": "sequential-thinking",
                                "name": "Sequential Thinking",
                                "description": "Advanced reasoning",
                                "enabled": True,
                            }
                        ],
                        "max_file_size": 10485760,
                        "version": "1.0.0-local",
                    }
                }
            },
        }
    },
)
async def get_config() -> ConfigResponse:
    """Get application configuration for frontend."""
    settings = get_settings()

    # Build model list from metadata in frontend-expected format
    default_model = "gpt-5.2"  # Default model
    models = [
        ModelConfigItem(
            value=model_id,
            isDefault=(model_id == default_model),
            supportsReasoning=(model_id in MODELS_WITH_REASONING),
        )
        for model_id in MODEL_METADATA
    ]

    # Build MCP server list
    mcp_servers = [
        MCPServerConfig(
            id="sequential-thinking",
            name="Sequential Thinking",
            description="Advanced reasoning with structured thinking",
            enabled=True,
        ),
        MCPServerConfig(
            id="fetch",
            name="Fetch",
            description="HTTP/HTTPS web content retrieval",
            enabled=True,
        ),
    ]

    # Add Tavily if configured
    if settings.tavily_api_key:
        mcp_servers.append(
            MCPServerConfig(
                id="tavily",
                name="Tavily Search",
                description="AI-powered web search",
                enabled=True,
            )
        )

    return ConfigResponse(
        models=models,
        reasoning_levels=[
            {"value": "none", "label": "None", "isDefault": False},
            {"value": "low", "label": "Low", "isDefault": False},
            {"value": "medium", "label": "Medium", "isDefault": True},
            {"value": "high", "label": "High", "isDefault": False},
        ],
        mcp_servers=mcp_servers,
        max_file_size=settings.max_file_size,
        version="1.0.0-local",
    )
