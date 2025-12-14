from __future__ import annotations

from typing import Annotated
from uuid import UUID

import asyncpg

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.dependencies import get_db
from api.services.auth_service import AuthService
from core.constants import get_settings
from models.api_models import UserInfo

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
                raise HTTPException(status_code=401, detail="Default user not found")
            payload = auth.user_payload(user)
            return UserInfo(**payload)
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
    try:
        payload = auth.decode_access_token(token)
        user = await auth.get_user_by_id(UUID(payload["sub"]))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return UserInfo(**auth.user_payload(user))


async def get_current_user_from_token(token: str, db: asyncpg.Pool) -> UserInfo:
    """Authenticate WebSocket connections via query token."""
    auth = AuthService(db)
    try:
        payload = auth.decode_access_token(token)
        user = await auth.get_user_by_id(UUID(payload["sub"]))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return UserInfo(**auth.user_payload(user))


def _is_localhost(request: Request) -> bool:
    """Check if the request originates from localhost."""
    host = request.client.host if request.client else ""
    return host in {"127.0.0.1", "localhost", "::1"}
