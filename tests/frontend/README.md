# Frontend Test Suite

**Coverage**: 90%+ | **Tests**: 583 | **Status**: ✅ Passing

---

## Overview

Comprehensive test suite for the Chat Juicer frontend covering unit tests, integration tests, and performance regression tests.

### Test Organization

```
tests/frontend/
├── unit/                    # Isolated component tests (440+ tests)
│   ├── adapters/           # DOMAdapter, IPCAdapter, StorageAdapter
│   ├── core/               # EventBus, AppState, BoundedMap
│   ├── services/           # Business logic services
│   └── viewmodels/         # View model transformations
├── integration/            # Multi-component tests (60+ tests)
│   ├── analytics-adapter.test.js
│   ├── event-bus.test.js
│   ├── performance-metrics.test.js
│   └── plugin-system.test.js
├── performance/            # Performance regression tests (19 tests)
│   └── performance-regression.test.js
├── e2e/                    # End-to-end tests (future)
└── helpers/                # Test utilities and mocks
    ├── MockIPCAdapter.js
    ├── MockStorageAdapter.js
    └── MockDOMAdapter.js
```

---

## Running Tests

### Quick Commands

```bash
# Run all frontend tests
make test-frontend

# Run with coverage report
make test-coverage-frontend

# Run only unit tests
make test-frontend-unit

# Run only integration tests
make test-frontend-integration

# Watch mode (TDD)
make test-frontend-watch

# Interactive UI
make test-frontend-ui
```

### Direct npm Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/frontend/unit/core/state.test.js

