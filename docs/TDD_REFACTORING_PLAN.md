# Backend Test Suite TDD Refactoring Plan

## Executive Summary

**Migration Context**: Chat Juicer has migrated from a legacy IPC/stdout-based Python backend (`src/main.py`, `src/app/`, `src/core/`) to a FastAPI backend (`src/api/`) with REST endpoints and WebSocket streaming.

**Test Suite Status**:
- **Total Tests**: ~494 tests
- **Passing**: ~457 tests (92.5%)
- **Failing**: ~37 tests (7.5%)
- **Key Insight**: Most failing tests are in integration tests and file operations - areas directly impacted by the architectural shift from stdout JSON protocol to HTTP/WebSocket.

---

## Test Failure Analysis

### Test Run Results Summary

```
Running Python backend tests...
FFF.....FFFF.F.......................................................... [  9%]
........................................................................ [ 18%]
.....................................................................FFF [ 28%]
........................................................................ [ 37%]
........................................................................ [ 46%]
........................................................................ [ 56%]
...........................FFFF.F.........F.FFF......................... [ 65%]
...................FF.FFF..............................F..F.FF...F.....F [ 75%]
......F....F..........FFF....................F..F....................... [ 84%]
........................................................................ [ 93%]
..............................................                           [100%]

Failures: 37
Passes: 457
Success Rate: 92.5%
```

---

## Categorized Test Failures

### Category 1: Legacy IPC/stdout Protocol Tests (HIGH PRIORITY - OBSOLETE)

**Count**: 2 tests
**Impact**: Low
**Action**: **DELETE** - These tests are for the legacy architecture that no longer exists.

#### Affected Tests:
1. `tests/backend/unit/test_main.py::test_main_handles_core_message_types`
2. `tests/backend/unit/test_main.py::test_main_interrupts_active_session`

**Reasoning**:
- These tests validate the legacy `main.py` event loop that read JSON messages from stdin
- The new FastAPI backend uses:
  - REST endpoints for configuration/session management
  - WebSocket for streaming chat
  - No stdin/stdout JSON protocol
- `main.py` is now a simple coordinator, not the IPC message router

**Migration Path**: None - these tests should be **deleted** as the code they test no longer exists in the new architecture.

---

### Category 2: IPC Output Tests (HIGH PRIORITY - ADAPT TO REST/WEBSOCKET)

**Count**: 3 tests
**Impact**: High (core communication layer)
**Action**: **REFACTOR** to test REST responses and WebSocket messages instead of stdout JSON.

#### Affected Tests:
1. `tests/backend/unit/utils/test_ipc.py::*` (all IPC tests)
2. Tests in `test_runtime.py` that assert on `IPCManager.send()` calls

**Current Pattern** (Legacy):
```python
# Old: Tests IPCManager writing JSON to stdout
def test_send_message(mock_ipc_output: list[dict[str, Any]]) -> None:
    IPCManager.send({"type": "test", "data": "value"})
    assert len(mock_ipc_output) == 1
    assert mock_ipc_output[0]["type"] == "test"
```

**New Pattern** (FastAPI):
```python
# New: Test WebSocket message sending
async def test_websocket_send_message(mock_websocket: AsyncMock) -> None:
    await ws_manager.send(session_id, {"type": "test", "data": "value"})
    mock_websocket.send_json.assert_called_once_with({"type": "test", "data": "value"})
```

**Key Changes**:
- Replace `IPCManager.send()` with `WebSocketManager.send()`
- Replace `mock_ipc_output` fixture with WebSocket mocks
- Add `pytest-asyncio` for async test support
- Use `httpx.AsyncClient` for REST endpoint testing

**Files to Update**:
- `tests/backend/unit/utils/test_ipc.py` → **REFACTOR** or **DELETE** (most of this is obsolete)
- `tests/backend/unit/app/test_runtime.py` → Adapt assertions from `IPCManager.send` to `ws_manager.send`

---

### Category 3: File Operation Tests (MEDIUM PRIORITY - WORKING DIRECTORY ISSUES)

**Count**: 22 tests
**Impact**: High (critical functionality)
**Action**: **FIX** working directory issues and session workspace initialization.

#### Affected Test Files:
- `tests/backend/unit/tools/test_document_generation.py` (6 failures)
- `tests/backend/unit/tools/test_file_operations.py` (4 failures)
- `tests/backend/unit/tools/test_text_editing.py` (5 failures)
- `tests/backend/unit/utils/test_file_utils.py` (5 failures)
- `tests/backend/unit/utils/test_file_utils_extended.py` (2 failures)

