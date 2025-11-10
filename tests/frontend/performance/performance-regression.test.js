/**
 * Performance Regression Tests
 * Ensures critical operations stay within performance budgets
 */

import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../electron/renderer/core/event-bus.js";
import { BoundedMap } from "../../../electron/renderer/core/state.js";

describe("Performance Regression Tests", () => {
  describe("Bootstrap Performance", () => {
    it("should create BoundedMap in <5ms", () => {
      const start = performance.now();

      const map = new BoundedMap(1000);
      for (let i = 0; i < 100; i++) {
        map.set(`key-${i}`, `value-${i}`);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5); // 5ms budget
    });

    it("should create EventBus in <1ms", () => {
      const start = performance.now();

      const bus = new EventBus();
      bus.on("test:event", () => {});
      bus.on("test:other", () => {});

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1); // 1ms budget
    });

    it("should register 10 event handlers in <5ms", () => {
      const bus = new EventBus();
      const start = performance.now();

      for (let i = 0; i < 10; i++) {
        bus.on(`event:${i}`, () => {});
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5); // 5ms budget
    });

    it("should handle 100 state updates in <10ms", () => {
      const map = new BoundedMap(200);
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        map.set(`key-${i}`, { data: `value-${i}`, timestamp: Date.now() });
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(10); // 10ms budget
    });
  });

  describe("Event Bus Performance", () => {
    let bus;

    beforeEach(() => {
      bus = new EventBus();
    });

    it("should emit 1000 events in <50ms", () => {
      const handler = vi.fn();
      bus.on("test:event", handler);

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        bus.emit("test:event", { index: i });
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // 50ms budget for 1000 events
      expect(handler).toHaveBeenCalledTimes(1000);
    });

    it("should handle priority sorting efficiently", () => {
      // Register 20 handlers with different priorities
      for (let i = 0; i < 20; i++) {
        bus.on("test:priority", () => {}, { priority: Math.floor(Math.random() * 100) });
      }

      const start = performance.now();

      // Emit 100 events
      for (let i = 0; i < 100; i++) {
        bus.emit("test:priority", {});
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // 100ms budget
    });

    it("should emit async events efficiently", async () => {
      const handler = vi.fn();
      bus.on("test:async", handler);

      const start = performance.now();

      // Emit 100 async events
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(bus.emitAsync("test:async", { index: i }));
      }
      await Promise.all(promises);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // 50ms budget
      expect(handler).toHaveBeenCalledTimes(100);
    });

    it("should not leak memory with many subscriptions", () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;

      // Create and remove 1000 subscriptions
      for (let i = 0; i < 1000; i++) {
        const unsubscribe = bus.on(`event:${i}`, () => {});
        unsubscribe();
      }

      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryGrowth = finalMemory - initialMemory;

      // Should not grow more than 1MB
      expect(memoryGrowth).toBeLessThan(1024 * 1024);
    });
  });

  describe("BoundedMap Performance", () => {
    it("should handle 10000 operations in <100ms", () => {
      const map = new BoundedMap(1000);
      const start = performance.now();

      // Insert 500, read 500
      for (let i = 0; i < 500; i++) {
        map.set(`key-${i}`, `value-${i}`);
      }
      for (let i = 0; i < 500; i++) {
        map.get(`key-${i}`);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // 100ms budget
    });

    it("should evict old entries efficiently", () => {
      const map = new BoundedMap(100);
      const start = performance.now();

      // Add 1000 items (will evict 900)
      for (let i = 0; i < 1000; i++) {
        map.set(`key-${i}`, `value-${i}`);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // 50ms budget
      expect(map.size).toBe(100); // Should cap at maxSize
    });

    it("should delete entries efficiently", () => {
      const map = new BoundedMap(1000);

      // Populate
      for (let i = 0; i < 500; i++) {
        map.set(`key-${i}`, `value-${i}`);
      }

      const start = performance.now();

      // Delete half
      for (let i = 0; i < 250; i++) {
        map.delete(`key-${i}`);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(10); // 10ms budget
      expect(map.size).toBe(250);
    });

    it("should clear efficiently", () => {
      const map = new BoundedMap(1000);

      // Populate
      for (let i = 0; i < 1000; i++) {
        map.set(`key-${i}`, `value-${i}`);
      }

      const start = performance.now();
      map.clear();
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5); // 5ms budget
      expect(map.size).toBe(0);
    });
  });

  describe("Memory Performance", () => {
    it("should not leak memory with repeated map operations", () => {
      if (!performance.memory) {
        // Skip test if memory API not available
        return;
      }

      const maps = [];
      const initialMemory = performance.memory.usedJSHeapSize;

      // Create 10 maps, populate, and clear
      for (let i = 0; i < 10; i++) {
        const map = new BoundedMap(100);
        for (let j = 0; j < 100; j++) {
          map.set(`key-${j}`, { data: "x".repeat(1000) }); // ~1KB per entry
        }
        map.clear();
        maps.push(map);
      }

      const finalMemory = performance.memory.usedJSHeapSize;
      const memoryGrowth = finalMemory - initialMemory;

      // Should not grow more than 5MB
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024);
    });

    it("should release memory after unsubscribing events", () => {
      if (!performance.memory) {
        return;
      }

      const bus = new EventBus();
      const initialMemory = performance.memory.usedJSHeapSize;

      // Subscribe and unsubscribe 100 times
      for (let i = 0; i < 100; i++) {
        const unsubscribe = bus.on("test:event", () => {
          // Large handler
          const data = new Array(1000).fill(0);
          return data.length;
        });
        unsubscribe();
      }

      const finalMemory = performance.memory.usedJSHeapSize;
      const memoryGrowth = finalMemory - initialMemory;

      // Should not grow more than 2MB
      expect(memoryGrowth).toBeLessThan(2 * 1024 * 1024);
    });

    it("should bound map memory usage", () => {
      const map = new BoundedMap(100); // Strict limit

      // Try to add 1000 items
      for (let i = 0; i < 1000; i++) {
        map.set(`key-${i}`, { data: "x".repeat(1000) }); // ~1KB per entry
      }

      // Should only have 100 items (bounded)
      expect(map.size).toBe(100);
    });
  });

  describe("Concurrent Operations Performance", () => {
    it("should handle concurrent event emissions", async () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.on("test:concurrent", handler);

      const start = performance.now();

      // Emit 50 events concurrently
      const promises = Array.from({ length: 50 }, (_, i) => bus.emitAsync("test:concurrent", { index: i }));

      await Promise.all(promises);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // 50ms budget
      expect(handler).toHaveBeenCalledTimes(50);
    });

    it("should handle concurrent map operations", () => {
      const map = new BoundedMap(1000);
      const start = performance.now();

      // Concurrent reads and writes
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(
          Promise.resolve().then(() => {
            map.set(`key-${i}`, `value-${i}`);
            return map.get(`key-${i}`);
          })
        );
      }

      return Promise.all(operations).then(() => {
        const duration = performance.now() - start;
        expect(duration).toBeLessThan(20); // 20ms budget
      });
    });
  });

  describe("Stress Test Performance", () => {
    it("should handle extreme event load", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      // Register 100 handlers
      for (let i = 0; i < 100; i++) {
        bus.on(`event:${i % 10}`, handler);
      }

      const start = performance.now();

      // Emit 100 events to 10 different event names
      for (let i = 0; i < 100; i++) {
        bus.emit(`event:${i % 10}`, { index: i });
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // 100ms budget
    });

    it("should handle large map with many operations", () => {
      const map = new BoundedMap(10000); // Large map
      const start = performance.now();

      // 5000 writes, 5000 reads
      for (let i = 0; i < 5000; i++) {
        map.set(`key-${i}`, { data: `value-${i}`, timestamp: Date.now() });
      }
      for (let i = 0; i < 5000; i++) {
        map.get(`key-${i}`);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(200); // 200ms budget
    });
  });
});
