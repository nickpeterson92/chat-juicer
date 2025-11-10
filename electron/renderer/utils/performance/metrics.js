/**
 * Performance Metrics - Track and analyze app performance
 */

/**
 * Performance metric entry
 * @typedef {Object} Metric
 * @property {string} name - Metric name
 * @property {number} value - Metric value
 * @property {string} unit - Unit (ms, bytes, count, etc.)
 * @property {number} timestamp - When metric was recorded
 * @property {Object} metadata - Additional metadata
 */

export class PerformanceMetrics {
  constructor(options = {}) {
    this.metrics = [];
    this.timers = new Map();
    this.counters = new Map();
    this.maxMetrics = options.maxMetrics || 1000;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Record a metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {string} unit - Unit (ms, bytes, count, etc.)
   * @param {Object} metadata - Additional metadata
   */
  record(name, value, unit = "count", metadata = {}) {
    if (!this.enabled) return;

    const metric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      metadata,
    };

    this.metrics.push(metric);

    // Keep metrics bounded
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // NOTE: Do NOT emit to EventBus here to avoid infinite loop
    // MetricsBridgePlugin handles EventBus → record() direction
    // If plugins want to emit metrics, they should emit to EventBus directly
  }

  /**
   * Start a timer
   * @param {string} name - Timer name
   * @param {Object} metadata - Additional metadata
   */
  startTimer(name, metadata = {}) {
    if (!this.enabled) return;

    this.timers.set(name, {
      start: performance.now(),
      metadata,
    });
  }

  /**
   * End a timer and record duration
   * @param {string} name - Timer name
   * @param {Object} additionalMetadata - Additional metadata
   * @returns {number} Duration in ms
   */
  endTimer(name, additionalMetadata = {}) {
    if (!this.enabled) return 0;

    const timer = this.timers.get(name);
    if (!timer) {
      console.warn(`[PerformanceMetrics] Timer ${name} not found`);
      return 0;
    }

    const duration = performance.now() - timer.start;
    this.record(name, duration, "ms", {
      ...timer.metadata,
      ...additionalMetadata,
    });

    this.timers.delete(name);
    return duration;
  }

  /**
   * Measure function execution time
   * @param {string} name - Metric name
   * @param {Function} fn - Function to measure
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<*>} Function result
   */
  async measure(name, fn, metadata = {}) {
    if (!this.enabled) {
      return await fn();
    }

    this.startTimer(name, metadata);
    try {
      const result = await fn();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name, { error: error.message });
      throw error;
    }
  }

  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {number} amount - Amount to increment (default: 1)
   */
  increment(name, amount = 1) {
    if (!this.enabled) return;

    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + amount);
  }

  /**
   * Get counter value
   * @param {string} name - Counter name
   * @returns {number}
   */
  getCounter(name) {
    return this.counters.get(name) || 0;
  }

  /**
   * Reset counter
   * @param {string} name - Counter name
   */
  resetCounter(name) {
    this.counters.delete(name);
  }

  /**
   * Get metrics by name
   * @param {string} name - Metric name
   * @param {number} limit - Max results
   * @returns {Array<Metric>}
   */
  getMetrics(name, limit = 100) {
    return this.metrics.filter((m) => m.name === name).slice(-limit);
  }

  /**
   * Get all metrics
   * @param {number} limit - Max results
   * @returns {Array<Metric>}
   */
  getAllMetrics(limit = 100) {
    return this.metrics.slice(-limit);
  }

  /**
   * Get metric statistics
   * @param {string} name - Metric name
   * @returns {Object} Stats (avg, min, max, count)
   */
  getStats(name) {
    const metrics = this.getMetrics(name);
    if (metrics.length === 0) {
      return {
        count: 0,
        avg: 0,
        min: 0,
        max: 0,
        sum: 0,
      };
    }

    const values = metrics.map((m) => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      count: metrics.length,
      avg,
      min,
      max,
      sum,
      unit: metrics[0].unit,
    };
  }

  /**
   * Get percentile
   * @param {string} name - Metric name
   * @param {number} percentile - Percentile (0-100)
   * @returns {number}
   */
  getPercentile(name, percentile) {
    const metrics = this.getMetrics(name);
    if (metrics.length === 0) return 0;

    const values = metrics.map((m) => m.value).sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * values.length);
    return values[index] || 0;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = [];
    this.timers.clear();
    this.counters.clear();
  }

  /**
   * Export metrics as JSON
   * @returns {Object}
   */
  export() {
    return {
      metrics: this.metrics,
      counters: Array.from(this.counters.entries()),
      timestamp: Date.now(),
    };
  }

  /**
   * Get performance summary
   * @returns {Object}
   */
  getSummary() {
    const metricNames = [...new Set(this.metrics.map((m) => m.name))];
    const summary = {};

    for (const name of metricNames) {
      summary[name] = this.getStats(name);
    }

    return {
      metrics: summary,
      counters: Array.from(this.counters.entries()),
      totalMetrics: this.metrics.length,
      activeTimers: this.timers.size,
    };
  }

  /**
   * Enable metrics collection
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable metrics collection
   */
  disable() {
    this.enabled = false;
  }
}

