"""
Health check endpoints (v1).

Provides health, readiness, and liveness probes with consistent
response patterns and comprehensive OpenAPI documentation.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from api.dependencies import DB
from models.schemas.health import (
    DatabaseHealth,
    HealthResponse,
    LivenessResponse,
    MCPHealth,
    ReadinessResponse,
    WebSocketHealth,
)
from utils.db_utils import check_pool_health

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Comprehensive health check with all subsystem statuses.",
    responses={
        200: {
            "description": "System health status",
            "content": {
                "application/json": {
                    "example": {
                        "status": "healthy",
                        "version": "1.0.0-local",
                        "database": {
                            "healthy": True,
                            "pool_size": 10,
                            "pool_free": 8,
                            "pool_used": 2,
                        },
                        "websocket": {
                            "active_connections": 5,
                            "active_sessions": 3,
                            "shutting_down": False,
                        },
                        "mcp": {
                            "initialized": True,
                            "pool_size": 3,
                            "available": 2,
                        },
                    }
                }
            },
        }
    },
    tags=["Health"],
)
async def health_check(db: DB, request: Request) -> HealthResponse:
    """Comprehensive health check endpoint."""
    # Database health with pool statistics
    db_health_data = await check_pool_health(db)

    # WebSocket statistics
    ws_manager = request.app.state.ws_manager
    if ws_manager:
        ws_stats = ws_manager.get_stats()
        ws_health = WebSocketHealth(
            active_connections=ws_stats.get("active_connections", 0),
            active_sessions=ws_stats.get("active_sessions", 0),
            shutting_down=ws_stats.get("shutting_down", False),
        )
    else:
        ws_health = WebSocketHealth(error="not initialized")

    # MCP manager statistics
    mcp_manager = request.app.state.mcp_manager
    if mcp_manager:
        stats = mcp_manager.get_stats()
        server_count = stats.get("server_count", 0)
        mcp_health = MCPHealth(
            initialized=stats.get("initialized", True),
            pool_size=server_count,
            available=server_count,
        )
    else:
        mcp_health = MCPHealth(initialized=False, pool_size=0, available=0)

    # Determine overall status
    db_healthy = db_health_data.get("healthy", False)
    ws_healthy = not ws_health.shutting_down and ws_health.error is None

    if db_healthy and ws_healthy:
        status = "healthy"
    elif db_healthy or ws_healthy:
        status = "degraded"
    else:
        status = "unhealthy"

    return HealthResponse(
        status=status,
        version="1.0.0-local",
        database=DatabaseHealth(
            healthy=db_healthy,
            pool_size=db_health_data.get("pool_size", 0),
            pool_free=db_health_data.get("pool_free", 0),
            pool_used=db_health_data.get("pool_used", 0),
            error=db_health_data.get("error"),
        ),
        websocket=ws_health,
        mcp=mcp_health,
    )


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe",
    description="Kubernetes-style readiness probe for load balancer integration.",
    responses={
        200: {
            "description": "Service ready",
            "content": {"application/json": {"example": {"ready": True}}},
        },
        503: {
            "description": "Service not ready",
            "content": {"application/json": {"example": {"ready": False, "error": "Database unavailable"}}},
        },
    },
    tags=["Health"],
)
async def readiness_check(db: DB) -> ReadinessResponse | JSONResponse:
    """Kubernetes-style readiness probe."""
    try:
        async with db.acquire(timeout=5.0) as conn:
            await conn.fetchval("SELECT 1")
        return ReadinessResponse(ready=True)
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"ready": False, "error": str(e)},
        )


@router.get(
    "/health/live",
    response_model=LivenessResponse,
    summary="Liveness probe",
    description="Kubernetes-style liveness probe to confirm process is running.",
    responses={
        200: {
            "description": "Process alive",
            "content": {"application/json": {"example": {"alive": True}}},
        }
    },
    tags=["Health"],
)
async def liveness_check() -> LivenessResponse:
    """Kubernetes-style liveness probe."""
    return LivenessResponse(alive=True)
