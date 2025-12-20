from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from api.dependencies import DB
from utils.db_utils import check_pool_health

router = APIRouter()


@router.get("/health")
async def health_check(db: DB, request: Request) -> dict[str, Any]:
    """Health check endpoint with comprehensive resource status."""
    # Database health with pool statistics
    db_health = await check_pool_health(db)

    # WebSocket statistics
    ws_manager = request.app.state.ws_manager
    ws_stats = ws_manager.get_stats() if ws_manager else {"error": "not initialized"}

    # MCP pool statistics
    mcp_pool = request.app.state.mcp_pool
    mcp_stats = {"initialized": mcp_pool is not None}

    # Determine overall status
    is_healthy = db_health["healthy"] and not ws_stats.get("shutting_down", False)

    return {
        "status": "healthy" if is_healthy else "degraded",
        "version": "1.0.0-local",
        "database": db_health,
        "websocket": ws_stats,
        "mcp": mcp_stats,
    }


@router.get("/health/ready")
async def readiness_check(db: DB) -> dict[str, Any]:
    """Kubernetes-style readiness probe (lightweight)."""
    try:
        async with db.acquire(timeout=5.0) as conn:
            await conn.fetchval("SELECT 1")
        return {"ready": True}
    except Exception as e:
        return {"ready": False, "error": str(e)}


@router.get("/health/live")
async def liveness_check() -> dict[str, Any]:
    """Kubernetes-style liveness probe (just confirms process is running)."""
    return {"alive": True}
