/**
 * EventBus Edge Case Tests
 * Tests real-world edge cases and error scenarios
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../../electron/renderer/core/event-bus.js";

describe("EventBus Edge Cases", () => {
  let eventBus;
  let consoleErrorSpy;

  beforeEach(() => {
    eventBus = new EventBus();
    // Suppress console.error during tests
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    eventBus.off();
    consoleErrorSpy.mockRestore();
  });

  describe("Error Handler Failures", () => {
    it("should not crash if error handler itself throws", () => {
      // Create EventBus with broken error handler
      const brokenErrorHandler = vi.fn(() => {
        throw new Error("Error handler failed");
      });
      const bus = new EventBus({ errorHandler: brokenErrorHandler });

      // Register handler that throws
      bus.on("test:error", () => {
        throw new Error("Original error");
      });

      // Should not throw even though both handler and error handler throw
      expect(() => bus.emit("test:error", {})).not.toThrow();

      // Broken error handler should have been called
      expect(brokenErrorHandler).toHaveBeenCalledTimes(1);
    });

    it("should fall back to console.error if error handler throws", () => {
      const brokenErrorHandler = () => {
        throw new Error("Error handler crashed");
      };
      const bus = new EventBus({ errorHandler: brokenErrorHandler });

      bus.on("test:event", () => {
        throw new Error("Handler error");
      });

      bus.emit("test:event", {});

      // Should have logged to console as fallback
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should handle error handler returning non-void values", () => {
      const weirdErrorHandler = vi.fn(() => {
        return "weird return value";
      });
      const bus = new EventBus({ errorHandler: weirdErrorHandler });

      bus.on("test:event", () => {
        throw new Error("Test error");
      });

      expect(() => bus.emit("test:event", {})).not.toThrow();
      expect(weirdErrorHandler).toHaveBeenCalled();
    });
  });

  describe("Listener Removal During Emit", () => {
    it("should handle listener removing itself during emit", () => {
      let unsubscribe;
      const selfRemovingHandler = vi.fn(() => {
        // Remove self during execution
        unsubscribe();
      });

      unsubscribe = eventBus.on("test:self-remove", selfRemovingHandler);

      // First emit - handler runs and removes itself
      eventBus.emit("test:self-remove", {});
      expect(selfRemovingHandler).toHaveBeenCalledTimes(1);

      // Second emit - handler should not run (already removed)
      eventBus.emit("test:self-remove", {});
      expect(selfRemovingHandler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it("should handle listener removing other listeners during emit", () => {
      let unsubscribe2;

      const handler1 = vi.fn(() => {
        // Handler 1 removes handler 2
        unsubscribe2();
      });

      const handler2 = vi.fn();

      eventBus.on("test:remove-others", handler1);
      unsubscribe2 = eventBus.on("test:remove-others", handler2);

      // First emit - both handlers registered, handler1 removes handler2
      eventBus.emit("test:remove-others", {});

      // Handler 2 might or might not run depending on iteration order
      // But it should definitely not run on second emit
      const handler2CallsAfterFirst = handler2.mock.calls.length;

      // Second emit - handler2 should definitely not run
      eventBus.emit("test:remove-others", {});

      expect(handler2.mock.calls.length).toBe(handler2CallsAfterFirst); // No new calls
      expect(handler1).toHaveBeenCalledTimes(2); // Handler1 runs both times
    });

    it("should handle off() called with specific event during emit", () => {
      const handler = vi.fn(() => {
        // Remove all listeners for this event
        eventBus.off("test:remove-all");
      });

      eventBus.on("test:remove-all", handler);

      // Should not crash
      expect(() => eventBus.emit("test:remove-all", {})).not.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);

      // Second emit - no handlers left
      eventBus.emit("test:remove-all", {});
      expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe("Wildcard Listener Edge Cases", () => {
    it("should deliver event to wildcard listener even if regular handler throws", () => {
      const wildcardHandler = vi.fn();
      const throwingHandler = vi.fn(() => {
        throw new Error("Handler error");
      });

      eventBus.on("*", wildcardHandler);
      eventBus.on("test:error", throwingHandler);

      eventBus.emit("test:error", { value: 42 });

      // Both should have been called
      expect(throwingHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "test:error",
          data: { value: 42 },
        })
      );
    });

    it("should handle wildcard listener removing itself", () => {
      let unsubscribe;
      const selfRemovingWildcard = vi.fn(() => {
        unsubscribe();
      });

      unsubscribe = eventBus.on("*", selfRemovingWildcard);

      eventBus.emit("test:event1", {});
      expect(selfRemovingWildcard).toHaveBeenCalledTimes(1);

      // Should not receive second event
      eventBus.emit("test:event2", {});
      expect(selfRemovingWildcard).toHaveBeenCalledTimes(1);
    });

    it("should handle error in wildcard listener", () => {
      const wildcardHandler = vi.fn(() => {
        throw new Error("Wildcard error");
      });
      const normalHandler = vi.fn();

      eventBus.on("*", wildcardHandler);
      eventBus.on("test:event", normalHandler);

      // Should not throw, both handlers should run
      expect(() => eventBus.emit("test:event", {})).not.toThrow();
      expect(wildcardHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });
  });

  describe("Once Listener Edge Cases", () => {
    it("should handle once listener removing itself explicitly", () => {
      let unsubscribe;
      const onceHandler = vi.fn(() => {
        // Trying to unsubscribe an already-auto-unsubscribing listener
        unsubscribe();
      });

      unsubscribe = eventBus.once("test:once", onceHandler);

      // Should not crash
      expect(() => eventBus.emit("test:once", {})).not.toThrow();
      expect(onceHandler).toHaveBeenCalledTimes(1);

      // Second emit - should not run
      eventBus.emit("test:once", {});
      expect(onceHandler).toHaveBeenCalledTimes(1);
    });

    it("should handle once listener that throws", () => {
      const onceHandler = vi.fn(() => {
        throw new Error("Once handler error");
      });

      eventBus.once("test:once-error", onceHandler);

      // Should not throw
      expect(() => eventBus.emit("test:once-error", {})).not.toThrow();
      expect(onceHandler).toHaveBeenCalledTimes(1);

      // Should be removed even though it threw
      eventBus.emit("test:once-error", {});
      expect(onceHandler).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe("Async Emit Edge Cases", () => {
    it("should handle error in async emitted event", async () => {
      const handler = vi.fn(() => {
        throw new Error("Async error");
      });

      eventBus.on("test:async-error", handler);

      // Should not throw
      await expect(eventBus.emitAsync("test:async-error", {})).resolves.not.toThrow();
      expect(handler).toHaveBeenCalled();
    });

    it("should handle listener removal before async emit executes", async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on("test:async-remove", handler);

      // Queue async emit
      const emitPromise = eventBus.emitAsync("test:async-remove", {});

      // Remove listener before emit executes
      unsubscribe();

      // Await the emit
      await emitPromise;

      // Handler should not have run (removed before setTimeout callback)
      expect(handler).toHaveBeenCalledTimes(0);
    });
  });

  describe("Event Data Edge Cases", () => {
    it("should handle null event data", () => {
      const handler = vi.fn();
      eventBus.on("test:null", handler);

      expect(() => eventBus.emit("test:null", null)).not.toThrow();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "test:null",
          data: null,
        })
      );
    });

    it("should handle undefined event data", () => {
      const handler = vi.fn();
      eventBus.on("test:undefined", handler);

      expect(() => eventBus.emit("test:undefined", undefined)).not.toThrow();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "test:undefined",
          data: undefined,
        })
      );
    });

    it("should handle circular reference in event data", () => {
      const handler = vi.fn();
      eventBus.on("test:circular", handler);

      const circular = { a: 1 };
      circular.self = circular; // Circular reference

      // Should not crash
      expect(() => eventBus.emit("test:circular", circular)).not.toThrow();
      expect(handler).toHaveBeenCalled();
    });
  });
});
