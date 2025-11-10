# Chat Juicer Frontend Architecture

## Table of Contents
- [Overview](#overview)
- [Design Principles](#design-principles)
- [Architecture Layers](#architecture-layers)
- [Directory Structure](#directory-structure)
- [Data Flow](#data-flow)
- [Key Patterns](#key-patterns)
- [Technology Stack](#technology-stack)
- [Testing Strategy](#testing-strategy)

---

## Overview

Chat Juicer is a production-grade Electron desktop application with a clean, testable architecture built on the **Hexagonal Architecture** (Ports & Adapters) pattern. The frontend is designed for:

- **Testability**: 82%+ test coverage with fast, isolated unit tests
- **Maintainability**: Loose coupling, single responsibility, clear boundaries
- **Extensibility**: Plugin system, feature flags, platform-agnostic design
- **Performance**: <400KB bundle, 60fps animations, <500ms session switching

### Core Architecture Principles

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer                              │
│  (Pure presentation - no business logic)                 │
│  Renderers, Components, View State                       │
└─────────────────────────────────────────────────────────┘
                          ↓ View Models
┌─────────────────────────────────────────────────────────┐
│                  View Models                             │
│  (Transform domain → UI data)                            │
│  MessageViewModel, SessionViewModel                      │
└─────────────────────────────────────────────────────────┘
                          ↓ Domain Objects
┌─────────────────────────────────────────────────────────┐
│                  Service Layer                           │
│  (Business logic - NO DOM/Platform dependencies)         │
│  MessageService, SessionService, FileService             │
└─────────────────────────────────────────────────────────┘
                          ↓ Adapter Interfaces
┌─────────────────────────────────────────────────────────┐
│                  Adapter Layer                           │
│  (Abstract infrastructure - dependency inversion)        │
│  IPCAdapter, DOMAdapter, StorageAdapter                  │
└─────────────────────────────────────────────────────────┘
                          ↓ Implementations
┌─────────────────────────────────────────────────────────┐
│              Infrastructure Layer                        │
│  (Electron IPC, Browser DOM, localStorage)               │
└─────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Dependency Inversion
**Services depend on adapter interfaces, not concrete implementations.**

```javascript
// ✅ CORRECT: Service depends on interface
class MessageService {
  constructor({ ipcAdapter, storageAdapter }) {
    this.ipc = ipcAdapter;      // Interface
    this.storage = storageAdapter; // Interface
  }
}

// ❌ WRONG: Service depends on Electron directly
class MessageService {
  sendMessage(content) {
    window.electronAPI.sendUserInput(content); // Tight coupling!
  }
}
```

**Benefits**:
- Services testable with mock adapters
- Can swap infrastructure (Electron → Web → Mobile)
- Business logic isolated from platform details

### 2. Single Responsibility
**Each module has one reason to change.**

- **Services**: Business logic only (no DOM, no IPC)
- **ViewModels**: Data transformation only (no rendering, no business logic)
- **Renderers**: Pure functions (ViewModel → DOM elements)
- **Adapters**: Infrastructure abstraction only

### 3. Explicit State Management
**No module-level globals. State passed explicitly.**

```javascript
// ✅ CORRECT: Explicit state passing
export async function switchSession(sessionService, sessionId) {
  return await sessionService.switchSession(sessionId);
}

// ❌ WRONG: Hidden module state
let currentSessionId = null; // Global!
export async function switchSession(api, sessionId) {
  currentSessionId = sessionId; // Mutation!
}
```

### 4. Event-Driven Communication
**Use EventBus for cross-cutting concerns.**

```javascript
// Emit events for observability
eventBus.emit('user:message_sent', { content, sessionId });
eventBus.emit('perf:session_switch', { duration: 245 });

// Plugins subscribe without modifying core
analyticsPlugin.install(app) {
  app.eventBus.on('user:*', this.track);
}
```

---

## Architecture Layers

### Layer 1: UI Components (`ui/`)

**Responsibility**: Pure presentation - render view models to DOM.

**Rules**:
- ✅ Accept view models as input
- ✅ Return DOM elements or null
- ✅ Use DOMAdapter for DOM operations (testability)
- ❌ NO business logic
- ❌ NO direct IPC calls
- ❌ NO state management

**Example**:
```javascript
// ui/renderers/message-renderer.js
export function renderMessage(viewModel, domAdapter) {
  const messageDiv = domAdapter.createElement('div');
  domAdapter.addClass(messageDiv, viewModel.baseClasses);
  messageDiv.innerHTML = viewModel.content;
  return messageDiv;
}
```

### Layer 2: View Models (`viewmodels/`)

**Responsibility**: Transform domain data → UI-ready data.

**Rules**:
- ✅ Pure functions (no side effects)
- ✅ Add UI-specific properties (CSS classes, formatted strings)
- ✅ Handle all data transformations
- ❌ NO DOM manipulation
- ❌ NO business logic
- ❌ NO API calls

**Example**:
```javascript
// viewmodels/message-viewmodel.js
export function createMessageViewModel(message) {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    role: message.role,
    content: parseMessageContent(message.content),
    baseClasses: `message ${message.role} animate-slideIn`,
    shouldRenderMarkdown: message.role === 'assistant',
  };
}
```

### Layer 3: Services (`services/`)

**Responsibility**: Business logic - NO infrastructure dependencies.

**Rules**:
- ✅ Dependency injection (adapters passed to constructor)
- ✅ Return result objects `{ success, data?, error? }`
- ✅ Comprehensive error handling
- ✅ Pure business logic
- ❌ NO DOM access
- ❌ NO direct `window.*` or `document.*` usage
- ❌ NO Electron-specific APIs

**Example**:
```javascript
// services/session-service.js
export class SessionService {
  constructor({ ipcAdapter, storageAdapter }) {
    this.ipc = ipcAdapter;
    this.storage = storageAdapter;
  }

  async switchSession(sessionId) {
    if (!sessionId) {
      return { success: false, error: 'No session ID provided' };
    }

    try {
      const response = await this.ipc.sendSessionCommand('switch', { session_id: sessionId });
      return { success: true, data: response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

### Layer 4: Adapters (`adapters/`)

**Responsibility**: Abstract infrastructure - provide clean interfaces.

**Rules**:
- ✅ Define interfaces for infrastructure
- ✅ Graceful degradation when API unavailable
- ✅ Consistent error handling
- ✅ Mock implementations for testing
- ❌ NO business logic in adapters

**Example**:
```javascript
// adapters/IPCAdapter.js
export class IPCAdapter {
  constructor(api = window.electronAPI) {
    this.api = api;
  }

  async sendMessage(content) {
    if (!this.api?.sendUserInput) {
      throw new Error('IPC API not available: sendUserInput');
    }
    return this.api.sendUserInput(content);
  }

  isAvailable() {
    return !!this.api;
  }
}
```

### Layer 5: Core (`core/`)

**Responsibility**: Framework - EventBus, State, Plugin system.

**Modules**:
- `event-bus.js`: Central event bus with priority, wildcards, error handling
- `state.js`: Reactive state management (BoundedMap, AppState)
- `plugin-interface.js`: Plugin system with lifecycle hooks

---

## Directory Structure

```
electron/renderer/
├── adapters/              # Infrastructure abstraction
│   ├── DOMAdapter.js      # DOM operations abstraction
│   ├── IPCAdapter.js      # Electron IPC abstraction
│   └── StorageAdapter.js  # localStorage abstraction
│
├── core/                  # Framework & infrastructure
│   ├── event-bus.js       # Central event system
│   └── state.js           # State management (BoundedMap, AppState)
│
├── services/              # Business logic (pure, testable)
│   ├── file-service.js           # File operations
│   ├── function-call-service.js  # Function call state
│   ├── message-service.js        # Message processing
│   └── session-service.js        # Session CRUD
│
├── viewmodels/            # Data transformation (domain → UI)
│   ├── message-viewmodel.js      # Message transformations
│   └── session-viewmodel.js      # Session transformations
│
├── ui/                    # Presentation layer
│   ├── renderers/         # Pure rendering functions
│   │   ├── file-list-renderer.js
│   │   └── ...
│   ├── chat-ui.js         # Chat UI coordination
│   ├── function-card-ui.js # Function card rendering
│   ├── titlebar.js        # Titlebar component
│   └── welcome-page.js    # Welcome screen
│
├── handlers/              # Event handlers
│   ├── message-handlers.js        # Message routing
│   └── message-handlers-v2.js     # EventBus-integrated handlers
│
├── managers/              # UI state managers
│   ├── theme-manager.js   # Theme switching
│   ├── view-manager.js    # View state (welcome/chat)
│   ├── dom-manager.js     # DOM element references
│   └── file-manager.js    # File panel state
│
├── plugins/               # Plugin system
│   ├── plugin-interface.js # Plugin API & registry
│   └── core-plugins.js    # Built-in plugins
│
├── config/                # Configuration
│   ├── constants.js       # App constants
│   └── features.js        # Feature flags
│
├── utils/                 # Utilities
│   ├── analytics/         # Analytics & telemetry
│   ├── performance/       # Performance monitoring
│   ├── debug/             # Debug tools
│   ├── markdown-renderer.js
│   ├── scroll-utils.js
│   └── ...
│
├── bootstrap.js           # Application initialization
└── index.js               # Entry point

tests/frontend/
├── unit/                  # Fast, isolated tests
│   ├── adapters/
│   ├── services/
│   ├── viewmodels/
│   └── core/
├── integration/           # Multi-component tests
│   ├── event-bus.test.js
│   ├── plugin-system.test.js
│   └── ...
└── helpers/               # Test utilities
    ├── MockIPCAdapter.js
    └── MockStorageAdapter.js
```

---

## Data Flow

### Message Sending Flow

```
User Input
   ↓
handleSendMessage() [event handler]
   ↓
MessageService.sendMessage() [business logic]
   ↓
IPCAdapter.sendMessage() [infrastructure]
   ↓
Electron IPC → Python Backend
```

### Message Receiving Flow

```
Python Backend → Electron IPC
   ↓
IPCAdapter.onPythonStdout() [infrastructure]
   ↓
EventBus.emit('backend:message', data) [event system]
   ↓
MessageHandlerPlugin.handle() [routing]
   ↓
handleAssistantDelta() [business logic]
   ↓
createMessageViewModel() [transformation]
   ↓
renderMessage() [presentation]
   ↓
DOMAdapter.appendChild() [infrastructure]
```

### Session Switching Flow

```
User clicks session in sidebar
   ↓
handleSessionClick() [event handler]
   ↓
SessionService.switchSession() [business logic]
   ↓
IPCAdapter.sendSessionCommand() [infrastructure]
   ↓
Backend returns history
   ↓
createMessageListViewModel() [transformation]
   ↓
messages.map(renderMessage) [presentation]
   ↓
DOMAdapter.appendChild() [infrastructure]
   ↓
EventBus.emit('session:switched') [event system]
```

---

## Key Patterns

### 1. Dependency Injection

All services use constructor injection:

```javascript
// Bootstrap: Wire dependencies
const ipcAdapter = new IPCAdapter(window.electronAPI);
const storageAdapter = new StorageAdapter(localStorage);

const sessionService = new SessionService({
  ipcAdapter,
  storageAdapter,
});

const messageService = new MessageService({
  ipcAdapter,
  storageAdapter,
});
```

### 2. Result Objects

Services return structured results:

```javascript
// Success
{ success: true, data: response }

// Failure
{ success: false, error: 'Session not found' }
```

**Benefits**:
- No throwing for expected failures
- Consistent error handling
- Easy to test both paths

### 3. Plugin System

Extend functionality without modifying core:

```javascript
export const MyPlugin = createPlugin({
  name: 'my-plugin',
  version: '1.0.0',

  async install(app) {
    const { eventBus, services } = app;

    // Register event handlers
    eventBus.on('user:message_sent', (data) => {
      console.log('Message sent:', data);
    });

    // Add custom functionality
    app.myFeature = () => { /* ... */ };
  },
});
```

### 4. EventBus Communication

Decouple components with events:

```javascript
// Emitter (doesn't know about listeners)
eventBus.emit('session:created', { sessionId, title });

// Listener (doesn't know about emitter)
eventBus.on('session:created', ({ sessionId }) => {
  analytics.track('session_created', { session_id: sessionId });
});
```

### 5. BoundedMap for Memory Management

Automatic eviction of oldest entries:

```javascript
const activeCalls = new BoundedMap(100); // Max 100 entries
activeCalls.set('call-1', data);
// Oldest entry automatically removed when exceeding 100
```

---

## Technology Stack

### Core Technologies
- **Electron**: Desktop application framework
- **Vite**: Build tool & dev server
- **Marked**: Markdown parsing
- **Highlight.js**: Syntax highlighting
- **KaTeX**: Math rendering
- **Mermaid**: Diagram rendering
- **Lottie**: Animations

### Testing
- **Vitest**: Unit & integration testing (507 tests, 82% coverage)
- **Happy-DOM**: Fast DOM implementation for tests

### Code Quality
- **Biome**: Linting & formatting
- **TypeScript/JSDoc**: Type checking

### Styling
- **Tailwind CSS**: Utility-first CSS framework

---

## Testing Strategy

### Test Pyramid

```
         ┌─────┐
         │ E2E │ (Future: Playwright)
         └─────┘
      ┌───────────┐
      │Integration│ (60+ tests)
      └───────────┘
   ┌─────────────────┐
   │   Unit Tests    │ (440+ tests)
   └─────────────────┘
```

### Unit Tests (Fast, Isolated)

**What**: Test individual functions/classes with mocks
**Coverage**: Services, ViewModels, Adapters, Core
**Speed**: <5 seconds for all unit tests

**Example**:
```javascript
// services/session-service.test.js
it('should switch to different session', async () => {
  mockIPC.setResponse('session-command', {
    session: { session_id: 'session-2' },
    full_history: [{ role: 'user', content: 'Hello' }],
  });

  const result = await sessionService.switchSession('session-2');

  expect(result.success).toBe(true);
  expect(result.session.session_id).toBe('session-2');
});
```

### Integration Tests (Component Interaction)

**What**: Test multiple components working together
**Coverage**: EventBus, Plugin system, Message flow
**Speed**: <10 seconds for all integration tests

**Example**:
```javascript
// integration/event-bus.test.js
it('should emit and receive events', () => {
  const callback = vi.fn();
  eventBus.on('test:event', callback);

  eventBus.emit('test:event', { data: 'test' });

  expect(callback).toHaveBeenCalledWith({ data: 'test' });
});
```

### Test Doubles

- **MockIPCAdapter**: Simulates Electron IPC
- **MockStorageAdapter**: In-memory storage
- **Mock DOM**: Happy-DOM for UI tests

---

## Performance Considerations

### Optimizations in Place

1. **Lazy Loading**: Plugins loaded on demand
2. **Bounded Collections**: `BoundedMap` prevents memory leaks
3. **Debounced Updates**: Scroll, resize, input events
4. **Virtual Scrolling**: For long message lists (future)
5. **Code Splitting**: Separate chunks for dev tools

### Performance Budgets

- Bundle size: <400KB gzipped
- Initial load: <1.5s
- Message render: <16ms (60fps)
- Session switch: <500ms

### Monitoring

```javascript
import { globalMetrics } from './utils/performance';

// Track operation timing
globalMetrics.startTimer('session-switch');
await sessionService.switchSession(sessionId);
const duration = globalMetrics.endTimer('session-switch');

// Record metrics
globalMetrics.record('messages-rendered', count, 'count');
```

---

## Next Steps

- **Read**: [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md)
- **Debug**: [Debugging Guide](./DEBUGGING.md)
- **Optimize**: [Performance Guide](./PERFORMANCE.md)
- **Understand Decisions**: [ADRs](./adr/)

---

## Questions?

- Check documentation in `/docs`
- Review tests for examples
- Inspect DevTools: `window.__DEBUG__`

**Remember**: The best code is code that doesn't need explaining. This architecture achieves that through clear boundaries, explicit dependencies, and consistent patterns.

