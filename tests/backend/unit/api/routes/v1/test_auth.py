from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db
from api.middleware.exception_handlers import register_exception_handlers
from api.routes.v1.auth import router
from models.error_models import ErrorCode
from models.schemas.auth import UserInfo

# Mock data
USER_ID = "550e8400-e29b-41d4-a716-446655440000"
EMAIL = "user@example.com"
ACCESS_TOKEN = "access_token_123"
REFRESH_TOKEN = "refresh_token_123"


@pytest.fixture
def mock_db_pool() -> MagicMock:
    pool = MagicMock()
    return pool


@pytest.fixture
def mock_auth_service() -> Generator[MagicMock, None, None]:
    with patch("api.routes.v1.auth.AuthService") as MockService:
        service = MockService.return_value
        yield service


@pytest.fixture
def app(mock_db_pool: MagicMock) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router, prefix="/api/v1/auth")

    app.dependency_overrides[get_db] = lambda: mock_db_pool
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.asyncio
async def test_login_success(client: TestClient, mock_auth_service: AsyncMock) -> None:
    mock_auth_service.login = AsyncMock(
        return_value={
            "access_token": ACCESS_TOKEN,
            "refresh_token": REFRESH_TOKEN,
            "expires_in": 3600,
            "user": {"id": USER_ID, "email": EMAIL, "display_name": "Test User"},
        }
    )

    response = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": "password"})

    assert response.status_code == 200
    data = response.json()
    assert data["access_token"] == ACCESS_TOKEN
    assert data["user"]["email"] == EMAIL


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: TestClient, mock_auth_service: AsyncMock) -> None:
    mock_auth_service.login = AsyncMock(side_effect=ValueError("Invalid credentials"))

    response = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": "wrongpassword"})

    assert response.status_code == 401
    # Check specific error code from auth.py mapping
    assert response.json()["error"]["code"] == ErrorCode.AUTH_INVALID_CREDENTIALS


@pytest.mark.asyncio
async def test_refresh_success(client: TestClient, mock_auth_service: AsyncMock) -> None:
    mock_auth_service.refresh = AsyncMock(return_value={"access": "new_access_token", "refresh": "new_refresh_token"})

    response = client.post("/api/v1/auth/refresh", json={"refresh_token": REFRESH_TOKEN})

    assert response.status_code == 200
    data = response.json()
    assert data["access_token"] == "new_access_token"


@pytest.mark.asyncio
async def test_refresh_invalid_token(client: TestClient, mock_auth_service: AsyncMock) -> None:
    mock_auth_service.refresh = AsyncMock(side_effect=ValueError("Invalid token"))

    response = client.post("/api/v1/auth/refresh", json={"refresh_token": "invalid"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == ErrorCode.AUTH_EXPIRED_TOKEN


@pytest.mark.asyncio
async def test_me_authenticated(client: TestClient, app: FastAPI) -> None:
    # 'me' endpoint relies on get_current_user dependency.
    # We need to override it to simulate logged-in user.
    from api.middleware.auth import get_current_user

    mock_user = UserInfo(id=USER_ID, email=EMAIL, display_name="Test User")
    app.dependency_overrides[get_current_user] = lambda: mock_user

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == EMAIL


@pytest.mark.asyncio
async def test_me_unauthenticated(client: TestClient, app: FastAPI) -> None:
    # If we don't override get_current_user, it should raise 401 if it fails?
    # Actually get_current_user usually verifies token.
    # If we want to test 401, we should probably let the real dependency run or mock it to raise exception.
    # But get_current_user is complex (validates JWT).
    # For unit test of the route logic (which is just 'return user'),
    # ensuring the dependency mechanism works is integration testing.
    # The route itself is trivial: `async def me(user): return user`.
    # Testing that FastAPI raises 401 when dependency fails is technically testing FastAPI/Middleware,
    # but let's verify expected error response if we simulate failure.

    from api.middleware.auth import get_current_user
    from api.middleware.exception_handlers import AuthenticationError

    def mock_fail() -> None:
        raise AuthenticationError("Not authenticated", code=ErrorCode.AUTH_REQUIRED)

    app.dependency_overrides[get_current_user] = mock_fail

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == ErrorCode.AUTH_REQUIRED
