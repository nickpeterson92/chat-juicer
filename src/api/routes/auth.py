from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.dependencies import DB
from api.middleware.auth import get_current_user
from api.middleware.exception_handlers import AuthenticationError
from api.services.auth_service import AuthService
from models.api_models import TokenResponse, UserInfo
from models.error_models import ErrorCode

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: Annotated[DB, DB]) -> TokenResponse:
    """Login and issue tokens (Phase 1: seeded user)."""
    auth = AuthService(db)
    try:
        result = await auth.login(body.email, body.password)
        return TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
        )
    except ValueError as exc:
        raise AuthenticationError(
            message=str(exc),
            code=ErrorCode.AUTH_INVALID_TOKEN,
        ) from exc


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: Annotated[DB, DB]) -> TokenResponse:
    """Refresh access token."""
    auth = AuthService(db)
    try:
        access = await auth.refresh(body.refresh_token)
        return TokenResponse(access_token=access, refresh_token=body.refresh_token)
    except ValueError as exc:
        raise AuthenticationError(
            message=str(exc),
            code=ErrorCode.AUTH_EXPIRED_TOKEN,
        ) from exc


@router.get("/me")
async def me(user: Annotated[UserInfo, Depends(get_current_user)]) -> UserInfo:
    """Get current user (requires valid access token)."""
    return user
