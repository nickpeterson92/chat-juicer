from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from jose import jwt

from api.services.auth_service import AuthService
from core.constants import Settings

# Constants
TEST_SECRET = "test_secret_key"
TEST_ALGO = "HS256"
USER_ID = uuid4()
EMAIL = "user@test.com"
PASSWORD = "password123"
HASHED_PASSWORD = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxwKc.6q.1M.m4oJ8cKrj5/0oj.G."  # BCrypt hash for "password123"


@pytest.fixture
def mock_settings() -> MagicMock:
    settings = MagicMock(spec=Settings)
    settings.jwt_secret = TEST_SECRET
    settings.jwt_algorithm = TEST_ALGO
    settings.access_token_expires_minutes = 15
    settings.refresh_token_expires_days = 7
    settings.default_user_email = "default@chatjuicer.dev"
    return settings


@pytest.fixture
def mock_db_pool() -> MagicMock:
    pool = MagicMock()
    cm = MagicMock()
    conn = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=conn)
    cm.__aexit__ = AsyncMock(return_value=None)
    pool.acquire.return_value = cm
    return pool


@pytest.fixture
def auth_service(mock_db_pool: MagicMock, mock_settings: MagicMock) -> AuthService:
    return AuthService(pool=mock_db_pool, settings=mock_settings)


@pytest.mark.asyncio
async def test_login_success(auth_service: AuthService, mock_db_pool: MagicMock) -> None:
    # Setup mock user
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    mock_user = {"id": USER_ID, "email": EMAIL, "password_hash": HASHED_PASSWORD, "display_name": "Test User"}
    conn.fetchrow.return_value = mock_user

    # Mock checkpw to avoid actual heavy BCrypt
    with patch("bcrypt.checkpw", return_value=True) as mock_checkpw:
        result = await auth_service.login(EMAIL, PASSWORD)

        assert mock_checkpw.called
        assert "access_token" in result
        assert "refresh_token" in result
        assert result["user"]["email"] == EMAIL


@pytest.mark.asyncio
async def test_login_invalid_credentials(auth_service: AuthService, mock_db_pool: MagicMock) -> None:
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value

    # Case 1: User not found
    conn.fetchrow.return_value = None
    with pytest.raises(ValueError, match="Invalid credentials"):
        await auth_service.login(EMAIL, PASSWORD)

    # Case 2: Wrong password
    conn.fetchrow.return_value = {"id": USER_ID, "password_hash": HASHED_PASSWORD, "email": EMAIL}
    with (
        patch("bcrypt.checkpw", return_value=False),
        pytest.raises(ValueError, match="Invalid credentials"),
    ):
        await auth_service.login(EMAIL, PASSWORD)


def test_issue_tokens(auth_service: AuthService) -> None:
    user = {"id": USER_ID, "email": EMAIL}
    tokens = auth_service._issue_tokens(user)

    access = tokens["access"]
    refresh = tokens["refresh"]

    # decode to verify
    payload = jwt.decode(access, TEST_SECRET, algorithms=[TEST_ALGO])
    assert payload["sub"] == str(USER_ID)
    assert payload["type"] == "access"

    payload_refresh = jwt.decode(refresh, TEST_SECRET, algorithms=[TEST_ALGO])
    assert payload_refresh["sub"] == str(USER_ID)
    assert payload_refresh["type"] == "refresh"


def test_decode_access_token_valid(auth_service: AuthService) -> None:
    # Manually create token
    exp = datetime.now(timezone.utc) + timedelta(minutes=15)
    token = jwt.encode({"sub": str(USER_ID), "type": "access", "exp": exp}, TEST_SECRET, algorithm=TEST_ALGO)

    payload = auth_service.decode_access_token(token)
    assert payload["sub"] == str(USER_ID)


def test_decode_token_invalid_type(auth_service: AuthService) -> None:
    # Access token used as refresh
    exp = datetime.now(timezone.utc) + timedelta(minutes=15)
    token = jwt.encode({"sub": str(USER_ID), "type": "access", "exp": exp}, TEST_SECRET, algorithm=TEST_ALGO)

    # Try to decode as refresh (via private method or specific public if exists)
    # AuthService.refresh calls _decode_token(..., "refresh")
    with pytest.raises(ValueError, match="Invalid token type"):
        auth_service._decode_token(token, "refresh")


@pytest.mark.asyncio
async def test_refresh_success(auth_service: AuthService, mock_db_pool: MagicMock) -> None:
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow.return_value = {"id": USER_ID, "email": EMAIL}

    # valid refresh token
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    refresh_token = jwt.encode({"sub": str(USER_ID), "type": "refresh", "exp": exp}, TEST_SECRET, algorithm=TEST_ALGO)

    result = await auth_service.refresh(refresh_token)

    assert "access" in result
    assert "refresh" in result
    assert result["access"] != refresh_token  # Rotated


@pytest.mark.asyncio
async def test_get_default_user(auth_service: AuthService, mock_db_pool: MagicMock) -> None:
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow.return_value = {"id": USER_ID, "email": "default@chatjuicer.dev"}

    user = await auth_service.get_default_user()

    conn.fetchrow.assert_called_with("SELECT * FROM users WHERE email = $1", "default@chatjuicer.dev")
    assert user["email"] == "default@chatjuicer.dev"
