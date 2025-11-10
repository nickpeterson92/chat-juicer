# Performance Optimization Guide

## Table of Contents
- [Overview](#overview)
- [Performance Budgets](#performance-budgets)
- [Monitoring & Metrics](#monitoring--metrics)
- [Common Bottlenecks](#common-bottlenecks)
- [Optimization Techniques](#optimization-techniques)
- [Profiling Tools](#profiling-tools)
- [Memory Management](#memory-management)
- [Best Practices](#best-practices)

---

## Overview

Chat Juicer is optimized for **production-grade performance** with specific budgets and monitoring in place. This guide covers how to maintain and improve performance.

### Current Performance Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Bundle Size** | <400KB (gzipped) | ~350KB | ✅ |
| **Initial Load** | <1.5s | ~1.2s | ✅ |
| **Message Render** | <16ms (60fps) | ~8ms | ✅ |
| **Session Switch** | <500ms | ~245ms | ✅ |
| **Memory (1h use)** | <150MB | ~120MB | ✅ |
| **Test Coverage** | >80% | 82% | ✅ |

---

## Performance Budgets

### Critical User Interactions

```javascript
// Performance budgets (in ms)
export const PERFORMANCE_BUDGETS = {
  // User input → first visual feedback
  INPUT_FEEDBACK: 100,

  // Message send → processing indicator
  MESSAGE_SEND: 150,

  // Backend response → first token displayed
  FIRST_TOKEN: 500,

  // Session click → history loaded
  SESSION_SWITCH: 500,

  // File drop → upload started
  FILE_UPLOAD_START: 200,

  // Theme toggle → colors applied
  THEME_SWITCH: 300,

  // Sidebar toggle → animation complete
  SIDEBAR_TOGGLE: 300,

  // Scroll to bottom → scroll complete
  SCROLL_TO_BOTTOM: 200,
};
```

### Resource Budgets

```javascript
export const RESOURCE_BUDGETS = {
  // JavaScript bundle size (gzipped)
  BUNDLE_SIZE_MAX: 400 * 1024, // 400KB

  // Maximum messages in DOM at once
  MAX_RENDERED_MESSAGES: 100,

  // Maximum active function cards
  MAX_ACTIVE_FUNCTION_CARDS: 20,

  // Maximum sessions loaded in memory
  MAX_LOADED_SESSIONS: 50,

  // Cache size limits
  MARKDOWN_CACHE_MAX: 500,
  FILE_CACHE_MAX: 100,
};
```

---

## Monitoring & Metrics

### Built-in Performance Monitoring

Chat Juicer includes a comprehensive metrics system:

```javascript
import { globalMetrics } from './utils/performance';

// Track operation timing
globalMetrics.startTimer('operation-name');
await performOperation();
const duration = globalMetrics.endTimer('operation-name');

// Record custom metrics
globalMetrics.record('messages-rendered', count, 'count');
globalMetrics.record('bundle-size', sizeInBytes, 'bytes');

// Get statistics
const stats = globalMetrics.getStatistics('operation-name');
console.log(`Avg: ${stats.mean}ms, P95: ${stats.p95}ms`);
```

### Real-time Metrics Dashboard

In development mode, access the metrics dashboard:

```javascript
// Console access
window.__DEBUG__.getMetrics();           // All metrics
window.__DEBUG__.getSlowOps(16);         // Operations >16ms (60fps)
window.__DEBUG__.getFPS();               // Current FPS
window.__DEBUG__.snapshot('checkpoint'); // Memory snapshot
window.__DEBUG__.report();               // Full performance report
```

### Performance Event Tracking

The EventBus emits performance events for monitoring:

```javascript
// Listen to performance events
eventBus.on('perf:*', ({ event, data }) => {
  console.log(`${event}: ${data.duration}ms`);
});

// Events emitted automatically:
// - perf:message_render
// - perf:session_switch
// - perf:file_upload
// - perf:markdown_parse
// - perf:bootstrap
```

---

## Common Bottlenecks

### 1. Markdown Rendering

**Problem**: Rendering complex markdown (code blocks, math, mermaid) is CPU-intensive.

**Symptoms**:
- Laggy typing during message streaming
- High CPU usage when rendering large messages
- Slow session switching with many messages

**Solutions**:

```javascript
// ✅ GOOD: Debounce markdown rendering
const debouncedRender = debounce((content) => {
  renderMarkdown(content);
}, 100);

// ✅ GOOD: Defer Mermaid rendering until streaming completes
if (message.streaming) {
  // Show plain code block during streaming
} else {
  processMermaidDiagrams(element);
}

// ✅ GOOD: Use requestIdleCallback for non-critical rendering
requestIdleCallback(() => {
  renderComplexElements();
}, { timeout: 2000 });

// ❌ BAD: Render markdown on every token
eventBus.on('message:token', ({ token }) => {
  renderMarkdown(buffer + token); // Re-renders entire message!
});
```

### 2. DOM Manipulation

**Problem**: Excessive DOM updates cause layout thrashing and reflows.

**Symptoms**:
- Janky animations
- Slow scrolling
- High paint times in DevTools

**Solutions**:

```javascript
// ✅ GOOD: Batch DOM updates
const fragment = document.createDocumentFragment();
messages.forEach(msg => {
  const el = createMessageElement(msg);
  fragment.appendChild(el);
});
container.appendChild(fragment); // Single reflow

// ✅ GOOD: Use CSS transforms (GPU-accelerated)
element.style.transform = 'translateY(100px)'; // ✅ Fast
element.style.top = '100px'; // ❌ Slow (triggers layout)

// ✅ GOOD: Read then write (avoid layout thrashing)
const heights = elements.map(el => el.offsetHeight); // Batch reads
heights.forEach((h, i) => {
  elements[i].style.height = h + 'px'; // Batch writes
});

// ❌ BAD: Interleaved reads and writes
elements.forEach(el => {
  const h = el.offsetHeight; // Read (forces layout)
  el.style.height = h + 'px'; // Write
  // Repeat causes layout thrashing
});
```

### 3. Event Handler Leaks

**Problem**: Event listeners not cleaned up cause memory leaks and duplicate execution.

**Symptoms**:
- Memory usage grows over time
- Duplicate messages or UI updates
- Slow performance after multiple session switches

**Solutions**:

```javascript
// ✅ GOOD: Store and cleanup event listeners
class Component {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.unsubscribers = [];
  }

  mount() {
    const unsub1 = this.eventBus.on('message:received', this.handleMessage);
    const unsub2 = this.eventBus.on('session:switched', this.handleSwitch);
    this.unsubscribers.push(unsub1, unsub2);
  }

  unmount() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}

// ✅ GOOD: Use weak references for caches
const messageCache = new WeakMap(); // Auto-cleans when object GC'd

// ❌ BAD: Never cleanup
eventBus.on('event', handler); // Listener persists forever
```

### 4. Large Collections

**Problem**: Unbounded arrays/maps grow indefinitely, consuming memory.

**Symptoms**:
- Memory usage grows over time
- Slow iterations over large collections
- High GC pauses

**Solutions**:

```javascript
// ✅ GOOD: Use BoundedMap (built-in)
import { BoundedMap } from './core/state.js';

const activeCalls = new BoundedMap(100); // Max 100 entries
activeCalls.set('call-1', data);
// Oldest entry automatically evicted when >100

// ✅ GOOD: Paginate large lists
async function loadMessages(sessionId, offset = 0, limit = 50) {
  const response = await ipc.loadMessages(sessionId, offset, limit);
  return response.messages; // Only load what's visible
}

// ✅ GOOD: Clear stale data periodically
setInterval(() => {
  const now = Date.now();
  activeCalls.forEach((value, key) => {
    if (now - value.timestamp > STALE_THRESHOLD) {
      activeCalls.delete(key);
    }
  });
}, 60000); // Every minute

// ❌ BAD: Unbounded array
const allMessages = [];
eventBus.on('message', msg => {
  allMessages.push(msg); // Never removes old messages
});
```

---

## Optimization Techniques

### 1. Lazy Loading

Defer loading of non-critical resources:

```javascript
// ✅ Lazy load Mermaid (only when needed)
let mermaid = null;
async function renderDiagram(code) {
  if (!mermaid) {
    mermaid = await import('mermaid'); // 200KB+ loaded on demand
    mermaid.initialize({ theme: 'dark' });
  }
  return mermaid.render('id', code);
}

// ✅ Lazy load plugins
const plugins = {
  async analytics() {
    return import('./plugins/analytics-plugin.js');
  },
  async devTools() {
    return import('./plugins/dev-tools-plugin.js');
  },
};
```

### 2. Code Splitting

Split bundle into chunks loaded on demand:

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk (rarely changes → cached)
          vendor: ['marked', 'highlight.js', 'katex'],

          // Dev tools (only loaded in dev mode)
          devtools: ['./utils/debug/debug-tools.js'],

          // Heavy libs (lazy loaded)
          mermaid: ['mermaid'],
        },
      },
    },
  },
};
```

### 3. Debouncing & Throttling

Limit expensive operations:

```javascript
import { debounce, throttle } from './utils/performance';

// Debounce: Wait for pause in events (last call wins)
const debouncedSearch = debounce((query) => {
  performSearch(query);
}, 300); // Wait 300ms after last keystroke

// Throttle: Limit call frequency (first call wins per interval)
const throttledScroll = throttle(() => {
  updateScrollPosition();
}, 16); // Max 60fps

window.addEventListener('scroll', throttledScroll);
```

### 4. Virtualization (Future)

For very long lists, render only visible items:

```javascript
// Virtual scrolling for 1000+ messages
class VirtualList {
  constructor(items, itemHeight, containerHeight) {
    this.items = items;
    this.itemHeight = itemHeight;
    this.containerHeight = containerHeight;
  }

  getVisibleRange(scrollTop) {
    const start = Math.floor(scrollTop / this.itemHeight);
    const end = Math.ceil((scrollTop + this.containerHeight) / this.itemHeight);
    return { start, end };
  }

  render(scrollTop) {
    const { start, end } = this.getVisibleRange(scrollTop);
    const visibleItems = this.items.slice(start, end);

    // Only render ~20 items instead of 1000
    return visibleItems.map(item => renderItem(item));
  }
}
```

### 5. Caching

Cache expensive computations:

```javascript
// Markdown parsing cache
const markdownCache = new Map();

function parseMarkdown(content) {
  const cacheKey = hashString(content);

  if (markdownCache.has(cacheKey)) {
    return markdownCache.get(cacheKey);
  }

  const parsed = marked.parse(content);
  markdownCache.set(cacheKey, parsed);

  // Limit cache size
  if (markdownCache.size > 500) {
    const firstKey = markdownCache.keys().next().value;
    markdownCache.delete(firstKey);
  }

  return parsed;
}
```

---

## Profiling Tools

### 1. Browser DevTools

**Performance Tab**:
1. Open DevTools (Cmd+Option+I)
2. Switch to Performance tab
3. Click Record
4. Perform action (e.g., switch session)
5. Stop recording
6. Analyze flame chart

**What to look for**:
- Long tasks (>50ms yellow bars)
- Layout thrashing (purple spikes)
- Paint operations (green spikes)
- JavaScript execution time (yellow)

### 2. Memory Profiler

**Detect Memory Leaks**:
1. Open DevTools → Memory tab
2. Take heap snapshot (baseline)
3. Perform actions (e.g., switch sessions 10 times)
4. Take second snapshot
5. Compare: Look for growing objects

**What to look for**:
- Detached DOM nodes
- Large arrays/objects not being GC'd
- Event listeners not cleaned up

### 3. Network Tab

**Check Bundle Size**:
1. Open DevTools → Network tab
2. Hard refresh (Cmd+Shift+R)
3. Check `index.js` size
4. Verify gzip compression enabled
5. Check for unnecessary dependencies

### 4. Custom Profiler

Use built-in profiling decorator:

```javascript
import { profile } from './utils/performance/profiler.js';

@profile({ name: 'renderMessages', threshold: 16 })
async function renderMessages(messages) {
  // Function execution time automatically logged if >16ms
  return messages.map(renderMessage);
}

// Or manual profiling
const profiler = new Profiler('operation');
profiler.start();
await performOperation();
profiler.end(); // Logs duration
```

---

## Memory Management

### 1. Avoid Memory Leaks

**Common Sources**:
- Event listeners not removed
- Timers (setTimeout/setInterval) not cleared
- Closures holding large objects
- Detached DOM nodes

**Prevention**:

```javascript
// ✅ GOOD: Cleanup timers
class Component {
  mount() {
    this.intervalId = setInterval(this.update, 1000);
  }

  unmount() {
    clearInterval(this.intervalId);
  }
}

// ✅ GOOD: Remove event listeners
element.addEventListener('click', handler);
// Later:
element.removeEventListener('click', handler);

// ✅ GOOD: Clear references
this.largeData = null; // Allow GC
```

### 2. Use Bounded Collections

```javascript
import { BoundedMap } from './core/state.js';

// Automatic eviction of old entries
const cache = new BoundedMap(100);
cache.set('key', 'value'); // Oldest auto-removed when >100
```

### 3. WeakMap for Caches

```javascript
// Entries auto-removed when key object is GC'd
const elementDataCache = new WeakMap();

elementDataCache.set(domElement, { data: 'value' });
// When domElement is removed from DOM and GC'd, cache entry is auto-removed
```

---

## Best Practices

### 1. Measure Before Optimizing

**Always profile first!** Don't guess where bottlenecks are.

```bash
# Run performance tests
npm run test:perf

# Generate bundle analysis
npm run build:analyze

# Check bundle size
npm run build && du -h dist/index.js
```

### 2. Set Performance Budgets

Add budget checks to CI:

```javascript
// vitest.config.js
export default {
  test: {
    performance: {
      budgets: {
        'renderMessage': 16, // ms
        'switchSession': 500, // ms
      },
    },
  },
};
```

### 3. Monitor in Production

Track real user metrics:

```javascript
// Track performance metrics
eventBus.on('perf:*', ({ event, data }) => {
  if (data.duration > BUDGETS[event]) {
    // Send to analytics
    analytics.track('performance_budget_exceeded', {
      operation: event,
      duration: data.duration,
      budget: BUDGETS[event],
    });
  }
});
```

### 4. Progressive Enhancement

Start minimal, add features progressively:

```javascript
// 1. Render text immediately
renderTextContent(message);

// 2. Add markdown (debounced)
requestIdleCallback(() => {
  applyMarkdown(element);
});

// 3. Add syntax highlighting (deferred)
requestIdleCallback(() => {
  highlightCodeBlocks(element);
}, { timeout: 1000 });

// 4. Render diagrams (only when visible)
intersectionObserver.observe(element, () => {
  renderMermaidDiagrams(element);
});
```

### 5. Test Performance Regularly

Add performance regression tests:

```javascript
// tests/performance/message-render.test.js
describe('Message Rendering Performance', () => {
  it('should render 100 messages in <500ms', async () => {
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      await renderMessage(createMockMessage());
    }

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });
});
```

---

## Performance Checklist

Before releasing a feature:

- [ ] Profiled in DevTools Performance tab
- [ ] Checked memory usage (no leaks)
- [ ] Verified bundle size impact (<5KB increase)
- [ ] Tested with 100+ messages in chat
- [ ] Tested rapid session switching (10x)
- [ ] Verified 60fps animations
- [ ] Added performance metrics/logging
- [ ] Documented any known slow paths
- [ ] Added performance tests if critical path

---

## Resources

- **Internal Docs**:
  - [Architecture Guide](./ARCHITECTURE.md)
  - [Debugging Guide](./DEBUGGING.md)
  - [Testing Guide](../claudedocs/NEW_ARCHITECTURE_TESTING_GUIDE.md)

- **External Resources**:
  - [Web Vitals](https://web.dev/vitals/)
  - [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
  - [JavaScript Performance](https://developer.mozilla.org/en-US/docs/Web/Performance)

---

## Questions?

- Check `window.__DEBUG__.report()` for performance snapshot
- Review metrics in `globalMetrics.getAll()`
- Profile with DevTools Performance tab
- Ask in team chat with profiling screenshots

**Remember**: Premature optimization is the root of all evil. Measure, then optimize the bottleneck.

