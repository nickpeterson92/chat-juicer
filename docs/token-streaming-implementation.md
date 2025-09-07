# Perfect Token Streaming Implementation Plan

## Executive Summary
Implementing perfect token streaming requires changes to both backend (Python) and frontend (Electron) to handle 10-100x more events while maintaining smooth performance.

## Current State Analysis

### What We Have
1. **Backend**: Processes `message_output_item` events (complete messages)
2. **Frontend**: Uses `assistant_delta` events with buffering
3. **Performance**: ~500ms to first token (waiting for complete message)

### What We Need
1. **Backend**: Process `raw_response_event` with `ResponseTextDeltaEvent`
2. **Frontend**: Enhanced buffering and rendering optimization
3. **Performance**: <100ms to first token (immediate streaming)

## Implementation Requirements

### 1. Backend Changes (src/main.py)

```python
# Enhanced event handler with token streaming
async def handle_electron_ipc(event, call_id_tracker=None):
    if call_id_tracker is None:
        call_id_tracker = {}
    
    # NEW: Handle raw token streaming
    if event.type == "raw_response_event":
        from openai.types.responses import ResponseTextDeltaEvent
        if isinstance(event.data, ResponseTextDeltaEvent):
            # Check if this is actual content (not function calls)
            if event.data.delta and not call_id_tracker.get("in_tool_call"):
                return json.dumps({
                    "type": "assistant_token",
                    "content": event.data.delta
                })
    
    elif event.type == "run_item_stream_event":
        item = event.item
        
        # Track when we're in a tool call to suppress token streaming
        if item.type == "tool_call_item":
            call_id_tracker["in_tool_call"] = True
            # ... existing tool call handling
        
        elif item.type == "tool_call_output_item":
            call_id_tracker["in_tool_call"] = False
            # ... existing output handling
        
        elif item.type == "message_output_item":
            # Skip this since we're handling via tokens
            call_id_tracker["in_tool_call"] = False
            return None  # Don't send duplicate content
```

### 2. Frontend Changes (electron/renderer.js)

```javascript
// Enhanced token accumulator with debouncing
class TokenStreamManager {
  constructor() {
    this.buffer = '';
    this.renderTimeout = null;
    this.lastRenderTime = 0;
    this.targetFPS = 60;
    this.frameTime = 1000 / this.targetFPS;
  }
  
  addToken(token) {
    this.buffer += token;
    this.scheduleRender();
  }
  
  scheduleRender() {
    // Cancel pending render
    if (this.renderTimeout) {
      cancelAnimationFrame(this.renderTimeout);
    }
    
    // Use requestAnimationFrame for smooth rendering
    this.renderTimeout = requestAnimationFrame(() => {
      const now = performance.now();
      const timeSinceLastRender = now - this.lastRenderTime;
      
      // Throttle to target FPS
      if (timeSinceLastRender >= this.frameTime) {
        this.render();
        this.lastRenderTime = now;
      } else {
        // Schedule for next frame
        this.scheduleRender();
      }
    });
  }
  
  render() {
    if (this.buffer && updateAssistantMessage) {
      updateAssistantMessage(this.buffer);
    }
  }
  
  reset() {
    this.buffer = '';
    if (this.renderTimeout) {
      cancelAnimationFrame(this.renderTimeout);
      this.renderTimeout = null;
    }
  }
}

// Update message handler
case "assistant_token":
  if (!appState.streamManager) {
    appState.streamManager = new TokenStreamManager();
  }
  appState.streamManager.addToken(message.content);
  break;

case "assistant_start":
  appState.streamManager = new TokenStreamManager();
  // ... existing code
  break;

case "assistant_end":
  if (appState.streamManager) {
    appState.streamManager.render(); // Final render
    appState.streamManager.reset();
  }
  // ... existing code
  break;
```

### 3. Markdown Rendering Optimization

