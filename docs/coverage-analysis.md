# Backend Test Coverage Analysis

## Executive Summary

**Current State:**
- **Coverage:** 48.92% (2300/4702 statements)
- **Tests:** 557 passing
- **Target:** 85% coverage
- **Gap:** ~1697 statements needed

**Key Findings:**
1. **Critical API Layer**: Entire FastAPI application layer at 0% (main.py, routes, services)
2. **Business Logic**: Core chat orchestration and session management completely untested
3. **Infrastructure**: Database utilities, MCP pool, middleware all at 0%
4. **Existing Tests**: Strong coverage in utils, models, and tools (60-100%)

**Estimated Effort:** 40-50 hours to reach 85% coverage with high-value tests

**Priority Distribution:**
- High Priority: 12 modules (~900 statements) - Core business logic and critical paths
- Medium Priority: 8 modules (~550 statements) - Middleware, supporting services
- Low Priority: Schema models (~250 statements) - Validation boilerplate

## Module-by-Module Analysis

### CRITICAL - Priority 1 (High Business Value)

#### 1. `api/services/chat_service.py` (244 statements, 0% coverage)

**Purpose:** Core chat orchestration - WebSocket streaming, Agent/Runner coordination, cancellation handling

**Complexity:** Very High
- Manages entire chat lifecycle from user input to streaming response
- Handles cooperative cancellation via CancellationToken
- Coordinates Agent/Runner, MCP servers, token tracking, and persistence
- Complex error recovery and partial response handling

**Dependencies to Mock:**
- `asyncpg.Pool` - Database connection pool
- `WebSocketManager` - WebSocket connection management
- `FileService` - File operations
- `MCPServerPool` - MCP server connection pool
- `PostgresTokenAwareSession` - Token-aware session
- `Agent`, `Runner` - OpenAI agents SDK

**Key Test Scenarios:**
1. **Happy Path Chat Processing**
   - User message → agent response → persistence
   - Multi-turn conversations
   - Token usage updates

2. **Cancellation Handling**
   - Mid-stream interruption via CancellationToken
   - Partial response persistence with `partial=True` flag
   - Interrupted tool calls with synthetic completions

3. **Tool Call Persistence**
   - Tool execution tracking
   - Tool results saved to messages table
   - Tool token accumulation

4. **Summarization Triggers**
   - Automatic summarization at 80% threshold
   - Title generation after first turn
   - Token count updates

5. **Error Handling**
   - WebSocket send failures
   - Agent/Runner exceptions
   - Database transaction rollbacks

**Test File:** `tests/backend/unit/api/services/test_chat_service.py`

**Estimated Coverage Gain:** 200+ statements (200)

**Priority:** **CRITICAL** - This is the heart of the application

---

#### 2. `api/routes/chat.py` (104 statements, 0% coverage)

**Purpose:** WebSocket endpoint for real-time chat streaming

**Complexity:** High
- WebSocket lifecycle management
- Authentication via token query parameter
- Task management for concurrent requests
- Interrupt message handling

**Dependencies to Mock:**
- `WebSocket` - FastAPI WebSocket
- `WebSocketManager` - Connection tracking
- `ChatService` - Business logic
- `asyncpg.Pool` - Database
- `MCPServerPool` - MCP servers

**Key Test Scenarios:**
1. **Connection Lifecycle**
   - Successful WebSocket connection
   - Authentication via token
   - Connection rejection (limits, auth)
   - Graceful disconnection

2. **Message Handling**
   - User message processing
   - Interrupt message handling
   - Concurrent message handling (cancel previous)

3. **Task Management**
   - Active task cancellation on new message
   - Clean task cleanup on disconnect
   - Timeout handling for stuck tasks

4. **Error Recovery**
   - WebSocket disconnection during processing
   - Runtime errors with error message to client
   - Keepalive ping handling

**Test File:** `tests/backend/unit/api/routes/test_chat.py`

**Estimated Coverage Gain:** 90 statements (290)

**Priority:** **CRITICAL** - Main entry point for chat functionality

---

#### 3. `api/services/session_service.py` (95 statements, 0% coverage)

**Purpose:** Session CRUD operations with PostgreSQL

