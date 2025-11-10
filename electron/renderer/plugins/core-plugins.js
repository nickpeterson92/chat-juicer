/**
 * Core Plugins - Built-in plugins that provide essential functionality
 */

import { createPlugin } from "./plugin-interface.js";

/**
 * Message Handler Plugin
 * Bridges old message handler system with event bus
 */
export const MessageHandlerPlugin = createPlugin({
  name: "message-handler",
  version: "1.0.0",
  description: "Bridges message handlers with event bus",

  async install(app) {
    const { eventBus } = app;

    // Subscribe to all message events and route to handlers
    eventBus.on("message:received", async ({ data }) => {
      const message = data;
      const messageType = message.type;

      // Emit specific message type event
      eventBus.emit(`message:${messageType}`, message, {
        source: "message-handler-plugin",
      });

      // Emit to analytics
      eventBus.emit("analytics:event", {
        category: "message",
        action: "received",
        label: messageType,
      });
    });

    console.log("[MessageHandlerPlugin] Installed");
  },

  async uninstall(_app) {
    // Cleanup handled by eventBus.off()
    console.log("[MessageHandlerPlugin] Uninstalled");
  },
});

/**
 * State Sync Plugin
 * Syncs AppState changes with EventBus
 */
export const StateSyncPlugin = createPlugin({
  name: "state-sync",
  version: "1.0.0",
  description: "Synchronizes state changes with event bus",

  async install(app) {
    const { eventBus, state } = app;

    // Subscribe to wildcard state changes
    state.subscribe("*", ({ path, newValue, oldValue }) => {
      eventBus.emit("state:changed", {
        path,
        newValue,
        oldValue,
      });

      // Emit specific state change events
      eventBus.emit(`state:${path}`, {
        newValue,
        oldValue,
      });

      // Track for analytics
      eventBus.emit("analytics:event", {
        category: "state",
        action: "changed",
        label: path,
      });
    });

    console.log("[StateSyncPlugin] Installed");
  },
});

/**
 * Performance Tracking Plugin
 * Tracks performance metrics for key operations
 */
export const PerformanceTrackingPlugin = createPlugin({
  name: "performance-tracking",
  version: "1.0.0",
  description: "Tracks performance metrics",

  async install(app) {
    const { eventBus } = app;
    const metrics = new Map();

    // Track message rendering time
    eventBus.on("message:assistant_start", () => {
      metrics.set("message_render_start", performance.now());
    });

    eventBus.on("message:assistant_end", () => {
      const start = metrics.get("message_render_start");
      if (start) {
        const duration = performance.now() - start;
        eventBus.emit("performance:metric", {
          name: "message_render_duration",
          value: duration,
          unit: "ms",
        });
        metrics.delete("message_render_start");
      }
    });

    // Track session switch time
    eventBus.on("session:switch:start", () => {
      metrics.set("session_switch_start", performance.now());
    });

    eventBus.on("session:switch:complete", () => {
      const start = metrics.get("session_switch_start");
      if (start) {
        const duration = performance.now() - start;
        eventBus.emit("performance:metric", {
          name: "session_switch_duration",
          value: duration,
          unit: "ms",
        });
        metrics.delete("session_switch_start");
      }
    });

    // Store metrics reference on app
    app.performanceMetrics = metrics;

    console.log("[PerformanceTrackingPlugin] Installed");
  },
});

/**
 * Error Tracking Plugin
 * Centralized error tracking and reporting
 */
export const ErrorTrackingPlugin = createPlugin({
  name: "error-tracking",
  version: "1.0.0",
  description: "Tracks and logs errors",

  async install(app) {
    const { eventBus } = app;
    const errors = [];

    // Track all error events
    eventBus.on("error:*", ({ event, data }) => {
      const errorEntry = {
        event,
        error: data,
        timestamp: Date.now(),
        stack: data?.stack,
      };

      errors.push(errorEntry);

      // Keep only last 50 errors
      if (errors.length > 50) {
        errors.shift();
      }

      // Log to console in dev
      if (import.meta.env.DEV) {
        console.error("[ErrorTracking]", errorEntry);
      }

      // Send to analytics
      eventBus.emit("analytics:event", {
        category: "error",
        action: event,
        label: data?.message || "unknown",
      });
    });

    // Store errors on app for debugging
    app.recentErrors = errors;

    console.log("[ErrorTrackingPlugin] Installed");
  },
});

/**
 * Debug Tools Plugin
 * Provides debug utilities in development mode
 */
export const DebugToolsPlugin = createPlugin({
  name: "debug-tools",
  version: "1.0.0",
  description: "Development debugging tools",

  async install(app) {
    if (!import.meta.env.DEV) {
      console.log("[DebugToolsPlugin] Skipped (not in dev mode)");
      return;
    }

    const { eventBus, state } = app;

    // Expose debug API on window
    window.__CHAT_JUICER_DEBUG__ = {
      app,
      eventBus,
      state,

      // Get event log
      getEventLog: (limit = 50) => eventBus.getEventLog(limit),

      // Get state snapshot
      getStateSnapshot: () => ({
        connection: state.connection,
        message: state.message,
        ui: state.ui,
        functions: {
          activeCalls: state.functions.activeCalls.size,
          argumentsBuffer: state.functions.argumentsBuffer.size,
        },
      }),

      // Get performance metrics
      getPerformanceMetrics: () => {
        if (app.performanceMetrics) {
          return Array.from(app.performanceMetrics.entries());
        }
        return [];
      },

      // Get recent errors
      getRecentErrors: () => app.recentErrors || [],

      // Emit test event
      emitTestEvent: (event, data) => {
        eventBus.emit(event, data);
      },

      // List all plugins
      listPlugins: () => {
        if (app.pluginRegistry) {
          return app.pluginRegistry.getAllPlugins().map((p) => p.getMetadata());
        }
        return [];
      },

      // Get debug info
      getDebugInfo: () => ({
        eventBus: eventBus.getDebugSnapshot(),
        state: state.getState("*"),
        plugins: app.pluginRegistry?.getDebugSnapshot(),
        performance: app.performanceMetrics ? Array.from(app.performanceMetrics.entries()) : [],
        errors: app.recentErrors || [],
      }),
    };

    // Log all events in dev mode
    eventBus.on("*", ({ event, data }) => {
      if (event.startsWith("debug:")) {
        console.log(`[EventBus] ${event}`, data);
      }
    });

    console.log("[DebugToolsPlugin] Installed");
    console.log("💡 Debug API available at: window.__CHAT_JUICER_DEBUG__");
  },
});

