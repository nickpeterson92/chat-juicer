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
                "ping_latency_ms": 45.2,
            }
        }
    )

    initialized: bool = Field(..., description="Pool is initialized")
    pool_size: int = Field(default=0, ge=0, description="Configured pool size")
    available: int = Field(default=0, ge=0, description="Available instances")
    ping_latency_ms: float | None = Field(default=None, description="Average ping latency")
    error: str | None = Field(default=None, description="Connectivity error")


class S3Health(BaseModel):
    """S3 storage health."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "bucket": "chat-juicer-sessions",
                "connected": True,
            }
        }
    )

    bucket: str = Field(..., description="Bucket name")
    connected: bool = Field(..., description="Connectivity confirmed")
    latency_ms: float | None = Field(default=None, description="Ping latency")
    error: str | None = Field(default=None, description="Connectivity error")


class HealthResponse(BaseModel):
    """Comprehensive health check response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "healthy",
                "version": "1.0.0-local",
                "uptime_seconds": 3600.5,
                "startup_time": "2023-12-31T12:00:00Z",
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
                "s3": {
                    "bucket": "test-bucket",
                    "connected": True,
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
    uptime_seconds: float = Field(..., description="Seconds since startup")
    startup_time: str = Field(..., description="Startup timestamp (ISO 8601)")
    database: DatabaseHealth = Field(..., description="Database health")
    websocket: WebSocketHealth = Field(..., description="WebSocket health")
    mcp: MCPHealth = Field(..., description="MCP server pool health")
    s3: S3Health | None = Field(default=None, description="S3 storage health")


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