**Complexity:** Medium
- Database operations with asyncpg
- Session metadata management
- File cleanup on deletion

**Dependencies to Mock:**
- `asyncpg.Pool` - Database connection pool
- File system operations for cleanup

**Key Test Scenarios:**
1. **Session Creation**
   - Generate unique session ID
   - Store with default model/config
   - Initialize session workspace

2. **Session Retrieval**
   - Get by ID
   - Get with full history and pagination
   - List sessions with pagination

3. **Session Updates**
   - Update allowed fields (title, model, mcp_config, etc.)
   - Validate field constraints
   - Update last_used_at timestamp

4. **Session Deletion**
   - Delete from database
   - Clean up session files from disk
   - Handle missing session gracefully

5. **Model Limit Logic**
   - Token limits by model
   - Partial match for deployment names
   - Conservative default for unknown models

**Test File:** `tests/backend/unit/api/services/test_session_service.py`

**Estimated Coverage Gain:** 85 statements (375)

**Priority:** **HIGH** - Core session management logic

---

#### 4. `api/services/token_aware_session.py` (191 statements, 0% coverage)

**Purpose:** Token tracking and automatic summarization for chat sessions

**Complexity:** High
- Token counting with tiktoken
- Threshold-based summarization (80% of model limit)
- Conversation summarization with Agent
- Recent exchange preservation

**Dependencies to Mock:**
- `asyncpg.Pool` - Database
- `Agent`, `Runner` - For summarization
- Token counting utilities

**Key Test Scenarios:**
1. **Token Counting**
   - Count tokens for messages
   - Track total tokens across conversation
   - Handle tool token accumulation

2. **Summarization Logic**
   - Trigger at 80% threshold
   - Keep recent N exchanges
   - Summarize older conversation
   - Update token counts after summarization

3. **Database Persistence**
   - Load token state from DB
   - Update total_tokens in sessions table
   - Save accumulated_tool_tokens

4. **Edge Cases**
   - Empty conversation (no summarization)
   - Very short conversations (below MIN_MESSAGES)
   - Failed summarization (retry logic)

**Test File:** `tests/backend/unit/api/services/test_token_aware_session.py`

**Estimated Coverage Gain:** 150 statements (525)

**Priority:** **HIGH** - Critical for context management

---

#### 5. `utils/db_utils.py` (79 statements, 0% coverage)

**Purpose:** Database connection pooling, retry logic, health checks

**Complexity:** Medium
- Connection pool factory with production config
- Retry decorator with exponential backoff
- Transaction context managers
- Health check utilities

**Dependencies to Mock:**
- `asyncpg` module
- Connection objects
- Time delays for retry logic

**Key Test Scenarios:**
1. **Pool Creation**
   - Successful pool initialization
   - Connection timeout handling
   - Pool exhaustion errors

2. **Retry Logic**
   - Transient failure retry with backoff
   - Max attempts exceeded
   - Non-retryable exceptions bypass retry

3. **Transaction Management**
   - Successful transaction commit
   - Transaction rollback on error
   - Timeout handling

4. **Health Checks**
   - Healthy pool returns stats
   - Unhealthy pool detection
   - Pool size metrics

5. **Graceful Shutdown**
   - Wait for active connections to drain
   - Force close on timeout
   - Proper cleanup

**Test File:** `tests/backend/unit/utils/test_db_utils.py`

**Estimated Coverage Gain:** 75 statements (600)

**Priority:** **HIGH** - Database resilience critical for production

---

#### 6. `integrations/mcp_pool.py` (108 statements, 0% coverage)

**Purpose:** MCP server connection pooling for concurrent requests

**Complexity:** High
- Pre-spawn MCP server instances
- Queue-based server checkout/checkin
- Concurrent acquisition with timeout
- Graceful shutdown

**Dependencies to Mock:**
- `mcp_registry.initialize_mcp_server`
- MCP server objects
- `asyncio.Queue`

**Key Test Scenarios:**
1. **Pool Initialization**
   - Spawn pool_size instances per server type
   - Handle spawn failures gracefully
   - Track all servers for cleanup

2. **Acquire/Release**
   - Acquire server from pool (blocks if empty)
   - Release server back to pool
   - Timeout on acquisition
   - KeyError for unknown server type

