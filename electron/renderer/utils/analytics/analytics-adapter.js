/**
 * Analytics Adapter - Pluggable analytics system
 * Supports multiple analytics backends (console, custom, etc.)
 */

/**
 * Analytics Event
 * @typedef {Object} AnalyticsEvent
 * @property {string} category - Event category (user, system, error, performance)
 * @property {string} action - Event action (click, send, error, etc.)
 * @property {string} label - Event label (specific identifier)
 * @property {number} value - Optional numeric value
 * @property {Object} metadata - Additional metadata
 */

/**
 * Base Analytics Backend
 */
export class AnalyticsBackend {
  constructor(config = {}) {
    this.enabled = config.enabled ?? true;
    this.name = config.name || "base";
  }

  /**
   * Track an event
   * @param {AnalyticsEvent} event - Event to track
   */
  async track(_event) {
    throw new Error("Backend must implement track() method");
  }

  /**
   * Track a page view
   * @param {string} page - Page name
   * @param {Object} metadata - Additional metadata
   */
  async trackPageView(_page, _metadata = {}) {
    throw new Error("Backend must implement trackPageView() method");
  }

  /**
   * Track an error
   * @param {Error} error - Error object
   * @param {Object} metadata - Additional metadata
   */
  async trackError(_error, _metadata = {}) {
    throw new Error("Backend must implement trackError() method");
  }

  /**
   * Track timing/performance
   * @param {string} category - Timing category
   * @param {string} variable - Variable name
   * @param {number} value - Duration in ms
   * @param {Object} metadata - Additional metadata
   */
  async trackTiming(_category, _variable, _value, _metadata = {}) {
    throw new Error("Backend must implement trackTiming() method");
  }

  /**
   * Enable backend
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable backend
   */
  disable() {
    this.enabled = false;
  }
}

/**
 * Console Analytics Backend - Logs to console (dev mode)
 */
export class ConsoleAnalyticsBackend extends AnalyticsBackend {
  constructor(config = {}) {
    super({ name: "console", ...config });
  }

  async track(event) {
    if (!this.enabled) return;

    console.log(`[Analytics] Event:`, {
      category: event.category,
      action: event.action,
      label: event.label,
      value: event.value,
      metadata: event.metadata,
    });
  }

  async trackPageView(page, metadata = {}) {
    if (!this.enabled) return;
    console.log(`[Analytics] PageView: ${page}`, metadata);
  }

  async trackError(error, metadata = {}) {
    if (!this.enabled) return;

    console.error("[Analytics] Error:", {
      message: error.message,
      stack: error.stack,
      metadata,
    });
  }

  async trackTiming(category, variable, value, metadata = {}) {
    if (!this.enabled) return;

    console.log(`[Analytics] Timing: ${category}.${variable} = ${value}ms`, metadata);
  }
}

/**
 * Local Storage Analytics Backend - Stores events locally
 */
export class LocalStorageAnalyticsBackend extends AnalyticsBackend {
  constructor(config = {}) {
    super({ name: "localStorage", ...config });
    this.storageKey = config.storageKey || "chat_juicer_analytics";
    this.maxEvents = config.maxEvents || 1000;
  }

  async track(event) {
    if (!this.enabled) return;

    const events = this.getEvents();
    events.push({
      ...event,
      timestamp: Date.now(),
    });

    // Keep bounded
    if (events.length > this.maxEvents) {
      events.shift();
    }

    this.saveEvents(events);
  }

  async trackPageView(page, metadata = {}) {
    return this.track({
      category: "navigation",
      action: "page_view",
      label: page,
      metadata,
    });
  }

  async trackError(error, metadata = {}) {
    return this.track({
      category: "error",
      action: "error_occurred",
      label: error.message,
      metadata: {
        ...metadata,
        stack: error.stack,
      },
    });
  }

  async trackTiming(category, variable, value, metadata = {}) {
    return this.track({
      category: "performance",
      action: "timing",
      label: `${category}.${variable}`,
      value,
      metadata,
    });
  }

  /**
   * Get stored events
   * @returns {Array}
   */
  getEvents() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("[LocalStorageAnalyticsBackend] Failed to get events:", error);
      return [];
    }
  }

  /**
   * Save events
   * @param {Array} events - Events to save
   */
  saveEvents(events) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(events));
    } catch (error) {
      console.error("[LocalStorageAnalyticsBackend] Failed to save events:", error);
    }
  }

  /**
   * Clear events
   */
  clearEvents() {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Export events
   * @returns {Array}
   */
  exportEvents() {
    return this.getEvents();
  }
}

/**
 * Electron IPC Analytics Backend - Sends to main process
 */
export class ElectronIPCAnalyticsBackend extends AnalyticsBackend {
  constructor(config = {}) {
    super({ name: "electron-ipc", ...config });
  }

  async track(event) {
    if (!this.enabled) return;
    if (!window.electronAPI?.log) return;

    window.electronAPI.log("info", "analytics_event", {
      ...event,
      timestamp: Date.now(),
    });
  }

  async trackPageView(page, metadata = {}) {
    return this.track({
      category: "navigation",
      action: "page_view",
      label: page,
      metadata,
    });
  }

