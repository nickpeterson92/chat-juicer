from __future__ import annotations

from typing import Annotated
from uuid import UUID

import asyncpg

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.dependencies import get_db
from api.middleware.exception_handlers import AuthenticationError
from api.services.auth_service import AuthService
from core.constants import get_settings
from models.api_models import UserInfo
from models.error_models import ErrorCode

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[asyncpg.Pool, Depends(get_db)],
) -> UserInfo:
    """Authenticate incoming REST requests."""
    settings = get_settings()
    auth = AuthService(db)

    if credentials is None:
        if settings.allow_localhost_noauth and _is_localhost(request):
            user = await auth.get_default_user()
            if not user:
                raise AuthenticationError(
                    message="Default user not found",
                    code=ErrorCode.AUTH_USER_NOT_FOUND,
                )
            payload = auth.user_payload(user)
            return UserInfo(**payload)
        raise AuthenticationError(
            message="Authentication required",
            code=ErrorCode.AUTH_REQUIRED,
        )

    token = credentials.credentials
    try:
        payload = auth.decode_access_token(token)
        user = await auth.get_user_by_id(UUID(payload["sub"]))
    except ValueError as exc:
        raise AuthenticationError(
            message="Invalid token",
            code=ErrorCode.AUTH_INVALID_TOKEN,
        ) from exc

    if not user:
        raise AuthenticationError(
            message="User not found",
            code=ErrorCode.AUTH_USER_NOT_FOUND,
        )

    return UserInfo(**auth.user_payload(user))


async def get_current_user_from_token(token: str, db: asyncpg.Pool) -> UserInfo:
    """Authenticate WebSocket connections via query token."""
    auth = AuthService(db)
    try:
        payload = auth.decode_access_token(token)
        user = await auth.get_user_by_id(UUID(payload["sub"]))
    except ValueError as exc:
        raise AuthenticationError(
            message="Invalid token",
            code=ErrorCode.AUTH_INVALID_TOKEN,
        ) from exc

    if not user:
        raise AuthenticationError(
            message="User not found",
            code=ErrorCode.AUTH_USER_NOT_FOUND,
        )

    return UserInfo(**auth.user_payload(user))


def _is_localhost(request: Request) -> bool:
    """Check if the request originates from localhost."""
    host = request.client.host if request.client else ""
    return host in {"127.0.0.1", "localhost", "::1"}