3. **Concurrent Access**
   - Multiple concurrent acquisitions
   - Context manager auto-release
   - Acquire multiple servers atomically

4. **Pool Statistics**
   - Total vs available counts
   - Per-server-type stats
   - Monitoring integration

5. **Shutdown**
   - Graceful shutdown all servers
   - Concurrent shutdown tasks
   - Clear pool state

**Test File:** `tests/backend/unit/integrations/test_mcp_pool.py`

**Estimated Coverage Gain:** 95 statements (695)

**Priority:** **HIGH** - Critical for MCP server concurrency

---

#### 7. `api/main.py` (72 statements, 0% coverage)

**Purpose:** FastAPI application initialization, lifespan management, route registration

**Complexity:** Medium
- OpenAI client setup
- Database pool initialization
- MCP pool initialization
- Graceful shutdown sequence

**Dependencies to Mock:**
- Settings/environment
- Database pool creation
- MCP pool initialization
- OpenAI client

**Key Test Scenarios:**
1. **Application Startup**
   - OpenAI client configuration (Azure vs OpenAI)
   - Database pool initialization with health check
   - MCP pool initialization
   - WebSocket manager startup

2. **Lifespan Context**
   - Startup sequence completes
   - Resources initialized in app.state
   - Health check passes

3. **Graceful Shutdown**
   - Shutdown event signaled
   - WebSocket drain with timeout
   - MCP pool shutdown
   - Database pool graceful close

4. **Route Registration**
   - API v1 routes registered
   - WebSocket routes registered
   - Exception handlers registered
   - Middleware configured

**Test File:** `tests/backend/unit/api/test_main.py`

**Estimated Coverage Gain:** 60 statements (755)

**Priority:** **HIGH** - Application initialization and lifecycle

---

### IMPORTANT - Priority 2 (Medium Business Value)

#### 8. `api/middleware/exception_handlers.py` (143 statements, 0% coverage)

**Purpose:** Global exception handling with consistent error responses

**Complexity:** Medium
- Custom exception classes
- Exception-to-ErrorCode mapping
- Structured error responses
- Request context integration

**Dependencies to Mock:**
- FastAPI Request objects
- Various exception types
- Settings for debug mode

**Key Test Scenarios:**
1. **Custom Exceptions**
   - AppException with error codes
   - AuthenticationError variants
   - ResourceNotFoundError
   - ValidationException with field errors

2. **Exception Handlers**
   - AppException → ErrorResponse
   - HTTPException mapping
   - Pydantic validation errors
   - OpenAI API errors
   - PostgreSQL errors
   - Generic exception fallback

3. **Error Response Format**
   - Consistent ErrorResponse structure
   - Request ID inclusion
   - Path tracking
   - Debug info in development mode

4. **Logging Integration**
   - Appropriate log levels (ERROR/WARNING)
   - Request context in logs
   - Exception details

**Test File:** `tests/backend/unit/api/middleware/test_exception_handlers.py`

**Estimated Coverage Gain:** 120 statements (875)

**Priority:** **MEDIUM** - Error handling consistency

---

#### 9. `api/routes/v1/sessions.py` (81 statements, 0% coverage)

**Purpose:** Session CRUD REST endpoints

**Complexity:** Low-Medium
- FastAPI route handlers
- Dependency injection
- Response model serialization
- OpenAPI documentation

**Dependencies to Mock:**
- SessionService
- FileService
- Database pool

**Key Test Scenarios:**
1. **List Sessions** (`GET /api/v1/sessions`)
   - Pagination parameters
   - Response model validation
   - Empty results

2. **Create Session** (`POST /api/v1/sessions`)
   - With optional parameters
   - Default values
   - Workspace initialization

3. **Get Session** (`GET /api/v1/sessions/{id}`)
   - With history
   - Not found handling
   - Pagination

4. **Update Session** (`PATCH /api/v1/sessions/{id}`)
   - Allowed fields
   - Not found handling
   - Partial updates

5. **Delete Session** (`DELETE /api/v1/sessions/{id}`)
   - Success response
   - File cleanup
   - Not found handling