**Root Cause Analysis**:
```python
# Example failing assertion from test_document_generation_tool_integration:
created_file = integration_test_env / "data/files/chat_a40184f3/output/test.md"
assert created_file.exists()  # FAILS - file not created where expected
```

**Observations from logs**:
```
INFO chat-juicer:logger.py:167 Generated document: test.md, 34 chars, 3 lines, 34 bytes
```
The document IS being generated, but not in the expected test directory.

**Issue**: Tests are using a temporary `integration_test_env` directory, but the actual code is writing to the **real** `data/files/` directory (relative to project root).

**Root Cause**:
1. File operation tools use `DATA_FILES_PATH` from `core/constants.py`
2. Tests create temporary directories but don't properly override `DATA_FILES_PATH`
3. Session workspace initialization may be creating directories in the wrong location

**Fix Strategy**:
1. **Inject `base_path` into file operation tools** during tests
2. **Override `DATA_FILES_PATH` in test fixtures** to point to temporary directory
3. **Ensure session workspace initialization respects test directory** via monkey-patching or dependency injection

**Example Fix**:
```python
# Before (hardcoded path):
def generate_document(content: str, filename: str, session_id: str) -> str:
    output_dir = Path("data/files") / session_id / "output"
    # ...

# After (injectable base_path):
def generate_document(
    content: str,
    filename: str,
    session_id: str,
    base_path: Path = DATA_FILES_PATH  # Default for production
) -> str:
    output_dir = base_path / session_id / "output"
    # ...

# Test:
@pytest.fixture
def override_data_path(integration_test_env: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("tools.document_generation.DATA_FILES_PATH", integration_test_env / "data/files")
```

**Files to Update**:
- `tests/backend/conftest.py` → Add `override_data_path` fixture
- All failing file operation tests → Use `override_data_path` fixture
- Consider refactoring tools to accept `base_path` parameter (cleaner than monkeypatching)

---

### Category 4: Integration Tests - Agent Tools (MEDIUM PRIORITY)

**Count**: 3 tests
**Impact**: High (end-to-end validation)
**Action**: **REFACTOR** to use FastAPI test client and fix file path issues.

#### Affected Tests:
1. `test_multiple_tools_in_session` - Tests read_file + generate_document
2. `test_file_read_tool_integration` - Tests file reading
3. `test_document_generation_tool_integration` - Tests document generation

**Current Pattern** (Legacy):
```python
# Old: Direct function calls with mock IPC
from tools.file_operations import read_file
read_result = await read_file("sources/data.txt", session_id=session_id)
read_dict = json.loads(read_result)  # Expects JSON string return
assert read_dict["success"] is True
```

**Issues**:
1. **Return value mismatch**: Tools return JSON strings in legacy mode, but FastAPI expects dicts
2. **File path issues**: Same as Category 3 (working directory mismatch)
3. **Missing WebSocket context**: Integration tests don't set up the full FastAPI app context

**New Pattern** (FastAPI):
```python
# Option A: Test via FastAPI endpoints (true integration test)
async def test_chat_with_tools(client: AsyncClient, session_id: str):
    async with client.websocket_connect(f"/ws/chat/{session_id}") as ws:
        await ws.send_json({
            "type": "message",
            "messages": ["Read the file sources/data.txt"]
        })
        # Validate streaming events including tool calls
        events = []
        async for msg in ws.iter_json():
            events.append(msg)
            if msg["type"] == "assistant_end":
                break
        assert any(e["type"] == "function_executing" for e in events)

# Option B: Test tools directly (unit test with FastAPI context)
async def test_file_operations_unit(integration_test_env: Path, db_pool: asyncpg.Pool):
    # Set up file service with test directory
    file_service = LocalFileService(base_path=integration_test_env / "data/files", pool=db_pool)
    # Create test file
    file_service.write_file(session_id, "sources", "test.txt", "content")
    # Test read
    result = await file_service.read_file(session_id, "sources", "test.txt")
    assert result["content"] == "content"
```

**Recommended Approach**:
- **Short term**: Fix file path issues (same as Category 3)
- **Long term**: Create new FastAPI integration tests using `httpx.AsyncClient` and WebSocket clients

