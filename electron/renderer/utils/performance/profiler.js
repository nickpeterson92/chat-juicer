/**
 * Performance Profiler - Advanced profiling tools for development
 */

import { globalMetrics } from "./metrics.js";

/**
 * Function profiler decorator
 * @param {Object} options - Options { category, logThreshold }
 * @returns {Function} Decorator function
 */
export function profile(options = {}) {
  return (_target, propertyKey, descriptor) => {
    const originalMethod = descriptor.value;
    const category = options.category || "function";
    const logThreshold = options.logThreshold || 0;

    descriptor.value = async function (...args) {
      const metricName = `${category}:${propertyKey}`;
      const startTime = performance.now();

      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - startTime;

        // Record metric
        globalMetrics.record(metricName, duration, "ms");

        // Log if exceeds threshold
        if (duration > logThreshold) {
          console.warn(`[Profiler] ${metricName} took ${duration.toFixed(2)}ms (threshold: ${logThreshold}ms)`);
        }

        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        globalMetrics.record(metricName, duration, "ms", { error: true });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Profiling Session - Track multiple operations
 */
export class ProfilingSession {
  constructor(name) {
    this.name = name;
    this.startTime = performance.now();
    this.operations = [];
    this.active = true;
  }

  /**
   * Log an operation
   * @param {string} operation - Operation name
   * @param {Object} metadata - Additional data
   */
  log(operation, metadata = {}) {
    if (!this.active) return;

    this.operations.push({
      operation,
      timestamp: performance.now() - this.startTime,
      metadata,
    });
  }

  /**
   * End the session
   * @returns {Object} Session summary
   */
  end() {
    if (!this.active) return this.getSummary();

    this.active = false;
    this.endTime = performance.now();
    return this.getSummary();
  }

  /**
   * Get session summary
   * @returns {Object}
   */
  getSummary() {
    const duration = (this.endTime || performance.now()) - this.startTime;

    return {
      name: this.name,
      duration,
      operations: this.operations,
      operationCount: this.operations.length,
      active: this.active,
    };
  }

  /**
   * Print summary to console
   */
  print() {
    const summary = this.getSummary();
    console.group(`[Profiling Session] ${summary.name}`);
    console.log(`Duration: ${summary.duration.toFixed(2)}ms`);
    console.log(`Operations: ${summary.operationCount}`);
    console.table(summary.operations);
    console.groupEnd();
  }
}

/**
 * Memory Profiler
 */
export class MemoryProfiler {
  constructor() {
    this.snapshots = [];
  }

  /**
   * Take a memory snapshot
   * @param {string} label - Snapshot label
   */
  snapshot(label = "snapshot") {
    if (!performance.memory) {
      console.warn("[MemoryProfiler] performance.memory not available (Chrome only)");
      return null;
    }

    const snapshot = {
      label,
      timestamp: Date.now(),
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Compare two snapshots
   * @param {number} index1 - First snapshot index
   * @param {number} index2 - Second snapshot index
   * @returns {Object} Comparison
   */
  compare(index1 = 0, index2 = this.snapshots.length - 1) {
    const snap1 = this.snapshots[index1];
    const snap2 = this.snapshots[index2];

    if (!snap1 || !snap2) {
      console.error("[MemoryProfiler] Invalid snapshot indices");
      return null;
    }

    const diff = {
      usedDiff: snap2.usedJSHeapSize - snap1.usedJSHeapSize,
      totalDiff: snap2.totalJSHeapSize - snap1.totalJSHeapSize,
      timeDiff: snap2.timestamp - snap1.timestamp,
    };

    return {
      from: snap1.label,
      to: snap2.label,
      usedDiff: `${(diff.usedDiff / 1024 / 1024).toFixed(2)} MB`,
      totalDiff: `${(diff.totalDiff / 1024 / 1024).toFixed(2)} MB`,
      timeDiff: `${diff.timeDiff}ms`,
    };
  }

  /**
   * Clear all snapshots
   */
  clear() {
    this.snapshots = [];
  }

  /**
   * Get all snapshots
   * @returns {Array}
   */
  getSnapshots() {
    return this.snapshots.map((s) => ({
      ...s,
      usedJSHeapSizeMB: (s.usedJSHeapSize / 1024 / 1024).toFixed(2),
      totalJSHeapSizeMB: (s.totalJSHeapSize / 1024 / 1024).toFixed(2),
    }));
  }

  /**
   * Print memory report
   */
  print() {
    console.group("[MemoryProfiler] Report");
    console.table(this.getSnapshots());

    if (this.snapshots.length >= 2) {
      console.log("Comparison (first vs last):");
      console.log(this.compare(0, this.snapshots.length - 1));
    }

    console.groupEnd();
  }
}

/**
 * Render Profiler - Track render performance
 */
export class RenderProfiler {
  constructor() {
    this.renders = [];
    this.maxRenders = 100;
  }

  /**
   * Track a render
   * @param {string} component - Component name
   * @param {Function} renderFn - Render function
   * @returns {Promise<*>}
   */
  async trackRender(component, renderFn) {
    const startTime = performance.now();
    const startMark = `${component}-render-start`;
    const endMark = `${component}-render-end`;

    performance.mark(startMark);

    try {
      const result = await renderFn();

      performance.mark(endMark);
      const duration = performance.now() - startTime;

      this.renders.push({
        component,
        duration,
        timestamp: Date.now(),
        success: true,
      });

      // Keep bounded
      if (this.renders.length > this.maxRenders) {
        this.renders.shift();
      }

      // Warn on slow renders (>16ms = below 60fps)
      if (duration > 16) {
        console.warn(`[RenderProfiler] Slow render: ${component} took ${duration.toFixed(2)}ms (>16ms threshold)`);
      }

      return result;
    } catch (error) {
      performance.mark(endMark);
      const duration = performance.now() - startTime;

      this.renders.push({
        component,
        duration,
        timestamp: Date.now(),
        success: false,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Get render stats for component
   * @param {string} component - Component name
   * @returns {Object}
   */
  getStats(component) {
    const renders = this.renders.filter((r) => r.component === component);
    if (renders.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0 };
    }

    const durations = renders.map((r) => r.duration);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      count: renders.length,
      avg: sum / renders.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      failureRate: (renders.filter((r) => !r.success).length / renders.length) * 100,
    };
  }

  /**
   * Get all component stats
   * @returns {Object}
   */
  getAllStats() {
    const components = [...new Set(this.renders.map((r) => r.component))];
    const stats = {};

    for (const component of components) {
      stats[component] = this.getStats(component);
    }

    return stats;
  }

  /**
   * Print render report
   */
  print() {
    console.group("[RenderProfiler] Report");
    console.table(this.getAllStats());
    console.groupEnd();
  }
}

/**
 * Bundle Analyzer - Analyze bundle size
 */
export class BundleAnalyzer {
  /**
   * Get loaded modules/scripts
   * @returns {Array}
   */
  static getLoadedModules() {
    const resources = performance.getEntriesByType("resource");
    const scripts = resources.filter((r) => r.initiatorType === "script");

    return scripts.map((s) => ({
      name: s.name,
      size: s.transferSize,
      duration: s.duration,
      protocol: s.nextHopProtocol,
    }));
  }

  /**
   * Get total bundle size
   * @returns {Object}
   */
  static getTotalBundleSize() {
    const modules = BundleAnalyzer.getLoadedModules();
    const totalSize = modules.reduce((sum, m) => sum + m.size, 0);
    const totalDuration = modules.reduce((sum, m) => sum + m.duration, 0);

    return {
      totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
      totalDuration: `${totalDuration.toFixed(2)}ms`,
      moduleCount: modules.length,
      avgModuleSize: `${(totalSize / modules.length / 1024).toFixed(2)} KB`,
    };
  }

  /**
   * Get largest modules
   * @param {number} limit - Number of results
   * @returns {Array}
   */
  static getLargestModules(limit = 10) {
    const modules = BundleAnalyzer.getLoadedModules();
    return modules
      .sort((a, b) => b.size - a.size)
      .slice(0, limit)
      .map((m) => ({
        name: m.name.split("/").pop(),
        size: `${(m.size / 1024).toFixed(2)} KB`,
        duration: `${m.duration.toFixed(2)}ms`,
      }));
  }

  /**
   * Print bundle analysis
   */
  static print() {
    console.group("[BundleAnalyzer] Report");
    console.log("Total Bundle:", BundleAnalyzer.getTotalBundleSize());
    console.log("\nLargest Modules:");
    console.table(BundleAnalyzer.getLargestModules());
    console.groupEnd();
  }
}

/**
 * Performance Budget - Define and check performance budgets
 */
export class PerformanceBudget {
  constructor(budgets = {}) {
    this.budgets = {
      // Default budgets (can be overridden)
      messageRenderDuration: 16, // 60fps = 16ms
      sessionSwitchDuration: 500,
      fileUploadDuration: 2000,
      bundleSize: 500 * 1024, // 500KB
      memoryUsage: 50 * 1024 * 1024, // 50MB
      ...budgets,
    };
  }

  /**
   * Check if metric is within budget
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @returns {Object} Result { passed, budget, value, exceeded }
   */
  check(name, value) {
    const budget = this.budgets[name];
    if (budget === undefined) {
      return { passed: true, budget: null, value };
    }

    const passed = value <= budget;
    const exceeded = value - budget;

    return {
      passed,
      budget,
      value,
      exceeded: exceeded > 0 ? exceeded : 0,
      percentage: ((value / budget) * 100).toFixed(2),
    };
  }

  /**
   * Check all budgets against current metrics
   * @returns {Object} Results
   */
  checkAll() {
    const results = {};

    for (const [name, _budget] of Object.entries(this.budgets)) {
      // Get metric from globalMetrics
      const stats = globalMetrics.getStats(name);
      if (stats.count > 0) {
        results[name] = this.check(name, stats.avg);
      }
    }

    return results;
  }

  /**
   * Print budget report
   */
  print() {
    const results = this.checkAll();
    console.group("[PerformanceBudget] Report");

    for (const [name, result] of Object.entries(results)) {
      const status = result.passed ? "✅" : "❌";
      console.log(`${status} ${name}: ${result.value.toFixed(2)} / ${result.budget} (${result.percentage}%)`);
    }

    console.groupEnd();
  }
}

// Global profiler instances
export const globalMemoryProfiler = new MemoryProfiler();
export const globalRenderProfiler = new RenderProfiler();
export const globalPerformanceBudget = new PerformanceBudget();

// Export helper function to create profiling session
export function startProfilingSession(name) {
  return new ProfilingSession(name);
}
