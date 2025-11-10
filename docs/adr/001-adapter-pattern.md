# ADR 001: Adapter Pattern for Infrastructure Abstraction

**Status**: Accepted
**Date**: 2025-11-10
**Deciders**: Engineering Team
**Context**: Phase 1-2 Refactoring

---

## Context and Problem Statement

The original Chat Juicer frontend was tightly coupled to Electron APIs, making it:
- **Difficult to test**: Required full Electron environment for unit tests
- **Platform-locked**: Could not run in browser or be ported to mobile
- **Hard to maintain**: Business logic mixed with infrastructure code
- **Slow to test**: Integration tests were the only option

**Question**: How can we make the frontend testable, portable, and maintainable while preserving Electron functionality?

---

## Decision Drivers

- **Testability**: Must be able to unit test services without Electron runtime
- **Portability**: Should be able to port to web/mobile with minimal changes
- **Maintainability**: Business logic should be isolated from infrastructure
- **Performance**: No significant performance overhead from abstraction
- **Developer Experience**: Easy to understand and use
- **Gradual Migration**: Can be adopted incrementally without breaking existing code

---

## Considered Options

### Option 1: **Direct Electron API Usage** (Status Quo)

```javascript
// Services call Electron APIs directly
class MessageService {
  async sendMessage(content) {
    window.electronAPI.sendUserInput(content);
  }
}
```

**Pros**:
- Simple, no abstraction layer
- Direct access to all Electron features
- No performance overhead

**Cons**:
- Cannot unit test (requires Electron runtime)
- Tightly coupled to Electron
- Business logic mixed with infrastructure
- Cannot port to web/mobile

### Option 2: **Mock Global Objects**

```javascript
// Mock window.electronAPI in tests
global.window = {
  electronAPI: {
    sendUserInput: vi.fn(),
  },
};
```

**Pros**:
- Minimal code changes
- Can test with mocks

**Cons**:
- Fragile tests (mocking globals is error-prone)
- Still coupled to Electron API shape
- Hard to swap implementations
- Mocks drift from real implementation

### Option 3: **Adapter Pattern with Dependency Injection** ✅ (Chosen)

```javascript
// Adapter interface
class IPCAdapter {
  async sendMessage(content) {
    return this.api.sendUserInput(content);
  }
}

// Service depends on adapter interface
class MessageService {
  constructor({ ipcAdapter }) {
    this.ipc = ipcAdapter; // Injected
  }

  async sendMessage(content) {
    return this.ipc.sendMessage(content);
  }
}
```

**Pros**:
- ✅ Fully testable with mock adapters
- ✅ Platform-agnostic services
- ✅ Clear separation of concerns
- ✅ Easy to swap implementations
- ✅ Gradual migration possible
- ✅ Type-safe interfaces

**Cons**:
- Additional abstraction layer
- Slight boilerplate (minimal)
- Requires dependency injection setup

---

## Decision Outcome

**Chosen option**: **Option 3 - Adapter Pattern with Dependency Injection**

We will create adapter interfaces for all infrastructure dependencies:
- **IPCAdapter**: Abstract Electron IPC
- **DOMAdapter**: Abstract DOM operations
- **StorageAdapter**: Abstract localStorage/sessionStorage

Services will depend only on adapter interfaces, not concrete implementations. This follows the **Dependency Inversion Principle** from SOLID.

---

## Implementation

### 1. Adapter Interfaces

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

  async sendSessionCommand(command, data) {
    if (!this.api?.sessionCommand) {
      throw new Error('IPC API not available: sessionCommand');
    }
    return this.api.sessionCommand(command, data);
  }

  onPythonStdout(callback) {
    if (this.api?.onBotOutput) {
      this.api.onBotOutput(callback);
    }
  }
}
```

### 2. Mock Implementation for Tests

```javascript
// tests/helpers/MockIPCAdapter.js
export class MockIPCAdapter {
  constructor() {
    this.responses = new Map();
    this.callLog = [];
  }

  setResponse(method, response) {
    this.responses.set(method, response);
  }

  async sendMessage(content) {
    this.callLog.push({ method: 'sendMessage', args: [content] });
    return this.responses.get('sendMessage');
  }