**Files to Update**:
- `tests/backend/integration/test_agent_tools.py` → Fix file paths OR refactor to FastAPI test pattern
- `tests/backend/integration/conftest.py` → Add FastAPI app fixture with test database

---

### Category 5: Event Handler Tests (LOW PRIORITY - STILL VALID)

**Count**: 3 tests
**Impact**: Low (utility function tests)
**Action**: **MINOR FIX** - Update mock expectations.

#### Affected Tests:
1. `test_handle_tool_output_success`
2. `test_handle_tool_output_with_error`
3. `test_handle_tool_output_no_tracked_call`

**Issue**: Event handlers still work correctly, but tests may assert on old IPC message formats.

**Root Cause**:
- Event handlers in `integrations/event_handlers.py` are still used by FastAPI backend
- Tests may expect old JSON string format instead of dict format
- Minor assertion mismatches, not architectural issues

**Fix Strategy**:
1. Review test assertions for message format expectations
2. Update to match current `build_event_handlers()` return format
3. Ensure tests use correct mock objects for `CallTracker`

**Effort**: Low (1-2 hours)

---

### Category 6: Session Lifecycle Tests (LOW PRIORITY - MINOR FIXES)

**Count**: 4 tests
**Impact**: Medium (session management)
**Action**: **MINOR FIX** - Update to use PostgreSQL instead of SQLite fixtures.

#### Affected Tests:
- `tests/backend/integration/test_file_operations.py` (4 session-related failures)
- `tests/backend/integration/test_session_lifecycle.py` (if exists)

**Issue**: Tests may be using SQLite session fixtures, but FastAPI backend uses PostgreSQL.

**Current Pattern** (Legacy SQLite):
```python
@pytest.fixture
def mock_app_state(tmp_path: Path) -> AppState:
    # Creates SQLite database in tmp_path
    session_manager = SessionManager(
        db_path=tmp_path / "test.db",
        sessions_file=tmp_path / "sessions.json"
    )
    # ...
```

**New Pattern** (PostgreSQL):
```python
@pytest.fixture
async def db_pool() -> AsyncGenerator[asyncpg.Pool, None]:
    # Create test database pool
    pool = await asyncpg.create_pool(dsn=TEST_DATABASE_URL, min_size=1, max_size=2)
    # Run migrations
    await init_test_db(pool)
    yield pool
    # Cleanup
    await pool.close()

@pytest.fixture
async def test_session(db_pool: asyncpg.Pool) -> str:
    # Create test session in PostgreSQL
    async with db_pool.acquire() as conn:
        session_id = f"test_{uuid.uuid4().hex[:8]}"
        await conn.execute(
            "INSERT INTO sessions (session_id, model) VALUES ($1, $2)",
            session_id, "gpt-4o"
        )
    return session_id
```

**Files to Update**:
- `tests/backend/integration/conftest.py` → Add PostgreSQL fixtures
- Session lifecycle tests → Use `db_pool` and async patterns

---

## Priority-Ordered Refactoring Roadmap

### Phase 1: Quick Wins (1-2 days)
**Goal**: Get test suite to 95%+ pass rate by fixing obvious issues.

1. **Delete obsolete tests** (Category 1)
   - `tests/backend/unit/test_main.py` → DELETE all tests (legacy event loop no longer exists)
   - **Effort**: 30 minutes
   - **Impact**: -2 failures

2. **Fix file operation working directory issues** (Category 3)
   - Add `override_data_path` fixture to `conftest.py`
   - Apply fixture to all file operation tests
   - **Effort**: 4-6 hours
   - **Impact**: -22 failures
   - **Files**:
     - `tests/backend/conftest.py`
     - `tests/backend/unit/tools/test_*.py`
     - `tests/backend/unit/utils/test_file_utils*.py`

3. **Fix event handler tests** (Category 5)
   - Review and update assertion expectations
   - **Effort**: 2 hours
   - **Impact**: -3 failures
   - **Files**: `tests/backend/unit/integrations/test_event_handlers.py`

**Total Phase 1**: 27 failures fixed, 10 remaining

---

### Phase 2: Refactor IPC to WebSocket (3-5 days)
**Goal**: Adapt communication layer tests to FastAPI patterns.

1. **Refactor IPC tests** (Category 2)
   - Create WebSocket mock fixtures
   - Replace `IPCManager.send()` assertions with `ws_manager.send()`
   - Add `pytest-asyncio` support
   - **Effort**: 8-12 hours
   - **Impact**: -3 failures
   - **Files**:
     - `tests/backend/unit/utils/test_ipc.py` → Consider DELETE and replace
     - `tests/backend/unit/app/test_runtime.py` → Update assertions
     - New file: `tests/backend/unit/api/test_websocket_manager.py`

