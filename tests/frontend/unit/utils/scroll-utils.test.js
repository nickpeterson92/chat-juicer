/**
 * Unit tests for Scroll utilities
 * Tests batched scroll operations using requestAnimationFrame
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Scroll Utilities", () => {
  let container;
  let rafCallbacks;
  let rafId;
  let scheduleScroll;

  beforeEach(async () => {
    // Reset modules to ensure clean state
    vi.resetModules();

    // Create container with scrollable content
    container = document.createElement("div");
    container.style.height = "100px";
    container.style.overflow = "auto";

    // Add content that exceeds container height
    const content = document.createElement("div");
    content.style.height = "500px";
    container.appendChild(content);

    document.body.appendChild(container);

    // Mock requestAnimationFrame to capture callbacks BEFORE importing module
    rafCallbacks = [];
    rafId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });

    // Import module AFTER mocking RAF
    const module = await import("@utils/scroll-utils.js");
    scheduleScroll = module.scheduleScroll;
  });

  afterEach(() => {
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    rafCallbacks = [];
    vi.restoreAllMocks();
  });

  // Helper to execute all pending animation frame callbacks
  function flushAnimationFrames() {
    const callbacks = rafCallbacks.slice();
    rafCallbacks = [];
    for (const cb of callbacks) {
      cb();
    }
  }

  describe("scheduleScroll", () => {
    it("should scroll container to bottom", () => {
      container.scrollTop = 0;

      scheduleScroll(container);

      // Execute captured callbacks
      flushAnimationFrames();

      expect(container.scrollTop).toBe(container.scrollHeight);
    });

    it("should use requestAnimationFrame for batching", () => {
      scheduleScroll(container);

      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });

    it("should batch multiple scroll requests", () => {
      // Schedule multiple scrolls
      scheduleScroll(container);
      scheduleScroll(container);
      scheduleScroll(container);

      // Should only call requestAnimationFrame once (batched)
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    });

    it("should scroll to latest target when batched", () => {
      const container1 = document.createElement("div");
      container1.style.height = "100px";
      container1.style.overflow = "auto";
      const content1 = document.createElement("div");
      content1.style.height = "300px";
      container1.appendChild(content1);

      const container2 = document.createElement("div");
      container2.style.height = "100px";
      container2.style.overflow = "auto";
      const content2 = document.createElement("div");
      content2.style.height = "400px";
      container2.appendChild(content2);

      document.body.appendChild(container1);
      document.body.appendChild(container2);

      container1.scrollTop = 0;
      container2.scrollTop = 0;

      // Schedule scrolls for both containers
      scheduleScroll(container1);
      scheduleScroll(container2);

      // Execute callbacks
      flushAnimationFrames();

      // Only container2 should be scrolled (latest target)
      expect(container2.scrollTop).toBe(container2.scrollHeight);

      // Cleanup
      container1.remove();
      container2.remove();
    });

    it("should handle null container gracefully", () => {
      expect(() => {
        scheduleScroll(null);
      }).not.toThrow();
    });

    it("should handle undefined container gracefully", () => {
      expect(() => {
        scheduleScroll(undefined);
      }).not.toThrow();
    });

    it("should allow new scroll after previous completes", () => {
      // First scroll
      scheduleScroll(container);
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

      // Complete first scroll
      flushAnimationFrames();

      // Second scroll (after first completes)
      scheduleScroll(container);
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    });
  });

  describe("Batching Optimization", () => {
    it("should prevent layout thrashing with multiple calls", () => {
      // Simulate rapid scroll requests
      for (let i = 0; i < 100; i++) {
        scheduleScroll(container);
      }

      // Should only trigger one animation frame (due to batching)
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    });

    it("should execute scroll on next frame", () => {
      container.scrollTop = 0;

      scheduleScroll(container);

      // Scroll should not execute immediately
      expect(container.scrollTop).toBe(0);

      // Execute callbacks
      flushAnimationFrames();

      // Scroll should execute after frame
      expect(container.scrollTop).toBe(container.scrollHeight);
    });
  });

  describe("Edge Cases", () => {
    it("should handle container without scroll", () => {
      const smallContainer = document.createElement("div");
      smallContainer.style.height = "100px";
      // Content smaller than container (no scroll)
      const smallContent = document.createElement("div");
      smallContent.style.height = "50px";
      smallContainer.appendChild(smallContent);

      document.body.appendChild(smallContainer);

      expect(() => {
        scheduleScroll(smallContainer);
        flushAnimationFrames();
      }).not.toThrow();

      smallContainer.remove();
    });

    it("should handle container removed from DOM", () => {
      const tempContainer = document.createElement("div");
      tempContainer.style.height = "100px";
      const content = document.createElement("div");
      content.style.height = "200px";
      tempContainer.appendChild(content);

      document.body.appendChild(tempContainer);
      tempContainer.remove();

      expect(() => {
        scheduleScroll(tempContainer);
        flushAnimationFrames();
      }).not.toThrow();
    });

    it("should handle rapid target changes", () => {
      const containers = [];

      for (let i = 0; i < 10; i++) {
        const c = document.createElement("div");
        c.style.height = "100px";
        c.style.overflow = "auto";
        const content = document.createElement("div");
        content.style.height = "500px";
        c.appendChild(content);
        document.body.appendChild(c);
        containers.push(c);
      }

      // Schedule scrolls rapidly
      for (const c of containers) {
        scheduleScroll(c);
      }

      // Execute callbacks
      flushAnimationFrames();

      // Only last container should be scrolled
      const lastContainer = containers[containers.length - 1];
      expect(lastContainer.scrollTop).toBe(lastContainer.scrollHeight);

      // Cleanup
      for (const c of containers) {
        c.remove();
      }
    });
  });
});
