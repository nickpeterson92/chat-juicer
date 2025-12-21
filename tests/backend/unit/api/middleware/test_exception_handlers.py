from unittest.mock import MagicMock, patch

import asyncpg
import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from openai import AuthenticationError, RateLimitError
from pydantic import BaseModel, ValidationError

from api.middleware.exception_handlers import (
    ApiFileNotFoundError,
    AppException,
    ResourceNotFoundError,
    SessionNotFoundError,
    ValidationException,
    register_exception_handlers,
)
from models.error_models import ErrorCode


# Setup a test app
@pytest.fixture
def test_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    return app


@pytest.fixture
def client(test_app: FastAPI) -> TestClient:
    # raise_server_exceptions=False ensures that we get the 500 response
    # instead of the client re-raising the exception.
    return TestClient(test_app, raise_server_exceptions=False)


def test_app_exception(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/app_error")
    def raise_app_error() -> None:
        raise AppException(code=ErrorCode.INTERNAL_ERROR, message="Test error", details={"foo": "bar"})

    response = client.get("/app_error")
    assert response.status_code == 500
    data = response.json()["error"]
    assert data["code"] == ErrorCode.INTERNAL_ERROR.value
    assert data["message"] == "Test error"
    # exclude_none=True removes code/value if None
    assert data["details"] == [{"field": "foo", "message": "bar"}]


def test_resource_not_found(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/not_found")
    def raise_not_found() -> None:
        raise ResourceNotFoundError(resource="Item", resource_id="123")

    response = client.get("/not_found")
    assert response.status_code == 404
    data = response.json()["error"]
    assert data["code"] == ErrorCode.RESOURCE_NOT_FOUND.value
    assert data["message"] == "Item '123' not found"


def test_session_not_found(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/session_not_found")
    def raise_session_not_found() -> None:
        raise SessionNotFoundError(session_id="sess_1")

    response = client.get("/session_not_found")
    assert response.status_code == 404
    data = response.json()["error"]
    assert data["code"] == ErrorCode.SESSION_NOT_FOUND.value
    assert "Session 'sess_1' not found" in data["message"]


def test_file_not_found(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/file_not_found")
    def raise_file_not_found() -> None:
        raise ApiFileNotFoundError(filename="test.txt")

    response = client.get("/file_not_found")
    assert response.status_code == 404
    data = response.json()["error"]
    assert data["code"] == ErrorCode.FILE_NOT_FOUND.value
    assert "File 'test.txt' not found" in data["message"]


def test_validation_exception(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/validation_error")
    def raise_validation_error() -> None:
        # Tricking it to raise a validation exception manually for testing logic
        raise ValidationException(message="Invalid data")

    response = client.get("/validation_error")
    assert response.status_code == 422
    data = response.json()["error"]
    assert data["code"] == ErrorCode.VALIDATION_ERROR.value
    assert data["message"] == "Invalid data"


def test_pydantic_request_validation_error(test_app: FastAPI, client: TestClient) -> None:
    """Test FastAPI RequestValidationError handler (auto-triggered by bad body)."""

    class Item(BaseModel):
        name: str
        age: int

    @test_app.post("/pydantic")
    def create_item(item: Item) -> Item:
        return item

    # Send invalid data (string for int)
    response = client.post("/pydantic", json={"name": "foo", "age": "not_an_int"})
    assert response.status_code == 422
    data = response.json()["error"]
    assert data["code"] == ErrorCode.VALIDATION_ERROR.value
    # FastAPI request validation raises RequestValidationError -> validation_exception_handler
    assert data["message"] == "Request validation failed"
    # Verify details structure
    assert len(data["details"]) > 0
    assert data["details"][0]["field"] == "body.age"


def test_pydantic_manual_validation_error(test_app: FastAPI, client: TestClient) -> None:
    """Test manual Pydantic ValidationError handler."""

    class User(BaseModel):
        email: str

    @test_app.get("/manual_pydantic")
    def manual_error() -> None:
        # Manually validate and raise native ValidationError
        try:
            User(email=123)  # type: ignore
        except ValidationError as e:
            raise e

    response = client.get("/manual_pydantic")
    assert response.status_code == 422
    data = response.json()["error"]
    assert data["code"] == ErrorCode.VALIDATION_ERROR.value
    assert data["message"] == "Data validation failed"  # Pydantic handler message
    assert len(data["details"]) > 0


def test_openai_auth_error(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/openai_auth")
    def raise_openai_auth() -> None:
        # Raise AuthenticationError from openai
        raise AuthenticationError("Invalid key", response=MagicMock(), body=None)

    response = client.get("/openai_auth")
    assert response.status_code == 401
    data = response.json()["error"]
    assert data["code"] == ErrorCode.AUTH_INVALID_TOKEN.value
    assert "OpenAI authentication failed" in data["message"]


def test_openai_rate_limit(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/openai_rate")
    def raise_openai_rate() -> None:
        raise RateLimitError("Too many", response=MagicMock(), body=None)

    response = client.get("/openai_rate")
    assert response.status_code == 429
    data = response.json()["error"]
    assert data["code"] == ErrorCode.EXTERNAL_RATE_LIMITED.value


def test_database_error(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/db_error")
    def raise_db_error() -> None:
        raise asyncpg.PostgresError("Connection failed")

    with patch("api.middleware.exception_handlers.logger"):  # Suppress error logging
        response = client.get("/db_error")
        assert response.status_code == 500
        data = response.json()["error"]
        assert data["code"] == ErrorCode.DATABASE_ERROR.value
        assert data["message"] == "Database operation failed"


def test_generic_exception(test_app: FastAPI, client: TestClient) -> None:
    @test_app.get("/generic")
    def raise_generic() -> None:
        raise ValueError("Boom")

    with patch("api.middleware.exception_handlers.logger"):
        response = client.get("/generic")
        assert response.status_code == 500
        data = response.json()["error"]
        assert data["code"] == ErrorCode.INTERNAL_UNEXPECTED.value
        assert data["message"] == "An unexpected error occurred"


def test_debug_mode_info(test_app: FastAPI, client: TestClient) -> None:
    # Mock settings to enable debug
    mock_settings = MagicMock()
    mock_settings.debug = True

    with patch("api.middleware.exception_handlers.get_settings", return_value=mock_settings):

        @test_app.get("/debug_test")
        def raise_val_error() -> None:
            raise ValueError("Debug boom")

        # Suppress logging
        with patch("api.middleware.exception_handlers.logger"):
            response = client.get("/debug_test")
            assert response.status_code == 500
            data = response.json()["error"]
            assert "debug" in data
            assert data["debug"]["exception_type"] == "ValueError"
            assert data["debug"]["exception_message"] == "Debug boom"