2. **Create FastAPI integration test fixtures** (Category 4 prep)
   - Add `httpx.AsyncClient` fixture
   - Add WebSocket test client fixture
   - Add PostgreSQL test database setup
   - **Effort**: 6-8 hours
   - **Impact**: Enables Phase 3
   - **Files**:
     - `tests/backend/integration/conftest.py`
     - New file: `tests/backend/fixtures/fastapi_app.py`

**Total Phase 2**: 3 failures fixed, 7 remaining

---

### Phase 3: Integration Test Refactoring (5-7 days)
**Goal**: Create proper FastAPI integration tests.

1. **Refactor agent tool integration tests** (Category 4)
   - Option A: Quick fix file paths (2-3 hours)
   - Option B: Full FastAPI refactor (16-20 hours, recommended)
   - **Effort**: 16-20 hours (Option B)
   - **Impact**: -3 failures
   - **Files**:
     - `tests/backend/integration/test_agent_tools.py` → Full rewrite
     - New pattern: WebSocket-based chat tests

2. **Session lifecycle tests** (Category 6)
   - Migrate from SQLite to PostgreSQL fixtures
   - Add async patterns
   - **Effort**: 4-6 hours
   - **Impact**: -4 failures
   - **Files**:
     - `tests/backend/integration/test_file_operations.py`
     - `tests/backend/integration/test_session_lifecycle.py`

**Total Phase 3**: 7 failures fixed, 0 remaining (100% pass rate)

---

### Phase 4: New Test Coverage (Ongoing)
**Goal**: Add tests for FastAPI-specific functionality not covered by legacy tests.

1. **WebSocket streaming tests**
   - Test interrupt handling via WebSocket
   - Test concurrent session handling
   - Test stream isolation between users
   - **Effort**: 8-12 hours
   - **Files**: New file `tests/backend/integration/test_websocket_streaming.py`

2. **REST endpoint tests**
   - Test all `/api/*` endpoints
   - Test authentication middleware
   - Test error handling
   - **Effort**: 12-16 hours
   - **Files**: New file `tests/backend/integration/test_api_endpoints.py`

3. **Database persistence tests**
   - Test PostgreSQL session storage
   - Test token tracking in DB
   - Test migration from SQLite (if needed)
   - **Effort**: 8-12 hours
   - **Files**: New file `tests/backend/integration/test_database.py`

---

## FastAPI Test Patterns & Examples

### Pattern 1: REST Endpoint Testing

```python
# tests/backend/integration/test_api_endpoints.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_session(client: AsyncClient, auth_token: str):
    """Test POST /api/sessions endpoint."""
    response = await client.post(
        "/api/sessions",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"model": "gpt-4o", "reasoning_effort": "medium"}
    )
    assert response.status_code == 201
    data = response.json()
    assert "session_id" in data
    assert data["model"] == "gpt-4o"

@pytest.mark.asyncio
async def test_list_sessions(client: AsyncClient, auth_token: str):
    """Test GET /api/sessions endpoint."""
    response = await client.get(
        "/api/sessions",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    sessions = response.json()
    assert isinstance(sessions, list)
```

### Pattern 2: WebSocket Testing

```python
# tests/backend/integration/test_websocket_streaming.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_chat_stream(client: AsyncClient, session_id: str):
    """Test chat streaming via WebSocket."""
    async with client.websocket_connect(f"/ws/chat/{session_id}") as ws:
        # Send message
        await ws.send_json({
            "type": "message",
            "messages": ["Hello, how are you?"]
        })

        # Collect events
        events = []
        async for msg in ws.iter_json():
            events.append(msg)
            if msg["type"] == "assistant_end":
                break

        # Validate event sequence
        assert events[0]["type"] == "assistant_start"
        assert any(e["type"] == "assistant_delta" for e in events)
        assert events[-1]["type"] == "assistant_end"

@pytest.mark.asyncio
async def test_interrupt_stream(client: AsyncClient, session_id: str):
    """Test interrupting a chat stream."""
    async with client.websocket_connect(f"/ws/chat/{session_id}") as ws:
        # Start message
        await ws.send_json({
            "type": "message",
            "messages": ["Generate a very long story..."]
        })

        # Wait for first delta
        msg = await ws.receive_json()
        assert msg["type"] == "assistant_start"

        # Send interrupt
        await ws.send_json({
            "type": "interrupt",
            "session_id": session_id
        })

        # Validate interrupted response
        interrupted_msg = await ws.receive_json()
        assert interrupted_msg["type"] == "stream_interrupted"

        # Wait for assistant_end
        end_msg = await ws.receive_json()
        assert end_msg["type"] == "assistant_end"
        assert end_msg["finish_reason"] == "interrupted"
```

