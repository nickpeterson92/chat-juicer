"""
Configuration API schemas.

Provides response models for application configuration
with comprehensive OpenAPI documentation.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ModelConfigItem(BaseModel):
    """Model configuration for frontend selector."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "value": "gpt-4o",
                "isDefault": False,
                "supportsReasoning": True,
            }
        },
    )

    value: str = Field(
        ...,
        description="Model identifier for API calls",
        json_schema_extra={"example": "gpt-4o"},
    )
    isDefault: bool = Field(
        default=False,
        description="Whether this is the default model",
        json_schema_extra={"example": False},
    )
    supportsReasoning: bool = Field(
        default=False,
        description="Whether model supports extended thinking",
        json_schema_extra={"example": True},
    )


class MCPServerConfig(BaseModel):
    """MCP server configuration."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "sequential-thinking",
                "name": "Sequential Thinking",
                "description": "Advanced reasoning with structured thinking",
                "enabled": True,
            }
        }
    )

    id: str = Field(..., description="Server identifier")
    name: str = Field(..., description="Human-readable name")
    description: str | None = Field(default=None, description="Server description")
    enabled: bool = Field(default=True, description="Whether server is available")


class ConfigResponse(BaseModel):
    """Application configuration for frontend."""

    model_config = ConfigDict(
        json_schema_extra={
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
                "reasoning_levels": ["none", "low", "medium", "high"],
                "mcp_servers": [
                    {
                        "id": "sequential-thinking",
                        "name": "Sequential Thinking",
                        "enabled": True,
                    }
                ],
                "max_file_size": 10485760,
                "version": "1.0.0-local",
            }
        }
    )

    models: list[ModelConfigItem] = Field(
        ...,
        description="Available AI models",
    )
    reasoning_levels: list[dict[str, Any]] = Field(
        default_factory=lambda: [
            {"value": "none", "label": "None", "isDefault": False},
            {"value": "low", "label": "Low", "isDefault": False},
            {"value": "medium", "label": "Medium", "isDefault": True},
            {"value": "high", "label": "High", "isDefault": False},
        ],
        description="Available reasoning effort levels",
    )
    mcp_servers: list[MCPServerConfig] = Field(
        default_factory=list,
        description="Available MCP servers",
    )
    max_file_size: int = Field(
        default=10485760,
        ge=0,
        description="Maximum upload file size in bytes",
        json_schema_extra={"example": 10485760},
    )
    version: str = Field(
        default="1.0.0-local",
        description="API version",
        json_schema_extra={"example": "1.0.0-local"},
    )