6. **Summarize Session** (`POST /api/v1/sessions/{id}/summarize`)
   - Force summarization
   - Token count changes
   - Tool call persistence

**Test File:** `tests/backend/unit/api/routes/v1/test_sessions.py`

**Estimated Coverage Gain:** 75 statements (950)

**Priority:** **MEDIUM** - REST API endpoints

---

#### 10. `api/websocket/task_manager.py` (76 statements, 30.26% coverage)

**Purpose:** Cooperative cancellation via CancellationToken

**Complexity:** Medium
- Async event-based cancellation
- Callback registration
- Context manager support

**Dependencies to Mock:**
- Asyncio tasks and events
- Callback functions

**Key Test Scenarios (expand existing):**
1. **Cancellation Signaling**
   - Cancel with reason
   - Check is_cancelled property
   - Cancel reason retrieval

2. **Callback Execution**
   - Register callback before cancellation
   - Register callback after cancellation (immediate call)
   - Multiple callbacks
   - Remove callback

3. **Cancellation Scope**
   - Raise CancelledError if cancelled
   - Cancel current task on token cancellation
   - Cleanup on exit

4. **Token Reset**
   - Reset to uncancelled state
   - Clear reason and callbacks

**Test File:** `tests/backend/unit/api/websocket/test_task_manager.py` (extend existing)

**Estimated Coverage Gain:** 50 statements (1000)

**Priority:** **MEDIUM** - Cancellation infrastructure

---

#### 11. `api/routes/v1/files.py` (47 statements, 0% coverage)

**Purpose:** File upload/download/delete endpoints

**Complexity:** Low-Medium
- Multipart file upload handling
- File streaming responses
- File metadata management

**Dependencies to Mock:**
- FileService
- SessionService
- UploadFile objects

**Key Test Scenarios:**
1. **List Files** (`GET /api/v1/sessions/{id}/files`)
   - List files in folder
   - Filter by folder

2. **Upload File** (`POST /api/v1/sessions/{id}/files`)
   - Successful upload
   - Duplicate filename handling
   - Folder parameter

3. **Download File** (`GET /api/v1/sessions/{id}/files/{filename}`)
   - Streaming response
   - Not found handling
   - Content-Type headers

4. **Delete File** (`DELETE /api/v1/sessions/{id}/files/{filename}`)
   - Success response
   - Not found handling
   - Folder parameter

**Test File:** `tests/backend/unit/api/routes/v1/test_files.py`

**Estimated Coverage Gain:** 45 statements (1045)

**Priority:** **MEDIUM** - File operations

---

#### 12. `api/middleware/request_context.py` (84 statements, 46.43% coverage)

**Purpose:** Request ID tracking and context management

**Complexity:** Low
- Request ID generation
- Context variable management
- Middleware integration

**Dependencies to Mock:**
- FastAPI Request/Response
- Context variables

**Key Test Scenarios (expand existing):**
1. **Request ID Generation**
   - Unique ID per request
   - ID in response headers
   - ID in log context

2. **Context Management**
   - Create context per request
   - Update context with session_id
   - Get context from anywhere in stack
   - WebSocket context creation

3. **Middleware Processing**
   - Process request
   - Add headers to response
   - Exception handling

**Test File:** `tests/backend/unit/api/middleware/test_request_context.py` (expand existing)

**Estimated Coverage Gain:** 40 statements (1085)

**Priority:** **MEDIUM** - Request tracking

---

#### 13. `api/dependencies.py` (27 statements, 0% coverage)

**Purpose:** FastAPI dependency injection providers

**Complexity:** Low
- Simple getter functions
- App state access
- Service instantiation

**Dependencies to Mock:**
- FastAPI Request with app.state
- Settings

**Key Test Scenarios:**
1. **Settings Provider**
   - Get settings
   - Hot reload in development

2. **Database Provider**
   - Get db_pool from app.state

3. **Service Providers**
   - FileService instantiation
   - SessionService instantiation

4. **Manager Providers**
   - WebSocketManager from state
   - MCPServerPool from state

**Test File:** `tests/backend/unit/api/test_dependencies.py`

**Estimated Coverage Gain:** 27 statements (1112)

**Priority:** **MEDIUM** - Dependency injection

---