### Pattern 3: Database Testing

```python
# tests/backend/integration/test_database.py
import pytest
import asyncpg

@pytest.mark.asyncio
async def test_session_persistence(db_pool: asyncpg.Pool):
    """Test session data persists correctly."""
    session_id = "test_session_123"

    # Create session
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sessions (session_id, model, reasoning_effort) VALUES ($1, $2, $3)",
            session_id, "gpt-4o", "medium"
        )

    # Read back
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM sessions WHERE session_id = $1",
            session_id
        )

    assert row is not None
    assert row["model"] == "gpt-4o"
    assert row["reasoning_effort"] == "medium"

@pytest.mark.asyncio
async def test_message_history(db_pool: asyncpg.Pool, session_uuid: UUID):
    """Test message history storage."""
    # Add messages
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)",
            session_uuid, "user", "Hello"
        )
        await conn.execute(
            "INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)",
            session_uuid, "assistant", "Hi there!"
        )

    # Read back
    async with db_pool.acquire() as conn:
        messages = await conn.fetch(
            "SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at",
            session_uuid
        )

    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
```

### Pattern 4: FastAPI Test Fixtures

```python
# tests/backend/integration/conftest.py
import asyncio
import pytest
import asyncpg
from httpx import AsyncClient
from api.main import app

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
async def db_pool() -> AsyncGenerator[asyncpg.Pool, None]:
    """Create test database pool."""
    pool = await asyncpg.create_pool(
        dsn="postgresql://test:test@localhost:5432/chat_juicer_test",
        min_size=1,
        max_size=2
    )

    # Run migrations or create schema
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id TEXT UNIQUE NOT NULL,
                model TEXT NOT NULL,
                reasoning_effort TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID REFERENCES sessions(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

    yield pool

    # Cleanup
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE sessions, messages CASCADE")
    await pool.close()

@pytest.fixture
async def client(db_pool: asyncpg.Pool) -> AsyncGenerator[AsyncClient, None]:
    """Create FastAPI test client."""
    # Inject test db pool into app state
    app.state.db_pool = db_pool

    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.fixture
async def auth_token(client: AsyncClient) -> str:
    """Generate test auth token."""
    response = await client.post(
        "/api/auth/login",
        json={"username": "test", "password": "test"}
    )
    return response.json()["access_token"]

@pytest.fixture
async def session_id(client: AsyncClient, auth_token: str) -> str:
    """Create test session."""
    response = await client.post(
        "/api/sessions",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"model": "gpt-4o"}
    )
    return response.json()["session_id"]
```

---

## Migration Checklist

### Dependencies to Add
- [ ] `pytest-asyncio>=0.21.0` (async test support)
- [ ] `httpx>=0.24.0` (FastAPI test client)
- [ ] `pytest-postgresql` (PostgreSQL test fixtures, optional)
- [ ] `pytest-mock>=3.11.0` (enhanced mocking)

### Test Configuration Updates
- [ ] Update `pytest.ini` with `asyncio_mode = auto`
- [ ] Add `tests/backend/integration/conftest.py` with FastAPI fixtures
- [ ] Create `tests/backend/fixtures/` for shared test utilities
- [ ] Add test database setup script

### Code Refactoring (to improve testability)
- [ ] Make `FileService` accept `base_path` as constructor parameter
- [ ] Make `ChatService` accept WebSocket manager as dependency
- [ ] Add dependency injection for MCP servers (use pool)
- [ ] Ensure all tools accept `session_id` and `base_path` parameters

---

## Risk Assessment

### High Risk Areas (Need Careful Testing)
1. **WebSocket stream isolation** - Concurrent users must not see each other's streams
2. **Interrupt handling** - Must cleanly cancel tasks without corrupting state
3. **Database transactions** - Ensure message persistence doesn't deadlock
4. **MCP server pool** - Prevent resource leaks and concurrency bugs

