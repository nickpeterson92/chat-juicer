/**
 * StorageAdapter Unit Tests
 *
 * Tests the StorageAdapter with mock Storage objects
 */

import { StorageAdapter } from "@adapters/StorageAdapter.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("StorageAdapter", () => {
  let adapter;
  let mockLocalStorage;
  let mockSessionStorage;

  beforeEach(() => {
    // Create mock storage objects
    mockLocalStorage = createMockStorage();
    mockSessionStorage = createMockStorage();

    adapter = new StorageAdapter(mockLocalStorage, mockSessionStorage);
  });

  describe("Constructor", () => {
    it("should initialize with provided storage objects", () => {
      expect(adapter.localStorage).toBe(mockLocalStorage);
      expect(adapter.sessionStorage).toBe(mockSessionStorage);
    });

    it("should warn when localStorage not available", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      new StorageAdapter(null, mockSessionStorage);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("No localStorage found"));

      consoleWarnSpy.mockRestore();
    });

    it("should warn when sessionStorage not available", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      new StorageAdapter(mockLocalStorage, null);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("No sessionStorage found"));

      consoleWarnSpy.mockRestore();
    });
  });

  describe("LocalStorage Operations", () => {
    it("should set and get item", () => {
      adapter.setLocal("key", "value");
      expect(adapter.getLocal("key")).toBe("value");
    });

    it("should return null for non-existent key", () => {
      expect(adapter.getLocal("does-not-exist")).toBeNull();
    });

    it("should remove item", () => {
      adapter.setLocal("key", "value");
      adapter.removeLocal("key");
      expect(adapter.getLocal("key")).toBeNull();
    });

    it("should clear all items", () => {
      adapter.setLocal("key1", "value1");
      adapter.setLocal("key2", "value2");
      adapter.clearLocal();

      expect(adapter.getLocal("key1")).toBeNull();
      expect(adapter.getLocal("key2")).toBeNull();
      expect(adapter.getLocalLength()).toBe(0);
    });

    it("should get length", () => {
      adapter.setLocal("key1", "value1");
      adapter.setLocal("key2", "value2");
      expect(adapter.getLocalLength()).toBe(2);
    });

    it("should get key by index", () => {
      adapter.setLocal("key1", "value1");
      adapter.setLocal("key2", "value2");

      const key0 = adapter.getLocalKey(0);
      const key1 = adapter.getLocalKey(1);

      expect(["key1", "key2"]).toContain(key0);
      expect(["key1", "key2"]).toContain(key1);
      expect(key0).not.toBe(key1);
    });

    it("should return null for invalid index", () => {
      expect(adapter.getLocalKey(999)).toBeNull();
    });

    it("should throw when localStorage not available", () => {
      const adapterNoLocal = new StorageAdapter(null, mockSessionStorage);

      expect(() => adapterNoLocal.setLocal("key", "value")).toThrow("localStorage not available");

      expect(() => adapterNoLocal.getLocal("key")).toThrow("localStorage not available");

      expect(() => adapterNoLocal.removeLocal("key")).toThrow("localStorage not available");

      expect(() => adapterNoLocal.clearLocal()).toThrow("localStorage not available");
    });
  });

  describe("SessionStorage Operations", () => {
    it("should set and get item", () => {
      adapter.setSession("key", "value");
      expect(adapter.getSession("key")).toBe("value");
    });

    it("should return null for non-existent key", () => {
      expect(adapter.getSession("does-not-exist")).toBeNull();
    });

    it("should remove item", () => {
      adapter.setSession("key", "value");
      adapter.removeSession("key");
      expect(adapter.getSession("key")).toBeNull();
    });

    it("should clear all items", () => {
      adapter.setSession("key1", "value1");
      adapter.setSession("key2", "value2");
      adapter.clearSession();

      expect(adapter.getSession("key1")).toBeNull();
      expect(adapter.getSession("key2")).toBeNull();
      expect(adapter.getSessionLength()).toBe(0);
    });

    it("should get length", () => {
      adapter.setSession("key1", "value1");
      adapter.setSession("key2", "value2");
      expect(adapter.getSessionLength()).toBe(2);
    });

    it("should get key by index", () => {
      adapter.setSession("key1", "value1");
      adapter.setSession("key2", "value2");

      const key0 = adapter.getSessionKey(0);
      const key1 = adapter.getSessionKey(1);

      expect(["key1", "key2"]).toContain(key0);
      expect(["key1", "key2"]).toContain(key1);
      expect(key0).not.toBe(key1);
    });

    it("should throw when sessionStorage not available", () => {
      const adapterNoSession = new StorageAdapter(mockLocalStorage, null);

      expect(() => adapterNoSession.setSession("key", "value")).toThrow("sessionStorage not available");

      expect(() => adapterNoSession.getSession("key")).toThrow("sessionStorage not available");

      expect(() => adapterNoSession.removeSession("key")).toThrow("sessionStorage not available");

      expect(() => adapterNoSession.clearSession()).toThrow("sessionStorage not available");
    });
  });

  describe("JSON Helper Methods", () => {
    it("should set and get JSON in localStorage", () => {
      const data = { name: "Test", count: 42, nested: { foo: "bar" } };
      adapter.setLocalJSON("data", data);

      const retrieved = adapter.getLocalJSON("data");
      expect(retrieved).toEqual(data);
    });

    it("should return default value for non-existent JSON key", () => {
      const defaultValue = { default: true };
      const result = adapter.getLocalJSON("missing", defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it("should return default value for invalid JSON", () => {
      mockLocalStorage.setItem("invalid", "not valid json{");
      const result = adapter.getLocalJSON("invalid", { fallback: true });
      expect(result).toEqual({ fallback: true });
    });

    it("should handle null values in JSON", () => {
      adapter.setLocalJSON("nullValue", null);
      const result = adapter.getLocalJSON("nullValue");
      expect(result).toBeNull();
    });

    it("should handle arrays in JSON", () => {
      const array = [1, 2, 3, { nested: "value" }];
      adapter.setLocalJSON("array", array);
      const result = adapter.getLocalJSON("array");
      expect(result).toEqual(array);
    });

    it("should set and get JSON in sessionStorage", () => {
      const data = { session: "data", items: [1, 2, 3] };
      adapter.setSessionJSON("data", data);

      const retrieved = adapter.getSessionJSON("data");
      expect(retrieved).toEqual(data);
    });

    it("should return default value for invalid session JSON", () => {
      mockSessionStorage.setItem("invalid", "bad json");
      const result = adapter.getSessionJSON("invalid", { default: "value" });
      expect(result).toEqual({ default: "value" });
    });

    it("should log error for invalid JSON parsing", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockLocalStorage.setItem("bad", "invalid{json");

      adapter.getLocalJSON("bad");

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Error parsing JSON"), expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Availability Checks", () => {
    it("should report localStorage available", () => {
      expect(adapter.isLocalStorageAvailable()).toBe(true);
    });

    it("should report sessionStorage available", () => {
      expect(adapter.isSessionStorageAvailable()).toBe(true);
    });

    it("should report available when any storage exists", () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it("should report localStorage not available when missing", () => {
      const adapterNoLocal = new StorageAdapter(null, mockSessionStorage);
      expect(adapterNoLocal.isLocalStorageAvailable()).toBe(false);
      expect(adapterNoLocal.isAvailable()).toBe(true); // sessionStorage still available
    });

    it("should report sessionStorage not available when missing", () => {
      const adapterNoSession = new StorageAdapter(mockLocalStorage, null);
      expect(adapterNoSession.isSessionStorageAvailable()).toBe(false);
      expect(adapterNoSession.isAvailable()).toBe(true); // localStorage still available
    });

    it("should report not available when both missing", () => {
      const adapterNone = new StorageAdapter(null, null);
      expect(adapterNone.isLocalStorageAvailable()).toBe(false);
      expect(adapterNone.isSessionStorageAvailable()).toBe(false);
      expect(adapterNone.isAvailable()).toBe(false);
    });
  });

  describe("Storage Isolation", () => {
    it("should keep localStorage and sessionStorage separate", () => {
      adapter.setLocal("key", "local-value");
      adapter.setSession("key", "session-value");

      expect(adapter.getLocal("key")).toBe("local-value");
      expect(adapter.getSession("key")).toBe("session-value");
    });

    it("should clear localStorage without affecting sessionStorage", () => {
      adapter.setLocal("key", "local");
      adapter.setSession("key", "session");

      adapter.clearLocal();

      expect(adapter.getLocal("key")).toBeNull();
      expect(adapter.getSession("key")).toBe("session");
    });

    it("should clear sessionStorage without affecting localStorage", () => {
      adapter.setLocal("key", "local");
      adapter.setSession("key", "session");

      adapter.clearSession();

      expect(adapter.getLocal("key")).toBe("local");
      expect(adapter.getSession("key")).toBeNull();
    });
  });

  describe("Value Persistence", () => {
    it("should store values as strings", () => {
      adapter.setLocal("number", "123");
      adapter.setLocal("boolean", "true");

      expect(adapter.getLocal("number")).toBe("123");
      expect(adapter.getLocal("boolean")).toBe("true");
    });

    it("should overwrite existing values", () => {
      adapter.setLocal("key", "first");
      adapter.setLocal("key", "second");
      expect(adapter.getLocal("key")).toBe("second");
    });

    it("should handle empty string values", () => {
      adapter.setLocal("empty", "");
      expect(adapter.getLocal("empty")).toBe("");
    });
  });
});

/**
 * Create a mock Storage object for testing
 * @returns {Storage} Mock storage object
 */
function createMockStorage() {
  const storage = new Map();

  return {
    get length() {
      return storage.size;
    },
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
    key(index) {
      const keys = Array.from(storage.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
  };
}