/**
 * Browser Performance API wrapper
 */
export class BrowserPerformance {
  /**
   * Get navigation timing
   * @returns {Object}
   */
  static getNavigationTiming() {
    if (!performance.timing) return null;

    const timing = performance.timing;
    return {
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
      loadComplete: timing.loadEventEnd - timing.navigationStart,
      domReady: timing.domInteractive - timing.navigationStart,
      responseTime: timing.responseEnd - timing.requestStart,
    };
  }

  /**
   * Get memory info (Chrome only)
   * @returns {Object|null}
   */
  static getMemoryInfo() {
    if (!performance.memory) return null;

    return {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      usedPercentage: ((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100).toFixed(2),
    };
  }

  /**
   * Get resource timing
   * @param {string} type - Resource type (script, stylesheet, fetch, etc.)
   * @returns {Array}
   */
  static getResourceTiming(type = null) {
    const entries = performance.getEntriesByType("resource");

    if (type) {
      return entries.filter((e) => e.initiatorType === type);
    }

    return entries;
  }

  /**
   * Get mark timing
   * @param {string} name - Mark name
   * @returns {PerformanceEntry|null}
   */
  static getMark(name) {
    const marks = performance.getEntriesByName(name, "mark");
    return marks[0] || null;
  }

  /**
   * Create performance mark
   * @param {string} name - Mark name
   */
  static mark(name) {
    performance.mark(name);
  }

  /**
   * Measure between marks
   * @param {string} name - Measure name
   * @param {string} startMark - Start mark name
   * @param {string} endMark - End mark name
   * @returns {number} Duration in ms
   */
  static measure(name, startMark, endMark) {
    performance.measure(name, startMark, endMark);
    const measure = performance.getEntriesByName(name, "measure")[0];
    return measure ? measure.duration : 0;
  }

  /**
   * Clear performance data
   */
  static clear() {
    performance.clearMarks();
    performance.clearMeasures();
    performance.clearResourceTimings();
  }
}

/**
 * FPS Monitor
 */
export class FPSMonitor {
  constructor(sampleSize = 60) {
    this.sampleSize = sampleSize;
    this.frames = [];
    this.lastFrameTime = performance.now();
    this.running = false;
    this.rafId = null;
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.running) return;

    this.running = true;
    this.lastFrameTime = performance.now();
    this.tick();
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Tick function
   * @private
   */
  tick() {
    if (!this.running) return;

    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;

    const fps = 1000 / delta;
    this.frames.push(fps);

    if (this.frames.length > this.sampleSize) {
      this.frames.shift();
    }

    this.rafId = requestAnimationFrame(() => this.tick());
  }

  /**
   * Get current FPS
   * @returns {number}
   */
  getFPS() {
    if (this.frames.length === 0) return 0;
    return Math.round(this.frames[this.frames.length - 1]);
  }

  /**
   * Get average FPS
   * @returns {number}
   */
  getAverageFPS() {
    if (this.frames.length === 0) return 0;
    const sum = this.frames.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.frames.length);
  }

  /**
   * Get min FPS
   * @returns {number}
   */
  getMinFPS() {
    if (this.frames.length === 0) return 0;
    return Math.round(Math.min(...this.frames));
  }
}

// Global instance
export const globalMetrics = new PerformanceMetrics({
  enabled: import.meta.env.DEV,
});
