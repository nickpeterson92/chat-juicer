/**
 * State Management Unit Tests
 * Tests for BoundedMap and AppState classes
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppState, BoundedMap } from "@/core/state.js";

describe("BoundedMap", () => {
  let boundedMap;

  beforeEach(() => {
    boundedMap = new BoundedMap(3); // Small size for easy testing
  });

  describe("constructor", () => {
    it("should initialize with default maxSize", () => {
      const map = new BoundedMap();

      expect(map.maxSize).toBe(100);
      expect(map.size).toBe(0);
      expect(map.nextOrder).toBe(0);
    });

    it("should initialize with custom maxSize", () => {
      const map = new BoundedMap(50);

      expect(map.maxSize).toBe(50);
    });
  });

  describe("set", () => {
    it("should add new key-value pair", () => {
      boundedMap.set("key1", "value1");

      expect(boundedMap.get("key1")).toBe("value1");
      expect(boundedMap.size).toBe(1);
    });

    it("should update existing key without changing size", () => {
      boundedMap.set("key1", "value1");
      boundedMap.set("key1", "value2");

      expect(boundedMap.get("key1")).toBe("value2");
      expect(boundedMap.size).toBe(1);
    });

    it("should track insertion order", () => {
      boundedMap.set("key1", "value1");
      boundedMap.set("key2", "value2");
      boundedMap.set("key3", "value3");

      expect(boundedMap.insertionOrder.get("key1")).toBe(0);
      expect(boundedMap.insertionOrder.get("key2")).toBe(1);
      expect(boundedMap.insertionOrder.get("key3")).toBe(2);
    });

    it("should evict oldest entry when at capacity", () => {
      boundedMap.set("key1", "value1");
      boundedMap.set("key2", "value2");
      boundedMap.set("key3", "value3");
      boundedMap.set("key4", "value4"); // Should evict key1

      expect(boundedMap.has("key1")).toBe(false);
      expect(boundedMap.has("key2")).toBe(true);
      expect(boundedMap.has("key3")).toBe(true);
      expect(boundedMap.has("key4")).toBe(true);
      expect(boundedMap.size).toBe(3);
    });

    it("should maintain correct size after multiple evictions", () => {
      boundedMap.set("key1", "value1");
      boundedMap.set("key2", "value2");
      boundedMap.set("key3", "value3");
      boundedMap.set("key4", "value4");
      boundedMap.set("key5", "value5");
      boundedMap.set("key6", "value6");

      expect(boundedMap.size).toBe(3);
      expect(boundedMap.has("key4")).toBe(true);
      expect(boundedMap.has("key5")).toBe(true);
      expect(boundedMap.has("key6")).toBe(true);
    });

    it("should not change insertion order when updating existing key", () => {
      boundedMap.set("key1", "value1");
      boundedMap.set("key2", "value2");
      const originalOrder = boundedMap.insertionOrder.get("key1");

      boundedMap.set("key1", "updated");

      expect(boundedMap.insertionOrder.get("key1")).toBe(originalOrder);
    });
  });

  describe("delete", () => {
    it("should delete key and update insertion order", () => {
      boundedMap.set("key1", "value1");
      boundedMap.set("key2", "value2");

      const result = boundedMap.delete("key1");

      expect(result).toBe(true);
      expect(boundedMap.has("key1")).toBe(false);
      expect(boundedMap.insertionOrder.has("key1")).toBe(false);
      expect(boundedMap.size).toBe(1);
    });

    it("should return false for non-existent key", () => {
      const result = boundedMap.delete("non-existent");

      expect(result).toBe(false);
    });

    it("should handle deleting from empty map", () => {
      const result = boundedMap.delete("key1");

      expect(result).toBe(false);
      expect(boundedMap.size).toBe(0);
    });
  });

  describe("clear", () => {
    it("should clear all entries", () => {
      boundedMap.set("key1", "value1");
      boundedMap.set("key2", "value2");
      boundedMap.set("key3", "value3");

      boundedMap.clear();

      expect(boundedMap.size).toBe(0);
      expect(boundedMap.insertionOrder.size).toBe(0);
    });

    it("should reset nextOrder counter", () => {
      boundedMap.set("key1", "value1");
      boundedMap.set("key2", "value2");

      boundedMap.clear();

      expect(boundedMap.nextOrder).toBe(0);
    });

    it("should allow adding new entries after clear", () => {
      boundedMap.set("key1", "value1");
      boundedMap.clear();

      boundedMap.set("key2", "value2");

      expect(boundedMap.get("key2")).toBe("value2");
      expect(boundedMap.size).toBe(1);
      expect(boundedMap.insertionOrder.get("key2")).toBe(0);
    });
  });
});

describe("AppState", () => {
  let appState;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Mock electronAPI globally
    window.electronAPI = { log: vi.fn() };

    appState = new AppState();
  });

  describe("constructor", () => {
    it("should initialize connection state", () => {
      expect(appState.connection).toEqual({
        status: "CONNECTED",
        isInitial: true,
        hasShownWelcome: false,
      });
    });

    it("should initialize message state", () => {
      expect(appState.message).toEqual({
        currentAssistant: null,
        assistantBuffer: "",
      });
    });

    it("should initialize functions state with BoundedMaps", () => {
      expect(appState.functions.activeCalls).toBeInstanceOf(BoundedMap);
      expect(appState.functions.argumentsBuffer).toBeInstanceOf(BoundedMap);
      expect(appState.functions.activeTimers).toBeInstanceOf(Set);
    });

    it("should initialize UI state with theme from localStorage", () => {
      localStorage.setItem("theme", "dark");
      const state = new AppState();

      expect(state.ui.theme).toBe("dark");
    });

    it("should default to light theme if not in localStorage", () => {
      expect(appState.ui.theme).toBe("light");
    });

    it("should initialize listeners map", () => {
      expect(appState.listeners).toBeInstanceOf(Map);
      expect(appState.listeners.size).toBe(0);
    });
  });

  describe("setState", () => {
    it("should set simple path value", () => {
      appState.setState("connection", { status: "DISCONNECTED" });

      expect(appState.connection).toEqual({ status: "DISCONNECTED" });
    });

    it("should set nested path value", () => {
      appState.setState("connection.status", "DISCONNECTED");

      expect(appState.connection.status).toBe("DISCONNECTED");
    });

    it("should set deeply nested path", () => {
      appState.setState("message.currentAssistant", "msg-123");

      expect(appState.message.currentAssistant).toBe("msg-123");
    });

    it("should notify listeners on state change", () => {
      const callback = vi.fn();
      appState.subscribe("connection.status", callback);

      appState.setState("connection.status", "DISCONNECTED");

      expect(callback).toHaveBeenCalledWith("DISCONNECTED", "CONNECTED", "connection.status");
    });

    it("should notify wildcard listeners", () => {
      const callback = vi.fn();
      appState.subscribe("*", callback);

      appState.setState("message.currentAssistant", "msg-123");

      expect(callback).toHaveBeenCalledWith({
        path: "message.currentAssistant",
        newValue: "msg-123",
        oldValue: null,
      });
    });
  });

  describe("getState", () => {
    it("should get simple path value", () => {
      const value = appState.getState("connection");

      expect(value).toEqual(appState.connection);
    });

    it("should get nested path value", () => {
      const value = appState.getState("connection.status");

      expect(value).toBe("CONNECTED");
    });

    it("should return undefined for non-existent path", () => {
      const value = appState.getState("non.existent.path");

      expect(value).toBeUndefined();
    });

    it("should handle deeply nested paths", () => {
      const value = appState.getState("ui.theme");

      expect(value).toBe("light");
    });
  });

  describe("subscribe", () => {
    it("should register callback for path", () => {
      const callback = vi.fn();

      appState.subscribe("connection.status", callback);

      expect(appState.listeners.has("connection.status")).toBe(true);
      expect(appState.listeners.get("connection.status").has(callback)).toBe(true);
    });

    it("should return unsubscribe function", () => {
      const callback = vi.fn();
      const unsubscribe = appState.subscribe("connection.status", callback);

      unsubscribe();

      appState.setState("connection.status", "DISCONNECTED");
      expect(callback).not.toHaveBeenCalled();
    });

    it("should allow multiple subscribers for same path", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      appState.subscribe("message.assistantBuffer", callback1);
      appState.subscribe("message.assistantBuffer", callback2);

      appState.setState("message.assistantBuffer", "Hello");

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it("should support wildcard subscriptions", () => {
      const callback = vi.fn();
      appState.subscribe("*", callback);

      appState.setState("connection.status", "ERROR");

      expect(callback).toHaveBeenCalledWith({
        path: "connection.status",
        newValue: "ERROR",
        oldValue: "CONNECTED",
      });
    });
  });

  describe("notifyListeners", () => {
    it("should call all registered listeners for path", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      appState.subscribe("test.path", callback1);
      appState.subscribe("test.path", callback2);

      appState.notifyListeners("test.path", "new", "old");

      expect(callback1).toHaveBeenCalledWith("new", "old", "test.path");
      expect(callback2).toHaveBeenCalledWith("new", "old", "test.path");
    });

    it("should call wildcard listeners", () => {
      const wildcardCallback = vi.fn();
      appState.subscribe("*", wildcardCallback);

      appState.notifyListeners("any.path", "new", "old");

      expect(wildcardCallback).toHaveBeenCalledWith({
        path: "any.path",
        newValue: "new",
        oldValue: "old",
      });
    });

    it("should not error if no listeners registered", () => {
      expect(() => {
        appState.notifyListeners("no.listeners", "new", "old");
      }).not.toThrow();
    });
  });

  describe("setConnectionStatus", () => {
    it("should allow valid transition from CONNECTED to DISCONNECTED", () => {
      appState.setConnectionStatus("DISCONNECTED");

      expect(appState.connection.status).toBe("DISCONNECTED");
    });

    it("should allow valid transition from CONNECTED to ERROR", () => {
      appState.setConnectionStatus("ERROR");

      expect(appState.connection.status).toBe("ERROR");
    });

    it("should allow valid transition from DISCONNECTED to RECONNECTING", () => {
      appState.setState("connection.status", "DISCONNECTED");

      appState.setConnectionStatus("RECONNECTING");

      expect(appState.connection.status).toBe("RECONNECTING");
    });

    it("should allow valid transition from RECONNECTING to CONNECTED", () => {
      appState.setState("connection.status", "RECONNECTING");

      appState.setConnectionStatus("CONNECTED");

      expect(appState.connection.status).toBe("CONNECTED");
    });

    it("should allow valid transition from ERROR to RECONNECTING", () => {
      appState.setState("connection.status", "ERROR");

      appState.setConnectionStatus("RECONNECTING");

      expect(appState.connection.status).toBe("RECONNECTING");
    });

    it("should skip transition if already in desired state", () => {
      const callback = vi.fn();
      appState.subscribe("connection.status", callback);

      appState.setConnectionStatus("CONNECTED");

      expect(callback).not.toHaveBeenCalled();
    });

    it("should reject invalid transition from CONNECTED to RECONNECTING", () => {
      const originalStatus = appState.connection.status;

      appState.setConnectionStatus("RECONNECTING");

      expect(appState.connection.status).toBe(originalStatus);
    });

    it("should reject invalid transition from DISCONNECTED to ERROR", () => {
      appState.setState("connection.status", "DISCONNECTED");

      appState.setConnectionStatus("ERROR");

      expect(appState.connection.status).toBe("DISCONNECTED");
    });

    it("should log warning for invalid transitions", () => {
      appState.setConnectionStatus("RECONNECTING");

      expect(window.electronAPI.log).toHaveBeenCalledWith(
        "warn",
        "Invalid state transition: CONNECTED -> RECONNECTING"
      );
    });
  });

  describe("Integration", () => {
    it("should handle complex state updates with subscriptions", () => {
      const messageCallback = vi.fn();
      const wildcardCallback = vi.fn();

      appState.subscribe("message.assistantBuffer", messageCallback);
      appState.subscribe("*", wildcardCallback);

      appState.setState("message.assistantBuffer", "Hello");
      appState.setState("message.currentAssistant", "msg-456");

      expect(messageCallback).toHaveBeenCalledTimes(1);
      expect(wildcardCallback).toHaveBeenCalledTimes(2);
    });

    it("should work with BoundedMap in functions state", () => {
      appState.functions.activeCalls.set("call-1", { name: "test" });
      appState.functions.activeCalls.set("call-2", { name: "test2" });

      expect(appState.functions.activeCalls.size).toBe(2);
      expect(appState.functions.activeCalls.get("call-1")).toEqual({ name: "test" });
    });

    it("should handle unsubscribe correctly", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = appState.subscribe("ui.theme", callback1);
      appState.subscribe("ui.theme", callback2);

      unsubscribe1();
      appState.setState("ui.theme", "dark");

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith("dark", "light", "ui.theme");
    });
  });
});
