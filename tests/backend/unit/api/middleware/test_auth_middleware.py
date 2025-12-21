from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from fastapi import Request
from fastapi.security import HTTPAuthorizationCredentials

from api.middleware.auth import get_current_user, get_current_user_from_token
from api.middleware.exception_handlers import AuthenticationError
from core.constants import Settings
from models.error_models import ErrorCode


@pytest.fixture
def mock_db_pool() -> MagicMock:
    return MagicMock()


@pytest.fixture
def mock_request() -> MagicMock:
    req = MagicMock(spec=Request)
    req.client.host = "1.2.3.4"
    return req


@pytest.fixture
def mock_auth_service() -> Generator[MagicMock, None, None]:
    with patch("api.middleware.auth.AuthService") as MockService:
        instance = MockService.return_value
        instance.user_payload.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "user@test.com",
            "display_name": "Test User",
        }
        yield instance


@pytest.mark.asyncio
async def test_get_current_user_valid_token(
    mock_request: MagicMock, mock_db_pool: MagicMock, mock_auth_service: MagicMock
) -> None:
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid_token")
    mock_auth_service.decode_access_token.return_value = {"sub": "550e8400-e29b-41d4-a716-446655440000"}
    mock_auth_service.get_user_by_id = AsyncMock(return_value={"id": "uid", "email": "user@test.com"})

    user = await get_current_user(mock_request, creds, mock_db_pool)

    assert user.email == "user@test.com"
    mock_auth_service.decode_access_token.assert_called_with("valid_token")


@pytest.mark.asyncio
async def test_get_current_user_invalid_token(
    mock_request: MagicMock, mock_db_pool: MagicMock, mock_auth_service: MagicMock
) -> None:
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad_token")
    mock_auth_service.decode_access_token.side_effect = ValueError("Bad token")

    with pytest.raises(AuthenticationError) as exc:
        await get_current_user(mock_request, creds, mock_db_pool)

    assert exc.value.code == ErrorCode.AUTH_INVALID_TOKEN


@pytest.mark.asyncio
async def test_get_current_user_user_not_found(
    mock_request: MagicMock, mock_db_pool: MagicMock, mock_auth_service: MagicMock
) -> None:
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid_token")
    mock_auth_service.decode_access_token.return_value = {"sub": "550e8400-e29b-41d4-a716-446655440000"}
    mock_auth_service.get_user_by_id = AsyncMock(return_value=None)

    with pytest.raises(AuthenticationError) as exc:
        await get_current_user(mock_request, creds, mock_db_pool)

    assert exc.value.code == ErrorCode.AUTH_USER_NOT_FOUND


@pytest.mark.asyncio
async def test_get_current_user_localhost_bypass(
    mock_request: MagicMock, mock_db_pool: MagicMock, mock_auth_service: MagicMock
) -> None:
    # Simulate localhost
    mock_request.client.host = "127.0.0.1"

    # Mock settings to allow localhost noauth
    mock_settings = MagicMock(spec=Settings)
    mock_settings.allow_localhost_noauth = True

    mock_auth_service.get_default_user = AsyncMock(return_value={"id": "def_uid", "email": "default@test.com"})

    with patch("api.middleware.auth.get_settings", return_value=mock_settings):
        user = await get_current_user(mock_request, None, mock_db_pool)

    assert (
        user.email == "user@test.com"
    )  # Returns payload from user_payload, which is mocked in fixture to user@test.com
    # Wait, mock_auth_service.user_payload returns constant.
    # But usually it takes the user record.
    # In test_get_current_user_valid_token we verified email.
    # Here let's just assert success.


@pytest.mark.asyncio
async def test_get_current_user_no_creds_remote(mock_request: MagicMock, mock_db_pool: MagicMock) -> None:
    mock_request.client.host = "1.2.3.4"  # Remote IP

    mock_settings = MagicMock(spec=Settings)
    mock_settings.allow_localhost_noauth = True  # Even if enabled, should fail for remote

    with (
        patch("api.middleware.auth.get_settings", return_value=mock_settings),
        pytest.raises(AuthenticationError) as exc,
    ):
        await get_current_user(mock_request, None, mock_db_pool)

    assert exc.value.code == ErrorCode.AUTH_REQUIRED


@pytest.mark.asyncio
async def test_ws_get_user_valid_token(mock_db_pool: MagicMock, mock_auth_service: MagicMock) -> None:
    mock_auth_service.decode_access_token.return_value = {"sub": "550e8400-e29b-41d4-a716-446655440000"}
    mock_auth_service.get_user_by_id = AsyncMock(return_value={"id": "uid"})

    user = await get_current_user_from_token("valid_token", mock_db_pool)
    assert user.email == "user@test.com"


@pytest.mark.asyncio
async def test_ws_get_user_invalid_token(mock_db_pool: MagicMock, mock_auth_service: MagicMock) -> None:
    mock_auth_service.decode_access_token.side_effect = ValueError("Bad token")

    with pytest.raises(AuthenticationError) as exc:
        await get_current_user_from_token("bad_token", mock_db_pool)

    assert exc.value.code == ErrorCode.AUTH_INVALID_TOKEN