#### 14. `api/services/file_service.py` (91 statements, 0% coverage)

**Purpose:** File operations and session workspace management

**Complexity:** Medium
- File upload/download/delete
- Session workspace initialization
- Template symlink management

**Dependencies to Mock:**
- File system operations
- Database for file metadata
- Path utilities

**Key Test Scenarios:**
1. **Workspace Initialization**
   - Create session directories
   - Create template symlinks
   - Handle existing workspaces

2. **File Operations**
   - Upload file to session
   - Download file by name
   - Delete file
   - List files in folder

3. **File Metadata**
   - Track in database
   - Size calculations
   - Timestamps

4. **Error Handling**
   - File not found
   - Disk space issues
   - Permission errors

**Test File:** `tests/backend/unit/api/services/test_file_service.py`

**Estimated Coverage Gain:** 80 statements (1192)

**Priority:** **MEDIUM** - File management

---

#### 15. `api/routes/v1/health.py` (41 statements, 0% coverage)

**Purpose:** Health check endpoints for monitoring

**Complexity:** Low
- Database health check
- Liveness/readiness probes
- Detailed health status

**Dependencies to Mock:**
- Database pool
- `check_pool_health` function

**Key Test Scenarios:**
1. **Liveness Probe** (`GET /api/v1/health`)
   - Always returns 200 OK
   - Simple JSON response

2. **Readiness Probe** (`GET /api/v1/health/ready`)
   - Healthy when DB accessible
   - Unhealthy (503) when DB down

3. **Detailed Health** (`GET /api/v1/health/detailed`)
   - Database status
   - Pool statistics
   - Version info
   - Uptime

**Test File:** `tests/backend/unit/api/routes/v1/test_health.py`

**Estimated Coverage Gain:** 40 statements (1232)

**Priority:** **MEDIUM** - Health monitoring

---

### USEFUL - Priority 3 (Lower Business Value)

#### 16. `api/routes/v1/messages.py` (35 statements, 0% coverage)

**Purpose:** Message pagination endpoint

**Complexity:** Low
- Simple database queries
- Pagination logic

**Test File:** `tests/backend/unit/api/routes/v1/test_messages.py`

**Estimated Coverage Gain:** 30 statements (1262)

---

#### 17. `api/routes/v1/config.py` (14 statements, 0% coverage)

**Purpose:** Configuration endpoint for frontend

**Complexity:** Very Low
- Return settings as JSON

**Test File:** `tests/backend/unit/api/routes/v1/test_config.py`

**Estimated Coverage Gain:** 14 statements (1276)

---

#### 18. `api/routes/v1/auth.py` (29 statements, 0% coverage)

**Purpose:** Authentication endpoints (future)

**Complexity:** Low
- Placeholder for Phase 2

**Test File:** `tests/backend/unit/api/routes/v1/test_auth.py`

**Estimated Coverage Gain:** 25 statements (1301)

---

#### 19. `api/middleware/auth.py` (46 statements, 0% coverage)

**Purpose:** JWT authentication middleware

**Complexity:** Medium
- JWT token validation
- User lookup
- Phase 1 bypass logic

**Test File:** `tests/backend/unit/api/middleware/test_auth.py`

**Estimated Coverage Gain:** 40 statements (1341)

---

#### 20. `api/services/auth_service.py` (57 statements, 0% coverage)

**Purpose:** Authentication service logic

**Complexity:** Medium
- Login/logout
- Token generation
- User management

**Test File:** `tests/backend/unit/api/services/test_auth_service.py`

**Estimated Coverage Gain:** 50 statements (1391)

---

#### 21. `api/services/postgres_session.py` (48 statements, 0% coverage)

**Purpose:** PostgreSQL session adapter for agents SDK

**Complexity:** Medium
- Persist SDK session items to PostgreSQL
- Session history retrieval

**Test File:** `tests/backend/unit/api/services/test_postgres_session.py`

**Estimated Coverage Gain:** 45 statements (1436)

---

#### 22. `api/services/message_utils.py` (22 statements, 0% coverage)

**Purpose:** Message transformation utilities

**Complexity:** Low
- Database row to message dict

**Test File:** `tests/backend/unit/api/services/test_message_utils.py`

