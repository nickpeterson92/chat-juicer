/**
 * ConnectionStatus Component Unit Tests
 * Phase 4 State Management Migration
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { globalLifecycleManager } from "@/core/lifecycle-manager.js";
import { AppState } from "@/core/state.js";
import { ConnectionStatus } from "@/ui/components/connection-status.js";

// Mock DOM adapter
class MockDOMAdapter {
  createElement(tag) {
    return document.createElement(tag);
  }

  addClass(element, className) {
    element.classList.add(className);
  }

  removeClass(element, className) {
    element.classList.remove(className);
  }

  appendChild(parent, child) {
    parent.appendChild(child);
  }

  setTextContent(element, text) {
    element.textContent = text;
  }

  querySelector(element, selector) {
    return element.querySelector(selector);
  }

  setStyle(element, property, value) {
    element.style[property] = value;
  }

  remove(element) {
    element.remove();
  }
}

describe("ConnectionStatus", () => {
  let domAdapter;
  let appState;

  beforeEach(() => {
    domAdapter = new MockDOMAdapter();
    appState = new AppState();
    globalLifecycleManager.unmountAll();
  });

  afterEach(() => {
    globalLifecycleManager.unmountAll();
  });

  describe("constructor", () => {
    it("should initialize without appState (backwards compatibility)", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);

      expect(connectionStatus.dom).toBe(domAdapter);
      expect(connectionStatus.appState).toBeNull();

      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "ConnectionStatus");
      expect(entry?.listeners ?? 0).toBe(0);
    });

    it("should initialize with appState", () => {
      const connectionStatus = new ConnectionStatus(domAdapter, {
        appState,
      });

      expect(connectionStatus.appState).toBe(appState);
    });
  });

  describe("render", () => {
    it("should render connection status element", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);

      const element = connectionStatus.render();

      expect(element).toBeDefined();
      expect(element.classList.contains("connection-status")).toBe(true);
      expect(element.classList.contains("connected")).toBe(true);
    });

    it("should setup AppState subscriptions after render", () => {
      const connectionStatus = new ConnectionStatus(domAdapter, {
        appState,
      });

      connectionStatus.render();

      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "ConnectionStatus");
      expect(entry?.listeners).toBe(1); // connection.status subscription
    });
  });

  describe("AppState integration", () => {
    it("should subscribe to connection.status", () => {
      const connectionStatus = new ConnectionStatus(domAdapter, {
        appState,
      });

      connectionStatus.render();

      // Test CONNECTED status
      appState.setState("connection.status", "CONNECTED");
      expect(connectionStatus.isConnected).toBe(true);
      expect(connectionStatus.element.classList.contains("connected")).toBe(true);

      // Test DISCONNECTED status
      appState.setState("connection.status", "DISCONNECTED");
      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.element.classList.contains("disconnected")).toBe(true);

      // Test RECONNECTING status
      appState.setState("connection.status", "RECONNECTING");
      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.element.classList.contains("reconnecting")).toBe(true);

      // Test ERROR status
      appState.setState("connection.status", "ERROR");
      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.element.classList.contains("disconnected")).toBe(true);
    });

    it("should work without appState", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);

      connectionStatus.render();

      // Manual state changes should still work
      connectionStatus.setDisconnected();
      expect(connectionStatus.isConnected).toBe(false);

      connectionStatus.setConnected();
      expect(connectionStatus.isConnected).toBe(true);
    });
  });

  describe("setConnected", () => {
    it("should set connected state", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);
      connectionStatus.render();

      connectionStatus.setConnected();

      expect(connectionStatus.isConnected).toBe(true);
      expect(connectionStatus.lastError).toBeNull();
      expect(connectionStatus.element.classList.contains("connected")).toBe(true);
    });
  });

  describe("setDisconnected", () => {
    it("should set disconnected state", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);
      connectionStatus.render();

      connectionStatus.setDisconnected("Test error");

      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.lastError).toBe("Test error");
      expect(connectionStatus.element.classList.contains("disconnected")).toBe(true);
    });
  });

  describe("setReconnecting", () => {
    it("should set reconnecting state", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);
      connectionStatus.render();

      connectionStatus.setReconnecting();

      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.element.classList.contains("reconnecting")).toBe(true);
    });
  });

  describe("getState", () => {
    it("should return current state", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);
      connectionStatus.render();

      connectionStatus.setDisconnected("Network error");

      const state = connectionStatus.getState();

      expect(state.isConnected).toBe(false);
      expect(state.lastError).toBe("Network error");
    });
  });

  describe("destroy", () => {
    it("should clean up AppState subscriptions", () => {
      const connectionStatus = new ConnectionStatus(domAdapter, {
        appState,
      });

      connectionStatus.render();

      const snapshotBefore = globalLifecycleManager.getDebugSnapshot();
      const entryBefore = snapshotBefore.components.find((c) => c.name === "ConnectionStatus");
      expect(entryBefore?.listeners).toBe(1);

      connectionStatus.destroy();

      const snapshotAfter = globalLifecycleManager.getDebugSnapshot();
      const entryAfter = snapshotAfter.components.find((c) => c.name === "ConnectionStatus");
      expect(entryAfter).toBeUndefined();
    });

    it("should remove DOM element", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);
      const element = connectionStatus.render();

      document.body.appendChild(element);

      connectionStatus.destroy();

      expect(connectionStatus.element).toBeNull();
      expect(document.body.contains(element)).toBe(false);
    });

    it("should work without appState", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);
      connectionStatus.render();

      expect(() => connectionStatus.destroy()).not.toThrow();
    });
  });

  describe("show/hide", () => {
    it("should show component", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);
      connectionStatus.render();

      connectionStatus.show();

      expect(connectionStatus.element.style.display).toBe("flex");
    });

    it("should hide component", () => {
      const connectionStatus = new ConnectionStatus(domAdapter);
      connectionStatus.render();

      connectionStatus.hide();

      expect(connectionStatus.element.style.display).toBe("none");
    });
  });
});
