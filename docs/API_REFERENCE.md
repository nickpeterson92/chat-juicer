# Chat Juicer - API Reference

> Complete API documentation for the FastAPI backend.

## Base URL

- **Local Development**: `http://localhost:8000`
- **WebSocket**: `ws://localhost:8000`

## Authentication

All endpoints except `/api/health` and `/api/config` require authentication.

### Headers

```
Authorization: Bearer <access_token>
```

### Token Flow

1. Login with `/api/auth/login` to get access + refresh tokens
2. Use access token in Authorization header
3. Refresh with `/api/auth/refresh` when access token expires

---

## Endpoints

### Health Check

#### `GET /api/health`

Check API and database health status.

**Response**:
```json
{
  "status": "healthy",
  "database": "healthy",
  "version": "1.0.0-local"
}
```

**Status Values**:
- `healthy` - All systems operational
- `degraded` - Partial functionality available

---

### Configuration

#### `GET /api/config`

Get model and MCP server configuration for frontend.

**Response**:
```json
{
  "success": true,
  "models": [
    {
      "value": "gpt-5.1",
      "label": "GPT-5.1",
      "isDefault": true,
      "supportsReasoning": true,
      "provider": "openai",
      "context_window": 272000
    }
  ],
  "reasoning_levels": [
    { "value": "none", "label": "None", "isDefault": false },
    { "value": "low", "label": "Low", "isDefault": false },
    { "value": "medium", "label": "Medium", "isDefault": true },
    { "value": "high", "label": "High", "isDefault": false }
  ],
  "mcp_servers": ["sequential-thinking", "fetch"],
  "max_file_size": 52428800
}
```

---

### Authentication

#### `POST /api/auth/login`

Authenticate user and issue tokens.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Response** (`200 OK`):
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Errors**:
- `401 Unauthorized` - Invalid credentials

---

#### `POST /api/auth/refresh`

Refresh access token using refresh token.

**Request Body**:
```json
{
  "refresh_token": "eyJ..."
}
```

**Response** (`200 OK`):
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Errors**:
- `401 Unauthorized` - Invalid or expired refresh token

---

#### `GET /api/auth/me`

Get current authenticated user information.

**Response** (`200 OK`):
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name"
}
```

**Errors**:
- `401 Unauthorized` - Missing or invalid token

---

### Sessions

#### `GET /api/sessions`

List all sessions for current user.

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | int | 0 | Pagination offset |
| `limit` | int | 50 | Max sessions to return |

**Response** (`200 OK`):
```json
{
  "sessions": [
    {
      "session_id": "abc123",
      "title": "Chat about Python",
      "model": "gpt-5.1",
      "reasoning_effort": "medium",
      "mcp_config": ["sequential-thinking", "fetch"],
      "pinned": false,
      "is_named": true,
      "message_count": 42,
      "turn_count": 21,
      "total_tokens": 15000,
      "created_at": "2025-12-14T10:00:00Z",
      "last_used_at": "2025-12-14T15:30:00Z"
    }
  ],
  "total_count": 100,
  "has_more": true
}
```

---

#### `POST /api/sessions`

Create a new chat session.

**Request Body**:
```json
{
  "title": "My Chat",
  "model": "gpt-5.1",
  "mcp_config": ["sequential-thinking", "fetch"],
  "reasoning_effort": "medium"
}
```

All fields are optional. Defaults:
- `title`: Auto-generated from first message
- `model`: First supported model
- `mcp_config`: Default MCP servers
- `reasoning_effort`: "medium"

**Response** (`200 OK`):
```json
{
  "session_id": "abc123",
  "title": "My Chat",
  "model": "gpt-5.1",
  "reasoning_effort": "medium",
  "mcp_config": ["sequential-thinking", "fetch"],
  "pinned": false,
  "is_named": false,
  "message_count": 0,
  "turn_count": 0,
  "total_tokens": 0,
  "created_at": "2025-12-14T10:00:00Z",
  "last_used_at": "2025-12-14T10:00:00Z"
}
```

---

#### `GET /api/sessions/{session_id}`

Get session with conversation history.

**Response** (`200 OK`):
```json
{
  "session": {
    "session_id": "abc123",
    "title": "Chat about Python",
    "model": "gpt-5.1",
    "reasoning_effort": "medium",
    "mcp_config": ["sequential-thinking", "fetch"],
    "pinned": false,
    "is_named": true,
    "message_count": 42,
    "turn_count": 21,
    "total_tokens": 15000,
    "created_at": "2025-12-14T10:00:00Z",
    "last_used_at": "2025-12-14T15:30:00Z"
  },
  "full_history": [
    {
      "role": "user",
      "content": "Hello!",
      "created_at": "2025-12-14T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Hello! How can I help you?",
      "created_at": "2025-12-14T10:00:01Z"
    }
  ],
  "files": [
    {
      "name": "document.pdf",
      "size": 1024000,
      "folder": "sources",
      "uploaded_at": "2025-12-14T10:05:00Z"
    }
  ],
  "has_more": false,
  "loaded_count": 42,
  "message_count": 42
}
```

**Errors**:
- `404 Not Found` - Session not found

---

#### `PATCH /api/sessions/{session_id}`

Update session metadata.

**Request Body**:
```json
{
  "title": "Updated Title",
  "pinned": true,
  "model": "gpt-4o",
  "mcp_config": ["sequential-thinking"],
  "reasoning_effort": "high"
}
```

All fields are optional.

**Response** (`200 OK`):
```json
{
  "session_id": "abc123",
  "title": "Updated Title",
  "pinned": true,
  ...
}
```

**Errors**:
- `404 Not Found` - Session not found

---

#### `DELETE /api/sessions/{session_id}`

Delete a session and all associated data.

**Response** (`200 OK`):
```json
{
  "success": true
}
```

**Errors**:
- `404 Not Found` - Session not found

---

#### `POST /api/sessions/{session_id}/summarize`

Force conversation summarization.

**Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Summary of the conversation...",
  "new_token_count": 5000,
  "call_id": "sum_abc12345"
}
```

