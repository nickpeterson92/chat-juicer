# Chat Juicer Backend Cloud Migration Spec

**Version**: 1.0
**Date**: December 2024
**Status**: Draft

---

## Executive Summary

This specification outlines migrating **only the Python backend** to a cloud-hosted FastAPI server while keeping the existing Electron frontend unchanged. This is the fastest path to multi-user scalability.

### What Changes

| Component | Change |
|-----------|--------|
| Python backend | → FastAPI server (cloud-hosted) |
| SQLite | → PostgreSQL |
| Local files | → S3-compatible storage |
| No auth | → JWT authentication |
| `electron/main.js` | Minimal changes: HTTP/WS instead of Python spawn |
| `electron/renderer/*` | **ZERO CHANGES** |

### What This Enables

- ✅ Multiple concurrent users
- ✅ Horizontal scaling (add more FastAPI instances)
- ✅ Centralized data (PostgreSQL + S3)
- ✅ User authentication
- ✅ Future web frontend (when ready)
- ✅ Keep existing stable Electron UI

### Why Backend-First

1. **Lower risk**: Frontend is working, don't touch it
2. **Faster delivery**: One layer of change, not two
3. **Immediate value**: Multi-user support is the core need
4. **Future-proof**: Web frontend can come later, same API

---

## Table of Contents