  async trackError(error, metadata = {}) {
    return this.track({
      category: "error",
      action: "error_occurred",
      label: error.message,
      metadata: {
        ...metadata,
        stack: error.stack,
      },
    });
  }

  async trackTiming(category, variable, value, metadata = {}) {
    return this.track({
      category: "performance",
      action: "timing",
      label: `${category}.${variable}`,
      value,
      metadata,
    });
  }
}

/**
 * Analytics Adapter - Manages multiple backends
 */
export class AnalyticsAdapter {
  constructor() {
    this.backends = new Map();
    this.enabled = true;
    this.queue = [];
    this.maxQueueSize = 100;
  }

  /**
   * Add analytics backend
   * @param {AnalyticsBackend} backend - Backend instance
   */
  addBackend(backend) {
    this.backends.set(backend.name, backend);
  }

  /**
   * Remove analytics backend
   * @param {string} name - Backend name
   */
  removeBackend(name) {
    this.backends.delete(name);
  }

  /**
   * Get backend
   * @param {string} name - Backend name
   * @returns {AnalyticsBackend|undefined}
   */
  getBackend(name) {
    return this.backends.get(name);
  }

  /**
   * Track an event
   * @param {string} category - Event category
   * @param {string} action - Event action
   * @param {string} label - Event label
   * @param {number} value - Optional numeric value
   * @param {Object} metadata - Additional metadata
   */
  async track(category, action, label, value = null, metadata = {}) {
    if (!this.enabled) return;

    const event = {
      category,
      action,
      label,
      value,
      metadata,
      timestamp: Date.now(),
    };

    // Queue event if no backends available
    if (this.backends.size === 0) {
      this.queueEvent(event);
      return;
    }

    // Send to all backends
    const promises = Array.from(this.backends.values()).map((backend) =>
      backend.track(event).catch((error) => {
        console.error(`[AnalyticsAdapter] Backend ${backend.name} error:`, error);
      })
    );

    await Promise.all(promises);
  }

  /**
   * Track page view
   * @param {string} page - Page name
   * @param {Object} metadata - Additional metadata
   */
  async trackPageView(page, metadata = {}) {
    if (!this.enabled) return;

    const promises = Array.from(this.backends.values()).map((backend) =>
      backend.trackPageView(page, metadata).catch((error) => {
        console.error(`[AnalyticsAdapter] Backend ${backend.name} error:`, error);
      })
    );

    await Promise.all(promises);
  }

  /**
   * Track error
   * @param {Error} error - Error object
   * @param {Object} metadata - Additional metadata
   */
  async trackError(error, metadata = {}) {
    if (!this.enabled) return;

    const promises = Array.from(this.backends.values()).map((backend) =>
      backend.trackError(error, metadata).catch((err) => {
        console.error(`[AnalyticsAdapter] Backend ${backend.name} error:`, err);
      })
    );

    await Promise.all(promises);
  }

  /**
   * Track timing/performance
   * @param {string} category - Timing category
   * @param {string} variable - Variable name
   * @param {number} value - Duration in ms
   * @param {Object} metadata - Additional metadata
   */
  async trackTiming(category, variable, value, metadata = {}) {
    if (!this.enabled) return;

    const promises = Array.from(this.backends.values()).map((backend) =>
      backend.trackTiming(category, variable, value, metadata).catch((error) => {
        console.error(`[AnalyticsAdapter] Backend ${backend.name} error:`, error);
      })
    );

    await Promise.all(promises);
  }

  /**
   * Queue event when no backends available
   * @private
   */
  queueEvent(event) {
    this.queue.push(event);

    if (this.queue.length > this.maxQueueSize) {
      this.queue.shift();
    }
  }

  /**
   * Flush queued events
   */
  async flushQueue() {
    if (this.queue.length === 0) return;
    if (this.backends.size === 0) return;

    const events = [...this.queue];
    this.queue = [];

    for (const event of events) {
      await this.track(event.category, event.action, event.label, event.value, event.metadata);
    }
  }

  /**
   * Enable analytics
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable analytics
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Get debug snapshot
   * @returns {Object}
   */
  getDebugSnapshot() {
    return {
      enabled: this.enabled,
      backends: Array.from(this.backends.keys()),
      queueSize: this.queue.length,
    };
  }
}

// Global analytics instance
export const globalAnalytics = new AnalyticsAdapter();

// Add default backends based on environment
if (import.meta.env.DEV) {
  globalAnalytics.addBackend(new ConsoleAnalyticsBackend());
  globalAnalytics.addBackend(new LocalStorageAnalyticsBackend());
}

// Always add Electron IPC backend if available
if (window.electronAPI) {
  globalAnalytics.addBackend(new ElectronIPCAnalyticsBackend());
}

// Convenience exports
export const track = globalAnalytics.track.bind(globalAnalytics);
export const trackPageView = globalAnalytics.trackPageView.bind(globalAnalytics);
export const trackError = globalAnalytics.trackError.bind(globalAnalytics);
export const trackTiming = globalAnalytics.trackTiming.bind(globalAnalytics);