/**
 * Keyboard Shortcuts Plugin
 * Handles keyboard shortcuts
 */
export const KeyboardShortcutsPlugin = createPlugin({
  name: "keyboard-shortcuts",
  version: "1.0.0",
  description: "Keyboard shortcuts handler",

  async install(app) {
    const { eventBus } = app;
    const shortcuts = new Map();

    // Register shortcut
    const registerShortcut = (key, handler, description = "") => {
      shortcuts.set(key, { handler, description });
    };

    // Handle keyboard events
    const handleKeydown = (e) => {
      const key = [e.ctrlKey || e.metaKey ? "Ctrl" : "", e.shiftKey ? "Shift" : "", e.altKey ? "Alt" : "", e.key]
        .filter(Boolean)
        .join("+");

      const shortcut = shortcuts.get(key);
      if (shortcut) {
        e.preventDefault();
        shortcut.handler(e);
        eventBus.emit("shortcut:triggered", { key, shortcut });
      }
    };

    document.addEventListener("keydown", handleKeydown);

    // Default shortcuts
    registerShortcut(
      "Ctrl+n",
      () => {
        eventBus.emit("session:create");
      },
      "Create new session"
    );

    registerShortcut(
      "Ctrl+k",
      () => {
        eventBus.emit("search:focus");
      },
      "Focus search"
    );

    registerShortcut(
      "Escape",
      () => {
        eventBus.emit("modal:close");
      },
      "Close modal"
    );

    // Store shortcuts on app
    app.shortcuts = shortcuts;
    app.registerShortcut = registerShortcut;

    console.log("[KeyboardShortcutsPlugin] Installed");
  },

  async uninstall(app) {
    // Remove keyboard listener
    document.removeEventListener("keydown", app.handleKeydown);
    console.log("[KeyboardShortcutsPlugin] Uninstalled");
  },
});

/**
 * Analytics Bridge Plugin
 * Bridges EventBus analytics events to the AnalyticsAdapter
 */
export const AnalyticsBridgePlugin = createPlugin({
  name: "analytics-bridge",
  version: "1.0.0",
  description: "Bridges EventBus analytics events to AnalyticsAdapter",

  async install(app) {
    const { eventBus } = app;

    // Import globalAnalytics
    const { globalAnalytics } = await import("../utils/analytics/index.js");

    // Listen to all analytics events and forward to adapter
    eventBus.on("analytics:event", async ({ data }) => {
      const { category, action, label, value, metadata } = data;
      await globalAnalytics.track(category, action, label, value, metadata);
    });

    // Store analytics on app
    app.analytics = globalAnalytics;

    console.log("[AnalyticsBridgePlugin] Installed - wired to globalAnalytics");
  },
});

/**
 * Performance Metrics Bridge Plugin
 * Bridges EventBus performance metrics to the MetricsCollector
 */
export const MetricsBridgePlugin = createPlugin({
  name: "metrics-bridge",
  version: "1.0.0",
  description: "Bridges EventBus performance metrics to MetricsCollector",

  async install(app) {
    const { eventBus } = app;

    // Import globalMetrics
    const { globalMetrics } = await import("../utils/performance/index.js");

    // Listen to all performance metric events
    eventBus.on("performance:metric", ({ data }) => {
      const { name, value, unit, metadata } = data;
      // Use correct API: record(name, value, unit, metadata)
      globalMetrics.record(name, value, unit || "count", metadata || {});
    });

    // Store metrics on app
    app.metrics = globalMetrics;

    console.log("[MetricsBridgePlugin] Installed - wired to globalMetrics");
  },
});

/**
 * Auto-save Plugin
 * Auto-saves UI state (theme, panel positions, etc.)
 */
export const AutoSavePlugin = createPlugin({
  name: "auto-save",
  version: "1.0.0",
  description: "Auto-saves UI state",

  async install(app) {
    const { eventBus, state } = app;

    // Save theme changes
    state.subscribe("ui.theme", (newTheme) => {
      localStorage.setItem("theme", newTheme);
      eventBus.emit("ui:theme:saved", { theme: newTheme });
    });

    // Save panel state
    state.subscribe("ui.toolsPanelCollapsed", (collapsed) => {
      localStorage.setItem("toolsPanelCollapsed", collapsed);
      eventBus.emit("ui:panel:saved", { collapsed });
    });

    console.log("[AutoSavePlugin] Installed");
  },
});

/**
 * Get all core plugins
 * @returns {Array<Plugin>}
 */
export function getCorePlugins() {
  return [
    MessageHandlerPlugin,
    StateSyncPlugin,
    PerformanceTrackingPlugin,
    ErrorTrackingPlugin,
    AnalyticsBridgePlugin, // NEW: Bridges analytics events
    MetricsBridgePlugin, // NEW: Bridges performance metrics
    DebugToolsPlugin,
    KeyboardShortcutsPlugin,
    AutoSavePlugin,
  ];
}