### Test Coverage Gaps (Post-Migration)
1. **Multi-user concurrency** - Legacy tests were single-user only
2. **Authentication flow** - New feature, no tests yet
3. **PostgreSQL-specific behavior** - Transaction isolation, JSONB queries
4. **WebSocket keepalive** - Ping/pong handling

---

## Success Metrics

### Phase 1 (Quick Wins)
- **Target**: 95% pass rate (27 failures fixed)
- **Timeline**: 2 days
- **Definition of Done**: All file operation tests passing

### Phase 2 (IPC Refactoring)
- **Target**: 98% pass rate (3 additional failures fixed)
- **Timeline**: 5 days
- **Definition of Done**: All IPC/WebSocket tests using FastAPI patterns

### Phase 3 (Integration Tests)
- **Target**: 100% pass rate (7 additional failures fixed)
- **Timeline**: 7 days
- **Definition of Done**: All integration tests using FastAPI test client

### Phase 4 (New Coverage)
- **Target**: 85%+ code coverage for `src/api/`
- **Timeline**: Ongoing
- **Definition of Done**: All critical paths covered (auth, streaming, errors)

---

## Recommendations

### Immediate Actions (This Week)
1. **Start with Phase 1** - Delete obsolete tests and fix file paths (quick wins)
2. **Set up test database** - PostgreSQL test instance for integration tests
3. **Add FastAPI fixtures** - Create reusable test fixtures in `conftest.py`

### Short Term (This Sprint)
1. **Complete Phase 1 & 2** - Get to 98% pass rate
2. **Write WebSocket integration test** - Validate core streaming functionality
3. **Document test patterns** - Create examples for future test authors

### Long Term (Next Sprint)
1. **Complete Phase 3** - Achieve 100% pass rate
2. **Add Phase 4 coverage** - New tests for FastAPI features
3. **Set up CI checks** - Enforce test coverage and pass rate in CI/CD

### Strategic Considerations
1. **Keep business logic tests** - Most tests in `tests/backend/unit/core/` and `tests/backend/unit/tools/` are still valid
2. **Delete architectural tests** - Tests for `main.py` event loop, IPC protocol are obsolete
3. **Invest in fixtures** - Good fixtures will make future test writing much faster
4. **Test in isolation** - Use dependency injection to make components testable without full app context

---

## Appendix: File-by-File Migration Guide

### Delete (Obsolete)
- `tests/backend/unit/test_main.py` - Legacy event loop tests

### Refactor (High Priority)
- `tests/backend/unit/utils/test_ipc.py` - Adapt to WebSocket pattern
- `tests/backend/unit/app/test_runtime.py` - Update IPC assertions
- `tests/backend/integration/test_agent_tools.py` - Fix file paths OR full rewrite
- `tests/backend/integration/test_file_operations.py` - Fix file paths + PostgreSQL

### Minor Fixes (Low Priority)
- `tests/backend/unit/integrations/test_event_handlers.py` - Update assertions
- `tests/backend/unit/tools/test_document_generation.py` - Fix file paths
- `tests/backend/unit/tools/test_file_operations.py` - Fix file paths
- `tests/backend/unit/tools/test_text_editing.py` - Fix file paths
- `tests/backend/unit/utils/test_file_utils*.py` - Fix file paths

### Keep As-Is (Still Valid)
- `tests/backend/unit/core/test_agent.py`
- `tests/backend/unit/core/test_session.py`
- `tests/backend/unit/core/test_session_manager.py`
- `tests/backend/unit/models/*.py`
- `tests/backend/unit/utils/test_logger.py`
- `tests/backend/unit/utils/test_token_utils.py`
- Most other unit tests

---

## Conclusion

The backend test suite is in good shape overall (92.5% pass rate), with most failures concentrated in:
1. **Obsolete legacy tests** (delete)
2. **File path issues** (quick fix)
3. **IPC → WebSocket refactoring** (medium effort)

By following the phased approach, the test suite can be brought to 100% pass rate in **2-3 weeks**, with most business logic tests remaining intact. The key is to:
- **Delete obsolete tests quickly** (don't waste time adapting them)
- **Fix file paths systematically** (affects 22 tests)
- **Invest in good fixtures** (pays dividends for future tests)
- **Write new FastAPI-specific tests** (cover gaps in multi-user, WebSocket, auth)

This plan provides a clear roadmap from the current 92.5% pass rate to 100%, with prioritized actions and concrete examples for each phase.
