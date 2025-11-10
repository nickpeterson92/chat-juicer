# Plugin Development Guide

## Table of Contents
- [Introduction](#introduction)
- [Plugin Basics](#plugin-basics)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Plugin API Reference](#plugin-api-reference)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Testing Plugins](#testing-plugins)
- [Publishing Plugins](#publishing-plugins)

---

## Introduction

Chat Juicer's plugin system allows you to extend the application without modifying core code. Plugins can:

- **Listen to events** from the EventBus
- **Add custom tools** and features
- **Intercept messages** before/after processing
- **Register UI components** in extension slots
- **Track analytics** and metrics
- **Modify behavior** through hooks

### Why Plugins?

✅ **No code modification**: Extend without touching core
✅ **Hot reload**: Enable/disable at runtime
✅ **Isolated**: Plugin crashes don't break app
✅ **Composable**: Multiple plugins work together
✅ **Testable**: Test plugins independently

---

## Plugin Basics

### Minimal Plugin

```javascript
// plugins/hello-world-plugin.js
import { createPlugin } from '../core/plugin-interface.js';

export const HelloWorldPlugin = createPlugin({
  name: 'hello-world',
  version: '1.0.0',
  description: 'A simple hello world plugin',

  async install(app) {
    console.log('Hello from plugin!');

    // Access app services
    const { eventBus, services } = app;

    // Listen to events
    eventBus.on('user:message_sent', ({ content }) => {
      console.log('User sent:', content);
    });
  },
});
```

### Registering Your Plugin

```javascript
// plugins/core-plugins.js (or your plugin file)
import { HelloWorldPlugin } from './hello-world-plugin.js';

export function getCorePlugins() {
  return [
    HelloWorldPlugin,
    // ... other plugins
  ];
}
```

```javascript
// bootstrap.js
import { getCorePlugins } from './plugins/core-plugins.js';

const plugins = getCorePlugins();
for (const plugin of plugins) {
  await pluginRegistry.install(plugin.name, plugin, app);
}
```

---

## Plugin Lifecycle

### Lifecycle Hooks

```javascript
export const MyPlugin = createPlugin({
  name: 'my-plugin',
  version: '1.0.0',

  // Called once when plugin is registered
  async install(app) {
    console.log('Plugin installed');
    // Setup: Register handlers, initialize state
  },

  // Called when plugin is removed (optional)
  async uninstall(app) {
    console.log('Plugin uninstalled');
    // Cleanup: Remove handlers, free resources
  },

  // Called when plugin is temporarily disabled (optional)
  async disable(app) {
    console.log('Plugin disabled');
    // Pause: Stop listening to events, hide UI
  },

  // Called when plugin is re-enabled (optional)
  async enable(app) {
    console.log('Plugin enabled');
    // Resume: Re-register handlers, show UI
  },
});
```

### Plugin States

```
NOT_INSTALLED → install() → INSTALLED → enable() → ENABLED
                                ↓           ↓
                         uninstall()   disable()
                                ↓           ↓
                           NOT_INSTALLED  DISABLED
                                           ↓
                                      enable()
                                           ↓
                                       ENABLED
```

### Managing Plugins at Runtime

```javascript
import { globalPluginRegistry } from './plugins/plugin-interface.js';

// Install plugin
await globalPluginRegistry.install('my-plugin', MyPlugin, app);

// Disable plugin
await globalPluginRegistry.disable('my-plugin', app);

// Enable plugin
await globalPluginRegistry.enable('my-plugin', app);

// Uninstall plugin
await globalPluginRegistry.uninstall('my-plugin', app);

// Check plugin status
const isEnabled = globalPluginRegistry.isEnabled('my-plugin');
```

---

## Plugin API Reference

### `app` Object

The `app` object passed to lifecycle hooks contains:

```javascript
{
  eventBus,        // EventBus instance
  services: {      // Core services
    sessionService,
    messageService,
    fileService,
    functionCallService,
  },
  state,           // AppState instance
  elements,        // DOM element references
  metrics,         // PerformanceMetrics (via MetricsBridgePlugin)
  analytics,       // AnalyticsAdapter (via AnalyticsBridgePlugin)
}
```

### EventBus API

```javascript
// Listen to events
eventBus.on(event, handler, options);
eventBus.on('user:message_sent', handleMessage);

// Wildcard listeners
eventBus.on('user:*', handleAllUserEvents);
eventBus.on('*', handleAllEvents);

// Priority listeners (higher = earlier)
eventBus.on('critical:event', handleCritical, { priority: 10 });

// One-time listeners
eventBus.once('app:ready', initializePlugin);

// Remove listeners
eventBus.off('user:message_sent', handleMessage);

// Emit events
eventBus.emit('plugin:custom_event', { data: 'value' });

// Check listener count
const count = eventBus.listenerCount('user:message_sent');
```

### Services API

#### SessionService

```javascript
const { sessionService } = app.services;

// Get all sessions (paginated)
const result = await sessionService.getSessions(offset, limit);
// Returns: { success, data: { sessions, has_more }, error }

// Switch session
const result = await sessionService.switchSession(sessionId);
// Returns: { success, data: { session, full_history }, error }

// Delete session
const result = await sessionService.deleteSession(sessionId);
// Returns: { success, error }

// Rename session
const result = await sessionService.renameSession(sessionId, newTitle);
// Returns: { success, error }
```

#### MessageService

```javascript
const { messageService } = app.services;

// Send message
const result = await messageService.sendMessage(content);
// Returns: { success, error }

// Validate message
const isValid = messageService.validateMessage(content);
// Returns: boolean
```

#### FileService

```javascript
const { fileService } = app.services;

// Upload file
const result = await fileService.uploadFile(file);
// Returns: { success, data: { filename, path }, error }

// Delete file
const result = await fileService.deleteFile(filename, directory);
// Returns: { success, error }

// Open file
const result = await fileService.openFile(filepath);
// Returns: { success, error }

// List files
const result = await fileService.listFiles(directory);
// Returns: { success, data: files[], error }
```

---

## Examples

### Example 1: Analytics Plugin

Track user interactions:

```javascript
export const AnalyticsPlugin = createPlugin({
  name: 'analytics',
  version: '1.0.0',
  description: 'Tracks user interactions and sends to analytics service',

  async install(app) {
    const { eventBus } = app;

    // Track message sends
    eventBus.on('user:message_sent', ({ content, sessionId }) => {
      this.track('message_sent', {
        length: content.length,
        session_id: sessionId,
        timestamp: Date.now(),
      });
    });

    // Track session creates
    eventBus.on('session:created', ({ sessionId }) => {
      this.track('session_created', { session_id: sessionId });
    });

    // Track errors
    eventBus.on('error:*', ({ error, context }) => {
      this.track('error_occurred', {
        error: error.message,
        context,
      });
    });
  },

  track(event, properties) {
    // Send to analytics service (e.g., Mixpanel, Amplitude)
    fetch('https://analytics.example.com/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, properties }),
    });
  },
});
```

### Example 2: Auto-Save Plugin

Automatically save drafts:

```javascript
export const AutoSavePlugin = createPlugin({
  name: 'auto-save',
  version: '1.0.0',
  description: 'Automatically saves message drafts',

  async install(app) {
    const { eventBus, services } = app;
    let draftTimer = null;

    // Save draft on input change
    eventBus.on('input:changed', ({ content }) => {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        this.saveDraft(content, services.sessionService.currentSessionId);
      }, 1000); // Debounce 1 second
    });

    // Clear draft on message sent
    eventBus.on('user:message_sent', () => {
      this.clearDraft();
    });
  },

  saveDraft(content, sessionId) {
    localStorage.setItem(`draft-${sessionId}`, content);
    console.log('Draft saved');
  },

  clearDraft() {
    localStorage.removeItem('draft');
  },
});
```

### Example 3: Keyboard Shortcuts Plugin

Add custom keyboard shortcuts:

```javascript
export const KeyboardShortcutsPlugin = createPlugin({
  name: 'keyboard-shortcuts',
  version: '1.0.0',
  description: 'Custom keyboard shortcuts',

  async install(app) {
    const { eventBus, services } = app;

    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + N: New session
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        eventBus.emit('user:new_session_requested');
      }

      // Cmd/Ctrl + K: Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector('#session-search')?.focus();
      }

      // Cmd/Ctrl + /: Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        eventBus.emit('ui:toggle_sidebar');
      }
    });
  },
});
```

### Example 4: Message Transformer Plugin

Transform messages before display:

```javascript
export const MessageTransformerPlugin = createPlugin({
  name: 'message-transformer',
  version: '1.0.0',
  description: 'Transforms messages before rendering',

  async install(app) {
    const { eventBus } = app;

    // Intercept messages before rendering
    eventBus.on('message:before_render', ({ message }) => {
      // Transform URLs to clickable links
      message.content = this.linkify(message.content);

      // Highlight @mentions
      message.content = this.highlightMentions(message.content);

      return message;
    });
  },

  linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
  },

  highlightMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  },
});
```

### Example 5: Performance Monitor Plugin

Monitor and alert on performance issues:

```javascript
export const PerformanceMonitorPlugin = createPlugin({
  name: 'performance-monitor',
  version: '1.0.0',
  description: 'Monitors app performance',

  async install(app) {
    const { eventBus, metrics } = app;

    // Track slow operations
    eventBus.on('perf:*', ({ name, duration }) => {
      if (duration > 1000) { // > 1 second
        console.warn(`Slow operation: ${name} took ${duration}ms`);
        this.alertSlowOperation(name, duration);
      }
    });

    // Monitor memory usage
    setInterval(() => {
      const memory = performance.memory;
      const usedMB = memory.usedJSHeapSize / 1048576;

      if (usedMB > 500) { // > 500 MB
        console.warn(`High memory usage: ${usedMB.toFixed(2)} MB`);
      }

      metrics.record('memory_usage', usedMB, 'MB');
    }, 10000); // Check every 10 seconds
  },

  alertSlowOperation(name, duration) {
    // Show toast notification
    window.dispatchEvent(new CustomEvent('show-toast', {
      detail: {
        message: `Slow operation: ${name} (${duration}ms)`,
        type: 'warning',
      },
    }));
  },
});
```

---

## Best Practices

### 1. Namespace Your Events

```javascript
// ✅ GOOD: Namespaced events
eventBus.emit('myplugin:custom_event', data);
eventBus.on('myplugin:*', handler);

// ❌ BAD: Generic event names (collision risk)
eventBus.emit('event', data);
eventBus.on('click', handler);
```

### 2. Clean Up Resources

```javascript
export const MyPlugin = createPlugin({
  name: 'my-plugin',

  timers: [],

  async install(app) {
    const timer = setInterval(() => { /* ... */ }, 1000);
    this.timers.push(timer);
  },

  async uninstall(app) {
    // Clear all timers
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
  },
});
```

### 3. Handle Errors Gracefully

```javascript
async install(app) {
  const { eventBus } = app;

  eventBus.on('user:message_sent', async ({ content }) => {
    try {
      await this.processMessage(content);
    } catch (error) {
      console.error('[MyPlugin] Error processing message:', error);
      // Don't throw - isolate plugin errors
    }
  });
}
```

### 4. Use Dependency Injection

```javascript
export const MyPlugin = createPlugin({
  name: 'my-plugin',

  async install(app) {
    // Store app reference for later use
    this.app = app;
    this.eventBus = app.eventBus;
    this.services = app.services;
  },

  async doSomething() {
    // Use stored references
    await this.services.sessionService.getSessions();
  },
});
```

### 5. Document Your Plugin

```javascript
/**
 * MyPlugin - Adds custom functionality
 *
 * @description
 * This plugin adds custom functionality to Chat Juicer by listening to
 * user events and transforming data before display.
 *
 * @events-emitted
 * - myplugin:processed - Emitted when processing completes
 * - myplugin:error - Emitted on processing error
 *
 * @events-subscribed
 * - user:message_sent - Processes user messages
 * - session:created - Initializes plugin for session
 *
 * @configuration
 * Set `window.__MYPLUGIN_CONFIG__` to configure:
 * - enabled: boolean (default: true)
 * - threshold: number (default: 100)
 *
 * @example
 * ```javascript
 * window.__MYPLUGIN_CONFIG__ = { threshold: 200 };
 * await pluginRegistry.install('my-plugin', MyPlugin, app);
 * ```
 */
export const MyPlugin = createPlugin({ /* ... */ });
```

### 6. Test Your Plugin

See [Testing Plugins](#testing-plugins) section below.

---

## Testing Plugins

### Unit Testing

```javascript
// tests/plugins/my-plugin.test.js
import { describe, it, expect, vi } from 'vitest';
import { MyPlugin } from '../../plugins/my-plugin.js';
import { EventBus } from '../../core/event-bus.js';

describe('MyPlugin', () => {
  it('should listen to user events', async () => {
    const eventBus = new EventBus();
    const app = { eventBus, services: {} };

    await MyPlugin.install(app);

    const callback = vi.fn();
    eventBus.on('myplugin:processed', callback);

    // Trigger event
    eventBus.emit('user:message_sent', { content: 'Hello' });

    expect(callback).toHaveBeenCalled();
  });

  it('should clean up on uninstall', async () => {
    const eventBus = new EventBus();
    const app = { eventBus, services: {} };

    await MyPlugin.install(app);
    await MyPlugin.uninstall(app);

    // Check listeners removed
    expect(eventBus.listenerCount('user:message_sent')).toBe(0);
  });
});
```

### Integration Testing

```javascript
// tests/integration/plugin-system.test.js
import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../../plugins/plugin-interface.js';
import { MyPlugin } from '../../plugins/my-plugin.js';

describe('Plugin System Integration', () => {
  it('should install and enable plugin', async () => {
    const registry = new PluginRegistry();
    const app = { eventBus: new EventBus(), services: {} };

    await registry.install('my-plugin', MyPlugin, app);

    expect(registry.isEnabled('my-plugin')).toBe(true);
  });

  it('should handle plugin errors gracefully', async () => {
    const BrokenPlugin = createPlugin({
      name: 'broken',
      async install() {
        throw new Error('Plugin failed');
      },
    });

    const registry = new PluginRegistry();
    const app = { eventBus: new EventBus(), services: {} };

    // Should not throw
    await expect(
      registry.install('broken', BrokenPlugin, app)
    ).resolves.toBeUndefined();

    // Plugin should not be enabled
    expect(registry.isEnabled('broken')).toBe(false);
  });
});
```

---

## Publishing Plugins

### Package Structure

```
my-plugin/
├── package.json
├── README.md
├── src/
│   ├── index.js         # Plugin entry point
│   └── utils.js         # Helper functions
├── tests/
│   └── index.test.js
└── examples/
    └── usage.js
```

### package.json

```json
{
  "name": "@chatjuicer/plugin-my-feature",
  "version": "1.0.0",
  "description": "My awesome Chat Juicer plugin",
  "main": "src/index.js",
  "keywords": ["chat-juicer", "plugin"],
  "peerDependencies": {
    "chat-juicer": "^1.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/chatjuicer-plugin-myfeature"
  }
}
```

### README.md Template

```markdown
# Chat Juicer Plugin: My Feature

## Installation

\`\`\`bash
npm install @chatjuicer/plugin-my-feature
\`\`\`

## Usage

\`\`\`javascript
import { MyFeaturePlugin } from '@chatjuicer/plugin-my-feature';

// In bootstrap.js
await pluginRegistry.install('my-feature', MyFeaturePlugin, app);
\`\`\`

## Configuration

...

## Events

### Emitted Events
- `myfeature:processed` - ...

### Subscribed Events
- `user:message_sent` - ...

## API

...

## Examples

...

## License

MIT
```

---

## Advanced Topics

### Plugin Dependencies

```javascript
export const AdvancedPlugin = createPlugin({
  name: 'advanced-plugin',
  version: '1.0.0',
  dependencies: ['analytics', 'storage'], // Required plugins

  async install(app) {
    const { pluginRegistry } = app;

    // Check dependencies
    for (const dep of this.dependencies) {
      if (!pluginRegistry.isEnabled(dep)) {
        throw new Error(`Missing required plugin: ${dep}`);
      }
    }

    // Use other plugin's functionality
    const analyticsPlugin = pluginRegistry.getPlugin('analytics');
    analyticsPlugin.track('advanced_plugin_loaded');
  },
});
```

### Dynamic Plugin Loading

```javascript
// Load plugin at runtime
async function loadPlugin(pluginUrl) {
  const module = await import(pluginUrl);
  const plugin = module.default;

  await pluginRegistry.install(plugin.name, plugin, app);
}

// Usage
await loadPlugin('./plugins/community-plugin.js');
```

### Plugin Configuration

```javascript
export const ConfigurablePlugin = createPlugin({
  name: 'configurable',
  version: '1.0.0',

  defaultConfig: {
    enabled: true,
    threshold: 100,
    mode: 'auto',
  },

  async install(app) {
    // Merge with user config
    this.config = {
      ...this.defaultConfig,
      ...window.__PLUGIN_CONFIG__?.configurable,
    };

    console.log('Plugin config:', this.config);
  },
});
```

---

## Troubleshooting

### Plugin Not Loading

1. Check plugin is in `getCorePlugins()` array
2. Verify `install()` method exists and is async
3. Check console for errors during installation

### Events Not Firing

1. Use `eventBus.listenerCount(event)` to verify listeners
2. Check event name matches exactly (case-sensitive)
3. Verify wildcard patterns are correct

### Memory Leaks

1. Always remove event listeners in `uninstall()`
2. Clear timers/intervals in `uninstall()`
3. Use Chrome DevTools Memory Profiler

---

## Next Steps

- Read [Architecture Guide](./ARCHITECTURE.md) for system overview
- Check [Debugging Guide](./DEBUGGING.md) for debug tools
- Review [Performance Guide](./PERFORMANCE.md) for optimization tips

**Happy Plugin Development!** 🎉

