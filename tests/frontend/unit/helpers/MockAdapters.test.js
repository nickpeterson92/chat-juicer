/**
 * Mock Adapters Unit Tests
 *
 * Tests the mock adapter implementations to ensure they work correctly in tests
 */

import { MockDOMAdapter, MockIPCAdapter, MockStorageAdapter } from "@test-helpers";
import { beforeEach, describe, expect, it } from "vitest";

describe("MockDOMAdapter", () => {
  let mock;

  beforeEach(() => {
    mock = new MockDOMAdapter();
  });

  it("should log method calls", () => {
    mock.createElement("div");
    mock.createElement("span");

    const log = mock.getCallLog();
    expect(log).toHaveLength(2);
    expect(log[0].method).toBe("createElement");
    expect(log[1].method).toBe("createElement");
  });

  it("should clear call log", () => {
    mock.createElement("div");
    mock.clearCallLog();
    expect(mock.getCallLog()).toHaveLength(0);
  });

  it("should create mock elements", () => {
    const div = mock.createElement("div");
    expect(div).toBeDefined();
    expect(div.tagName).toBe("DIV");
    expect(div.classList).toBeDefined();
  });

  it("should register and retrieve elements", () => {
    const element = { id: "test", tagName: "DIV" };
    mock.registerElement("#test", element);

    const retrieved = mock.querySelector("#test");
    expect(retrieved).toBe(element);
  });

  it("should reset all state", () => {
    mock.createElement("div");
    mock.registerElement("#test", { id: "test" });

    mock.reset();

    expect(mock.getCallLog()).toHaveLength(0);
    expect(mock.querySelector("#test")).toBeNull();
  });

  it("should handle classList operations", () => {
    const element = mock.createElement("div");
    mock.addClass(element, "test-class");

    expect(mock.hasClass(element, "test-class")).toBe(true);

    mock.removeClass(element, "test-class");
    expect(mock.hasClass(element, "test-class")).toBe(false);
  });

  it("should simulate event dispatch", () => {
    let eventFired = false;
    const element = mock.createElement("button");

    mock.addEventListener(element, "click", () => {
      eventFired = true;
    });

    mock.dispatchEvent(element, "click");
    expect(eventFired).toBe(true);
  });
});

describe("MockIPCAdapter", () => {
  let mock;

  beforeEach(() => {
    mock = new MockIPCAdapter();
  });

  it("should log method calls", async () => {
    await mock.sendMessage("test");
    await mock.stopGeneration();

    const log = mock.getCallLog();
    expect(log).toHaveLength(2);
    expect(log[0].method).toBe("sendMessage");
    expect(log[1].method).toBe("stopGeneration");
  });

  it("should filter calls by method", async () => {
    await mock.sendMessage("test1");
    await mock.sendMessage("test2");
    await mock.stopGeneration();

    const sendCalls = mock.getCallsFor("sendMessage");
    expect(sendCalls).toHaveLength(2);
  });

  it("should set and return mock responses", async () => {
    mock.setResponse("getVersion", "2.0.0-mock");
    const version = await mock.getVersion();
    expect(version).toBe("2.0.0-mock");
  });

  it("should support function responses", async () => {
    mock.setResponse("sendMessage", (content) => {
      return `Received: ${content}`;
    });

    const result = await mock.sendMessage("Hello");
    expect(result).toBe("Received: Hello");
  });

  it("should simulate failures", async () => {
    mock.setFailure("sendMessage", "Connection failed");

    await expect(mock.sendMessage("test")).rejects.toThrow("Connection failed");
  });

  it("should clear specific failures", async () => {
    mock.setFailure("sendMessage", "Error");
    mock.clearFailure("sendMessage");

    await expect(mock.sendMessage("test")).resolves.toBeUndefined();
  });

  it("should track event handlers", () => {
    const callback1 = () => {};
    const callback2 = () => {};

    mock.onPythonStdout(callback1);
    mock.onPythonStderr(callback2);

    expect(mock.handlers.pythonStdout).toHaveLength(1);
    expect(mock.handlers.pythonStderr).toHaveLength(1);
  });

  it("should simulate Python stdout", () => {
    let received = null;
    mock.onPythonStdout((content) => {
      received = content;
    });

    mock.simulatePythonStdout("Test output");
    expect(received).toBe("Test output");
  });

  it("should reset all state", async () => {
    await mock.sendMessage("test");
    mock.onPythonStdout(() => {});
    mock.setResponse("getVersion", "1.0.0");

    mock.reset();

    expect(mock.getCallLog()).toHaveLength(0);
    expect(mock.handlers.pythonStdout).toHaveLength(0);
    // After reset, no custom response set, should return undefined (not default)
    expect(await mock.getVersion()).toBeUndefined();
  });

  it("should always report available", () => {
    expect(mock.isAvailable()).toBe(true);
  });
});

describe("MockStorageAdapter", () => {
  let mock;

  beforeEach(() => {
    mock = new MockStorageAdapter();
  });

  it("should log method calls", () => {
    mock.setLocal("key", "value");
    mock.getLocal("key");

    const log = mock.getCallLog();
    expect(log).toHaveLength(2);
    expect(log[0].method).toBe("setLocal");
    expect(log[1].method).toBe("getLocal");
  });

  it("should filter calls by method", () => {
    mock.setLocal("key1", "value1");
    mock.setLocal("key2", "value2");
    mock.getLocal("key1");

    const setCalls = mock.getCallsFor("setLocal");
    expect(setCalls).toHaveLength(2);
  });

  it("should store and retrieve data", () => {
    mock.setLocal("test", "value");
    expect(mock.getLocal("test")).toBe("value");
  });

  it("should keep localStorage and sessionStorage separate", () => {
    mock.setLocal("key", "local");
    mock.setSession("key", "session");

    expect(mock.getLocal("key")).toBe("local");
    expect(mock.getSession("key")).toBe("session");
  });

  it("should seed localStorage", () => {
    mock.seedLocalStorage({ key1: "value1", key2: "value2" });

    expect(mock.getLocal("key1")).toBe("value1");
    expect(mock.getLocal("key2")).toBe("value2");
  });

  it("should get raw storage data", () => {
    mock.setLocal("test", "value");
    const raw = mock.getRawLocalStorage();

    expect(raw.get("test")).toBe("value");
  });

  it("should reset all state", () => {
    mock.setLocal("key", "value");
    mock.setSession("key", "value");

    mock.reset();

    expect(mock.getCallLog()).toHaveLength(0);
    expect(mock.getLocal("key")).toBeNull();
    expect(mock.getSession("key")).toBeNull();
  });

  it("should handle JSON operations", () => {
    const data = { nested: { value: 123 } };
    mock.setLocalJSON("data", data);

    const retrieved = mock.getLocalJSON("data");
    expect(retrieved).toEqual(data);
  });

  it("should always report available", () => {
    expect(mock.isAvailable()).toBe(true);
    expect(mock.isLocalStorageAvailable()).toBe(true);
    expect(mock.isSessionStorageAvailable()).toBe(true);
  });
});
