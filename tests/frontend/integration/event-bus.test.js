/**
 * Integration Tests - EventBus System
 * Tests the EventBus core functionality and event-driven architecture
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus, ScopedEventBus } from "../../../electron/renderer/core/event-bus.js";

describe("EventBus Integration Tests", () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus({ debug: true });
  });

  afterEach(() => {
    eventBus.off(); // Clear all listeners
  });

  describe("Basic Event Emission", () => {
    it("should emit and receive events", () => {
      const handler = vi.fn();

      eventBus.on("test:event", handler);
      eventBus.emit("test:event", { message: "Hello" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "test:event",
          data: { message: "Hello" },
        })
      );
    });

    it("should handle multiple listeners for same event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.on("test:multi", handler1);
      eventBus.on("test:multi", handler2);
      eventBus.on("test:multi", handler3);

      eventBus.emit("test:multi", { data: "test" });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it("should not call unsubscribed handlers", () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.on("test:unsub", handler);
      unsubscribe();

      eventBus.emit("test:unsub", {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Priority Handling", () => {
    it("should execute handlers in priority order", () => {
      const calls = [];

      eventBus.on("test:priority", () => calls.push("low"), { priority: 0 });
      eventBus.on("test:priority", () => calls.push("high"), { priority: 10 });
      eventBus.on("test:priority", () => calls.push("medium"), { priority: 5 });

      eventBus.emit("test:priority", {});

      expect(calls).toEqual(["high", "medium", "low"]);
    });
  });

  describe("Once Listeners", () => {
    it("should call once listener only once", () => {
      const handler = vi.fn();

      eventBus.once("test:once", handler);

      eventBus.emit("test:once", {});
      eventBus.emit("test:once", {});
      eventBus.emit("test:once", {});

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should allow unsubscribing once listener", () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.once("test:once-unsub", handler);
      unsubscribe();

      eventBus.emit("test:once-unsub", {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Wildcard Listeners", () => {
    it("should receive all events with wildcard", () => {
      const handler = vi.fn();

      eventBus.on("*", handler);

      eventBus.emit("test:event1", { data: 1 });
      eventBus.emit("test:event2", { data: 2 });
      eventBus.emit("test:event3", { data: 3 });

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("should receive specific events and wildcard", () => {
      const specificHandler = vi.fn();
      const wildcardHandler = vi.fn();

      eventBus.on("test:specific", specificHandler);
      eventBus.on("*", wildcardHandler);

      eventBus.emit("test:specific", { data: "test" });

      expect(specificHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    it("should catch handler errors and continue", () => {
      const errorHandler = vi.fn(() => {
        throw new Error("Handler error");
      });
      const successHandler = vi.fn();

      eventBus.on("test:error", errorHandler);
      eventBus.on("test:error", successHandler);

      expect(() => eventBus.emit("test:error", {})).not.toThrow();
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledTimes(1);
    });

    it("should call error handler on exceptions", () => {
      const customErrorHandler = vi.fn();
      const bus = new EventBus({ errorHandler: customErrorHandler });

      bus.on("test:error", () => {
        throw new Error("Test error");
      });

      bus.emit("test:error", {});

      expect(customErrorHandler).toHaveBeenCalledTimes(1);
      expect(customErrorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ event: "test:error" }),
        expect.any(Function)
      );
    });
  });

  describe("Event Log", () => {
    it("should log events when debug enabled", () => {
      const bus = new EventBus({ debug: true });

      bus.emit("test:log1", { data: 1 });
      bus.emit("test:log2", { data: 2 });

      const log = bus.getEventLog();
      expect(log.length).toBe(2);
      expect(log[0].event).toBe("test:log1");
      expect(log[1].event).toBe("test:log2");
    });

    it("should bound event log size", () => {
      const bus = new EventBus({ debug: true, maxLogSize: 5 });

      for (let i = 0; i < 10; i++) {
        bus.emit(`test:log${i}`, {});
      }

      const log = bus.getEventLog();
      expect(log.length).toBe(5);
      expect(log[0].event).toBe("test:log5");
      expect(log[4].event).toBe("test:log9");
    });

    it("should clear event log", () => {
      const bus = new EventBus({ debug: true });

      bus.emit("test:log", {});
      expect(bus.getEventLog().length).toBe(1);

      bus.clearEventLog();
      expect(bus.getEventLog().length).toBe(0);
    });
  });

  describe("Async Emission", () => {
    it("should emit events asynchronously", async () => {
      const handler = vi.fn();

      eventBus.on("test:async", handler);

      await eventBus.emitAsync("test:async", { data: "async" });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Listener Count", () => {
    it("should return correct listener count", () => {
      expect(eventBus.listenerCount("test:count")).toBe(0);

      eventBus.on("test:count", () => {});
      expect(eventBus.listenerCount("test:count")).toBe(1);

      eventBus.on("test:count", () => {});
      expect(eventBus.listenerCount("test:count")).toBe(2);

      eventBus.once("test:count", () => {});
      expect(eventBus.listenerCount("test:count")).toBe(3);
    });

    it("should check if event has listeners", () => {
      expect(eventBus.hasListeners("test:has")).toBe(false);

      eventBus.on("test:has", () => {});
      expect(eventBus.hasListeners("test:has")).toBe(true);
    });
  });

  describe("Off Method", () => {
    it("should remove all listeners for event", () => {
      eventBus.on("test:off", () => {});
      eventBus.on("test:off", () => {});
      expect(eventBus.listenerCount("test:off")).toBe(2);

      eventBus.off("test:off");
      expect(eventBus.listenerCount("test:off")).toBe(0);
    });

    it("should remove all listeners when no event specified", () => {
      eventBus.on("test:off1", () => {});
      eventBus.on("test:off2", () => {});
      eventBus.on("test:off3", () => {});

      eventBus.off();

      expect(eventBus.listenerCount("test:off1")).toBe(0);
      expect(eventBus.listenerCount("test:off2")).toBe(0);
      expect(eventBus.listenerCount("test:off3")).toBe(0);
    });
  });

  describe("Debug Snapshot", () => {
    it("should return debug snapshot", () => {
      eventBus.on("test:debug1", () => {});
      eventBus.on("test:debug2", () => {});
      eventBus.emit("test:debug1", {});

      const snapshot = eventBus.getDebugSnapshot();

      expect(snapshot.events).toContain("test:debug1");
      expect(snapshot.events).toContain("test:debug2");
      expect(snapshot.listenerCounts).toEqual(
        expect.arrayContaining([
          { event: "test:debug1", count: 1 },
          { event: "test:debug2", count: 1 },
        ])
      );
      expect(snapshot.recentEvents.length).toBeGreaterThan(0);
    });
  });
});

describe("ScopedEventBus Integration Tests", () => {
  let eventBus;
  let scopedBus;

  beforeEach(() => {
    eventBus = new EventBus();
    scopedBus = new ScopedEventBus(eventBus, "plugin");
  });

  afterEach(() => {
    eventBus.off();
  });

  it("should prefix events with scope", () => {
    const handler = vi.fn();

    eventBus.on("plugin:test", handler);
    scopedBus.emit("test", { data: "scoped" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "plugin:test",
        data: { data: "scoped" },
      })
    );
  });

  it("should listen to scoped events", () => {
    const handler = vi.fn();

    scopedBus.on("test", handler);
    eventBus.emit("plugin:test", { data: "test" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should not receive events from other scopes", () => {
    const handler = vi.fn();

    scopedBus.on("test", handler);
    eventBus.emit("other:test", {});

    expect(handler).not.toHaveBeenCalled();
  });
});
