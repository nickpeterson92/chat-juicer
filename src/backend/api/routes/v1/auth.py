"""
Authentication endpoints (v1).

Provides login, token refresh, and user info endpoints with consistent
response patterns and comprehensive OpenAPI documentation.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from api.dependencies import DB
from api.middleware.auth import get_current_user
from api.middleware.exception_handlers import AuthenticationError
from api.services.auth_service import AuthService
from models.error_models import ErrorCode
from models.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserInfo,
)

router = APIRouter()


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Register",
    description="Create a new user account and receive access tokens.",
    responses={
        201: {
            "description": "Registration successful",
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                        "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                        "token_type": "bearer",
                        "expires_in": 3600,
                        "user": {
                            "id": "550e8400-e29b-41d4-a716-446655440000",
                            "email": "user@example.com",
                            "display_name": "John Doe",
                        },
                    }
                }
            },
        },
        409: {"description": "Email already registered"},
    },
)
async def register(body: RegisterRequest, db: DB) -> TokenResponse:
    """Register new user and issue tokens."""
    auth = AuthService(db)
    try:
        result = await auth.register(body.email, body.password, body.display_name)
        return TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            expires_in=result.get("expires_in", 3600),
            user=(
                UserInfo(
                    id=result["user"]["id"],
                    email=result["user"]["email"],
                    display_name=result["user"].get("display_name"),
                )
                if "user" in result
                else None
            ),
        )
    except ValueError as exc:
        from api.middleware.exception_handlers import AppException

        raise AppException(
            code=ErrorCode.RESOURCE_ALREADY_EXISTS,
            message=str(exc),
        ) from exc


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login",
    description="Authenticate with email and password to receive access tokens.",
    responses={
        200: {
            "description": "Login successful",
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                        "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                        "token_type": "bearer",
                        "expires_in": 3600,
                        "user": {
                            "id": "550e8400-e29b-41d4-a716-446655440000",
                            "email": "user@example.com",
                        },
                    }
                }
            },
        },
        401: {"description": "Invalid credentials"},
    },
)
async def login(body: LoginRequest, db: DB) -> TokenResponse:
    """Login and issue tokens."""
    auth = AuthService(db)
    try:
        result = await auth.login(body.email, body.password)
        return TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            expires_in=result.get("expires_in", 3600),
            user=(
                UserInfo(
                    id=result["user"]["id"],
                    email=result["user"]["email"],
                    display_name=result["user"].get("display_name"),
                )
                if "user" in result
                else None
            ),
        )
    except ValueError as exc:
        raise AuthenticationError(
            message=str(exc),
            code=ErrorCode.AUTH_INVALID_CREDENTIALS,
        ) from exc


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh token",
    description="Exchange a refresh token for a new access token.",
    responses={
        200: {
            "description": "Token refreshed",
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                        "token_type": "bearer",
                        "expires_in": 3600,
                    }
                }
            },
        },
        401: {"description": "Invalid or expired refresh token"},
    },
)
async def refresh(body: RefreshRequest, db: DB) -> TokenResponse:
    """Refresh access token."""
    auth = AuthService(db)
    try:
        tokens = await auth.refresh(body.refresh_token)
        return TokenResponse(
            access_token=tokens["access"],
            refresh_token=tokens["refresh"],
        )
    except ValueError as exc:
        raise AuthenticationError(
            message=str(exc),
            code=ErrorCode.AUTH_EXPIRED_TOKEN,
        ) from exc


@router.get(
    "/me",
    response_model=UserInfo,
    summary="Get current user",
    description="Get information about the currently authenticated user.",
    responses={
        200: {
            "description": "User information",
            "content": {
                "application/json": {
                    "example": {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "email": "user@example.com",
                        "display_name": "John Doe",
                    }
                }
            },
        },
        401: {"description": "Not authenticated"},
    },
)
async def me(user: Annotated[UserInfo, Depends(get_current_user)]) -> UserInfo:
    """Get current user information."""
    return user