**Response** (no summarization needed):
```json
{
  "success": false,
  "error": "Summarization skipped - not enough content or already summarized"
}
```

**Errors**:
- `404 Not Found` - Session not found

---

### Messages

#### `GET /api/sessions/{session_id}/messages`

List messages for a session (Layer 2 history).

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | int | 0 | Pagination offset |
| `limit` | int | 50 | Max messages to return |

**Response** (`200 OK`):
```json
{
  "messages": [
    {
      "id": "msg_123",
      "role": "user",
      "content": "Hello!",
      "created_at": "2025-12-14T10:00:00Z"
    },
    {
      "id": "msg_124",
      "role": "assistant",
      "content": "Hello! How can I help?",
      "created_at": "2025-12-14T10:00:01Z"
    },
    {
      "id": "msg_125",
      "role": "tool_call",
      "content": "Read file",
      "tool_call_id": "call_abc",
      "tool_name": "read_file",
      "tool_arguments": "{\"path\": \"/file.txt\"}",
      "tool_result": "File contents...",
      "tool_success": true,
      "created_at": "2025-12-14T10:00:05Z"
    }
  ]
}
```

**Errors**:
- `404 Not Found` - Session not found

---

### Files

#### `GET /api/sessions/{session_id}/files`

List files in session folder.

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `folder` | string | "sources" | Folder name ("sources" or "output") |

**Response** (`200 OK`):
```json
{
  "files": [
    {
      "name": "document.pdf",
      "size": 1024000,
      "folder": "sources",
      "uploaded_at": "2025-12-14T10:05:00Z"
    }
  ]
}
```

---

#### `POST /api/sessions/{session_id}/files/upload`

Upload a file to session storage.

**Request**: `multipart/form-data`
| Field | Type | Description |
|-------|------|-------------|
| `file` | file | File to upload |
| `folder` | string | Target folder (default: "sources") |

**Response** (`200 OK`):
```json
{
  "name": "document.pdf",
  "size": 1024000,
  "folder": "sources",
  "uploaded_at": "2025-12-14T10:05:00Z"
}
```

---

#### `GET /api/sessions/{session_id}/files/{filename}/download`

Download file content.

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `folder` | string | "sources" | Folder name |

**Response**: Binary file content with appropriate Content-Type header.

**Errors**:
- `404 Not Found` - File not found

---

#### `GET /api/sessions/{session_id}/files/{filename}/path`

Get local file path (for shell.openPath in Electron).

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `folder` | string | "sources" | Folder name |

**Response** (`200 OK`):
```json
{
  "path": "/absolute/path/to/file.pdf"
}
```

**Errors**:
- `404 Not Found` - File not found

---

#### `DELETE /api/sessions/{session_id}/files/{filename}`

Delete a file from session storage.

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `folder` | string | "sources" | Folder name |

**Response** (`200 OK`):
```json
{
  "success": true
}
```

**Errors**:
- `404 Not Found` - File not found

---

## WebSocket API

### Endpoint

```
ws://localhost:8000/ws/chat/{session_id}?token={access_token}
```

### Client → Server Messages

#### Chat Message

```json
{
  "type": "message",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "model": "gpt-5.1",
  "reasoning_effort": "medium"
}
```

#### Interrupt Request

```json
{
  "type": "interrupt"
}
```

### Server → Client Events

#### Stream Lifecycle

```json
// Stream started
{ "type": "assistant_start" }

// Stream completed
{
  "type": "assistant_end",
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "total_tokens": 150
  }
}

// Stream interrupted by user
{ "type": "stream_interrupted" }
```

#### Content Events

```json
// Text content delta
{
  "type": "text_delta",
  "content": "Hello, how can I "
}
```

#### Tool Events

```json
// Tool execution started
{
  "type": "tool_start",
  "call_id": "call_abc123",
  "name": "read_file"
}

// Tool arguments streaming
{
  "type": "tool_arguments_delta",
  "call_id": "call_abc123",
  "delta": "{\"path\":"
}

// Tool execution completed
{
  "type": "tool_done",
  "call_id": "call_abc123",
  "output": "File contents..."
}
```

#### Session Events

```json
// Session title updated (auto-generated)
{
  "type": "session_updated",
  "session_id": "abc123",
  "title": "Python Help Session"
}

// Token usage update
{
  "type": "token_usage",
  "current": 15000,
  "limit": 128000,
  "threshold": 100000
}

// Summarization occurred
{
  "type": "summarization_complete",
  "tokens_before": 100000,
  "tokens_after": 5000
}
```

#### Keep-Alive

```json
// Server ping (every 30 seconds)
{ "type": "ping" }
```

#### Errors

```json
{
  "type": "error",
  "message": "Error description",
  "retryable": true
}
```

---

## Error Handling

### HTTP Error Responses

```json
{
  "detail": "Error message"
}
```

### Common Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid/missing token |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

### WebSocket Close Codes

| Code | Description |
|------|-------------|
| 1000 | Normal closure |
| 1001 | Going away (client disconnect) |
| 4401 | Unauthorized - Invalid token |

---

*Generated: 2025-12-14*
