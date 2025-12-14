from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from api.dependencies import DB

router = APIRouter()


@router.get("/health")
async def health_check(db: DB) -> dict[str, Any]:
    """Health check endpoint with DB probe."""
    try:
        async with db.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_status = "healthy"
    except Exception as exc:
        db_status = f"unhealthy: {exc}"

    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "database": db_status,
        "version": "1.0.0-local",
    }
