import asyncio
import time

import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.middleware.request_context import (
    REQUEST_ID_PREFIX,
    WEBSOCKET_ID_PREFIX,
    RequestContext,
    RequestContextMiddleware,
    generate_request_id,
    get_request_context,
    get_request_id,
    update_request_context,
)


def test_request_context_dataclass() -> None:
    ctx = RequestContext(request_id="123")
    assert ctx.request_id == "123"
    assert ctx.elapsed_ms >= 0
    assert "request_id" in ctx.to_log_context()

    time.sleep(0.01)
    assert ctx.elapsed_ms > 0


def test_generate_request_id() -> None:
    rid1 = generate_request_id()
    rid2 = generate_request_id()
    assert rid1.startswith(REQUEST_ID_PREFIX)
    assert rid1 != rid2

    ws_rid = generate_request_id(WEBSOCKET_ID_PREFIX)
    assert ws_rid.startswith(WEBSOCKET_ID_PREFIX)


@pytest.mark.asyncio
async def test_context_var_management() -> None:
    # Verify cleanup and isolation
    ctx = RequestContext(request_id="test")

    # Needs to be tested with the middleware or manual setting
    from api.middleware.request_context import clear_request_context, set_request_context

    set_request_context(ctx)
    assert get_request_context() == ctx
    assert get_request_id() == "test"

    update_request_context(user_id="user1")
    assert get_request_context().user_id == "user1"

    clear_request_context()
    assert get_request_context() is None


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)

    @app.get("/context")
    def get_ctx() -> dict[str, str | None]:
        ctx = get_request_context()
        return {
            "request_id": ctx.request_id,
            "session_id": ctx.session_id,
            "client_ip": ctx.client_ip,
        }

    @app.get("/api/v1/sessions/{session_id}/test")
    def get_session_ctx(session_id: str) -> dict[str, str | None]:
        ctx = get_request_context()
        return {"session_id": ctx.session_id}

    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


def test_middleware_request_id(client: TestClient) -> None:
    response = client.get("/context")
    assert response.status_code == 200
    data = response.json()

    # Check headers
    assert "x-request-id" in response.headers
    assert response.headers["x-request-id"].startswith(REQUEST_ID_PREFIX)

    # Check context matches header
    assert data["request_id"] == response.headers["x-request-id"]


def test_middleware_existing_request_id(client: TestClient) -> None:
    response = client.get("/context", headers={"X-Request-ID": "external_123"})
    assert response.status_code == 200
    assert response.headers["x-request-id"] == "external_123"
    assert response.json()["request_id"] == "external_123"


def test_middleware_session_id_extraction(client: TestClient) -> None:
    sid = "sess_abc123"
    response = client.get(f"/api/v1/sessions/{sid}/test")
    assert response.status_code == 200
    assert response.json()["session_id"] == sid


def test_middleware_client_ip(client: TestClient) -> None:
    # Direct
    response = client.get("/context")
    assert response.json()["client_ip"] == "testclient"

    # Proxied
    response = client.get("/context", headers={"X-Forwarded-For": "10.0.0.1, 192.168.1.1"})
    assert response.json()["client_ip"] == "10.0.0.1"


@pytest.mark.asyncio
async def test_async_context_isolation() -> None:
    # Manual test of async isolation to ensure context var works correctly in concurrent tasks
    from api.middleware.request_context import clear_request_context, get_request_id, set_request_context

    async def task(name: str, delay: float) -> str | None:
        ctx = RequestContext(request_id=name)
        set_request_context(ctx)
        await asyncio.sleep(delay)
        val: str | None = get_request_id()
        clear_request_context()
        return val

    results = await asyncio.gather(task("req1", 0.05), task("req2", 0.01))

    assert results[0] == "req1"
    assert results[1] == "req2"
