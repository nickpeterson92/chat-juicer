"""
API v1 Router - Aggregates all v1 endpoints.

This module provides:
- Centralized v1 route registration
- Consistent prefix handling
- Version-specific middleware hooks

Usage in main.py:
    from api.routes.v1 import router as v1_router
    app.include_router(v1_router, prefix="/api/v1")
"""

from fastapi import APIRouter

from api.routes.v1 import auth, config, context, files, health, messages, projects, sessions

# Create the v1 API router
router = APIRouter()

# Health endpoints (no auth required)
router.include_router(
    health.router,
    tags=["Health"],
)

# Authentication endpoints
router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Authentication"],
)

# Project management
router.include_router(
    projects.router,
    tags=["Projects"],
)

# Session management
router.include_router(
    sessions.router,
    prefix="/sessions",
    tags=["Sessions"],
)

# Message pagination (nested under sessions)
router.include_router(
    messages.router,
    prefix="/sessions",
    tags=["Messages"],
)

# File management (nested under sessions)
router.include_router(
    files.router,
    prefix="/sessions",
    tags=["Files"],
)

# Context search (vector similarity)
router.include_router(
    context.router,
    tags=["Context"],
)

# Configuration
router.include_router(
    config.router,
    tags=["Configuration"],
)

__all__ = ["router"]