**Estimated Coverage Gain:** 20 statements (1456)

---

#### 23. `api/services/file_context.py` (27 statements, 0% coverage)

**Purpose:** Session file context manager

**Complexity:** Low
- Change cwd for file operations

**Test File:** `tests/backend/unit/api/services/test_file_context.py`

**Estimated Coverage Gain:** 25 statements (1481)

---

#### 24. `api/websocket/errors.py` (114 statements, 35.96% coverage)

**Purpose:** WebSocket error handling utilities

**Test File:** `tests/backend/unit/api/websocket/test_errors.py` (expand existing)

**Estimated Coverage Gain:** 70 statements (1551)

---

#### 25. Schema Models (241 statements total, 0% coverage)

**Purpose:** Pydantic response models for API

**Complexity:** Very Low
- Mostly data class definitions
- Validation rules

**Test Files:**
- `tests/backend/unit/models/schemas/test_auth.py` (22 stmts)
- `tests/backend/unit/models/schemas/test_config.py` (25 stmts)
- `tests/backend/unit/models/schemas/test_files.py` (34 stmts)
- `tests/backend/unit/models/schemas/test_health.py` (35 stmts)
- `tests/backend/unit/models/schemas/test_sessions.py` (96 stmts)
- `tests/backend/unit/models/schemas/test_base.py` (29 stmts)

**Estimated Coverage Gain:** 180 statements (1731)

**Priority:** **LOW** - Validation boilerplate, but easy wins

---

#### 26. Partial Coverage Improvements

**Files with existing partial coverage:**
- `integrations/event_handlers/raw_events.py` (56% → 85%): +30 stmts (1761)
- `tools/code_interpreter.py` (62% → 80%): +50 stmts (1811)
- `session_models.py` (74% → 90%): +35 stmts (1846)

---

## Test Infrastructure Requirements

### 1. Database Test Utilities

Create `tests/backend/fixtures/database.py`:

```python
@pytest.fixture
async def db_pool():
    """Provide test PostgreSQL connection pool."""
    pool = await create_database_pool(
        dsn=TEST_DATABASE_URL,
        min_size=1,
        max_size=5
    )
    yield pool
    await pool.close()

@pytest.fixture
async def clean_db(db_pool):
    """Clean database tables before test."""
    async with db_pool.acquire() as conn:
        await conn.execute("TRUNCATE sessions, messages, files, users CASCADE")
    yield
```

### 2. FastAPI Test Client

Create `tests/backend/fixtures/api_client.py`:

```python
@pytest.fixture
async def test_client():
    """Provide FastAPI test client with app lifespan."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.fixture
async def auth_headers(test_client):
    """Provide authenticated request headers."""
    # Login and get token
    response = await test_client.post("/api/v1/auth/login", json=...)
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

### 3. WebSocket Test Utilities

Create `tests/backend/fixtures/websocket.py`:

```python
@pytest.fixture
async def ws_connection(test_client):
    """Provide WebSocket test connection."""
    async with test_client.websocket_connect("/ws/chat/test_session") as ws:
        yield ws
```

### 4. Mock Factories

Create `tests/backend/mocks/factories.py`:

```python
def create_mock_agent():
    """Create mock Agent for testing."""
    agent = Mock(spec=Agent)
    agent.name = "TestAgent"
    agent.model = "gpt-4o"
    return agent

def create_mock_runner():
    """Create mock Runner with streaming."""
    runner = Mock(spec=Runner)
    runner.run_streamed = AsyncMock()
    return runner

def create_mock_mcp_pool():
    """Create mock MCP server pool."""
    pool = AsyncMock(spec=MCPServerPool)
    pool.acquire_servers = AsyncMock()
    return pool
```

### 5. Test Data Builders

Create `tests/backend/builders/session_builder.py`:

```python
class SessionBuilder:
    """Builder for test session data."""

    def __init__(self):
        self.data = {
            "session_id": f"chat_{secrets.token_hex(4)}",
            "title": "Test Session",
            "model": "gpt-4o",
            ...
        }

    def with_title(self, title: str):
        self.data["title"] = title
        return self

    async def create(self, db_pool) -> dict:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(INSERT_QUERY, ...)
        return row_to_dict(row)
