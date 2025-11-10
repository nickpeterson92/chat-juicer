/**
 * Integration Tests - Performance Metrics
 * Tests the performance tracking and monitoring system
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BrowserPerformance,
  FPSMonitor,
  PerformanceMetrics,
} from "../../../electron/renderer/utils/performance/metrics.js";

describe("PerformanceMetrics Integration Tests", () => {
  let metrics;

  beforeEach(() => {
    metrics = new PerformanceMetrics({ enabled: true });
  });

  afterEach(() => {
    metrics.clear();
  });

  describe("Metric Recording", () => {
    it("should record a metric", () => {
      metrics.record("test:metric", 100, "ms");

      const recorded = metrics.getMetrics("test:metric");
      expect(recorded.length).toBe(1);
      expect(recorded[0].name).toBe("test:metric");
      expect(recorded[0].value).toBe(100);
      expect(recorded[0].unit).toBe("ms");
    });

    it("should record multiple metrics", () => {
      metrics.record("test:metric", 100, "ms");
      metrics.record("test:metric", 200, "ms");
      metrics.record("test:metric", 150, "ms");

      const recorded = metrics.getMetrics("test:metric");
      expect(recorded.length).toBe(3);
    });

    it("should include metadata in metrics", () => {
      metrics.record("test:metric", 100, "ms", { tag: "test" });

      const recorded = metrics.getMetrics("test:metric");
      expect(recorded[0].metadata).toEqual({ tag: "test" });
    });

    it("should not record when disabled", () => {
      metrics.disable();
      metrics.record("test:metric", 100, "ms");

      const recorded = metrics.getMetrics("test:metric");
      expect(recorded.length).toBe(0);
    });

    it("should bound metrics to max size", () => {
      const boundedMetrics = new PerformanceMetrics({
        enabled: true,
        maxMetrics: 5,
      });

      for (let i = 0; i < 10; i++) {
        boundedMetrics.record("test:metric", i, "count");
      }

      const all = boundedMetrics.getAllMetrics();
      expect(all.length).toBe(5);
      expect(all[0].value).toBe(5); // First is now index 5
      expect(all[4].value).toBe(9); // Last is index 9
    });
  });

  describe("Timer Operations", () => {
    it("should start and end timer", () => {
      metrics.startTimer("test:timer");

      // Simulate some work
      const start = performance.now();
      while (performance.now() - start < 10) {
        // Wait 10ms
      }

      const duration = metrics.endTimer("test:timer");

      expect(duration).toBeGreaterThan(5);
      const recorded = metrics.getMetrics("test:timer");
      expect(recorded.length).toBe(1);
      expect(recorded[0].value).toBeCloseTo(duration, 1);
    });

    it("should handle timer not found", () => {
      const duration = metrics.endTimer("non-existent");
      expect(duration).toBe(0);
    });

    it("should include metadata from start and end", () => {
      metrics.startTimer("test:timer", { startTag: "start" });
      metrics.endTimer("test:timer", { endTag: "end" });

      const recorded = metrics.getMetrics("test:timer");
      expect(recorded[0].metadata).toEqual({
        startTag: "start",
        endTag: "end",
      });
    });
  });

  describe("Measure Function", () => {
    it("should measure function execution", async () => {
      const testFn = () => {
        const start = performance.now();
        while (performance.now() - start < 10) {
          // Wait 10ms
        }
        return "result";
      };

      const result = await metrics.measure("test:measure", testFn);

      expect(result).toBe("result");
      const recorded = metrics.getMetrics("test:measure");
      expect(recorded.length).toBe(1);
      expect(recorded[0].value).toBeGreaterThan(5);
    });

    it("should measure async function execution", async () => {
      const asyncFn = () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve("async result"), 10);
        });
      };

      const result = await metrics.measure("test:async-measure", asyncFn);

      expect(result).toBe("async result");
      const recorded = metrics.getMetrics("test:async-measure");
      expect(recorded.length).toBe(1);
      expect(recorded[0].value).toBeGreaterThan(5);
    });

    it("should record error metadata on failure", async () => {
      const errorFn = () => {
        throw new Error("Test error");
      };

      await expect(metrics.measure("test:error", errorFn)).rejects.toThrow("Test error");

      const recorded = metrics.getMetrics("test:error");
      expect(recorded[0].metadata.error).toBe("Test error");
    });
  });

  describe("Counter Operations", () => {
    it("should increment counter", () => {
      metrics.increment("test:counter");
      expect(metrics.getCounter("test:counter")).toBe(1);

      metrics.increment("test:counter");
      expect(metrics.getCounter("test:counter")).toBe(2);
    });

    it("should increment by amount", () => {
      metrics.increment("test:counter", 5);
      expect(metrics.getCounter("test:counter")).toBe(5);

      metrics.increment("test:counter", 3);
      expect(metrics.getCounter("test:counter")).toBe(8);
    });

    it("should reset counter", () => {
      metrics.increment("test:counter", 10);
      expect(metrics.getCounter("test:counter")).toBe(10);

      metrics.resetCounter("test:counter");
      expect(metrics.getCounter("test:counter")).toBe(0);
    });

    it("should return 0 for non-existent counter", () => {
      expect(metrics.getCounter("non-existent")).toBe(0);
    });
  });

  describe("Statistics", () => {
    beforeEach(() => {
      metrics.record("test:stats", 100, "ms");
      metrics.record("test:stats", 200, "ms");
      metrics.record("test:stats", 150, "ms");
      metrics.record("test:stats", 300, "ms");
    });

    it("should calculate statistics", () => {
      const stats = metrics.getStats("test:stats");

      expect(stats.count).toBe(4);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(300);
      expect(stats.avg).toBe(187.5);
      expect(stats.sum).toBe(750);
      expect(stats.unit).toBe("ms");
    });

    it("should calculate percentiles", () => {
      const p50 = metrics.getPercentile("test:stats", 50);
      const p90 = metrics.getPercentile("test:stats", 90);
      const p99 = metrics.getPercentile("test:stats", 99);

      expect(p50).toBeGreaterThanOrEqual(100);
      expect(p50).toBeLessThanOrEqual(200);
      expect(p90).toBeGreaterThanOrEqual(200);
      expect(p99).toBeLessThanOrEqual(300);
    });

    it("should return 0 for empty metrics", () => {
      const stats = metrics.getStats("non-existent");

      expect(stats.count).toBe(0);
      expect(stats.avg).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });
  });

  describe("Export and Summary", () => {
    it("should export metrics as JSON", () => {
      metrics.record("test:export1", 100, "ms");
      metrics.record("test:export2", 200, "count");
      metrics.increment("test:counter", 5);

      const exported = metrics.export();

      expect(exported.metrics.length).toBe(2);
      expect(exported.counters.length).toBe(1);
      expect(exported.timestamp).toBeGreaterThan(0);
    });

    it("should generate summary", () => {
      metrics.record("test:summary1", 100, "ms");
      metrics.record("test:summary2", 200, "ms");
      metrics.increment("test:counter", 5);

      const summary = metrics.getSummary();

      expect(summary.metrics["test:summary1"]).toBeDefined();
      expect(summary.metrics["test:summary2"]).toBeDefined();
      expect(summary.counters).toContainEqual(["test:counter", 5]);
      expect(summary.totalMetrics).toBe(2);
    });
  });

  describe("Enable/Disable", () => {
    it("should enable metrics collection", () => {
      metrics.disable();
      metrics.record("test:disabled", 100, "ms");
      expect(metrics.getMetrics("test:disabled").length).toBe(0);

      metrics.enable();
      metrics.record("test:enabled", 100, "ms");
      expect(metrics.getMetrics("test:enabled").length).toBe(1);
    });
  });
});

describe("BrowserPerformance Integration Tests", () => {
  it("should get navigation timing", () => {
    const timing = BrowserPerformance.getNavigationTiming();

    if (timing) {
      expect(timing.domContentLoaded).toBeGreaterThanOrEqual(0);
      expect(timing.loadComplete).toBeGreaterThanOrEqual(0);
      expect(timing.domReady).toBeGreaterThanOrEqual(0);
      expect(timing.responseTime).toBeGreaterThanOrEqual(0);
    }
  });

  it("should get memory info", () => {
    const memory = BrowserPerformance.getMemoryInfo();

    if (memory) {
      expect(memory.usedJSHeapSize).toBeGreaterThan(0);
      expect(memory.totalJSHeapSize).toBeGreaterThan(0);
      expect(memory.jsHeapSizeLimit).toBeGreaterThan(0);
      expect(memory.usedPercentage).toMatch(/^\d+\.\d+$/);
    }
  });

  it("should create and measure marks", () => {
    BrowserPerformance.mark("test-start");
    BrowserPerformance.mark("test-end");

    const startMark = BrowserPerformance.getMark("test-start");
    const endMark = BrowserPerformance.getMark("test-end");

    expect(startMark).toBeDefined();
    expect(endMark).toBeDefined();
    expect(endMark.startTime).toBeGreaterThanOrEqual(startMark.startTime);
  });

  it("should measure between marks", () => {
    BrowserPerformance.mark("measure-start");

    // Simulate work
    const start = performance.now();
    while (performance.now() - start < 5) {}

    BrowserPerformance.mark("measure-end");

    const duration = BrowserPerformance.measure("test-measure", "measure-start", "measure-end");

    expect(duration).toBeGreaterThan(0);
  });
});

describe("FPSMonitor Integration Tests", () => {
  let fpsMonitor;

  beforeEach(() => {
    fpsMonitor = new FPSMonitor(10);
  });

  afterEach(() => {
    fpsMonitor.stop();
  });

  it("should start and stop monitoring", () => {
    expect(fpsMonitor.running).toBe(false);

    fpsMonitor.start();
    expect(fpsMonitor.running).toBe(true);

    fpsMonitor.stop();
    expect(fpsMonitor.running).toBe(false);
  });

  it("should measure FPS", (done) => {
    fpsMonitor.start();

    setTimeout(() => {
      const fps = fpsMonitor.getFPS();
      const avgFps = fpsMonitor.getAverageFPS();

      expect(fps).toBeGreaterThan(0);
      expect(avgFps).toBeGreaterThan(0);
      expect(fps).toBeLessThanOrEqual(60); // Should not exceed 60fps (typical max)

      fpsMonitor.stop();
      done();
    }, 100);
  });

  it("should track min FPS", (done) => {
    fpsMonitor.start();

    setTimeout(() => {
      const minFps = fpsMonitor.getMinFPS();
      const avgFps = fpsMonitor.getAverageFPS();

      expect(minFps).toBeGreaterThan(0);
      expect(minFps).toBeLessThanOrEqual(avgFps);

      fpsMonitor.stop();
      done();
    }, 100);
  });

  it("should not start twice", () => {
    fpsMonitor.start();
    const rafId1 = fpsMonitor.rafId;

    fpsMonitor.start();
    const rafId2 = fpsMonitor.rafId;

    expect(rafId1).toBe(rafId2);

    fpsMonitor.stop();
  });
});