# Run tests matching pattern
npm test -- --grep "EventBus"

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# UI mode
npm run test:ui
```

---

## Test Categories

### Unit Tests (440+ tests)

**Purpose**: Test individual components in isolation

**Coverage**: 95%+ for most modules

**Examples**:
- `adapters/DOMAdapter.test.js` - DOM manipulation abstraction
- `adapters/IPCAdapter.test.js` - Electron IPC communication
- `adapters/StorageAdapter.test.js` - LocalStorage/SessionStorage
- `core/state.test.js` - BoundedMap and AppState
- `core/event-bus.test.js` - Event bus pub/sub system
- `services/*.test.js` - Business logic services
- `viewmodels/*.test.js` - Data transformation logic

**Characteristics**:
- ✅ Fast (<10ms per test)
- ✅ Isolated (no dependencies between tests)
- ✅ Deterministic (always same result)

---

### Integration Tests (60+ tests)

**Purpose**: Test interactions between multiple components

**Coverage**: Focuses on critical integration points

**Examples**:
- `analytics-adapter.test.js` - Analytics backend integration
- `event-bus.test.js` - Complex event flow scenarios
- `performance-metrics.test.js` - Performance monitoring integration
- `plugin-system.test.js` - Plugin lifecycle and hooks

**Characteristics**:
- ⏱️ Slower (10-100ms per test)
- 🔗 Tests component interactions
- 🎯 Focuses on critical paths

---

### Performance Tests (19 tests)

**Purpose**: Prevent performance regressions

**Performance Budgets**:
- Bootstrap operations: <10ms
- Event emissions: <50ms for 1000 events
- Map operations: <100ms for 10,000 ops
- Memory growth: <5MB for typical operations

**Categories**:
1. **Bootstrap Performance** - App initialization speed
2. **Event Bus Performance** - Event emission/handling speed
3. **BoundedMap Performance** - Cache operations speed
4. **Memory Performance** - Memory leak detection
5. **Concurrent Operations** - Race condition safety
6. **Stress Tests** - High-load scenarios

**Running Performance Tests**:
```bash
npm test tests/frontend/performance/
```

---

## Coverage Requirements

### Module-Level Targets

| Module | Current | Target | Status |
|--------|---------|--------|--------|
| **Adapters** | 96.96% | 90% | ⭐ Excellent |
| **Config** | 100% | 90% | ⭐ Perfect |
| **Core** | 95.06% | 90% | ⭐ Excellent |
| **Plugins** | 80% | 85% | ⚠️ Improve |
| **Services** | 92.46% | 90% | ⭐ Excellent |
| **ViewModels** | 100% | 90% | ⭐ Perfect |
| **Overall** | **90.23%** | **80%** | ✅ **Passing** |

### Thresholds (vitest.config.js)

```javascript
coverage: {
  thresholds: {
    lines: 80,        // Current: 91.89% ✅
    functions: 80,    // Current: 90.62% ✅
    branches: 75,     // Current: 83.52% ✅
    statements: 80,   // Current: 90.23% ✅
  }
}
```

---

## Writing Tests

### Test Structure

```javascript
/**
 * Good test structure example
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MyComponent } from "../path/to/component.js";

describe("MyComponent", () => {
  let component;

  beforeEach(() => {
    // Set up test fixtures
    component = new MyComponent();
  });

  afterEach(() => {
    // Clean up
    component = null;
  });

  describe("Method: initialize", () => {
    it("should initialize with default values", () => {
      component.initialize();

      expect(component.isReady).toBe(true);
      expect(component.config).toBeDefined();
    });

    it("should throw if initialized twice", () => {
      component.initialize();

      expect(() => component.initialize()).toThrow("Already initialized");
    });
  });

  describe("Method: process", () => {
    it("should process valid input", () => {
      const result = component.process({ value: 42 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 42, processed: true });
    });

    it("should reject invalid input", () => {
      expect(() => component.process(null)).toThrow("Invalid input");
    });
  });
});
```

### Best Practices

#### ✅ DO:
- **Group related tests** with `describe` blocks
- **Use descriptive test names** ("should X when Y")
- **Test one thing per test** (single assertion focus)
- **Use beforeEach/afterEach** for setup/cleanup
- **Test edge cases** (null, undefined, empty, boundary values)
- **Test error conditions** (invalid input, error recovery)
- **Keep tests fast** (<10ms for unit tests)

#### ❌ DON'T:
- **Don't test implementation details** (test behavior, not internals)
- **Don't share state between tests** (tests must be isolated)
- **Don't use timeouts** unless absolutely necessary
- **Don't skip cleanup** (memory leaks in test suite)
- **Don't test external dependencies** (mock them instead)

---

### Using Mocks

```javascript
import { vi } from "vitest";
import { MockIPCAdapter } from "../../helpers/MockIPCAdapter.js";
import { MockStorageAdapter } from "../../helpers/MockStorageAdapter.js";

describe("Component with Dependencies", () => {
  it("should use mocked IPC adapter", () => {
    const mockIPC = new MockIPCAdapter();
    const component = new MyComponent(mockIPC);

    // Spy on IPC calls
    const spy = vi.spyOn(mockIPC, "sendMessage");

    component.sendData({ test: "data" });

    expect(spy).toHaveBeenCalledWith("message", { test: "data" });
  });
});
```

---

## Performance Testing

### Writing Performance Tests

```javascript
describe("Performance: MyOperation", () => {
  it("should complete in <10ms", () => {
    const start = performance.now();

    // Operation under test
    myExpensiveOperation();

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(10); // 10ms budget
  });

  it("should not leak memory", () => {
    if (!performance.memory) return; // Skip if API unavailable

    const initialMemory = performance.memory.usedJSHeapSize;

    // Perform operations
    for (let i = 0; i < 1000; i++) {
      myOperation();
    }

    const finalMemory = performance.memory.usedJSHeapSize;
    const memoryGrowth = finalMemory - initialMemory;

    expect(memoryGrowth).toBeLessThan(1024 * 1024); // <1MB growth
  });
});
```

---

## Debugging Tests

### Running Single Test

```bash
npm test -- tests/frontend/unit/core/state.test.js
```

### Debugging in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test:watch"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Using Console Logs

```javascript
it("should debug test", () => {
  console.log("Debug info:", myVariable);

  // Vitest will show console output
});
```

### Inspecting Test Failures

```bash
# Run with verbose output
npm test -- --reporter=verbose

# Run with coverage to see uncovered lines
npm run test:coverage
```

---

## CI/CD Integration

Tests run automatically on:
- ✅ Every push to main/develop/test-suite-js
- ✅ Every pull request
- ✅ Pre-commit hooks (via `make precommit`)

### GitHub Actions Workflow

See `.github/workflows/test.yml` for full configuration.

**Jobs**:
1. **Frontend Tests** - Runs all frontend tests with coverage
2. **Backend Tests** - Runs Python backend tests
3. **Quality Checks** - Linting and type checking

**Coverage Reporting**:
- Uploads to Codecov automatically
- PR comments show coverage changes
- Blocks merge if coverage drops below thresholds

---

## Troubleshooting

### Tests Timing Out

**Symptom**: Tests hang or timeout

**Solutions**:
- Check for missing `await` on async operations
- Look for infinite loops in test code
- Verify mock cleanup in `afterEach`
- Increase timeout: `it("test", () => {...}, 10000)` // 10 seconds

### Flaky Tests

**Symptom**: Tests pass/fail randomly

**Solutions**:
- Remove timing dependencies (use `waitFor` instead of `setTimeout`)
- Clear shared state in `beforeEach`
- Mock non-deterministic functions (Date.now, Math.random)
- Check for race conditions in async code

### Low Coverage

**Symptom**: Coverage below threshold

**Solutions**:
1. Run coverage report: `npm run test:coverage`
2. Open `coverage/index.html` in browser
3. Identify uncovered lines (highlighted in red)
4. Write tests for uncovered code paths
5. Consider if code is actually reachable

---

## Test Metrics

### Current Status (as of Phase 6)

| Metric | Value | Change from Phase 5 |
|--------|-------|---------------------|
| **Total Tests** | 526 | +19 (performance tests) |
| **Test Files** | 14 | +1 (performance suite) |
| **Coverage** | 90.23% | Maintained |
| **Pass Rate** | 100% | ✅ All passing |
| **Avg Test Duration** | <5ms | ⚡ Fast |
| **Total Suite Time** | <2s | ⚡ Very fast |

### Historical Progress

| Phase | Tests | Coverage | Notes |
|-------|-------|----------|-------|
| Phase 3 | 0 | 0% | Legacy code |
| Phase 4 | 440 | 82% | Foundation laid |
| Phase 5 | 507 | 90.23% | Exceeded targets |
| Phase 6 | 526 | 90.23% | Added performance tests |

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Best Practices](https://testing-library.com/docs/guiding-principles)
- [Project ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- [Project DEBUGGING.md](../../docs/DEBUGGING.md)

---

## Contributing

When adding new features:

1. ✅ **Write tests first** (TDD approach)
2. ✅ **Maintain coverage** (>80% for new code)
3. ✅ **Run tests locally** (`make test-frontend`)
4. ✅ **Verify in watch mode** (`make test-frontend-watch`)
5. ✅ **Check CI passes** before merging

---

**Maintained by**: Engineering Team
**Last Updated**: 2025-11-10 (Phase 6)
**Status**: ✅ **Production Ready**