```javascript
// Add markdown rendering with virtualization for long responses
class MarkdownRenderer {
  constructor(container) {
    this.container = container;
    this.observer = new IntersectionObserver(this.onIntersection.bind(this));
  }
  
  renderIncremental(markdown) {
    // Parse markdown incrementally
    const lines = markdown.split('\n');
    const fragment = document.createDocumentFragment();
    
    lines.forEach(line => {
      const element = this.parseLine(line);
      fragment.appendChild(element);
    });
    
    // Replace content efficiently
    requestAnimationFrame(() => {
      this.container.innerHTML = '';
      this.container.appendChild(fragment);
    });
  }
  
  parseLine(line) {
    // Simple markdown parsing (extend as needed)
    const div = document.createElement('div');
    
    if (line.startsWith('```')) {
      div.className = 'code-block';
    } else if (line.startsWith('#')) {
      div.className = 'heading';
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      div.className = 'list-item';
    }
    
    div.textContent = line;
    return div;
  }
}
```

## Performance Optimizations

### 1. Token Batching Strategy
```python
# Backend: Batch tokens for network efficiency
class TokenBatcher:
    def __init__(self, batch_size=5, max_delay_ms=50):
        self.batch = []
        self.batch_size = batch_size
        self.max_delay_ms = max_delay_ms
        self.last_send = time.time()
    
    async def add_token(self, token):
        self.batch.append(token)
        
        should_send = (
            len(self.batch) >= self.batch_size or
            (time.time() - self.last_send) * 1000 > self.max_delay_ms
        )
        
        if should_send:
            await self.send_batch()
    
    async def send_batch(self):
        if self.batch:
            content = ''.join(self.batch)
            print(f'__JSON__{{"type":"assistant_tokens","content":{json.dumps(content)}}}__JSON__', flush=True)
            self.batch = []
            self.last_send = time.time()
```

### 2. Network Optimization
- Use WebSocket instead of IPC for lower latency (optional)
- Implement compression for token batches
- Add connection pooling for parallel streams

### 3. UI Rendering Optimization
- Virtual scrolling for long messages
- Web Workers for markdown parsing
- CSS containment for render performance
- GPU acceleration for smooth scrolling

## Testing Strategy

### Performance Metrics
1. **Time to First Token (TTFT)**: Target <100ms
2. **Tokens per Second**: Target >50 tokens/sec
3. **UI Frame Rate**: Maintain 60 FPS
4. **Memory Usage**: <50MB for 10,000 tokens
5. **CPU Usage**: <10% during streaming

### Test Scenarios
1. **Short Response**: 50 tokens
2. **Medium Response**: 500 tokens  
3. **Long Response**: 5,000 tokens
4. **Code Heavy**: Multiple code blocks
5. **Parallel Tools**: Tool calls during streaming

## Implementation Phases

### Phase 1: Basic Token Streaming (2 hours)
- [ ] Enable raw_response_event handling
- [ ] Add assistant_token IPC event
- [ ] Basic frontend token accumulation
- [ ] Test with simple messages

### Phase 2: Performance Optimization (3 hours)
- [ ] Implement token batching
- [ ] Add requestAnimationFrame rendering
- [ ] Optimize IPC message passing
- [ ] Profile and measure TTFT

### Phase 3: Advanced Features (3 hours)
- [ ] Markdown incremental parsing
- [ ] Virtual scrolling for long content
- [ ] Progress indicators during streaming
- [ ] Smooth scroll preservation

### Phase 4: Polish & Testing (2 hours)
- [ ] Handle edge cases (interruptions, errors)
- [ ] Add fallback for slow connections
- [ ] Comprehensive testing suite
- [ ] Performance benchmarking

## Risk Mitigation

### Potential Issues & Solutions

1. **Issue**: Token flooding overwhelms UI
   **Solution**: Adaptive batching based on stream rate

2. **Issue**: Markdown parsing blocks UI
   **Solution**: Web Worker for parsing, incremental updates

3. **Issue**: Memory leak from accumulation
   **Solution**: Circular buffer with max size, cleanup on completion

4. **Issue**: Network latency spikes
   **Solution**: Local buffering, retry mechanism

5. **Issue**: Tool calls interrupt streaming
   **Solution**: State tracking to pause/resume streaming

## Configuration Options

```python
# Add to constants.py
TOKEN_STREAMING_CONFIG = {
    "enabled": True,
    "batch_size": 5,  # Tokens per batch
    "max_delay_ms": 50,  # Max delay before sending
    "buffer_size": 100000,  # Max chars in buffer
    "render_fps": 60,  # Target UI frame rate
    "markdown_parsing": True,  # Enable markdown
    "virtual_scroll": True,  # For long messages
}
```

## Success Criteria

✅ **Performance**
- TTFT < 100ms consistently
- 60 FPS maintained during streaming
- <10% CPU usage

✅ **User Experience**
- Smooth, flicker-free rendering
- Readable text during streaming
- Proper markdown formatting
- No UI freezes or stutters

✅ **Reliability**
- Graceful error handling
- Recovery from interruptions
- Consistent behavior across message types
- Backward compatibility

## Total Effort Estimate

**10 hours** for perfect implementation:
- 2 hours: Basic implementation
- 3 hours: Performance optimization
- 3 hours: Advanced features
- 2 hours: Testing and polish

**Note**: This can be done incrementally. Phase 1 (2 hours) provides immediate value with basic token streaming.