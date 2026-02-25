---
name: websocket-protocol
description: WebSocket message formats for chat streaming
---

# WebSocket Protocol

Chat streaming uses WebSocket at `/ws/chat/{session_id}`.

## Client → Server Messages

```javascript
// Send a chat message
{
  type: "message",
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
    { role: "user", content: "How are you?" }
  ],
  model: "gpt-5.1",
  reasoning_effort: "medium"  // none, low, medium, high
}

// Interrupt current generation
{ type: "interrupt" }
```

## Server → Client Messages

```javascript
// Stream start
{ type: "assistant_start" }

// Text chunk
{ type: "text_delta", content: "..." }

// Tool execution start
{
  type: "tool_start",
  call_id: "call_abc123",
  name: "read_file"
}

// Tool execution complete
{
  type: "tool_done",
  call_id: "call_abc123",
  output: "file contents..."
}

// Stream complete
{
  type: "assistant_end",
  usage: {
    prompt_tokens: 150,
    completion_tokens: 200,
    total_tokens: 350
  }
}

// Generation interrupted
{ type: "stream_interrupted" }
```

## Implementation Files

- WebSocket endpoint: `src/backend/api/routes/chat.py`
- Chat service: `src/backend/api/services/chat_service.py`
- WebSocket manager: `src/backend/api/websocket/manager.py`
- Event models: `src/backend/models/event_models.py`