```

---

## Recommended Test File Structure

```
tests/backend/
├── conftest.py                          # Existing fixtures
├── fixtures/                            # NEW
│   ├── database.py                      # DB fixtures
│   ├── api_client.py                    # FastAPI client
│   └── websocket.py                     # WebSocket fixtures
├── mocks/                               # NEW
│   ├── factories.py                     # Mock factories
│   └── event_streams.py                 # Mock streaming events
├── builders/                            # NEW
│   ├── session_builder.py               # Test data builders
│   └── message_builder.py
└── unit/
    ├── api/
    │   ├── test_main.py                 # NEW
    │   ├── test_dependencies.py         # NEW
    │   ├── middleware/
    │   │   ├── test_exception_handlers.py  # NEW
    │   │   ├── test_request_context.py     # EXPAND
    │   │   └── test_auth.py                # NEW
    │   ├── routes/
    │   │   ├── test_chat.py             # NEW - CRITICAL
    │   │   └── v1/
    │   │       ├── test_sessions.py     # NEW
    │   │       ├── test_files.py        # NEW
    │   │       ├── test_health.py       # NEW
    │   │       ├── test_messages.py     # NEW
    │   │       ├── test_config.py       # NEW
    │   │       └── test_auth.py         # NEW
    │   ├── services/
    │   │   ├── test_chat_service.py     # NEW - CRITICAL
    │   │   ├── test_session_service.py  # NEW
    │   │   ├── test_file_service.py     # NEW
    │   │   ├── test_token_aware_session.py  # NEW
    │   │   ├── test_postgres_session.py # NEW
    │   │   ├── test_auth_service.py     # NEW
    │   │   ├── test_message_utils.py    # NEW
    │   │   └── test_file_context.py     # NEW
    │   └── websocket/
    │       ├── test_manager.py          # EXISTS
    │       ├── test_task_manager.py     # EXPAND
    │       └── test_errors.py           # EXPAND
    ├── integrations/
    │   └── test_mcp_pool.py             # NEW - CRITICAL
    ├── models/
    │   └── schemas/                     # NEW directory
    │       ├── test_auth.py
    │       ├── test_config.py
    │       ├── test_files.py
    │       ├── test_health.py
    │       ├── test_sessions.py
    │       └── test_base.py
    └── utils/
        └── test_db_utils.py             # NEW - CRITICAL