1. [Current vs Target Architecture](#1-current-vs-target-architecture)
2. [Electron Client Changes](#2-electron-client-changes)
3. [FastAPI Server Design](#3-fastapi-server-design)
4. [API Design](#4-api-design)
5. [Database Schema](#5-database-schema)
6. [Authentication](#6-authentication)
7. [File Storage](#7-file-storage)
   - 7.1 [S3 Service](#71-s3-service)
   - 7.2 [Session File Context (S3 Abstraction)](#72-session-file-context-s3-abstraction-layer)
   - 7.3 [Tool Wrapper Updates](#73-tool-wrapper-updates)
   - 7.4 [Chat Service Integration](#74-chat-service-integration)
   - 7.5 [System Prompt - Unchanged](#75-system-prompt---unchanged)
   - 7.6 [Summary: What Changes](#76-summary-what-changes-for-s3)
8. [Infrastructure](#8-infrastructure)
9. [Migration Plan](#9-migration-plan)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Current vs Target Architecture

### 1.1 Current: Local Desktop

```
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON MAIN PROCESS                       │
│  • Spawns Python subprocess                                     │
│  • Binary IPC (MessagePack) over stdin/stdout                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Binary stdin/stdout
┌─────────────────────────────▼───────────────────────────────────┐
│                     PYTHON BACKEND (subprocess)                 │
│  • Agent/Runner pattern                                         │
│  • MCP Servers                                                  │
│  • TokenAwareSQLiteSession                                      │
│  • Native tools                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                     LOCAL STORAGE                               │
│  • SQLite: data/chat_history.db                                 │
│  • Files: data/files/{session_id}/                              │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Target: Cloud Backend

```
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON MAIN PROCESS                       │
│  • HTTP/WebSocket client (NO Python subprocess)                 │
│  • JWT token storage                                            │
│  • Forwards renderer IPC to cloud API                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTPS / WSS
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                     FASTAPI SERVER (cloud)                      │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ REST Routes │  │  WebSocket  │  │  Agent/Runner (existing)│  │
│  │ /api/*      │  │  /ws/chat/* │  │  MCP, Tools, etc.       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
      ┌───────▼───────┐ ┌─────▼─────┐ ┌───────▼───────┐
      │  PostgreSQL   │ │    S3     │ │ Azure OpenAI  │
      │  (sessions,   │ │  (files)  │ │    API        │
      │   messages)   │ │           │ │               │
      └───────────────┘ └───────────┘ └───────────────┘
```

### 1.3 What Stays The Same

| Component | Status |
|-----------|--------|
| `electron/renderer/*` | **UNCHANGED** - All vanilla JS stays exactly as-is |
| `electron/preload.js` | **UNCHANGED** - Same API exposed to renderer |
| Agent/Runner logic | **REUSED** - Core `src/app/runtime.py` logic moves to FastAPI |
| MCP integration | **REUSED** - `src/integrations/mcp_*.py` unchanged |
| Tools (`src/tools/*.py`) | **UNCHANGED** - Same implementations, wrapper handles S3 |
| System prompts | **UNCHANGED** - Still references `sources/`, `output/` |
| Pydantic models | **REUSED** - `src/models/*.py` extended for API |

> **Key insight**: Tools and prompts don't know about S3. A thin wrapper layer downloads files to a temp directory upon opening a WS connection for a session, tools operate on local paths, and writes are synced back to S3. See [Section 7.2](#72-session-file-context-s3-abstraction-layer) for details.

---

## 2. Electron Client Changes

### 2.1 Changes to `electron/main.js`

**Remove**:
- Python subprocess spawning
- Binary message encoding/decoding (MessagePack)
- stdin/stdout communication

**Add**:
- WebSocket client for streaming chat
- HTTP client for REST API calls
- JWT token storage (keytar or electron-store)
- Login window/flow

### 2.2 Code Diff: main.js

```javascript
// ============================================================
// REMOVE THIS SECTION (Python process management)
// ============================================================

// DELETE: Python spawn
const pythonProcess = spawn(pythonPath, ['src/main.py'], {
  cwd: projectRoot,
  stdio: ['pipe', 'pipe', 'pipe'],
});

// DELETE: Binary message handling
const parser = new BinaryMessageParser();
pythonProcess.stdout.on('data', (data) => {
  parser.feed(data);
});

// DELETE: Sending to Python
function sendToPython(message) {
  const encoded = msgpack.encode(message);
  pythonProcess.stdin.write(encoded);
}

// ============================================================
// ADD THIS SECTION (Cloud API client)
// ============================================================

const WebSocket = require('ws');
const keytar = require('keytar');

const API_BASE = process.env.API_URL || 'https://api.chatjuicer.com';
let authToken = null;
let wsConnection = null;
let currentSessionId = null;

// Token management
async function getAuthToken() {
  if (authToken) return authToken;
  const refresh = await keytar.getPassword('chatjuicer', 'refresh_token');
  if (refresh) {
    // Refresh the access token
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (response.ok) {
      const { access_token } = await response.json();
      authToken = access_token;
      return authToken;
    }
  }
  return null;
}

// WebSocket connections - Map of session_id → WebSocket
// Supports concurrent sessions (multiple streams at once)
const wsConnections = new Map();

function connectWebSocket(sessionId) {
  // Check if connection already exists for this session
  if (wsConnections.has(sessionId)) {
    const existing = wsConnections.get(sessionId);
    if (existing.readyState === WebSocket.OPEN) {
      return existing;
    }
    // Connection exists but not open - remove stale entry
    wsConnections.delete(sessionId);
  }

  const wsUrl = `${API_BASE.replace('https', 'wss')}/ws/chat/${sessionId}?token=${authToken}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    logger.info(`WebSocket connected for session ${sessionId}`);
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    // Forward to renderer with session_id for routing
    handleServerMessage(sessionId, message);
  };

  ws.onerror = (error) => {
    logger.error(`WebSocket error for session ${sessionId}:`, error);
    mainWindow?.webContents.send('connection-error', {
      session_id: sessionId,
      error: error.message
    });
  };

  ws.onclose = () => {
    logger.info(`WebSocket closed for session ${sessionId}`);
    wsConnections.delete(sessionId);
  };

  wsConnections.set(sessionId, ws);
  return ws;
}

function disconnectWebSocket(sessionId) {
  const ws = wsConnections.get(sessionId);
  if (ws) {
    ws.close();
    wsConnections.delete(sessionId);
  }
}

function disconnectAllWebSockets() {
  for (const [sessionId, ws] of wsConnections) {
    ws.close();
  }
  wsConnections.clear();
}

// Forward server messages to renderer (same format as Python used)
// Includes session_id so renderer can route to correct session
function handleServerMessage(sessionId, message) {
  switch (message.type) {
    case 'delta':
      mainWindow?.webContents.send('bot-message', {
        type: 'text_delta',
        content: message.content,
        session_id: sessionId,
      });
      break;

    case 'tool_call':
      if (message.status === 'detected') {
        mainWindow?.webContents.send('bot-message', {
          type: 'function_detected',
          name: message.name,
          arguments: message.arguments,
          call_id: message.id,
          session_id: sessionId,
        });
      } else if (message.status === 'completed') {
        mainWindow?.webContents.send('bot-message', {
          type: 'function_result',
          name: message.name,
          result: message.result,
          call_id: message.id,
          success: message.success,
          session_id: sessionId,
        });
      }
      break;

    case 'usage':
      mainWindow?.webContents.send('bot-message', {
        type: 'token_update',
        ...message,
        session_id: sessionId,
      });
      break;

    case 'stream_end':
      mainWindow?.webContents.send('bot-message', {
        type: 'end_turn',
        finish_reason: message.finish_reason,
        session_id: sessionId,
      });
      break;

    case 'error':
      mainWindow?.webContents.send('bot-message', {
        type: 'error',
        message: message.message,
        session_id: sessionId,
      });
      break;

    case 'session_updated':
      mainWindow?.webContents.send('session-updated', message.session);
      break;
  }
}

// API helper
async function apiRequest(endpoint, options = {}) {
  const token = await getAuthToken();
  if (!token && !endpoint.includes('/auth/')) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}
```

### 2.3 File Operation Handler Changes

The frontend calls `listDirectory`, `openFile`, `deleteFile` with local paths like `data/files/chat_abc123/sources`. These handlers need to call the API instead of the filesystem:

```javascript
// ============================================================
// MODIFY: File handlers to call API instead of filesystem
// ============================================================

// List directory -> API call
ipcMain.handle('list-directory', async (_event, dirPath) => {
  // Parse session_id from path like "data/files/chat_abc123/sources"
  const match = dirPath.match(/data\/files\/(chat_[^/]+)\/(sources|output)/);
  if (!match) {
    // Fallback for non-session paths (shouldn't happen in normal use)
    return { success: false, error: 'Invalid path format' };
  }

  const [, sessionId, folder] = match;

  try {
    const response = await apiRequest(`/api/sessions/${sessionId}/files?folder=${folder}`);
    // API returns same format: [{ name, type, size, modified }]
    return { success: true, files: response.files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open file -> Download from S3, then open with system app
ipcMain.handle('open-file', async (_event, { dirPath, filename }) => {
  const match = dirPath.match(/data\/files\/(chat_[^/]+)\/(sources|output)/);
  if (!match) {
    return { success: false, error: 'Invalid path format' };
  }

  const [, sessionId, folder] = match;

  try {
    // Get presigned download URL from API
    const { download_url } = await apiRequest(
      `/api/sessions/${sessionId}/files/${encodeURIComponent(filename)}/download-url?folder=${folder}`
    );

    // Download to temp directory
    const tempDir = app.getPath('temp');
    const tempPath = path.join(tempDir, `chatjuicer_${sessionId}_${filename}`);

    const response = await fetch(download_url);
    if (!response.ok) throw new Error('Download failed');

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    // Open with system default application
    await shell.openPath(tempPath);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Delete file -> API call
ipcMain.handle('delete-file', async (_event, { dirPath, filename }) => {
  const match = dirPath.match(/data\/files\/(chat_[^/]+)\/(sources|output)/);
  if (!match) {
    return { success: false, error: 'Invalid path format' };
  }

  const [, sessionId, folder] = match;

  try {
    await apiRequest(
      `/api/sessions/${sessionId}/files/${encodeURIComponent(filename)}?folder=${folder}`,
      { method: 'DELETE' }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

**Key insight**: The frontend only sees `{ name, type, size, modified }` objects. It doesn't care if they came from local filesystem or S3. We just need to return the same shape from the API.

### 2.4 Chat/Session IPC Handler Changes

```javascript
// ============================================================
// MODIFY: Chat/session handlers to call API instead of Python
// ============================================================

// User input -> Send to WebSocket (supports concurrent sessions)
ipcMain.on('user-input', async (event, payload) => {
  // Get or create WebSocket for this session
  const ws = connectWebSocket(payload.session_id);

  // Wait for connection if not yet open
  if (ws.readyState !== WebSocket.OPEN) {
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
  }

  ws.send(JSON.stringify({
    type: 'message',
    messages: payload.messages,
    model: payload.model,
    reasoning_effort: payload.reasoning_effort,
  }));
});

// Session commands -> REST API (supports concurrent sessions)
ipcMain.handle('session-command', async (event, { command, data }) => {
  switch (command) {
    case 'create':
      const session = await apiRequest('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      });
      // Connect WS for new session (doesn't close others)
      connectWebSocket(session.session_id);
      return session;

    case 'list':
      return apiRequest('/api/sessions');

    case 'switch':
      // Just connect if not already connected (doesn't close others)
      connectWebSocket(data.session_id);
      return apiRequest(`/api/sessions/${data.session_id}`);

    case 'delete':
      // Close WS for deleted session, then delete via API
      disconnectWebSocket(data.session_id);
      return apiRequest(`/api/sessions/${data.session_id}`, {
        method: 'DELETE',
      });

    case 'rename':
      return apiRequest(`/api/sessions/${data.session_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: data.title }),
      });

    case 'get_history':
      return apiRequest(`/api/sessions/${data.session_id}/messages`);

    default:
      throw new Error(`Unknown command: ${command}`);
  }
});

// File upload -> S3 presigned URL flow
ipcMain.handle('upload-file', async (event, { session_id, file_path, file_name }) => {
  // 1. Get presigned upload URL
  const { upload_url, file_key } = await apiRequest(
    `/api/sessions/${session_id}/files/upload-url`,
    {
      method: 'POST',
      body: JSON.stringify({
        filename: file_name,
        content_type: mime.getType(file_path) || 'application/octet-stream',
        size: fs.statSync(file_path).size,
      }),
    }
  );

  // 2. Upload directly to S3
  const fileBuffer = fs.readFileSync(file_path);
  await fetch(upload_url, {
    method: 'PUT',
    body: fileBuffer,
    headers: { 'Content-Type': mime.getType(file_path) },
  });

  // 3. Confirm upload
  return apiRequest(`/api/sessions/${session_id}/files/confirm`, {
    method: 'POST',
    body: JSON.stringify({ file_key }),
  });
});

// Get config on startup
ipcMain.handle('get-config', async () => {
  return apiRequest('/api/config');
});

// Interrupt streaming for a specific session
ipcMain.on('interrupt-stream', (event, { session_id }) => {
  const ws = wsConnections.get(session_id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'interrupt' }));
  }
});
```

### 2.5 Auth Flow (New)

```javascript
// ============================================================
// ADD: Authentication flow
// ============================================================

let loginWindow = null;

function showLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 400,
    height: 500,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-login.js'),
    },
  });

  loginWindow.loadFile('electron/login.html');
}

ipcMain.handle('login', async (event, { email, password }) => {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message };
    }

    const { access_token, refresh_token, user } = await response.json();
    authToken = access_token;
    await keytar.setPassword('chatjuicer', 'refresh_token', refresh_token);

    loginWindow?.close();
    return { success: true, user };

  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logout', async () => {
  authToken = null;
  await keytar.deletePassword('chatjuicer', 'refresh_token');
  wsConnection?.close();
  showLoginWindow();
});

// Check auth on startup
app.whenReady().then(async () => {
  createWindow();

  const token = await getAuthToken();
  if (!token) {
    showLoginWindow();
  } else {
    // Load sessions
    mainWindow.webContents.send('authenticated');
  }
});
```

### 2.6 preload.js - NO CHANGES NEEDED

The preload.js API stays **exactly the same**. The renderer code calls these methods and they just work:

```javascript
// electron/preload.js - UNCHANGED
// The renderer doesn't know or care that we switched from Python to HTTP

contextBridge.exposeInMainWorld("electronAPI", {
  sendUserInput: (messages, sessionId) => {
    ipcRenderer.send("user-input", { messages, session_id: sessionId });
  },

  onBotMessage: (callback) => {
    ipcRenderer.on("bot-message", (event, message) => callback(message));
  },

  sessionCommand: async (command, data) => {
    return await ipcRenderer.invoke("session-command", { command, data });
  },

  uploadFile: async (fileData) => {
    return await ipcRenderer.invoke("upload-file", fileData);
  },

  getConfig: async () => {
    return await ipcRenderer.invoke("get-config");
  },

  interruptStream: () => {
    ipcRenderer.send("interrupt-stream");
  },

  // ... all other methods stay the same
});
```

### 2.7 Renderer Code - ZERO CHANGES

All files in `electron/renderer/` remain **completely unchanged**:
- `adapters/` - Still calls `window.electronAPI`
- `services/` - Still works through adapters
- `handlers/` - Still receives same message formats
- `ui/` - Still renders same UI
- `core/state.js` - Still manages state the same way
- `managers/file-manager.js` - Still calls `listDirectory()`, receives same `{ name, type, size }` format
- `ui/components/file-panel.js` - Still renders files the same way

**File display works because**:
1. Frontend calls `window.electronAPI.listDirectory("data/files/chat_xxx/sources")`
2. main.js intercepts, parses session_id, calls API
3. API returns `[{ name, type, size, modified }]` (same shape as fs.readdir)
4. Frontend renders file list (doesn't know files are in S3)

---

## 3. FastAPI Server Design

### 3.1 Project Structure

```
src/api/
├── main.py                    # FastAPI application entry
├── dependencies.py            # Dependency injection
├── routes/
│   ├── __init__.py
│   ├── auth.py               # Login, logout, refresh
│   ├── sessions.py           # Session CRUD
│   ├── messages.py           # Message history
│   ├── files.py              # File upload/download
│   ├── chat.py               # WebSocket streaming
│   ├── config.py             # Model/MCP configuration
│   └── health.py             # Health checks
├── middleware/
│   ├── __init__.py
│   ├── auth.py               # JWT validation
│   ├── rate_limit.py         # Rate limiting
│   └── cors.py               # CORS configuration
├── services/
│   ├── __init__.py
│   ├── session_service.py    # Session business logic
│   ├── message_service.py    # Message persistence
│   ├── file_service.py       # S3 operations
│   ├── chat_service.py       # Chat orchestration
│   └── auth_service.py       # Authentication
├── providers/
│   ├── __init__.py
│   ├── base.py               # LLMProvider protocol
│   └── openai_provider.py    # OpenAI/Azure adapter
└── websocket/
    ├── __init__.py
    └── manager.py            # WebSocket connection manager
```

### 3.2 Reusing Existing Code

The following modules are **moved with minimal changes**:

```
EXISTING (src/)                    → TARGET (src/api/)
─────────────────────────────────────────────────────────────
app/runtime.py                     → services/chat_service.py
  (streaming logic)                  (same logic, WS output)

core/agent.py                      → providers/openai_provider.py
  (Agent/Runner creation)            (wrapped as provider)

core/prompts.py                    → core/prompts.py (unchanged)

core/session.py                    → services/postgres_session.py
  (SQLiteSession)                    (PostgreSQL adapter)

core/session_manager.py            → services/session_service.py
  (SessionManager)                   (multi-user aware)

integrations/mcp_*.py              → integrations/mcp_*.py (unchanged)
  (MCP servers)

integrations/event_handlers.py     → services/chat_service.py
  (streaming handlers)               (integrated)

tools/*.py                         → tools/*.py
  (file ops, etc.)                   (S3 path updates)

models/*.py                        → models/*.py
  (Pydantic models)                  (+ new API models)
```

### 3.3 FastAPI Application

```python
# src/api/main.py
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.middleware.auth import AuthMiddleware
from api.middleware.rate_limit import RateLimitMiddleware
from api.routes import auth, sessions, messages, files, chat, config, health
from core.constants import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown."""
    # Startup
    app.state.db_pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=5,
        max_size=20,
    )

    # Initialize MCP servers (existing logic)
    from integrations.mcp_servers import initialize_mcp_servers
    app.state.mcp_servers = await initialize_mcp_servers()

    yield

    # Shutdown
    await app.state.db_pool.close()


app = FastAPI(
    title="Chat Juicer API",
    version="1.0.0",
    lifespan=lifespan,
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)

# Routes
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(messages.router, prefix="/api/sessions", tags=["messages"])
app.include_router(files.router, prefix="/api/sessions", tags=["files"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(chat.router, prefix="/ws", tags=["websocket"])
```

---

## 4. API Design

### 4.1 REST Endpoints

#### Authentication

```yaml
POST /api/auth/login
  Request:  { email: string, password: string }
  Response: { access_token: string, refresh_token: string, user: User }

POST /api/auth/register
  Request:  { email: string, password: string, display_name?: string }
  Response: { access_token: string, refresh_token: string, user: User }

POST /api/auth/refresh
  Request:  { refresh_token: string }
  Response: { access_token: string }

POST /api/auth/logout
  Request:  { refresh_token: string }
  Response: { success: boolean }
```

#### Sessions

```yaml
GET /api/sessions
  Query:    ?limit=50&offset=0
  Response: {
    sessions: Session[],
    total_count: number,
    has_more: boolean
  }

POST /api/sessions
  Request:  {
    title?: string,
    model?: string,
    mcp_config?: string[],
    reasoning_effort?: string
  }
  Response: Session

GET /api/sessions/{session_id}
  Response: {
    session: Session,
    full_history: Message[],    # Layer 2 messages for UI
    files: FileInfo[],
    has_more: boolean,          # For message pagination
    loaded_count: number,
    message_count: number
  }

PATCH /api/sessions/{session_id}
  Request:  {
    title?: string,             # Rename
    pinned?: boolean,           # Pin/unpin
    model?: string,             # Change model
    mcp_config?: string[],      # Change MCP servers
    reasoning_effort?: string   # Change reasoning
  }
  Response: Session

DELETE /api/sessions/{session_id}
  Response: { success: boolean }

POST /api/sessions/{session_id}/summarize
  # Trigger manual summarization
  Response: { success: boolean, tokens_before: number, tokens_after: number }

POST /api/sessions/{session_id}/clear
  # Clear session history (both layers)
  Response: { success: boolean }
```

#### Messages

```yaml
GET /api/sessions/{session_id}/messages
  Query:    ?offset=0&limit=50
  Response: {
    messages: Message[],    # Ordered by created_at DESC
    has_more: boolean,
    total_count: number
  }
  # Used for "load more" pagination in chat history
```

#### Files

```yaml
GET /api/sessions/{session_id}/files
  Query:    ?folder=sources|output
  Response: {
    files: [{ name: string, type: "file"|"folder", size: number, modified: datetime }]
  }
  # Returns same format as local filesystem listing

GET /api/sessions/{session_id}/files/{filename}/download-url
  Query:    ?folder=sources|output
  Response: { download_url: string }
  # Presigned S3 URL for download (expires in 1 hour)

POST /api/sessions/{session_id}/files/upload-url
  Request:  { filename: string, content_type: string, size: number, folder?: string }
  Response: { upload_url: string, file_key: string }

POST /api/sessions/{session_id}/files/confirm
  Request:  { file_key: string, filename: string, content_type: string, size: number }
  Response: { name: string, type: "file", size: number, modified: datetime }

DELETE /api/sessions/{session_id}/files/{filename}
  Query:    ?folder=sources|output
  Response: { success: boolean }
```

> **Note**: The file list format `{ name, type, size, modified }` matches what the Electron frontend expects from `fs.readdir()`. This ensures **zero frontend changes** for file display.

#### Configuration

```yaml
GET /api/config
  Response: {
    models: ModelConfig[],
    reasoning_efforts: string[],
    mcp_servers: MCPServerConfig[],
    max_file_size: number
  }
```

### 4.2 WebSocket Protocol

#### Connection

```
WSS /ws/chat/{session_id}?token=<jwt>
```

#### Client → Server

```typescript
// Send message
{ type: "message", messages: [{ content: string }], model?: string, reasoning_effort?: string }

// Interrupt
{ type: "interrupt" }

// Ping
{ type: "ping" }
```

#### Server → Client

```typescript
// Text delta (streaming)
{ type: "delta", content: string }

// Tool call lifecycle
{ type: "tool_call", id: string, name: string, arguments: object, status: "detected" | "executing" | "completed", result?: string, success?: boolean }

// Tool arguments streaming (for large JSON)
{ type: "tool_call_arguments_delta", call_id: string, delta: string }
{ type: "tool_call_arguments_done", call_id: string }

// Reasoning (for reasoning models)
{ type: "reasoning_delta", delta: string }

// Token usage
{ type: "usage", input_tokens: number, output_tokens: number, total_tokens: number, context_tokens: number, threshold_tokens: number }

// Stream lifecycle
{ type: "stream_start", session_id: string }
{ type: "stream_end", finish_reason: "stop" | "tool_use" | "interrupted" | "error" }

// Errors
{ type: "error", message: string, code?: string, retryable: boolean }

// Session updates (background, e.g., title generation)
{ type: "session_updated", session: Session }

// Pong (keepalive response)
{ type: "pong" }
```

---

## 5. Database Schema

### 5.1 PostgreSQL Schema

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_users_email ON users(email);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(20) NOT NULL,  -- chat_xxxxxxxx format
    title VARCHAR(500),
    model VARCHAR(50) DEFAULT 'gpt-5.1',
    reasoning_effort VARCHAR(20) DEFAULT 'medium',
    mcp_config JSONB DEFAULT '["sequential-thinking", "fetch"]'::jsonb,
    pinned BOOLEAN DEFAULT FALSE,
    is_named BOOLEAN DEFAULT FALSE,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    accumulated_tool_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, session_id)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_last_used ON sessions(user_id, last_used_at DESC);

-- Messages table (Layer 2: Full History for UI)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    tool_call_id VARCHAR(50),
    tool_name VARCHAR(100),
    tool_arguments JSONB,
    tool_result TEXT,
    tool_success BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_role CHECK (role IN ('user', 'assistant', 'system', 'tool_call'))
);

CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(session_id, created_at DESC);

-- LLM Context table (Layer 1: Summarized context for LLM)
CREATE TABLE llm_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llm_context_session_id ON llm_context(session_id);

-- Files table (metadata only)
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    content_type VARCHAR(100),
    size_bytes BIGINT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_files_session_id ON files(session_id);

-- Refresh tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

### 5.2 PostgreSQL Session Adapter

```python
# src/api/services/postgres_session.py
from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

import asyncpg
from agents import TResponseInputItem

from utils.token_utils import count_tokens


class PostgresSession:
    """PostgreSQL-backed session for OpenAI Agents SDK.

    Drop-in replacement for SQLiteSession.
    """

    def __init__(
        self,
        session_id: str,
        session_uuid: UUID,
        pool: asyncpg.Pool,
    ):
        self.session_id = session_id
        self.session_uuid = session_uuid
        self.pool = pool

    async def get_items(self) -> list[TResponseInputItem]:
        """Retrieve LLM context items."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT role, content, metadata
                FROM llm_context
                WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                self.session_uuid
            )
            return [
                {
                    "role": row["role"],
                    "content": row["content"],
                    **(json.loads(row["metadata"]) if row["metadata"] else {})
                }
                for row in rows
            ]

    async def add_items(self, items: list[TResponseInputItem]) -> None:
        """Add items to LLM context."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for item in items:
                    role = item.get("role")
                    content = item.get("content")
                    metadata = {k: v for k, v in item.items() if k not in ("role", "content")}

                    await conn.execute(
                        """
                        INSERT INTO llm_context (session_id, role, content, metadata)
                        VALUES ($1, $2, $3, $4)
                        """,
                        self.session_uuid,
                        role,
                        content if isinstance(content, str) else json.dumps(content),
                        json.dumps(metadata) if metadata else None
                    )

    async def clear_session(self) -> None:
        """Clear all LLM context (for summarization)."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM llm_context WHERE session_id = $1",
                self.session_uuid
            )


class TokenAwarePostgresSession(PostgresSession):
    """PostgreSQL session with token tracking and summarization.

    Same functionality as TokenAwareSQLiteSession.
    """

    def __init__(
        self,
        session_id: str,
        session_uuid: UUID,
        pool: asyncpg.Pool,
        model: str = "gpt-5.1",
        threshold: float = 0.8,
    ):
        super().__init__(session_id, session_uuid, pool)
        self.model = model
        self.threshold = threshold

        # Token tracking
        self.max_tokens = self._get_model_limit(model)
        self.trigger_tokens = int(self.max_tokens * threshold)
        self._total_tokens = 0
        self._accumulated_tool_tokens = 0
        self._summarization_lock = asyncio.Lock()

    @staticmethod
    def _get_model_limit(model: str) -> int:
        """Get token limit for model."""
        limits = {
            "gpt-5.1": 1_000_000,
            "gpt-5.1-mini": 1_000_000,
            "gpt-5": 272_000,
            "gpt-4o": 128_000,
        }
        return limits.get(model, 128_000)

    async def check_and_summarize(self) -> None:
        """Check if summarization is needed and perform it."""
        async with self._summarization_lock:
            items = await self.get_items()
            total_tokens = sum(count_tokens(str(item.get("content", ""))) for item in items)

            if total_tokens >= self.trigger_tokens:
                await self._perform_summarization(items)

    async def _perform_summarization(self, items: list[TResponseInputItem]) -> None:
        """Summarize conversation history."""
        # Keep last 2 user exchanges
        # Summarize everything else
        # Same logic as TokenAwareSQLiteSession
        pass  # Implementation mirrors existing code
```

---

## 6. Authentication

### 6.1 JWT Implementation

```python
# src/api/services/auth_service.py
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import asyncpg
import bcrypt
import jwt
from pydantic import BaseModel

from core.constants import settings


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str


class AuthService:
    """Authentication service with JWT tokens."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
        self.secret = settings.jwt_secret
        self.access_expire = timedelta(minutes=15)
        self.refresh_expire = timedelta(days=7)

    async def register(self, email: str, password: str, display_name: str | None = None) -> dict[str, Any]:
        """Register a new user."""
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

        async with self.pool.acquire() as conn:
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO users (email, password_hash, display_name)
                    VALUES ($1, $2, $3)
                    RETURNING id, email, display_name, created_at
                    """,
                    email.lower(),
                    password_hash,
                    display_name,
                )
                user = dict(row)
                tokens = await self._create_tokens(user["id"])
                return {"user": user, **tokens.model_dump()}

            except asyncpg.UniqueViolationError:
                raise ValueError("Email already registered")

    async def login(self, email: str, password: str) -> dict[str, Any]:
        """Authenticate user and return tokens."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users WHERE email = $1",
                email.lower(),
            )

            if not row:
                raise ValueError("Invalid credentials")

            if not bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
                raise ValueError("Invalid credentials")

            # Update last login
            await conn.execute(
                "UPDATE users SET last_login_at = NOW() WHERE id = $1",
                row["id"],
            )

            user = {k: v for k, v in dict(row).items() if k != "password_hash"}
            tokens = await self._create_tokens(row["id"])
            return {"user": user, **tokens.model_dump()}

    async def refresh(self, refresh_token: str) -> str:
        """Refresh access token."""
        try:
            payload = jwt.decode(refresh_token, self.secret, algorithms=["HS256"])

            if payload.get("type") != "refresh":
                raise ValueError("Invalid token type")

            # Verify token not revoked
            token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM refresh_tokens
                    WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
                    """,
                    token_hash,
                )

                if not row:
                    raise ValueError("Token revoked or expired")

            # Create new access token
            user_id = UUID(payload["sub"])
            return self._create_access_token(user_id)

        except jwt.InvalidTokenError as e:
            raise ValueError(f"Invalid token: {e}")

    async def logout(self, refresh_token: str) -> None:
        """Revoke refresh token."""
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1",
                token_hash,
            )

    async def _create_tokens(self, user_id: UUID) -> TokenPair:
        """Create access and refresh token pair."""
        access = self._create_access_token(user_id)
        refresh = self._create_refresh_token(user_id)

        # Store refresh token hash
        token_hash = hashlib.sha256(refresh.encode()).hexdigest()
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
                VALUES ($1, $2, $3)
                """,
                user_id,
                token_hash,
                datetime.now(timezone.utc) + self.refresh_expire,
            )

        return TokenPair(access_token=access, refresh_token=refresh)

    def _create_access_token(self, user_id: UUID) -> str:
        """Create short-lived access token."""
        payload = {
            "sub": str(user_id),
            "type": "access",
            "exp": datetime.now(timezone.utc) + self.access_expire,
            "iat": datetime.now(timezone.utc),
        }
        return jwt.encode(payload, self.secret, algorithm="HS256")

    def _create_refresh_token(self, user_id: UUID) -> str:
        """Create long-lived refresh token."""
        payload = {
            "sub": str(user_id),
            "type": "refresh",
            "jti": secrets.token_urlsafe(32),
            "exp": datetime.now(timezone.utc) + self.refresh_expire,
            "iat": datetime.now(timezone.utc),
        }
        return jwt.encode(payload, self.secret, algorithm="HS256")
```

### 6.2 Auth Middleware

```python
# src/api/middleware/auth.py
from __future__ import annotations

from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.constants import settings
from api.dependencies import get_db


security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db = Depends(get_db),
) -> dict:
    """Validate JWT and return current user."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
        )

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )

        user_id = UUID(payload["sub"])

        async with db.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, email, display_name, settings FROM users WHERE id = $1",
                user_id,
            )

            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found",
                )

            return dict(row)

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


# Type alias for dependency injection
CurrentUser = Annotated[dict, Depends(get_current_user)]
```

---

## 7. File Storage

### 7.0 Storage Abstraction

Files can be stored locally (Phase 1) or in S3 (Phase 2+). A common interface allows swapping:

```python
# src/api/services/file_service.py
from typing import Protocol

class FileServiceProtocol(Protocol):
    """Abstract file service - implementations can be local or S3."""

    async def list_files(self, session_id: str, folder: str) -> list[dict]:
        """List files in session folder."""
        ...

    async def get_file_content(self, session_id: str, folder: str, filename: str) -> bytes:
        """Get file content."""
        ...

    async def save_file(self, session_id: str, folder: str, filename: str, content: bytes) -> dict:
        """Save file and return metadata."""
        ...

    async def delete_file(self, session_id: str, folder: str, filename: str) -> None:
        """Delete file."""
        ...

    def generate_upload_url(self, user_id, session_id, filename, content_type) -> tuple[str, str]:
        """Generate upload URL (S3 only, raises for local)."""
        ...

    def generate_download_url(self, session_id: str, folder: str, filename: str) -> str:
        """Generate download URL (S3 presigned, local returns file:// path)."""
        ...


class LocalFileService:
    """Phase 1: Local filesystem storage (no S3 needed)."""

    def __init__(self, base_path: Path = Path("data/files")):
        self.base_path = base_path

    async def list_files(self, session_id: str, folder: str) -> list[dict]:
        dir_path = self.base_path / session_id / folder
        if not dir_path.exists():
            return []

        files = []
        for entry in dir_path.iterdir():
            if entry.is_file() and not entry.name.startswith('.'):
                stat = entry.stat()
                files.append({
                    "name": entry.name,
                    "type": "file",
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime),
                })
        return sorted(files, key=lambda f: f["name"])

    async def save_file(self, session_id: str, folder: str, filename: str, content: bytes) -> dict:
        dir_path = self.base_path / session_id / folder
        dir_path.mkdir(parents=True, exist_ok=True)

        file_path = dir_path / filename
        file_path.write_bytes(content)

        return {"name": filename, "type": "file", "size": len(content)}

    async def get_file_content(self, session_id: str, folder: str, filename: str) -> bytes:
        file_path = self.base_path / session_id / folder / filename
        return file_path.read_bytes()

    async def delete_file(self, session_id: str, folder: str, filename: str) -> None:
        file_path = self.base_path / session_id / folder / filename
        file_path.unlink(missing_ok=True)

    def generate_download_url(self, session_id: str, folder: str, filename: str) -> str:
        # For local, return the file path (Electron will handle)
        return str(self.base_path / session_id / folder / filename)


# Factory function
def get_file_service(settings: Settings) -> FileServiceProtocol:
    if settings.file_storage == "s3":
        return S3FileService(settings)
    return LocalFileService(Path(settings.file_storage_path or "data/files"))
```

```bash
# .env.local (Phase 1 - no S3)
FILE_STORAGE=local
FILE_STORAGE_PATH=data/files

# .env.local (Phase 2 - MinIO)
FILE_STORAGE=s3
S3_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=chatjuicer-local

# .env.production (Phase 3 - real S3)
FILE_STORAGE=s3
S3_ENDPOINT=  # Empty = real AWS
AWS_ACCESS_KEY_ID=AKIA...
S3_BUCKET=chatjuicer-prod
```

### 7.1 S3 Service

```python
# src/api/services/file_service.py
from __future__ import annotations

import mimetypes
import re
from typing import TYPE_CHECKING
from uuid import UUID

import boto3
from botocore.config import Config

from core.constants import settings

if TYPE_CHECKING:
    import asyncpg


class FileService:
    """S3-backed file storage."""

    def __init__(self, pool: "asyncpg.Pool"):
        self.pool = pool
        self.s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
            config=Config(signature_version="s3v4"),
        )
        self.bucket = settings.s3_bucket

    def generate_upload_url(
        self,
        user_id: UUID,
        session_id: str,
        filename: str,
        content_type: str,
    ) -> tuple[str, str]:
        """Generate presigned URL for direct upload."""
        safe_filename = self._sanitize_filename(filename)
        file_key = f"users/{user_id}/sessions/{session_id}/sources/{safe_filename}"

        upload_url = self.s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": file_key,
                "ContentType": content_type,
            },
            ExpiresIn=3600,
        )

        return upload_url, file_key

    def generate_download_url(self, file_key: str) -> str:
        """Generate presigned URL for download."""
        return self.s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": file_key},
            ExpiresIn=3600,
        )

    async def confirm_upload(
        self,
        session_uuid: UUID,
        file_key: str,
        filename: str,
        content_type: str,
        size: int,
    ) -> dict:
        """Confirm upload and save metadata."""
        # Verify file exists in S3
        try:
            self.s3.head_object(Bucket=self.bucket, Key=file_key)
        except Exception:
            raise ValueError("File not found in storage")

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO files (session_id, filename, s3_key, content_type, size_bytes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, filename, content_type, size_bytes, uploaded_at
                """,
                session_uuid,
                filename,
                file_key,
                content_type,
                size,
            )
            return dict(row)

    async def get_file_content(self, file_key: str) -> bytes:
        """Download file content (for tool access)."""
        response = self.s3.get_object(Bucket=self.bucket, Key=file_key)
        return response["Body"].read()

    async def delete_file(self, file_id: UUID) -> None:
        """Delete file from S3 and database."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT s3_key FROM files WHERE id = $1",
                file_id,
            )
            if row:
                self.s3.delete_object(Bucket=self.bucket, Key=row["s3_key"])
                await conn.execute("DELETE FROM files WHERE id = $1", file_id)

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        """Sanitize filename for S3."""
        # Remove path separators and special chars
        safe = re.sub(r'[^\w\-_\.]', '_', filename)
        # Limit length
        if len(safe) > 200:
            ext = safe.rsplit('.', 1)[-1] if '.' in safe else ''
            safe = safe[:195] + ('.' + ext if ext else '')
        return safe
```

### 7.2 Session File Context (S3 Abstraction Layer)

The key insight is that **tools don't know about S3**. They operate on local directories, and we handle the S3 sync transparently.

#### Why Not S3 Filesystem Mount?

| Approach | Pros | Cons |
|----------|------|------|
| s3fs/goofys mount | Zero tool changes | Slow (network I/O on every op), operational complexity, poor container support |
| **Local cache + S3 sync** | Fast ops, clean separation | Small wrapper code needed |

We use the **local cache approach**: download files once per WebSocket connection, tools work on the local temp directory, and writes sync back to S3 immediately.

#### How It Works

Files are downloaded **once when the WebSocket connects**, not per message. This avoids redundant downloads during multi-message conversations while maintaining clean lifecycle management.

```
┌─────────────────────────────────────────────────────────────────┐
│                   PER-CONNECTION LIFECYCLE                      │
│                                                                 │
│  1. WebSocket connection established                            │
│     └── Create SessionFileContext                               │
│     └── Download session files from S3 → temp directory         │
│         S3: users/{user_id}/sessions/{session_id}/sources/*     │
│         └── /tmp/sessions/{session_id}/sources/*                │
│                                                                 │
│  2. Message 1 received                                          │
│     └── Run Agent with tools (files already local)              │
│         • read_file("sources/doc.pdf")  → reads from temp       │
│         • edit_file("output/result.md") → writes temp, syncs S3 │
│                                                                 │
│  3. Message 2 received                                          │
│     └── Run Agent with tools (same local files, no re-download) │
│                                                                 │
│  4. ... Message N                                               │
│                                                                 │
│  5. WebSocket connection closes                                 │
│     └── Clean up temp directory                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why per-connection instead of per-message?**

| Approach | 10 messages, 50MB files | Latency per message |
|----------|-------------------------|---------------------|
| Per-message download | 500MB transferred | High (S3 round-trip) |
| **Per-connection** | 50MB transferred | Low (local disk) |

#### Concurrent Sessions

The application supports multiple concurrent streaming sessions. Each session has its own independent WebSocket connection and file context:

```
User with 3 concurrent sessions:

Session A: WS-A → /tmp/session_A/{sources/,output/}  ← independent
Session B: WS-B → /tmp/session_B/{sources/,output/}  ← independent
Session C: WS-C → /tmp/session_C/{sources/,output/}  ← independent
```

**Key properties:**
- Each session's files are isolated (different S3 paths, different temp dirs)
- No shared state between sessions' file caches
- Each WebSocket manages its own lifecycle independently
- Closing one session doesn't affect others

**Resource considerations:**
- Disk usage scales with concurrent sessions: N sessions × avg file size
- For desktop: typically acceptable (few concurrent sessions)
- For cloud at scale: may need limits on concurrent sessions per user

#### Idle Timeout

WebSocket connections are closed after a configurable idle period (default: 10 minutes) to release resources:

```python
# Settings (src/core/constants.py)
ws_idle_timeout: float = Field(
    default=600.0,
    description="Close WebSocket connections idle longer than this (seconds)",
)
```

**How it works:**
- `WebSocketManager` tracks last activity time per connection
- Activity is updated on each message received (`touch()` method)
- Background task periodically checks for and closes idle connections
- When WS closes, the `SessionFileContext` cleanup happens automatically

**When connections close:**

| Event | Cleanup triggered? |
|-------|-------------------|
| Client disconnects | Yes |
| Session deleted | Yes (client closes WS) |
| Idle timeout | Yes (server closes WS) |
| App shutdown | Yes (all connections) |

This ensures file contexts don't leak even if clients misbehave.

#### Implementation

```python
# src/api/services/file_context.py
from __future__ import annotations

import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, AsyncGenerator
from uuid import UUID

if TYPE_CHECKING:
    from api.services.file_service import FileService


class SessionFileContext:
    """Manages local file cache for a session's S3 files.

    Tools operate on this local directory, unaware of S3.
    The directory structure mirrors what tools expect:

        /tmp/sessions/{session_id}/
        ├── sources/     # User-uploaded files (downloaded from S3)
        └── output/      # Agent-generated files (synced to S3)
    """

    def __init__(
        self,
        session_id: str,
        user_id: UUID,
        file_service: "FileService",
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.file_service = file_service
        self.temp_dir: Path | None = None

    async def __aenter__(self) -> "SessionFileContext":
        """Create temp directory and download files from S3."""
        # Create temp directory with same structure as current local setup
        self.temp_dir = Path(tempfile.mkdtemp(prefix=f"session_{self.session_id}_"))

        # Create subdirectories (same as data/files/{session_id}/)
        (self.temp_dir / "sources").mkdir()
        (self.temp_dir / "output").mkdir()

        # Download existing files from S3
        await self._download_session_files()

        return self

    async def __aexit__(self, *args) -> None:
        """Clean up temp directory."""
        if self.temp_dir and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)

    @property
    def base_path(self) -> Path:
        """Base path for file operations (what tools see)."""
        if not self.temp_dir:
            raise RuntimeError("FileContext not initialized")
        return self.temp_dir

    @property
    def sources_path(self) -> Path:
        """Path to user-uploaded files."""
        return self.base_path / "sources"

    @property
    def output_path(self) -> Path:
        """Path to agent-generated files."""
        return self.base_path / "output"

    async def _download_session_files(self) -> None:
        """Download all session files from S3 to temp directory."""
        files = await self.file_service.list_files(self.session_id)

        for file_info in files:
            # Download to sources/ directory
            local_path = self.sources_path / file_info["filename"]
            local_path.parent.mkdir(parents=True, exist_ok=True)

            content = await self.file_service.get_file_content(file_info["s3_key"])
            local_path.write_bytes(content)

    async def save_file(self, relative_path: str, content: bytes) -> None:
        """Save file locally AND sync to S3.

        Called by tool wrappers after file writes.
        """
        # Write locally
        local_path = self.output_path / relative_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(content)

        # Sync to S3
        await self.file_service.upload_content(
            user_id=self.user_id,
            session_id=self.session_id,
            folder="output",
            filename=relative_path,
            content=content,
        )

    def resolve_path(self, relative_path: str) -> Path:
        """Resolve and validate path within session directory.

        Prevents directory traversal attacks.
        """
        # Normalize the path
        full_path = (self.base_path / relative_path).resolve()

        # Security: ensure we stay within base directory
        if not str(full_path).startswith(str(self.base_path.resolve())):
            raise ValueError(f"Path escapes session directory: {relative_path}")

        return full_path


@asynccontextmanager
async def session_file_context(
    session_id: str,
    user_id: UUID,
    file_service: "FileService",
) -> AsyncGenerator[SessionFileContext, None]:
    """Context manager for session file operations.

    Usage:
        async with session_file_context(session_id, user_id, file_service) as ctx:
            tools = create_session_aware_tools(ctx)
            # Run agent with tools...
    """
    ctx = SessionFileContext(session_id, user_id, file_service)
    async with ctx:
        yield ctx
```

### 7.3 Tool Wrapper Updates

The tool wrappers add the S3 sync layer while keeping the same interface:

```python
# src/api/tools/wrappers.py
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from api.services.file_context import SessionFileContext


def create_session_aware_tools(
    file_context: "SessionFileContext",
) -> list[Callable]:
    """Create tools that operate on session's file context.

    Tools don't know about S3 - they just see local directories.
    Same interface as current tools, different backing storage.
    """

    # Import existing tool implementations
    from tools.file_operations import (
        read_file as _read_file,
        list_directory as _list_directory,
        search_files as _search_files,
    )
    from tools.text_editing import edit_file as _edit_file
    from tools.document_generation import generate_document as _generate_document

    base_path = file_context.base_path

    async def read_file(file_path: str) -> str:
        """Read file from session workspace.

        Args:
            file_path: Relative path like "sources/document.pdf"
        """
        full_path = file_context.resolve_path(file_path)
        return await _read_file(str(full_path))

    async def list_directory(directory_path: str = ".") -> str:
        """List files in session workspace.

        Args:
            directory_path: Relative path like "sources/" or "output/"
        """
        full_path = file_context.resolve_path(directory_path)
        return await _list_directory(str(full_path))

    async def search_files(query: str, directory: str = ".") -> str:
        """Search for files matching query.

        Args:
            query: Search pattern
            directory: Relative path to search in
        """
        full_path = file_context.resolve_path(directory)
        return await _search_files(query, str(full_path))

    async def edit_file(file_path: str, changes: str) -> str:
        """Edit file and sync to S3.

        Args:
            file_path: Relative path to file
            changes: Edit instructions
        """
        full_path = file_context.resolve_path(file_path)
        result = await _edit_file(str(full_path), changes)

        # Sync to S3 after successful edit
        if full_path.exists():
            relative = full_path.relative_to(base_path)
            await file_context.save_file(str(relative), full_path.read_bytes())

        return result

    async def generate_document(
        template: str,
        output_name: str,
        **kwargs,
    ) -> str:
        """Generate document and sync to S3.

        Args:
            template: Template name or content
            output_name: Output filename (saved to output/)
        """
        output_path = file_context.output_path / output_name
        result = await _generate_document(template, str(output_path), **kwargs)

        # Sync to S3
        if output_path.exists():
            await file_context.save_file(output_name, output_path.read_bytes())

        return result

    return [read_file, list_directory, search_files, edit_file, generate_document]
```

### 7.4 Chat Service Integration

The file context is created **once per WebSocket connection**, not per message. All messages within a connection share the same local file cache.

```python
# src/api/routes/chat.py

from api.services.file_context import session_file_context
from api.tools.wrappers import create_session_aware_tools


@router.websocket("/chat/{session_id}")
async def websocket_chat(
    websocket: WebSocket,
    session_id: str,
    user: dict = Depends(get_current_user_ws),
    file_service: FileService = Depends(get_file_service),
):
    """WebSocket endpoint for chat streaming.

    File context lifecycle is tied to the WebSocket connection:
    - Files downloaded once when connection opens
    - All messages use the same local cache
    - Cleanup happens when connection closes
    """
    await websocket.accept()

    # Create file context ONCE for the entire connection
    async with session_file_context(session_id, user["id"], file_service) as file_ctx:

        # Create tools with file context (reused across messages)
        tools = create_session_aware_tools(file_ctx)
        agent = create_agent_with_tools(tools, session_id)

        try:
            while True:
                data = await websocket.receive_json()

                if data["type"] == "message":
                    # Process message - files already local, no re-download
                    async for event in run_agent_stream(agent, data, session_id):
                        await websocket.send_json(event)

                elif data["type"] == "interrupt":
                    await handle_interrupt(session_id)

                elif data["type"] == "ping":
                    await websocket.send_json({"type": "pong"})

        except WebSocketDisconnect:
            pass  # Connection closed, file_ctx cleanup happens automatically
```

**Key difference from per-message approach:**
- `session_file_context` wraps the entire `while True` loop
- Files downloaded once at connection start
- Multiple messages reuse the same local files
- S3 writes still sync immediately (in tool wrappers)
- Cleanup happens when WebSocket disconnects

### 7.5 System Prompt - UNCHANGED

The system prompt references the **same paths** as before:

```python
# src/core/prompts.py - NO CHANGES NEEDED

SYSTEM_PROMPT = """
...
## File Workspace

You have access to a workspace with the following structure:
- `sources/` - User-uploaded files (read-only)
- `output/` - Your generated files (read-write)

Use the file tools to:
- `list_directory("sources/")` - See available source files
- `read_file("sources/document.pdf")` - Read file contents
- `edit_file("output/draft.md", changes)` - Modify files
- `generate_document(template, "report.docx")` - Create documents in output/
...
"""
```

The agent sees `sources/` and `output/` — it doesn't know these are backed by S3.

### 7.6 Summary: What Changes for S3

| Component | Change Required |
|-----------|-----------------|
| **System prompt** | ❌ None |
| **Tool implementations** (`tools/*.py`) | ❌ None - still pure file ops |
| **Tool wrappers** (`wrappers.py`) | ✅ Small update - add S3 sync |
| **New: `SessionFileContext`** | ✅ ~100 lines - manages temp dir lifecycle |
| **Chat service** | ✅ Wrap agent run in file context |

**Key benefits**:
- Fast local file operations (no S3 latency per read)
- Automatic cleanup (no orphaned temp files)
- Same tool interface works in Electron (local) and Web (S3-backed)
- Agent/prompt code unchanged

---

## 8. Infrastructure

### 8.1 Docker Configuration

```dockerfile
# Dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://chatjuicer:password@postgres:5432/chatjuicer
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - S3_BUCKET=chatjuicer-files
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
    volumes:
      - ./src:/app/src

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_USER=chatjuicer
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=chatjuicer
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - miniodata:/data
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  pgdata:
  miniodata:
```

### 8.2 Production Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                      t3.xlarge (16GB RAM)                       │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                       nginx                                │ │
│  │            (SSL termination, WebSocket proxy)              │ │
│  └─────────────────────────────┬──────────────────────────────┘ │
│                                │                                │
│  ┌─────────────────────────────▼──────────────────────────────┐ │
│  │                    FastAPI (uvicorn x4)                    │ │
│  │                                                            │ │
│  │  • REST endpoints (/api/*)                                 │ │
│  │  • WebSocket streaming (/ws/*)                             │ │
│  │  • Agent/Runner (existing logic)                           │ │
│  │  • MCP Servers (Sequential Thinking, Fetch)                │ │
│  └─────────────────────────────┬──────────────────────────────┘ │
│                                │                                │
│  ┌────────────────┐  ┌─────────▼─────────┐                      │
│  │   PostgreSQL   │  │  Local file cache │                      │
│  │  (RDS or local)│  │   (temp storage)  │                      │
│  └────────────────┘  └───────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
           │                         │
   ┌───────▼───────┐         ┌───────▼───────┐
   │ Azure OpenAI  │         │      S3       │
   │     API       │         │   (files)     │
   └───────────────┘         └───────────────┘
```

### 8.3 Environment Variables

```bash
# .env.production
DATABASE_URL=postgresql://user:pass@db.example.com:5432/chatjuicer
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
S3_BUCKET=chatjuicer-files
JWT_SECRET=your-32-char-secret
CORS_ORIGINS=app://.,https://chat.example.com
LOG_LEVEL=INFO
```

---

## 9. Migration Plan

### 9.1 Development Phases

The migration uses three development phases to minimize risk and cloud costs:

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: LOCAL FASTAPI (Weeks 1-2)                             │
│  ─────────────────────────────────────────────────────────────  │
│  • FastAPI running locally (uvicorn --reload)                   │
│  • PostgreSQL in Docker                                         │
│  • Files on LOCAL FILESYSTEM (same as current)                  │
│  • No S3, no AWS credentials needed                             │
│  • Electron calls localhost:8000                                │
│                                                                 │
│  Cost: $0 (all local)                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: LOCAL + S3 EMULATION (Week 3)                         │
│  ─────────────────────────────────────────────────────────────  │
│  • Add MinIO (S3-compatible) in Docker                          │
│  • Switch FileService to boto3                                  │
│  • Test presigned URLs locally                                  │
│  • Still all running locally                                    │
│                                                                 │
│  Cost: $0 (MinIO is free, runs in Docker)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: CLOUD DEPLOYMENT (Week 4)                             │
│  ─────────────────────────────────────────────────────────────  │
│  • Deploy FastAPI to EC2                                        │
│  • Use RDS or EC2-hosted PostgreSQL                             │
│  • Use real S3 bucket                                           │
│  • Configure domain, SSL, auth                                  │
│                                                                 │
│  Cost: ~$50-100/month (t3.xlarge + RDS + S3)                    │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Phase 1: Local FastAPI (Weeks 1-2)

**Goal**: FastAPI server running locally with PostgreSQL, files on local disk.

```yaml
# docker-compose.local.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: chatjuicer
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: chatjuicer
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```bash
# Run Phase 1 stack
docker-compose -f docker-compose.local.yml up -d
uvicorn src.api.main:app --reload --port 8000
```

#### Week 1: FastAPI Foundation

```
Day 1-2: Project Setup
├── Create src/api/ directory structure
├── Add dependencies: fastapi, uvicorn, asyncpg, python-jose, bcrypt
├── PostgreSQL schema in migrations/
├── Create LocalFileService (filesystem-backed)
└── Deliverable: FastAPI starts, connects to PostgreSQL

Day 3-4: Session Layer
├── Port core/session.py → services/postgres_session.py
├── Port core/session_manager.py → services/session_service.py
├── Implement all session commands
└── Deliverable: Session CRUD works via REST

Day 5: Core API
├── REST endpoints: /api/sessions, /api/config
├── WebSocket endpoint skeleton
├── Health check endpoint
└── Deliverable: API testable with curl/Postman
```

#### Week 2: Streaming + Electron Integration

```
Day 1-2: WebSocket Streaming
├── Port streaming logic from runtime.py
├── Implement WebSocket /ws/chat endpoint
├── Handle interrupts
└── Deliverable: Chat works via WebSocket

Day 3-4: Electron Client
├── Modify electron/main.js (remove Python, add HTTP/WS)
├── Add simple auth (can be single-user initially)
├── Test all existing functionality
└── Deliverable: Electron works with local FastAPI

Day 5: Integration Testing
├── End-to-end testing
├── Fix edge cases
└── Deliverable: Feature parity with Python subprocess
```

### 9.3 Phase 2: S3 Emulation (Week 3)

**Goal**: Add MinIO for S3-compatible storage, test presigned URL flow.

```yaml
# docker-compose.local.yml (updated)
services:
  postgres:
    # ... same as above

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"   # S3 API
      - "9001:9001"   # Console UI (http://localhost:9001)
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

```python
# FileService abstraction allows swapping implementations
class FileService(Protocol):
    async def list_files(self, session_id: str, folder: str) -> list[dict]: ...
    async def save_file(...) -> dict: ...
    # ...

# Phase 1: Local filesystem
file_service = LocalFileService(base_path=Path("data/files"))

# Phase 2+: S3 (MinIO locally, real S3 in prod)
file_service = S3FileService(settings)
```

```bash
# .env.local (Phase 2)
FILE_STORAGE=s3
S3_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=chatjuicer-local
```

### 9.4 Phase 3: Cloud Deployment (Week 4)

**Goal**: Deploy to EC2 with real PostgreSQL and S3.

```
Day 1-2: Infrastructure Setup
├── Launch EC2 t3.xlarge
├── Set up PostgreSQL (RDS or EC2-hosted)
├── Create S3 bucket with IAM credentials
├── Configure security groups
└── Deliverable: Infrastructure ready

Day 3: Application Deployment
├── Deploy FastAPI (Docker or direct)
├── Configure nginx for SSL termination
├── Set up domain + Let's Encrypt
└── Deliverable: API accessible at https://api.example.com

Day 4-5: Electron Update + Testing
├── Update Electron to use production API URL
├── Add production auth flow
├── End-to-end testing
├── Create runbooks
└── Deliverable: Production-ready system
```

```bash
# .env.production
DATABASE_URL=postgresql://user:pass@rds.amazonaws.com:5432/chatjuicer
FILE_STORAGE=s3
S3_ENDPOINT=  # Empty = use real AWS S3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=chatjuicer-prod
JWT_SECRET=production-secret-min-32-chars
```

### 9.5 Rollback Plan

Each phase can be rolled back independently:

| Phase | Rollback Strategy |
|-------|-------------------|
| **Phase 1** | Revert Electron to Python subprocess (keep old code path) |
| **Phase 2** | Switch `FILE_STORAGE=local` to use LocalFileService |
| **Phase 3** | Point Electron at localhost instead of cloud URL |

**Data Migration Scripts** (for Phase 3 rollback):

```bash
# Export PostgreSQL → SQLite (for disaster recovery)
pg_dump chatjuicer | python scripts/pg_to_sqlite.py > backup.db

# Export S3 → local files
aws s3 sync s3://chatjuicer-prod/users/ data/files/
```

---

## 10. Testing Strategy

### 10.1 API Tests

```python
# tests/api/test_sessions.py
import pytest
from httpx import AsyncClient

from src.api.main import app


@pytest.mark.asyncio
async def test_create_session(auth_client: AsyncClient):
    response = await auth_client.post("/api/sessions", json={})
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert data["session_id"].startswith("chat_")


@pytest.mark.asyncio
async def test_list_sessions(auth_client: AsyncClient):
    # Create a session first
    await auth_client.post("/api/sessions", json={})

    response = await auth_client.get("/api/sessions")
    assert response.status_code == 200
    data = response.json()
    assert "sessions" in data
    assert len(data["sessions"]) >= 1
```

### 10.2 WebSocket Tests

```python
# tests/api/test_websocket.py
import pytest
from fastapi.testclient import TestClient

from src.api.main import app


def test_websocket_chat(test_client: TestClient, auth_token: str, session_id: str):
    with test_client.websocket_connect(
        f"/ws/chat/{session_id}?token={auth_token}"
    ) as ws:
        # Send message
        ws.send_json({
            "type": "message",
            "messages": [{"content": "Hello"}],
        })

        # Expect stream_start
        msg = ws.receive_json()
        assert msg["type"] == "stream_start"

        # Expect deltas
        deltas = []
        while True:
            msg = ws.receive_json()
            if msg["type"] == "delta":
                deltas.append(msg["content"])
            elif msg["type"] == "stream_end":
                break

        assert len(deltas) > 0
```

### 10.3 Integration Tests

```python
# tests/integration/test_full_flow.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_full_chat_flow(auth_client: AsyncClient):
    # 1. Create session
    session = await auth_client.post("/api/sessions", json={})
    session_id = session.json()["session_id"]

    # 2. Upload file
    upload = await auth_client.post(
        f"/api/sessions/{session_id}/files/upload-url",
        json={"filename": "test.txt", "content_type": "text/plain", "size": 100},
    )
    # (upload to S3, confirm, etc.)

    # 3. Chat via WebSocket (separate test)

    # 4. Get history
    history = await auth_client.get(f"/api/sessions/{session_id}/messages")
    assert history.status_code == 200

    # 5. Delete session
    delete = await auth_client.delete(f"/api/sessions/{session_id}")
    assert delete.json()["success"]
```

---

## Appendix A: Message Format Mapping

The WebSocket message format is designed to match what the Electron renderer expects. The `main.js` translation layer converts API format to renderer format:

| API WebSocket Event | Electron IPC Event | Renderer Handler |
|---------------------|-------------------|------------------|
| `{ type: "stream_start" }` | `bot-message: { type: "assistant_start" }` | `handleAssistantStart()` |
| `{ type: "delta", content }` | `bot-message: { type: "text_delta", content }` | `handleTextDelta()` |
| `{ type: "stream_end", finish_reason }` | `bot-message: { type: "end_turn", finish_reason }` | `handleEndTurn()` |
| `{ type: "tool_call", status: "detected", ... }` | `bot-message: { type: "function_detected", name, arguments, call_id }` | `handleFunctionDetected()` |
| `{ type: "tool_call", status: "completed", ... }` | `bot-message: { type: "function_result", name, result, call_id, success }` | `handleFunctionResult()` |
| `{ type: "usage", ... }` | `bot-message: { type: "token_update", current, limit, threshold }` | `handleTokenUpdate()` |
| `{ type: "error", message }` | `bot-message: { type: "error", message }` | `handleError()` |
| `{ type: "session_updated", session }` | `session-updated` channel | `handleSessionUpdated()` |
| `{ type: "reasoning_delta", delta }` | `bot-message: { type: "reasoning_delta", delta }` | (future: reasoning display) |

The translation layer in `electron/main.js` ensures **renderer code needs zero changes**.

---

## Appendix B: Scaling Path

When you outgrow single instance:

```
Phase 1 (Current Spec): Single Instance
───────────────────────────────────────
• t3.xlarge (4 vCPU, 16GB)
• PostgreSQL (RDS or local)
• S3 for files
• ~2,000-5,000 users

Phase 2 (Future): Horizontal Scale
───────────────────────────────────────
• Add Redis for WebSocket pub/sub
• Multiple FastAPI instances behind ALB
• RDS PostgreSQL (managed)
• CloudFront CDN for static files
• ~10,000-50,000 users

Phase 3 (Future): Enterprise
───────────────────────────────────────
• Kubernetes deployment
• Multi-region
• Read replicas
• Organization/team isolation
```

---

## Appendix C: Complete Endpoint Audit

### IPC → API Mapping

| Electron IPC | HTTP Method | API Endpoint | Notes |
|--------------|-------------|--------------|-------|
| `user-input` | WebSocket | `/ws/chat/{session_id}` | `{ type: "message" }` |
| `interrupt-stream` | WebSocket | `/ws/chat/{session_id}` | `{ type: "interrupt" }` |
| `session-command: new` | POST | `/api/sessions` | |
| `session-command: switch` | GET | `/api/sessions/{id}` | Returns history + files |
| `session-command: list` | GET | `/api/sessions` | With pagination |
| `session-command: delete` | DELETE | `/api/sessions/{id}` | |
| `session-command: rename` | PATCH | `/api/sessions/{id}` | `{ title }` |
| `session-command: pin` | PATCH | `/api/sessions/{id}` | `{ pinned }` |
| `session-command: update_config` | PATCH | `/api/sessions/{id}` | `{ model, mcp_config, reasoning_effort }` |
| `session-command: summarize` | POST | `/api/sessions/{id}/summarize` | |
| `session-command: clear` | POST | `/api/sessions/{id}/clear` | |
| `session-command: load_more` | GET | `/api/sessions/{id}/messages` | `?offset=X&limit=Y` |
| `session-command: config_metadata` | GET | `/api/config` | Models, reasoning options |
| `upload-file` | POST + PUT | `/api/sessions/{id}/files/upload-url` → S3 → `/confirm` | Presigned URL flow |
| `list-directory` | GET | `/api/sessions/{id}/files?folder=sources|output` | |
| `delete-file` | DELETE | `/api/sessions/{id}/files/{filename}?folder=` | |
| `open-file` | GET | `/api/sessions/{id}/files/{filename}/download-url` | Then download + shell.openPath |
| `get-username` | - | JWT payload `user.display_name` | No API call needed |

### WebSocket Message Mapping

| Python IPC Message | WebSocket Event | main.js Translation |
|--------------------|-----------------|----------------------|
| `assistant_start` | `stream_start` | Direct |
| `assistant_delta` | `delta` | `{ type: "text_delta", content }` |
| `assistant_end` | `stream_end` | `{ type: "end_turn" }` |
| `function_detected` | `tool_call` (status: detected) | `{ type: "function_detected" }` |
| `function_completed` | `tool_call` (status: completed) | `{ type: "function_result" }` |
| `function_call_arguments_delta` | `tool_call_arguments_delta` | Direct (optional) |
| `reasoning_delta` | `reasoning_delta` | Direct (optional) |
| `token_usage` | `usage` | `{ type: "token_update" }` |
| `error` | `error` | Direct |
| `session_updated` | `session_updated` | Direct |

### Electron-Only (No API Needed)

| IPC Handler | Reason |
|-------------|--------|
| `renderer-log` | Local logging |
| `window-minimize/maximize/close` | OS window controls |
| `window-is-maximized` | OS window state |
| `open-external-url` | `shell.openExternal()` |
| `restart-bot` | Not applicable to cloud |

---

*End of Specification*

