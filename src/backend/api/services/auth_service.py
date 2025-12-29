from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import asyncpg
import bcrypt

from jose import JWTError, jwt

from core.constants import Settings, get_settings


class AuthService:
    """Authentication service for issuing and validating JWT tokens."""

    def __init__(self, pool: asyncpg.Pool, settings: Settings | None = None):
        self.pool = pool
        self.settings = settings or get_settings()

    async def login(self, email: str, password: str) -> dict[str, Any]:
        """Validate credentials and return access/refresh tokens."""
        user = await self.get_user_by_email(email)
        if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
            raise ValueError("Invalid credentials")

        tokens = self._issue_tokens(user)
        return {
            "access_token": tokens["access"],
            "refresh_token": tokens["refresh"],
            "user": self.user_payload(user),
        }

    async def register(self, email: str, password: str, display_name: str | None = None) -> dict[str, Any]:
        """Register a new user and return access/refresh tokens."""
        # Check if email already exists
        existing = await self.get_user_by_email(email)
        if existing:
            raise ValueError("Email already registered")

        # Hash password
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

        # Insert new user
        async with self.pool.acquire() as conn:
            user = await conn.fetchrow(
                """
                INSERT INTO users (email, password_hash, display_name)
                VALUES ($1, $2, $3)
                RETURNING *
                """,
                email,
                password_hash,
                display_name,
            )

        if not user:
            raise ValueError("Failed to create user")

        # Issue tokens for immediate login
        tokens = self._issue_tokens(user)
        return {
            "access_token": tokens["access"],
            "refresh_token": tokens["refresh"],
            "user": self.user_payload(user),
        }

    async def refresh(self, refresh_token: str) -> dict[str, Any]:
        """Validate refresh token and return new access and refresh tokens (rotation)."""
        payload = self._decode_token(refresh_token, "refresh")
        user = await self.get_user_by_id(UUID(payload["sub"]))
        if not user:
            raise ValueError("Invalid refresh token")
        tokens = self._issue_tokens(user, include_refresh=True)
        tokens["user"] = self.user_payload(user)
        return tokens

    async def get_default_user(self) -> dict[str, Any] | None:
        """Retrieve the default seeded user for Phase 1."""
        return await self.get_user_by_email(self.settings.default_user_email)

    def decode_access_token(self, token: str) -> dict[str, Any]:
        """Decode and validate an access token."""
        return self._decode_token(token, "access")

    async def get_user_by_email(self, email: str) -> asyncpg.Record | None:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM users WHERE email = $1",
                email,
            )

    async def get_user_by_id(self, user_id: UUID) -> asyncpg.Record | None:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT * FROM users WHERE id = $1",
                user_id,
            )

    def _issue_tokens(self, user: asyncpg.Record, include_refresh: bool = True) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        access_exp = now + timedelta(minutes=self.settings.access_token_expires_minutes)
        refresh_exp = now + timedelta(days=self.settings.refresh_token_expires_days)

        access = self._encode_token(user, "access", access_exp)
        tokens: dict[str, str] = {"access": access}

        if include_refresh:
            tokens["refresh"] = self._encode_token(user, "refresh", refresh_exp)

        return tokens

    def _encode_token(self, user: asyncpg.Record, token_type: str, expires_at: datetime) -> str:
        payload = {
            "sub": str(user["id"]),
            "email": user["email"],
            "type": token_type,
            "exp": expires_at,
        }
        token: str = jwt.encode(payload, self.settings.jwt_secret, algorithm=self.settings.jwt_algorithm)
        return token

    def _decode_token(self, token: str, token_type: str) -> dict[str, Any]:
        try:
            payload: dict[str, Any] = jwt.decode(
                token,
                self.settings.jwt_secret,
                algorithms=[self.settings.jwt_algorithm],
            )
        except JWTError as exc:
            raise ValueError("Invalid token") from exc

        if payload.get("type") != token_type:
            raise ValueError("Invalid token type")
        return payload

    def user_payload(self, user: asyncpg.Record) -> dict[str, Any]:
        return {
            "id": str(user["id"]),
            "email": user["email"],
            "display_name": user.get("display_name"),
        }