```

---

## Prioritized Implementation Plan

### Phase 1: Critical Business Logic (Week 1-2)
**Target:** 755 statements → ~16% coverage increase

1. `utils/db_utils.py` - Database foundation (1-2 days)
2. `api/services/session_service.py` - Session CRUD (1-2 days)
3. `api/services/token_aware_session.py` - Token tracking (2-3 days)
4. `api/services/chat_service.py` - Core chat orchestration (3-4 days)
5. `api/routes/chat.py` - WebSocket endpoint (2 days)

### Phase 2: Infrastructure & Middleware (Week 3)
**Target:** +435 statements → ~9% coverage increase

6. `integrations/mcp_pool.py` - MCP pooling (2 days)
7. `api/main.py` - Application lifecycle (1 day)
8. `api/middleware/exception_handlers.py` - Error handling (2 days)
9. `api/dependencies.py` - DI providers (0.5 days)

### Phase 3: REST API Endpoints (Week 4)
**Target:** +300 statements → ~6% coverage increase

10. `api/routes/v1/sessions.py` - Session endpoints (1.5 days)
11. `api/routes/v1/files.py` - File endpoints (1 day)
12. `api/routes/v1/health.py` - Health endpoints (0.5 days)
13. `api/middleware/request_context.py` - Expand existing (0.5 days)
14. `api/services/file_service.py` - File operations (1.5 days)

### Phase 4: Supporting Services (Week 5)
**Target:** +200 statements → ~4% coverage increase

15. `api/websocket/task_manager.py` - Expand cancellation tests (1 day)
16. `api/routes/v1/messages.py` - Message pagination (0.5 days)
17. `api/routes/v1/config.py` - Config endpoint (0.5 days)
18. `api/services/postgres_session.py` - SDK adapter (1 day)
19. Minor utilities (message_utils, file_context) (1 day)

### Phase 5: Schema Models & Polish (Week 6)
**Target:** +250 statements → ~5% coverage increase

20. All schema models - Validation tests (2 days)
21. Partial coverage improvements (raw_events, code_interpreter) (2 days)
22. Edge case coverage and cleanup (1 day)

**Total Timeline:** 5-6 weeks to 85% coverage

---

## Risk Areas & Edge Cases to Focus On

### High-Risk Edge Cases

1. **Concurrent Chat Requests**
   - Multiple sessions streaming simultaneously
   - MCP pool exhaustion under load
   - Database connection pool contention

2. **Cancellation & Interrupts**
   - Mid-stream cancellation during tool execution
   - Partial response persistence
   - Race conditions in cancellation token

3. **Database Failures**
   - Connection loss during transaction
   - Pool exhaustion
   - Retry logic correctness

4. **Token Management**
   - Summarization at exact threshold
   - Tool token accumulation overflow
   - Concurrent token updates

5. **WebSocket Edge Cases**
   - Client disconnect during agent processing
   - Connection limit enforcement
   - Idle timeout during long tool execution

6. **File Operations**
   - Concurrent file uploads
   - Disk space exhaustion
   - Symlink creation on different filesystems

7. **Error Recovery**
   - OpenAI API failures mid-stream
   - MCP server crashes
   - Database transaction rollbacks

### Critical Path Testing

**Most Important Integration Paths:**
1. User message → WebSocket → ChatService → Agent → Streaming → Persistence
2. Token threshold → Automatic summarization → Token update → Frontend notification
3. User interrupt → CancellationToken → Stream abort → Partial save
4. Session creation → Workspace init → Template symlink → First message
5. MCP pool acquisition → Concurrent requests → Server release → Pool stats

---

## Testing Best Practices

### 1. Test Naming Convention
```python
def test_<unit>_<scenario>_<expected_outcome>():
    """Clear docstring describing the test."""
```

### 2. Arrange-Act-Assert Pattern
```python
# Arrange
mock_agent = create_mock_agent()
session_id = "test_session"

# Act
result = await chat_service.process_chat(session_id, messages)

# Assert
assert result is not None
mock_agent.run.assert_called_once()
```

### 3. Focus on Behavior, Not Implementation
- Test public API contracts
- Avoid testing internal implementation details
- Mock at service boundaries (DB, OpenAI, MCP)

### 4. Parameterized Tests for Edge Cases
```python
@pytest.mark.parametrize("model,expected_limit", [
    ("gpt-4o", 128000),
    ("gpt-4", 8192),
    ("unknown-model", 15000),  # Conservative default
])
def test_model_token_limits(model, expected_limit):
    ...
```

### 5. Async Test Isolation
```python
@pytest.mark.asyncio
async def test_concurrent_requests():
    # Each test gets fresh mocks and state
    # Use autouse fixtures for cleanup
    ...
```

---

## Quality Metrics Target

**After reaching 85% coverage:**
- Line Coverage: 85%+ (target: 4000/4702 statements)
- Branch Coverage: 75%+ (critical paths)
- Mutation Score: 70%+ (test quality, not just coverage)
- Test Execution Time: <10 seconds (parallel execution)
- Flaky Test Rate: <1% (no timing-dependent tests)

---

## Maintenance Strategy

1. **Coverage Gate**: Block PRs that drop coverage below 83%
2. **Critical Path Protection**: 100% coverage on chat_service, session_service
3. **Integration Tests**: Add E2E tests for critical flows
4. **Performance Tests**: Load test MCP pool under concurrent requests
5. **Quarterly Review**: Update test strategy as architecture evolves

---

## Notes

- Schema models are low value but easy wins (copy-paste Pydantic validation tests)
- Focus test effort on business logic with complex state management
- Database tests should use real PostgreSQL (not mocks) for integration confidence
- WebSocket tests can use FastAPI's test client without real server
- MCP pool tests critical for multi-user cloud deployment
- Cancellation logic needs extensive testing due to race condition risks

**Estimated Total Effort:** 160-200 hours (4-5 weeks at full focus)

**Recommended Approach:** Tackle in phases, with continuous integration after each phase
