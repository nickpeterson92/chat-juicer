/**
 * Debug Tools - Development utilities for debugging
 */

import { globalEventBus } from "../../core/event-bus.js";
import { BrowserPerformance, FPSMonitor, globalMetrics } from "../performance/metrics.js";
import { BundleAnalyzer, globalMemoryProfiler } from "../performance/profiler.js";

/**
 * Debug Logger - Enhanced logging with filtering and history
 */
export class DebugLogger {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.logLevels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    this.currentLevel = this.logLevels[options.level || "debug"];
    this.history = [];
    this.maxHistory = options.maxHistory || 500;
    this.filters = new Set(options.filters || []);
  }

  /**
   * Log debug message
   * @param {string} category - Log category
   * @param {*} data - Log data
   */
  debug(category, ...data) {
    this.log("debug", category, ...data);
  }

  /**
   * Log info message
   * @param {string} category - Log category
   * @param {*} data - Log data
   */
  info(category, ...data) {
    this.log("info", category, ...data);
  }

  /**
   * Log warning message
   * @param {string} category - Log category
   * @param {*} data - Log data
   */
  warn(category, ...data) {
    this.log("warn", category, ...data);
  }

  /**
   * Log error message
   * @param {string} category - Log category
   * @param {*} data - Log data
   */
  error(category, ...data) {
    this.log("error", category, ...data);
  }

  /**
   * Log message
   * @private
   */
  log(level, category, ...data) {
    if (!this.enabled) return;
    if (this.logLevels[level] < this.currentLevel) return;
    if (this.filters.size > 0 && !this.filters.has(category)) return;

    const entry = {
      level,
      category,
      data,
      timestamp: Date.now(),
      stack: new Error().stack,
    };

    this.history.push(entry);

    // Keep bounded
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Console output
    const method = console[level] || console.log;
    method(`[${category}]`, ...data);
  }

  /**
   * Get log history
   * @param {Object} options - Filter options { level, category, limit }
   * @returns {Array}
   */
  getHistory(options = {}) {
    let filtered = this.history;

    if (options.level) {
      filtered = filtered.filter((e) => e.level === options.level);
    }

    if (options.category) {
      filtered = filtered.filter((e) => e.category === options.category);
    }

    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Add category filter
   * @param {string} category - Category to filter
   */
  addFilter(category) {
    this.filters.add(category);
  }

  /**
   * Remove category filter
   * @param {string} category - Category to remove
   */
  removeFilter(category) {
    this.filters.delete(category);
  }

  /**
   * Clear filters
   */
  clearFilters() {
    this.filters.clear();
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Set log level
   * @param {string} level - Log level (debug, info, warn, error)
   */
  setLevel(level) {
    if (this.logLevels[level] !== undefined) {
      this.currentLevel = this.logLevels[level];
    }
  }
}

/**
 * State Inspector - Inspect application state
 */
export class StateInspector {
  constructor(appState) {
    this.appState = appState;
  }

  /**
   * Get state snapshot
   * @returns {Object}
   */
  getSnapshot() {
    return {
      connection: { ...this.appState.connection },
      message: { ...this.appState.message },
      ui: { ...this.appState.ui },
      functions: {
        activeCalls: Array.from(this.appState.functions.activeCalls.entries()),
        argumentsBuffer: Array.from(this.appState.functions.argumentsBuffer.entries()),
        activeTimers: this.appState.functions.activeTimers.size,
      },
    };
  }

  /**
   * Watch state changes
   * @param {string} path - State path to watch
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  watch(path, callback) {
    return this.appState.subscribe(path, (newValue, oldValue) => {
      console.log(`[StateInspector] ${path} changed:`, {
        old: oldValue,
        new: newValue,
      });

      callback(newValue, oldValue);
    });
  }

  /**
   * Get state diff between two snapshots
   * @param {Object} snapshot1 - First snapshot
   * @param {Object} snapshot2 - Second snapshot
   * @returns {Object} Diff
   */
  diff(snapshot1, snapshot2) {
    const diff = {};

    for (const key in snapshot2) {
      if (JSON.stringify(snapshot1[key]) !== JSON.stringify(snapshot2[key])) {
        diff[key] = {
          old: snapshot1[key],
          new: snapshot2[key],
        };
      }
    }

    return diff;
  }

  /**
   * Print state to console
   */
  print() {
    console.group("[StateInspector]");
    console.table(this.getSnapshot());
    console.groupEnd();
  }
}

/**
 * Event Inspector - Inspect EventBus events
 */
export class EventInspector {
  constructor(eventBus = globalEventBus) {
    this.eventBus = eventBus;
    this.recording = false;
    this.recordedEvents = [];
    this.maxRecorded = 1000;
  }

  /**
   * Start recording events
   * @param {string} filter - Optional event filter pattern
   */
  startRecording(filter = null) {
    this.recording = true;
    this.recordedEvents = [];

    this.unsubscribe = this.eventBus.on("*", ({ event, data, timestamp }) => {
      if (filter && !event.includes(filter)) return;

      this.recordedEvents.push({
        event,
        data,
        timestamp,
      });

      // Keep bounded
      if (this.recordedEvents.length > this.maxRecorded) {
        this.recordedEvents.shift();
      }
    });

    console.log(`[EventInspector] Started recording events${filter ? ` (filter: ${filter})` : ""}`);
  }

  /**
   * Stop recording events
   */
  stopRecording() {
    this.recording = false;
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    console.log(`[EventInspector] Stopped recording (${this.recordedEvents.length} events captured)`);
  }

  /**
   * Get recorded events
   * @param {number} limit - Max events to return
   * @returns {Array}
   */
  getRecordedEvents(limit = 100) {
    return this.recordedEvents.slice(-limit);
  }

  /**
   * Get event timeline
   * @returns {Array} Timeline with durations
   */
  getTimeline() {
    const timeline = [];
    let prevTimestamp = this.recordedEvents[0]?.timestamp || 0;

    for (const event of this.recordedEvents) {
      timeline.push({
        event: event.event,
        timestamp: event.timestamp,
        delta: event.timestamp - prevTimestamp,
      });
      prevTimestamp = event.timestamp;
    }

    return timeline;
  }

  /**
   * Get event frequency
   * @returns {Object} Event counts
   */
  getFrequency() {
    const frequency = {};

    for (const event of this.recordedEvents) {
      frequency[event.event] = (frequency[event.event] || 0) + 1;
    }

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .map(([event, count]) => ({ event, count }));
  }

  /**
   * Print event report
   */
  print() {
    console.group("[EventInspector] Report");
    console.log(`Total events: ${this.recordedEvents.length}`);
    console.log("\nFrequency:");
    console.table(this.getFrequency());
    console.log("\nRecent events:");
    console.table(this.getRecordedEvents(20));
    console.groupEnd();
  }
}

/**
 * Performance Inspector - Inspect performance metrics
 */
export class PerformanceInspector {
  /**
   * Get performance summary
   * @returns {Object}
   */
  getSummary() {
    return {
      metrics: globalMetrics.getSummary(),
      navigation: BrowserPerformance.getNavigationTiming(),
      memory: BrowserPerformance.getMemoryInfo(),
    };
  }

  /**
   * Get slow operations
   * @param {number} threshold - Threshold in ms
   * @returns {Array}
   */
  getSlowOperations(threshold = 16) {
    const allMetrics = globalMetrics.getAllMetrics();
    return allMetrics
      .filter((m) => m.value > threshold && m.unit === "ms")
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }

  /**
   * Get memory snapshots
   * @returns {Array}
   */
  getMemorySnapshots() {
    return globalMemoryProfiler.getSnapshots();
  }

  /**
   * Take memory snapshot
   * @param {string} label - Snapshot label
   */
  snapshot(label) {
    return globalMemoryProfiler.snapshot(label);
  }

  /**
   * Compare memory snapshots
   * @param {number} index1 - First snapshot index
   * @param {number} index2 - Second snapshot index
   * @returns {Object}
   */
  compareMemory(index1, index2) {
    return globalMemoryProfiler.compare(index1, index2);
  }

  /**
   * Print performance report
   */
  print() {
    console.group("[PerformanceInspector] Report");
    console.log("Summary:", this.getSummary());
    console.log("\nSlow Operations (>16ms):");
    console.table(this.getSlowOperations());
    console.log("\nBundle Info:");
    BundleAnalyzer.print();
    console.groupEnd();
  }
}

/**
 * Debug Dashboard - All-in-one debug interface
 */
export class DebugDashboard {
  constructor(app) {
    this.app = app;
    this.logger = new DebugLogger();
    this.stateInspector = new StateInspector(app.state);
    this.eventInspector = new EventInspector(app.eventBus);
    this.performanceInspector = new PerformanceInspector();
    this.fpsMonitor = new FPSMonitor();
  }

  /**
   * Initialize dashboard
   */
  init() {
    // Start FPS monitoring
    this.fpsMonitor.start();

    // Take initial memory snapshot
    this.performanceInspector.snapshot("init");

    // Expose on window
    window.__DEBUG__ = {
      // App reference
      app: this.app,

      // Inspectors
      state: this.stateInspector,
      events: this.eventInspector,
      perf: this.performanceInspector,
      logger: this.logger,

      // Quick commands
      getState: () => this.stateInspector.getSnapshot(),
      watchState: (path, cb) => this.stateInspector.watch(path, cb),

      startRecording: (filter) => this.eventInspector.startRecording(filter),
      stopRecording: () => this.eventInspector.stopRecording(),
      getEvents: (limit) => this.eventInspector.getRecordedEvents(limit),

      getMetrics: () => globalMetrics.getSummary(),
      getSlowOps: (threshold) => this.performanceInspector.getSlowOperations(threshold),

      snapshot: (label) => this.performanceInspector.snapshot(label),
      compareMemory: (i1, i2) => this.performanceInspector.compareMemory(i1, i2),

      getFPS: () => this.fpsMonitor.getFPS(),
      getAvgFPS: () => this.fpsMonitor.getAverageFPS(),

      // Print reports
      printState: () => this.stateInspector.print(),
      printEvents: () => this.eventInspector.print(),
      printPerf: () => this.performanceInspector.print(),

      // Full report
      report: () => this.printFullReport(),
    };

    console.log("🔍 Debug Dashboard initialized");
    console.log("Available commands:");
    console.log("  __DEBUG__.getState()       - Get state snapshot");
    console.log("  __DEBUG__.startRecording() - Start recording events");
    console.log("  __DEBUG__.stopRecording()  - Stop recording events");
    console.log("  __DEBUG__.getEvents()      - Get recorded events");
    console.log("  __DEBUG__.getMetrics()     - Get performance metrics");
    console.log("  __DEBUG__.snapshot()       - Take memory snapshot");
    console.log("  __DEBUG__.getFPS()         - Get current FPS");
    console.log("  __DEBUG__.report()         - Full debug report");
  }

  /**
   * Print full debug report
   */
  printFullReport() {
    console.group("🔍 Chat Juicer Debug Report");

    console.group("Application State");
    this.stateInspector.print();
    console.groupEnd();

    console.group("Event Bus");
    console.log("Snapshot:", this.app.eventBus.getDebugSnapshot());
    console.groupEnd();

    console.group("Performance");
    this.performanceInspector.print();
    console.log(`FPS: ${this.fpsMonitor.getFPS()} (avg: ${this.fpsMonitor.getAverageFPS()})`);
    console.groupEnd();

    console.group("Plugins");
    if (this.app.pluginRegistry) {
      console.log(this.app.pluginRegistry.getDebugSnapshot());
    }
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.fpsMonitor.stop();
    this.eventInspector.stopRecording();
  }
}

// Export global logger
export const debugLogger = new DebugLogger({
  enabled: import.meta.env.DEV,
});