  // ... mock other methods
}
```

### 3. Service with Dependency Injection

```javascript
// services/message-service.js
export class MessageService {
  constructor({ ipcAdapter, storageAdapter }) {
    this.ipc = ipcAdapter;
    this.storage = storageAdapter;
  }

  async sendMessage(content) {
    // Business logic only - no direct infrastructure access
    if (!content || !content.trim()) {
      return { success: false, error: 'Empty message' };
    }

    try {
      await this.ipc.sendMessage(content);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

### 4. Bootstrap with Real Adapters

```javascript
// bootstrap.js
const ipcAdapter = new IPCAdapter(window.electronAPI);
const storageAdapter = new StorageAdapter(localStorage, sessionStorage);
const domAdapter = new DOMAdapter();

const messageService = new MessageService({
  ipcAdapter,
  storageAdapter,
});

const sessionService = new SessionService({
  ipcAdapter,
  storageAdapter,
});
```

### 5. Tests with Mock Adapters

```javascript
// tests/unit/services/message-service.test.js
describe('MessageService', () => {
  let mockIPC, messageService;

  beforeEach(() => {
    mockIPC = new MockIPCAdapter();
    messageService = new MessageService({
      ipcAdapter: mockIPC,
      storageAdapter: new MockStorageAdapter(),
    });
  });

  it('should send valid message', async () => {
    mockIPC.setResponse('sendMessage', { success: true });

    const result = await messageService.sendMessage('Hello');

    expect(result.success).toBe(true);
    expect(mockIPC.callLog).toHaveLength(1);
  });
});
```

---

## Consequences

### Positive

✅ **Testability**:
- Services are now fully unit testable without Electron
- Tests run in <5 seconds (was 30+ seconds with integration tests)
- Test coverage increased from 0% to 82%+

✅ **Portability**:
- Services are platform-agnostic
- Can create WebPlatformAdapter for browser deployment
- Can create MobilePlatformAdapter for React Native

✅ **Maintainability**:
- Clear separation between business logic and infrastructure
- Services are pure JavaScript with no DOM/Electron dependencies
- Easy to reason about and modify

✅ **Flexibility**:
- Can swap implementations at runtime
- Can add new adapters for new platforms
- Can create specialized adapters (e.g., LoggingAdapter, CachingAdapter)

### Negative

⚠️ **Boilerplate**:
- Need to create adapter classes for each infrastructure dependency
- Need to wire dependencies in bootstrap
- **Mitigation**: Keep adapters thin, use factories for common setups

⚠️ **Learning Curve**:
- Team needs to understand dependency injection pattern
- **Mitigation**: Comprehensive documentation, code examples in guides

⚠️ **Indirection**:
- One extra layer between service and infrastructure
- **Mitigation**: Negligible performance impact, benefits outweigh cost

---

## Validation

### Success Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Test Coverage** | 0% | 82% | +82% |
| **Unit Test Speed** | N/A | <5s | New |
| **Services with DI** | 0 | 4 | +4 |
| **Mock Adapters** | 0 | 3 | +3 |
| **Platform Dependencies** | High | Low | ✅ |

### Test Results

All services now have comprehensive unit tests:
- `SessionService`: 23 tests, 84% coverage
- `MessageService`: 16 tests, 95% coverage
- `FileService`: 12 tests, 94% coverage
- `FunctionCallService`: 11 tests, 98% coverage

---

## Related Decisions

- [ADR 002: EventBus Architecture](./002-event-bus.md) - Complements adapters for cross-cutting concerns
- [ADR 003: Plugin System](./003-plugin-system.md) - Uses adapter pattern for plugin isolation

---

## References

- **Hexagonal Architecture**: Alistair Cockburn (Ports & Adapters)
- **Clean Architecture**: Robert C. Martin (Dependency Inversion)
- **SOLID Principles**: Dependency Inversion Principle (DIP)
- **Martin Fowler**: [Inversion of Control Containers](https://martinfowler.com/articles/injection.html)

---

## Notes

- All new services MUST use adapters (enforced in code review)
- Adapters are thin wrappers - no business logic
- Mock adapters maintained alongside real adapters
- Future: Consider auto-generating TypeScript interfaces for adapters

