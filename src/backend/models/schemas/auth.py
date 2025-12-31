"""
Authentication-related API schemas.

Provides request/response models for auth operations
with comprehensive OpenAPI documentation.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    """Login credentials."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "secure_password_123",
            }
        }
    )

    email: str = Field(
        ...,
        description="User email address",
        json_schema_extra={"example": "user@example.com"},
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="User password",
        json_schema_extra={"example": "secure_password_123"},
    )


class RegisterRequest(BaseModel):
    """User registration request."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "secure_password_123",
                "display_name": "John Doe",
                "invite_code": "team-secret-2024",
            }
        }
    )

    email: str = Field(
        ...,
        description="User email address",
        pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$",
        json_schema_extra={"example": "user@example.com"},
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="User password (minimum 8 characters)",
        json_schema_extra={"example": "secure_password_123"},
    )
    display_name: str | None = Field(
        default=None,
        max_length=100,
        description="Optional display name",
        json_schema_extra={"example": "John Doe"},
    )
    invite_code: str | None = Field(
        default=None,
        description="Invite code for restricted registration",
        json_schema_extra={"example": "team-secret-2024"},
    )


class RefreshRequest(BaseModel):
    """Token refresh request."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            }
        }
    )

    refresh_token: str = Field(
        ...,
        description="Refresh token from login response",
        json_schema_extra={"example": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."},
    )


class UserInfo(BaseModel):
    """Public user information."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "email": "user@example.com",
                "display_name": "John Doe",
            }
        }
    )

    id: UUID = Field(
        ...,
        description="User UUID",
        json_schema_extra={"example": "550e8400-e29b-41d4-a716-446655440000"},
    )
    email: str = Field(
        ...,
        description="User email address",
        json_schema_extra={"example": "user@example.com"},
    )
    display_name: str | None = Field(
        default=None,
        max_length=100,
        description="User display name",
        json_schema_extra={"example": "John Doe"},
    )


class TokenResponse(BaseModel):
    """Authentication token response."""

    model_config = ConfigDict(
        json_schema_extra={
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
    )

    access_token: str = Field(
        ...,
        description="JWT access token",
        json_schema_extra={"example": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."},
    )
    refresh_token: str | None = Field(
        default=None,
        description="JWT refresh token (not included on refresh)",
        json_schema_extra={"example": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."},
    )
    token_type: str = Field(
        default="bearer",
        description="Token type (always 'bearer')",
        json_schema_extra={"example": "bearer"},
    )
    expires_in: int = Field(
        default=3600,
        ge=0,
        description="Access token expiry in seconds",
        json_schema_extra={"example": 3600},
    )
    user: UserInfo | None = Field(
        default=None,
        description="User information (included on login)",
    )
