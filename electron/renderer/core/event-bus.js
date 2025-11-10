/**
 * EventBus - Central event system for decoupled communication
 * Implements pub/sub pattern with priority handling, error boundaries, and wildcards
 */

export class EventBus {
  constructor(options = {}) {
    this.listeners = new Map();
    this.onceListeners = new Map();
    this.wildcardListeners = new Set();
    this.errorHandler = options.errorHandler || this.defaultErrorHandler;
    this.debug = options.debug ?? false;
    this.eventLog = [];
    this.maxLogSize = options.maxLogSize || 100;
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name (supports '*' wildcard)
   * @param {Function} handler - Handler function (event, data) => void
   * @param {Object} options - Optional config { priority: number }
   * @returns {Function} Unsubscribe function
   */
  on(event, handler, options = {}) {
    if (typeof handler !== "function") {
      throw new TypeError("Handler must be a function");
    }

    // Handle wildcard subscriptions
    if (event === "*") {
      this.wildcardListeners.add({ handler, priority: options.priority || 0 });
      return () => this.wildcardListeners.delete(handler);
    }

    // Regular event subscription
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const handlerEntry = {
      handler,
      priority: options.priority || 0,
    };

    const handlers = this.listeners.get(event);
    handlers.push(handlerEntry);

    // Sort by priority (higher priority executes first)
    handlers.sort((a, b) => b.priority - a.priority);

    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(event);
      if (handlers) {
        const index = handlers.findIndex((h) => h.handler === handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first trigger)
   * @param {string} event - Event name
   * @param {Function} handler - Handler function
   * @returns {Function} Unsubscribe function
   */
  once(event, handler) {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, []);
    }

    this.onceListeners.get(event).push(handler);

    return () => {
      const handlers = this.onceListeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @param {Object} metadata - Optional metadata (source, timestamp, etc.)
   */
  emit(event, data, metadata = {}) {
    const eventData = {
      event,
      data,
      timestamp: Date.now(),
      ...metadata,
    };

    // Log event if debug enabled
    if (this.debug) {
      this.logEvent(eventData);
    }

    // Emit to regular listeners
    const handlers = this.listeners.get(event) || [];
    for (const { handler } of handlers) {
      this.safeInvoke(handler, eventData);
    }

    // Emit to once listeners (then remove them)
    const onceHandlers = this.onceListeners.get(event) || [];
    if (onceHandlers.length > 0) {
      this.onceListeners.delete(event);
      for (const handler of onceHandlers) {
        this.safeInvoke(handler, eventData);
      }
    }

    // Emit to wildcard listeners
    for (const { handler } of this.wildcardListeners) {
      this.safeInvoke(handler, eventData);
    }
  }

  /**
   * Emit an event asynchronously (next tick)
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<void>}
   */
  async emitAsync(event, data, metadata = {}) {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.emit(event, data, metadata);
        resolve();
      }, 0);
    });
  }

  /**
   * Remove all listeners for an event (or all events if no event specified)
   * @param {string} [event] - Event name (optional)
   */
  off(event) {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
      this.wildcardListeners.clear();
    }
  }

  /**
   * Check if event has any listeners
   * @param {string} event - Event name
   * @returns {boolean}
   */
  hasListeners(event) {
    const regular = this.listeners.has(event) && this.listeners.get(event).length > 0;
    const once = this.onceListeners.has(event) && this.onceListeners.get(event).length > 0;
    return regular || once || this.wildcardListeners.size > 0;
  }

  /**
   * Get listener count for an event
   * @param {string} event - Event name
   * @returns {number}
   */
  listenerCount(event) {
    const regular = this.listeners.get(event)?.length || 0;
    const once = this.onceListeners.get(event)?.length || 0;
    const wildcard = event === "*" ? this.wildcardListeners.size : 0;
    return regular + once + wildcard;
  }

  /**
   * Safely invoke a handler with error boundary
   * @private
   */
  safeInvoke(handler, eventData) {
    try {
      handler(eventData);
    } catch (error) {
      this.errorHandler(error, eventData, handler);
    }
  }

  /**
   * Default error handler
   * @private
   */
  defaultErrorHandler(error, eventData, handler) {
    console.error("[EventBus] Handler error:", {
      error: error.message,
      event: eventData.event,
      handler: handler.name || "anonymous",
      stack: error.stack,
    });
  }

  /**
   * Log event to internal buffer (for debugging)
   * @private
   */
  logEvent(eventData) {
    this.eventLog.push(eventData);

    // Keep log size bounded
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }
  }

  /**
   * Get recent event log
   * @param {number} limit - Max events to return
   * @returns {Array}
   */
  getEventLog(limit = 50) {
    return this.eventLog.slice(-limit);
  }

  /**
   * Clear event log
   */
  clearEventLog() {
    this.eventLog = [];
  }

  /**
   * Get debug snapshot of current state
   * @returns {Object}
   */
  getDebugSnapshot() {
    return {
      events: Array.from(this.listeners.keys()),
      listenerCounts: Array.from(this.listeners.entries()).map(([event, handlers]) => ({
        event,
        count: handlers.length,
      })),
      wildcardListeners: this.wildcardListeners.size,
      recentEvents: this.getEventLog(10),
    };
  }
}

/**
 * Create a scoped event bus (namespace)
 * Useful for plugins to avoid conflicts
 */
export class ScopedEventBus {
  constructor(eventBus, scope) {
    this.eventBus = eventBus;
    this.scope = scope;
  }

  on(event, handler, options) {
    return this.eventBus.on(`${this.scope}:${event}`, handler, options);
  }

  once(event, handler) {
    return this.eventBus.once(`${this.scope}:${event}`, handler);
  }

  emit(event, data, metadata = {}) {
    return this.eventBus.emit(`${this.scope}:${event}`, data, {
      ...metadata,
      scope: this.scope,
    });
  }

  emitAsync(event, data, metadata = {}) {
    return this.eventBus.emitAsync(`${this.scope}:${event}`, data, {
      ...metadata,
      scope: this.scope,
    });
  }

  off(event) {
    return this.eventBus.off(`${this.scope}:${event}`);
  }
}

// Global instance (can be imported directly)
export const globalEventBus = new EventBus({
  debug: import.meta.env.DEV,
  errorHandler: (error, eventData, handler) => {
    console.error("[EventBus] Handler error:", {
      error: error.message,
      event: eventData.event,
      handler: handler.name || "anonymous",
      stack: error.stack,
    });

    // Send to Electron logger if available
    if (window.electronAPI?.log) {
      window.electronAPI.log("error", "EventBus handler error", {
        error: error.message,
        event: eventData.event,
        stack: error.stack,
      });
    }
  },
});

// Export convenience methods for global bus
export const on = globalEventBus.on.bind(globalEventBus);
export const once = globalEventBus.once.bind(globalEventBus);
export const emit = globalEventBus.emit.bind(globalEventBus);
export const off = globalEventBus.off.bind(globalEventBus);
