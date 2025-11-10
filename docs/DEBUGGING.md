# Debugging Guide

## Table of Contents
- [Quick Start](#quick-start)
- [Development Tools](#development-tools)
- [Common Issues](#common-issues)
- [Debugging Techniques](#debugging-techniques)
- [Performance Debugging](#performance-debugging)
- [Backend Integration](#backend-integration)
- [Production Debugging](#production-debugging)

---

## Quick Start

### Enable DevTools

```bash
# Run in development mode (DevTools auto-opens)
make dev

# Or manually
npm run dev
```

###

 Debug Console

Open DevTools Console and access the debug object:

```javascript
// Get debug dashboard
window.__DEBUG__

// Get full report
window.__DEBUG__.report()

// Output:
// {
//   eventBus: { listeners: Map, metrics: {...} },
//   plugins: { installed: [...], enabled: [...] },
//   state: { sessions: {...}, messages: {...} },
//   performance: { metrics: [...], timers: {...} },
//   analytics: { events: [...] }
// }
```

### Quick Health Check

```javascript
// Check system health
window.__DEBUG__.health()

// Output:
// {
//   status: 'healthy',
//   checks: {
//     eventBus: 'OK - 23 listeners',
//     plugins: 'OK - 5 enabled',
//     ipc: 'OK - connected',
//     memory: 'OK - 127 MB'
//   }
// }
```

---

## Development Tools

### 1. Debug Dashboard

**Access**: `window.__DEBUG__` (available in dev mode)

```javascript
const debug = window.__DEBUG__;

// Inspect EventBus
debug.eventBus.listeners;        // See all event listeners
debug.eventBus.listenerCount('user:*'); // Count specific listeners

// Inspect Plugins
debug.plugins.list();             // List all plugins
debug.plugins.isEnabled('analytics'); // Check plugin status

// Inspect State
debug.state.get();                // Get current app state
debug.state.getSnapshot();        // Get serializable snapshot

// Inspect Performance
debug.performance.getMetrics();   // Get performance metrics
debug.performance.getTimers();    // Get active timers

// Inspect Analytics
debug.analytics.getEvents();      // Get tracked events
```

### 2. Event Logging

Enable verbose event logging:

```javascript
// Enable event logging
window.__DEBUG__.eventBus.enableLogging();

// Now all events are logged to console:
// [EventBus] EMIT: user:message_sent { content: "Hello" }
// [EventBus] INVOKE: user:message_sent (3 listeners)
// [EventBus] COMPLETE: user:message_sent (12ms)

// Disable logging
window.__DEBUG__.eventBus.disableLogging();
```

### 3. Plugin Debugging

```javascript
// List all plugins
window.__DEBUG__.plugins.list()
// Output:
// [
//   { name: 'message-handler', status: 'enabled', version: '1.0.0' },
//   { name: 'analytics-bridge', status: 'enabled', version: '1.0.0' },
//   ...
// ]

// Get plugin details
window.__DEBUG__.plugins.get('analytics-bridge')
// Output: { name, version, description, status, metadata }

// Enable/disable plugin
await window.__DEBUG__.plugins.disable('analytics-bridge')
await window.__DEBUG__.plugins.enable('analytics-bridge')
```

### 4. Performance Profiling

```javascript
// Start profiling
window.__DEBUG__.performance.startProfile('my-operation');

// ... do work ...

// End profiling
const duration = window.__DEBUG__.performance.endProfile('my-operation');
console.log(`Operation took ${duration}ms`);

// Get performance report
window.__DEBUG__.performance.getReport()
// Output:
// {
//   metrics: [
//     { name: 'session-switch', avg: 245, min: 180, max: 310, count: 12 },
//     { name: 'message-render', avg: 12, min: 8, max: 23, count: 45 },
//   ],
//   timers: {
//     'bootstrap': 1234,
//     'initial-render': 567,
//   }
// }
```

---

## Common Issues

### Issue 1: Message Not Appearing

**Symptoms**: User sends message, but no response appears in UI.

**Debug Steps**:

1. **Check IPC connection**:
```javascript
// In DevTools Console
window.__DEBUG__.health()
// Look for: ipc: 'OK - connected'
```

2. **Check EventBus listeners**:
```javascript
window.__DEBUG__.eventBus.listenerCount('backend:message')
// Should be > 0

window.__DEBUG__.eventBus.listeners.get('backend:message')
// Should show registered handlers
```

3. **Enable event logging**:
```javascript
window.__DEBUG__.eventBus.enableLogging();
// Send a message and watch console for event flow
```

4. **Check backend logs**:
```bash
make logs
# Or
tail -f data/logs/conversation.jsonl
```

**Common Causes**:
- Backend disconnected (restart with "Restart Bot" button)
- JSON parsing error (check console for parse errors)
- EventBus handler crashed (check error logs)

---

### Issue 2: Session Not Switching

**Symptoms**: Click session in sidebar, but chat doesn't update.

**Debug Steps**:

1. **Check session service**:
```javascript
const { sessionService } = window.__DEBUG__.services;
const result = await sessionService.switchSession('session-id-here');
console.log(result);
// Should return: { success: true, data: {...} }
```

2. **Check IPC adapter**:
```javascript
const { ipcAdapter } = window.__DEBUG__.adapters;
const result = await ipcAdapter.sendSessionCommand('switch', { session_id: 'session-id' });
console.log(result);
```

3. **Enable performance tracking**:
```javascript
window.__DEBUG__.performance.startProfile('session-switch');
// Switch session
const duration = window.__DEBUG__.performance.endProfile('session-switch');
console.log(`Switch took ${duration}ms`); // Should be < 500ms
```

**Common Causes**:
- Invalid session ID (check spelling)
- Backend error (check Python logs)
- Race condition (multiple clicks)

---

### Issue 3: High Memory Usage

**Symptoms**: App becomes slow, high memory in Task Manager.

**Debug Steps**:

1. **Check memory usage**:
```javascript
window.__DEBUG__.performance.getMemoryUsage()
// Output:
// {
//   usedJSHeapSize: 127000000, // ~127 MB
//   totalJSHeapSize: 150000000, // ~150 MB
//   jsHeapSizeLimit: 2197815296 // ~2 GB
// }
```

2. **Profile memory over time**:
```javascript
// Take heap snapshot in Chrome DevTools:
// Performance tab → Memory → Take snapshot

// Compare snapshots after using app for a while
// Look for growing arrays/maps
```

3. **Check BoundedMap sizes**:
```javascript
window.__DEBUG__.state.get()
// Check sizes of:
// - messages: should be < 1000
// - activeCalls: should be < 100
// - pendingUpdates: should be < 50
```

**Common Causes**:
- Event listeners not cleaned up
- Infinite loops in plugins
- Large message history not paginated
- Memory leak in markdown renderer

---

### Issue 4: Slow Performance

**Symptoms**: Laggy UI, slow message rendering.

**Debug Steps**:

1. **Profile render performance**:
```javascript
// Open Chrome DevTools → Performance tab
// Click Record, interact with app, click Stop
// Look for long tasks (> 50ms yellow bars)
```

2. **Check metrics**:
```javascript
window.__DEBUG__.performance.getMetrics()
// Look for high averages:
// - message-render: should be < 16ms (60fps)
// - session-switch: should be < 500ms
// - file-upload: should be < 2s
```

3. **Check event handler performance**:
```javascript
// Enable timing logs
window.__DEBUG__.eventBus.enableTimingLogs();
// Now all slow handlers (> 10ms) are logged
```

**Common Causes**:
- Too many event listeners
- Synchronous operations blocking UI
- Large DOM (> 1000 nodes)
- Unoptimized markdown rendering

---

## Debugging Techniques

### Technique 1: Breakpoint Debugging

**Use Cases**: Step through code, inspect variables

```javascript
// services/session-service.js
async switchSession(sessionId) {
  debugger; // Execution pauses here

  if (!sessionId) {
    return { success: false, error: 'No session ID' };
  }

  const response = await this.ipc.sendSessionCommand('switch', { session_id: sessionId });
  // Set breakpoint on this line in DevTools

  return { success: true, data: response };
}
```

**DevTools**:
1. Open Sources tab
2. Find file (Cmd/Ctrl + P)
3. Click line number to set breakpoint
4. Trigger action (e.g., switch session)
5. Execution pauses, inspect variables in Scope panel

---

### Technique 2: Conditional Logging

**Use Cases**: Debug specific scenarios

```javascript
// Log only for specific session
function handleSessionSwitch(sessionId) {
  if (sessionId === 'problem-session-id') {
    console.log('[DEBUG] Switching to problem session:', {
      sessionId,
      state: window.__DEBUG__.state.get(),
      listeners: window.__DEBUG__.eventBus.listenerCount('session:switched'),
    });
  }

  // ... rest of function
}
```

---

### Technique 3: Event Tracing

**Use Cases**: Track event flow across components

```javascript
// Enable event tracing
window.__DEBUG__.eventBus.enableTracing();

// Now events are logged with stack traces:
// [EventBus TRACE] user:message_sent
//   ↳ Emitted from: handleSendMessage (chat-events.js:45)
//   ↳ Listener 1: MessageHandlerPlugin.handle (core-plugins.js:78)
//   ↳ Listener 2: AnalyticsPlugin.track (analytics-plugin.js:23)

// Disable tracing
window.__DEBUG__.eventBus.disableTracing();
```

---

### Technique 4: Mock Responses

**Use Cases**: Test error handling, edge cases

```javascript
// Mock IPC adapter to simulate errors
const { ipcAdapter } = window.__DEBUG__.adapters;
const originalSend = ipcAdapter.sendSessionCommand;

ipcAdapter.sendSessionCommand = async (command, data) => {
  if (command === 'switch') {
    throw new Error('Simulated error');
  }
  return originalSend.call(ipcAdapter, command, data);
};

// Now all session switches will fail
// Test error handling in UI

// Restore original
ipcAdapter.sendSessionCommand = originalSend;
```

---

## Performance Debugging

### 1. Identify Slow Operations

```javascript
// Get slowest operations
const metrics = window.__DEBUG__.performance.getMetrics();
const slow = metrics.filter(m => m.avg > 100); // > 100ms
console.table(slow);

// Output:
// ┌─────────────────┬─────────┬─────┬─────┬───────┐
// │ name            │ avg     │ min │ max │ count │
// ├─────────────────┼─────────┼─────┼─────┼───────┤
// │ session-switch  │ 245 ms  │ 180 │ 310 │ 12    │
// │ file-upload     │ 1200 ms │ 800 │ 2000│ 5     │
// └─────────────────┴─────────┴─────┴─────┴───────┘
```

### 2. Profile Event Handlers

```javascript
// Enable handler profiling
window.__DEBUG__.eventBus.enableProfiling();

// Trigger events
eventBus.emit('user:message_sent', { content: 'test' });

// Get profiling results
const profile = window.__DEBUG__.eventBus.getProfile();
console.log(profile);

// Output:
// {
//   'user:message_sent': [
//     { handler: 'MessageHandlerPlugin', duration: 2.3 },
//     { handler: 'AnalyticsPlugin', duration: 0.8 },
//     { handler: 'MetricsPlugin', duration: 0.5 }
//   ]
// }
```

### 3. Monitor FPS

```javascript
// Start FPS monitoring
window.__DEBUG__.performance.startFPSMonitoring();

// FPS is logged every second:
// [Performance] FPS: 60 (target: 60)
// [Performance] FPS: 58 (target: 60) ⚠️ Dropped frames

// Stop monitoring
window.__DEBUG__.performance.stopFPSMonitoring();
```

### 4. Detect Memory Leaks

```javascript
// Take baseline snapshot
const baseline = window.__DEBUG__.performance.getMemoryUsage();

// Use app for a while (switch sessions, send messages)

// Take second snapshot
const current = window.__DEBUG__.performance.getMemoryUsage();

// Compare
const growth = current.usedJSHeapSize - baseline.usedJSHeapSize;
console.log(`Memory growth: ${(growth / 1048576).toFixed(2)} MB`);

// If growth > 50 MB, investigate memory leak
```

---

## Backend Integration

### Debug IPC Communication

**1. Enable IPC logging**:

```javascript
// In bootstrap.js or console
const ipcAdapter = new IPCAdapter(window.electronAPI);
ipcAdapter.enableLogging = true;

// Now all IPC calls are logged:
// [IPC] → sendUserInput({ content: "Hello" })
// [IPC] ← onBotOutput({ type: "assistant_start" })
// [IPC] ← onBotOutput({ type: "assistant_delta", delta: "Hi" })
```

**2. Inspect IPC queue**:

```javascript
// Check pending IPC calls
window.__DEBUG__.ipc.getPendingCalls()
// Output: [{ method: 'sendUserInput', args: [...], timestamp: 1234567890 }]

// Check last N IPC calls
window.__DEBUG__.ipc.getCallHistory(10)
```

### Debug Python Backend

**1. Check Python logs**:

```bash
# View all logs
make logs

# View only errors
make logs-errors

# Follow logs in real-time
tail -f data/logs/conversation.jsonl
```

**2. Check backend status**:

```javascript
// In console
window.__DEBUG__.ipc.getStatus()
// Output:
// {
//   connected: true,
//   lastMessage: 1699999999999,
//   messageCount: 45
// }
```

---

## Production Debugging

### Enable Debug Mode in Production

**Option 1: Environment variable**

```bash
DEBUG=true make run
```

**Option 2: Runtime toggle**

```javascript
// Open DevTools in production build
// Press Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux)

// Enable debug mode
localStorage.setItem('__DEBUG_MODE__', 'true');
location.reload();

// Now window.__DEBUG__ is available
```

### Collect User Reports

**1. Export debug report**:

```javascript
// User runs this in console
const report = window.__DEBUG__.exportReport();
console.log(JSON.stringify(report, null, 2));

// User copies output and sends to support
```

**2. Parse debug report**:

```javascript
// Support team analyzes report
const report = JSON.parse(userReport);

console.log('Error events:', report.analytics.events.filter(e => e.category === 'error'));
console.log('Slow operations:', report.performance.metrics.filter(m => m.avg > 500));
console.log('Plugin issues:', report.plugins.filter(p => p.status === 'error'));
```

---

## Troubleshooting Checklist

When debugging an issue, go through this checklist:

- [ ] **Check console** for errors
- [ ] **Check backend logs** (`make logs-errors`)
- [ ] **Check IPC connection** (`window.__DEBUG__.health()`)
- [ ] **Check event listeners** (`window.__DEBUG__.eventBus.listenerCount(event)`)
- [ ] **Check plugin status** (`window.__DEBUG__.plugins.list()`)
- [ ] **Check memory usage** (`window.__DEBUG__.performance.getMemoryUsage()`)
- [ ] **Enable event logging** (`window.__DEBUG__.eventBus.enableLogging()`)
- [ ] **Profile operation** (`window.__DEBUG__.performance.startProfile()`)
- [ ] **Check state snapshot** (`window.__DEBUG__.state.getSnapshot()`)
- [ ] **Export debug report** (`window.__DEBUG__.exportReport()`)

---

## Next Steps

- Review [Architecture Guide](./ARCHITECTURE.md) for system design
- Check [Performance Guide](./PERFORMANCE.md) for optimization tips
- Read [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md) for plugin debugging

---

## Getting Help

If you're still stuck:

1. **Search existing issues**: [GitHub Issues](https://github.com/yourusername/chat-juicer/issues)
2. **Export debug report**: `window.__DEBUG__.exportReport()`
3. **Create new issue**: Include debug report + steps to reproduce

**Happy Debugging!** 🐛🔍

