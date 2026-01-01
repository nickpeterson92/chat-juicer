"""
Health check endpoints (v1).

Provides health, readiness, and liveness probes with consistent
response patterns and comprehensive OpenAPI documentation.
"""

from __future__ import annotations

from datetime import timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from api.dependencies import DB
from models.schemas.health import (
    DatabaseHealth,
    HealthResponse,
    LivenessResponse,
    MCPHealth,
    ReadinessResponse,
    S3Health,
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
    from datetime import datetime

    # Calculate uptime
    startup_time = getattr(request.app.state, "startup_time", None)
    now_utc = datetime.now(timezone.utc)
    if startup_time:
        uptime = (now_utc - startup_time).total_seconds()
        startup_str = startup_time.isoformat()
    else:
        uptime = 0.0
        startup_str = now_utc.isoformat()

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

    # MCP manager statistics & health
    mcp_manager = request.app.state.mcp_manager
    mcp_ping_data = {}
    if mcp_manager:
        stats = mcp_manager.get_stats()
        # Perform deep check
        mcp_ping_data = await mcp_manager.check_connectivity()

        server_count = stats.get("server_count", 0)
        mcp_health = MCPHealth(
            initialized=stats.get("initialized", True),
            pool_size=server_count,
            available=server_count,
            ping_latency_ms=mcp_ping_data.get("latency_ms"),
            error=str(mcp_ping_data.get("details")) if not mcp_ping_data.get("healthy") else None,
        )
    else:
        mcp_health = MCPHealth(initialized=False, pool_size=0, available=0)

    # S3 health
    s3_health = None
    s3_service = getattr(request.app.state, "s3_sync", None)
    if s3_service:
        s3_data = await s3_service.check_connectivity()
        s3_health = S3Health(
            bucket=s3_service.bucket,
            connected=s3_data.get("connected", False),
            latency_ms=s3_data.get("latency_ms"),
            error=s3_data.get("error"),
        )

    # Determine overall status
    db_healthy = db_health_data.get("healthy", False)
    ws_healthy = not ws_health.shutting_down and ws_health.error is None
    mcp_healthy = mcp_ping_data.get("healthy", True)  # Default true if no manager (not critical)
    s3_healthy = s3_health.connected if s3_health else True

    if db_healthy and ws_healthy and mcp_healthy and s3_healthy:
        status = "healthy"
    elif db_healthy:
        # DB is critical, others might mean degraded
        status = "degraded"
    else:
        status = "unhealthy"

    return HealthResponse(
        status=status,
        version="1.0.0-local",
        uptime_seconds=uptime,
        startup_time=startup_str,
        database=DatabaseHealth(
            healthy=db_healthy,
            pool_size=db_health_data.get("pool_size", 0),
            pool_free=db_health_data.get("pool_free", 0),
            pool_used=db_health_data.get("pool_used", 0),
            error=db_health_data.get("error"),
        ),
        websocket=ws_health,
        mcp=mcp_health,
        s3=s3_health,
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
