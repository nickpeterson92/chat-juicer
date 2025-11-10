/**
 * Integration Tests - Analytics Adapter
 * Tests the analytics system and backends
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnalyticsAdapter,
  ConsoleAnalyticsBackend,
  ElectronIPCAnalyticsBackend,
  LocalStorageAnalyticsBackend,
} from "../../../electron/renderer/utils/analytics/analytics-adapter.js";

describe("ConsoleAnalyticsBackend Integration Tests", () => {
  let backend;
  let consoleSpy;

  beforeEach(() => {
    backend = new ConsoleAnalyticsBackend({ enabled: true });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("should track event to console", async () => {
    await backend.track({
      category: "test",
      action: "click",
      label: "button",
      value: 1,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "[Analytics] Event:",
      expect.objectContaining({
        category: "test",
        action: "click",
        label: "button",
        value: 1,
      })
    );
  });

  it("should track page view", async () => {
    await backend.trackPageView("home", { referrer: "welcome" });

    expect(consoleSpy).toHaveBeenCalledWith("[Analytics] PageView: home", {
      referrer: "welcome",
    });
  });

  it("should track error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Test error");

    await backend.trackError(error, { context: "test" });

    expect(errorSpy).toHaveBeenCalledWith(
      "[Analytics] Error:",
      expect.objectContaining({
        message: "Test error",
        stack: expect.any(String),
        metadata: { context: "test" },
      })
    );

    errorSpy.mockRestore();
  });

  it("should track timing", async () => {
    await backend.trackTiming("render", "component", 15, { fast: true });

    expect(consoleSpy).toHaveBeenCalledWith("[Analytics] Timing: render.component = 15ms", {
      fast: true,
    });
  });

  it("should not track when disabled", async () => {
    backend.disable();

    await backend.track({ category: "test", action: "test" });

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

describe("LocalStorageAnalyticsBackend Integration Tests", () => {
  let backend;

  beforeEach(() => {
    localStorage.clear();
    backend = new LocalStorageAnalyticsBackend({
      enabled: true,
      storageKey: "test_analytics",
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should store events in localStorage", async () => {
    await backend.track({
      category: "test",
      action: "click",
      label: "button",
    });

    const events = backend.getEvents();
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("test");
    expect(events[0].action).toBe("click");
    expect(events[0].label).toBe("button");
  });

  it("should store multiple events", async () => {
    await backend.track({ category: "test1", action: "action1" });
    await backend.track({ category: "test2", action: "action2" });
    await backend.track({ category: "test3", action: "action3" });

    const events = backend.getEvents();
    expect(events.length).toBe(3);
  });

  it("should bound event storage", async () => {
    const boundedBackend = new LocalStorageAnalyticsBackend({
      enabled: true,
      storageKey: "test_bounded",
      maxEvents: 5,
    });

    for (let i = 0; i < 10; i++) {
      await boundedBackend.track({
        category: "test",
        action: `action${i}`,
      });
    }

    const events = boundedBackend.getEvents();
    expect(events.length).toBe(5);
    expect(events[0].action).toBe("action5"); // First event should be index 5
  });

  it("should convert trackPageView to event", async () => {
    await backend.trackPageView("home", { referrer: "welcome" });

    const events = backend.getEvents();
    expect(events[0]).toMatchObject({
      category: "navigation",
      action: "page_view",
      label: "home",
      metadata: { referrer: "welcome" },
    });
  });

  it("should convert trackError to event", async () => {
    const error = new Error("Test error");
    await backend.trackError(error, { context: "test" });

    const events = backend.getEvents();
    expect(events[0]).toMatchObject({
      category: "error",
      action: "error_occurred",
      label: "Test error",
    });
    expect(events[0].metadata.stack).toBeDefined();
  });

  it("should convert trackTiming to event", async () => {
    await backend.trackTiming("render", "component", 15);

    const events = backend.getEvents();
    expect(events[0]).toMatchObject({
      category: "performance",
      action: "timing",
      label: "render.component",
      value: 15,
    });
  });

  it("should clear events", async () => {
    await backend.track({ category: "test", action: "action" });
    expect(backend.getEvents().length).toBe(1);

    backend.clearEvents();
    expect(backend.getEvents().length).toBe(0);
  });

  it("should export events", async () => {
    await backend.track({ category: "test1", action: "action1" });
    await backend.track({ category: "test2", action: "action2" });

    const exported = backend.exportEvents();
    expect(exported.length).toBe(2);
    expect(exported[0].category).toBe("test1");
    expect(exported[1].category).toBe("test2");
  });
});

describe("ElectronIPCAnalyticsBackend Integration Tests", () => {
  let backend;
  let electronAPIMock;

  beforeEach(() => {
    electronAPIMock = {
      log: vi.fn(),
    };
    window.electronAPI = electronAPIMock;
    backend = new ElectronIPCAnalyticsBackend({ enabled: true });
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  it("should send events to Electron IPC", async () => {
    await backend.track({
      category: "test",
      action: "click",
      label: "button",
    });

    expect(electronAPIMock.log).toHaveBeenCalledWith(
      "info",
      "analytics_event",
      expect.objectContaining({
        category: "test",
        action: "click",
        label: "button",
      })
    );
  });

  it("should not track if electronAPI not available", async () => {
    delete window.electronAPI;

    // Should not throw
    await expect(backend.track({ category: "test", action: "test" })).resolves.toBeUndefined();
  });

  it("should track page view via IPC", async () => {
    await backend.trackPageView("home");

    expect(electronAPIMock.log).toHaveBeenCalledWith(
      "info",
      "analytics_event",
      expect.objectContaining({
        category: "navigation",
        action: "page_view",
        label: "home",
      })
    );
  });

  it("should track error via IPC", async () => {
    const error = new Error("Test error");
    await backend.trackError(error);

    expect(electronAPIMock.log).toHaveBeenCalledWith(
      "info",
      "analytics_event",
      expect.objectContaining({
        category: "error",
        action: "error_occurred",
        label: "Test error",
      })
    );
  });
});

describe("AnalyticsAdapter Integration Tests", () => {
  let adapter;

  beforeEach(() => {
    adapter = new AnalyticsAdapter();
  });

  describe("Backend Management", () => {
    it("should add backend", () => {
      const backend = new ConsoleAnalyticsBackend();
      adapter.addBackend(backend);

      expect(adapter.getBackend("console")).toBe(backend);
    });

    it("should remove backend", () => {
      const backend = new ConsoleAnalyticsBackend();
      adapter.addBackend(backend);
      expect(adapter.getBackend("console")).toBe(backend);

      adapter.removeBackend("console");
      expect(adapter.getBackend("console")).toBeUndefined();
    });

    it("should get backend by name", () => {
      const backend1 = new ConsoleAnalyticsBackend();
      const backend2 = new LocalStorageAnalyticsBackend();

      adapter.addBackend(backend1);
      adapter.addBackend(backend2);

      expect(adapter.getBackend("console")).toBe(backend1);
      expect(adapter.getBackend("localStorage")).toBe(backend2);
    });
  });

  describe("Event Tracking", () => {
    it("should track event to all backends", async () => {
      const backend1 = {
        name: "backend1",
        track: vi.fn().mockResolvedValue(undefined),
      };
      const backend2 = {
        name: "backend2",
        track: vi.fn().mockResolvedValue(undefined),
      };

      adapter.addBackend(backend1);
      adapter.addBackend(backend2);

      await adapter.track("test", "click", "button", 1, { extra: "data" });

      expect(backend1.track).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "test",
          action: "click",
          label: "button",
          value: 1,
          metadata: { extra: "data" },
        })
      );
      expect(backend2.track).toHaveBeenCalled();
    });

    it("should track page view to all backends", async () => {
      const backend = {
        name: "test",
        trackPageView: vi.fn().mockResolvedValue(undefined),
      };

      adapter.addBackend(backend);
      await adapter.trackPageView("home", { referrer: "welcome" });

      expect(backend.trackPageView).toHaveBeenCalledWith("home", {
        referrer: "welcome",
      });
    });

    it("should track error to all backends", async () => {
      const backend = {
        name: "test",
        trackError: vi.fn().mockResolvedValue(undefined),
      };

      adapter.addBackend(backend);
      const error = new Error("Test error");
      await adapter.trackError(error, { context: "test" });

      expect(backend.trackError).toHaveBeenCalledWith(error, { context: "test" });
    });

    it("should track timing to all backends", async () => {
      const backend = {
        name: "test",
        trackTiming: vi.fn().mockResolvedValue(undefined),
      };

      adapter.addBackend(backend);
      await adapter.trackTiming("render", "component", 15, { fast: true });

      expect(backend.trackTiming).toHaveBeenCalledWith("render", "component", 15, {
        fast: true,
      });
    });

    it("should handle backend errors gracefully", async () => {
      const backend1 = {
        name: "backend1",
        track: vi.fn().mockRejectedValue(new Error("Backend error")),
      };
      const backend2 = {
        name: "backend2",
        track: vi.fn().mockResolvedValue(undefined),
      };

      adapter.addBackend(backend1);
      adapter.addBackend(backend2);

      // Should not throw
      await expect(adapter.track("test", "action", "label")).resolves.toBeUndefined();

      expect(backend2.track).toHaveBeenCalled();
    });

    it("should not track when disabled", async () => {
      const backend = {
        name: "test",
        track: vi.fn().mockResolvedValue(undefined),
      };

      adapter.addBackend(backend);
      adapter.disable();

      await adapter.track("test", "action", "label");

      expect(backend.track).not.toHaveBeenCalled();
    });
  });

  describe("Event Queue", () => {
    it("should queue events when no backends available", async () => {
      await adapter.track("test", "action1", "label1");
      await adapter.track("test", "action2", "label2");

      const snapshot = adapter.getDebugSnapshot();
      expect(snapshot.queueSize).toBe(2);
    });

    it("should flush queue when backend added", async () => {
      await adapter.track("test", "action1", "label1");
      await adapter.track("test", "action2", "label2");

      const backend = {
        name: "test",
        track: vi.fn().mockResolvedValue(undefined),
      };

      adapter.addBackend(backend);
      await adapter.flushQueue();

      expect(backend.track).toHaveBeenCalledTimes(2);
      expect(adapter.getDebugSnapshot().queueSize).toBe(0);
    });

    it("should bound queue size", async () => {
      const smallAdapter = new AnalyticsAdapter();
      smallAdapter.maxQueueSize = 5;

      for (let i = 0; i < 10; i++) {
        await smallAdapter.track("test", `action${i}`, "label");
      }

      expect(smallAdapter.getDebugSnapshot().queueSize).toBe(5);
    });
  });

  describe("Enable/Disable", () => {
    it("should enable and disable analytics", async () => {
      const backend = {
        name: "test",
        track: vi.fn().mockResolvedValue(undefined),
      };

      adapter.addBackend(backend);

      adapter.disable();
      await adapter.track("test", "action", "label");
      expect(backend.track).not.toHaveBeenCalled();

      adapter.enable();
      await adapter.track("test", "action", "label");
      expect(backend.track).toHaveBeenCalledTimes(1);
    });
  });

  describe("Debug Snapshot", () => {
    it("should return debug snapshot", () => {
      const backend1 = new ConsoleAnalyticsBackend();
      const backend2 = new LocalStorageAnalyticsBackend();

      adapter.addBackend(backend1);
      adapter.addBackend(backend2);

      const snapshot = adapter.getDebugSnapshot();

      expect(snapshot.enabled).toBe(true);
      expect(snapshot.backends).toContain("console");
      expect(snapshot.backends).toContain("localStorage");
      expect(snapshot.queueSize).toBe(0);
    });
  });
});
