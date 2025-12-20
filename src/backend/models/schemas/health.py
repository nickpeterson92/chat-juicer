"""
Health check API schemas.

Provides response models for health, readiness, and liveness probes
with comprehensive OpenAPI documentation.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DatabaseHealth(BaseModel):
    """Database connection pool health."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "healthy": True,
                "pool_size": 10,
                "pool_free": 8,
                "pool_used": 2,
            }
        }
    )

    healthy: bool = Field(..., description="Database is accessible")
    pool_size: int = Field(default=0, ge=0, description="Total pool size")
    pool_free: int = Field(default=0, ge=0, description="Available connections")
    pool_used: int = Field(default=0, ge=0, description="Active connections")
    error: str | None = Field(default=None, description="Error if unhealthy")


class WebSocketHealth(BaseModel):
    """WebSocket manager health."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "active_connections": 5,
                "active_sessions": 3,
                "shutting_down": False,
            }
        }
    )

    active_connections: int = Field(default=0, ge=0, description="Open connections")
    active_sessions: int = Field(default=0, ge=0, description="Active sessions")
    shutting_down: bool = Field(default=False, description="Shutdown in progress")
    error: str | None = Field(default=None, description="Error if unhealthy")


class MCPHealth(BaseModel):
    """MCP server pool health."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "initialized": True,
                "pool_size": 3,
                "available": 2,
            }
        }
    )

    initialized: bool = Field(..., description="Pool is initialized")
    pool_size: int = Field(default=0, ge=0, description="Configured pool size")
    available: int = Field(default=0, ge=0, description="Available instances")


class HealthResponse(BaseModel):
    """Comprehensive health check response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "healthy",
                "version": "1.0.0-local",
                "database": {
                    "healthy": True,
                    "pool_size": 10,
                    "database": {
                        "healthy": True,
                        "pool_size": 10,
                        "pool_free": 8,
                        "pool_used": 2,
                    },
                },
                "websocket": {
                    "active_connections": 5,
                    "shutting_down": False,
                },
                "mcp": {
                    "initialized": True,
                    "pool_size": 3,
                },
            }
        }
    )

    status: Literal["healthy", "degraded", "unhealthy"] = Field(
        ...,
        description="Overall system health status",
        json_schema_extra={"example": "healthy"},
    )
    version: str = Field(
        ...,
        description="Application version",
        json_schema_extra={"example": "1.0.0-local"},
    )
    database: DatabaseHealth = Field(..., description="Database health")
    websocket: WebSocketHealth = Field(..., description="WebSocket health")
    mcp: MCPHealth = Field(..., description="MCP server pool health")


class ReadinessResponse(BaseModel):
    """Kubernetes-style readiness probe response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "ready": True,
            }
        }
    )

    ready: bool = Field(
        ...,
        description="Service is ready to accept traffic",
        json_schema_extra={"example": True},
    )
    error: str | None = Field(
        default=None,
        description="Error message if not ready",
    )


class LivenessResponse(BaseModel):
    """Kubernetes-style liveness probe response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "alive": True,
            }
        }
    )

    alive: bool = Field(
        default=True,
        description="Process is running",
        json_schema_extra={"example": True},
    )
