/**
 * ConnectionStatus Component Unit Tests
 */

import { MockDOMAdapter } from "@test-helpers/MockDOMAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import { ConnectionStatus } from "@/ui/components/connection-status.js";

describe("ConnectionStatus Component", () => {
  let mockDOM;
  let connectionStatus;

  beforeEach(() => {
    mockDOM = new MockDOMAdapter();
    connectionStatus = new ConnectionStatus(mockDOM);
  });

  describe("constructor", () => {
    it("should initialize with default state", () => {
      expect(connectionStatus.isConnected).toBe(true);
      expect(connectionStatus.lastError).toBeNull();
    });

    it("should store DOM adapter", () => {
      expect(connectionStatus.dom).toBe(mockDOM);
    });
  });

  describe("render", () => {
    it("should create connection status element", () => {
      const element = connectionStatus.render();

      expect(element).toBeDefined();
      expect(mockDOM.hasClass(element, "connection-status")).toBe(true);
    });

    it("should start in connected state", () => {
      const element = connectionStatus.render();

      expect(mockDOM.hasClass(element, "connected")).toBe(true);
      expect(mockDOM.hasClass(element, "disconnected")).toBe(false);
    });

    it("should show status indicator", () => {
      const element = connectionStatus.render();
      const indicator = mockDOM.querySelector(element, ".status-indicator");

      expect(indicator).toBeDefined();
    });

    it("should show status text", () => {
      const element = connectionStatus.render();
      const text = mockDOM.querySelector(element, ".status-text");

      expect(text).toBeDefined();
      expect(mockDOM.getTextContent(text)).toBe("Connected");
    });

    it("should store element reference", () => {
      const element = connectionStatus.render();

      expect(connectionStatus.element).toBe(element);
    });
  });

  describe("setConnected", () => {
    it("should update to connected state", () => {
      const element = connectionStatus.render();
      connectionStatus.isConnected = false;
      connectionStatus.lastError = "Test error";

      connectionStatus.setConnected();

      expect(connectionStatus.isConnected).toBe(true);
      expect(connectionStatus.lastError).toBeNull();
      expect(mockDOM.hasClass(element, "connected")).toBe(true);
      expect(mockDOM.hasClass(element, "disconnected")).toBe(false);
    });

    it("should update status text to Connected", () => {
      const element = connectionStatus.render();
      connectionStatus.isConnected = false;

      connectionStatus.setConnected();

      const text = mockDOM.querySelector(element, ".status-text");
      expect(mockDOM.getTextContent(text)).toBe("Connected");
    });

    it("should work without rendering first", () => {
      // Should not throw even if element not rendered yet
      expect(() => {
        connectionStatus.setConnected();
      }).not.toThrow();

      expect(connectionStatus.isConnected).toBe(true);
    });
  });

  describe("setDisconnected", () => {
    it("should update to disconnected state", () => {
      const element = connectionStatus.render();

      connectionStatus.setDisconnected("Connection lost");

      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.lastError).toBe("Connection lost");
      expect(mockDOM.hasClass(element, "connected")).toBe(false);
      expect(mockDOM.hasClass(element, "disconnected")).toBe(true);
    });

    it("should update status text to Disconnected", () => {
      const element = connectionStatus.render();

      connectionStatus.setDisconnected();

      const text = mockDOM.querySelector(element, ".status-text");
      expect(mockDOM.getTextContent(text)).toBe("Disconnected");
    });

    it("should store error message", () => {
      connectionStatus.render();

      connectionStatus.setDisconnected("Network error");

      expect(connectionStatus.lastError).toBe("Network error");
    });

    it("should work with null error", () => {
      const _element = connectionStatus.render();

      connectionStatus.setDisconnected(null);

      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.lastError).toBeNull();
    });

    it("should work without rendering first", () => {
      // Should not throw
      expect(() => {
        connectionStatus.setDisconnected("Test error");
      }).not.toThrow();

      expect(connectionStatus.isConnected).toBe(false);
    });
  });

  describe("setReconnecting", () => {
    it("should update to reconnecting state", () => {
      const element = connectionStatus.render();

      connectionStatus.setReconnecting();

      expect(connectionStatus.isConnected).toBe(false);
      expect(mockDOM.hasClass(element, "reconnecting")).toBe(true);
    });

    it("should update status text to Reconnecting", () => {
      const element = connectionStatus.render();

      connectionStatus.setReconnecting();

      const text = mockDOM.querySelector(element, ".status-text");
      expect(mockDOM.getTextContent(text)).toBe("Reconnecting...");
    });

    it("should work without rendering first", () => {
      expect(() => {
        connectionStatus.setReconnecting();
      }).not.toThrow();
    });
  });

  describe("getState", () => {
    it("should return current state", () => {
      const state = connectionStatus.getState();

      expect(state).toEqual({
        isConnected: true,
        lastError: null,
      });
    });

    it("should reflect state changes", () => {
      connectionStatus.setDisconnected("Test error");

      const state = connectionStatus.getState();

      expect(state).toEqual({
        isConnected: false,
        lastError: "Test error",
      });
    });
  });

  describe("show/hide", () => {
    it("should show element", () => {
      const element = connectionStatus.render();
      mockDOM.setStyle(element, "display", "none");

      connectionStatus.show();

      expect(mockDOM.getStyle(element, "display")).not.toBe("none");
    });

    it("should hide element", () => {
      const element = connectionStatus.render();

      connectionStatus.hide();

      expect(mockDOM.getStyle(element, "display")).toBe("none");
    });

    it("should work without rendering first", () => {
      expect(() => {
        connectionStatus.show();
        connectionStatus.hide();
      }).not.toThrow();
    });
  });

  describe("destroy", () => {
    it("should remove element from DOM", () => {
      const container = mockDOM.createElement("div");
      const element = connectionStatus.render();
      mockDOM.appendChild(container, element);

      connectionStatus.destroy();

      expect(mockDOM.querySelector(container, ".connection-status")).toBeNull();
    });

    it("should clear element reference", () => {
      connectionStatus.render();

      connectionStatus.destroy();

      expect(connectionStatus.element).toBeNull();
    });

    it("should work without rendering first", () => {
      expect(() => {
        connectionStatus.destroy();
      }).not.toThrow();
    });

    it("should work if already destroyed", () => {
      connectionStatus.render();
      connectionStatus.destroy();

      expect(() => {
        connectionStatus.destroy();
      }).not.toThrow();
    });
  });

  describe("state transitions", () => {
    it("should handle connected → disconnected → reconnecting → connected", () => {
      const element = connectionStatus.render();

      // Start connected
      expect(connectionStatus.isConnected).toBe(true);

      // Disconnect
      connectionStatus.setDisconnected("Error");
      expect(connectionStatus.isConnected).toBe(false);
      expect(mockDOM.hasClass(element, "disconnected")).toBe(true);

      // Reconnecting
      connectionStatus.setReconnecting();
      expect(mockDOM.hasClass(element, "reconnecting")).toBe(true);

      // Connected again
      connectionStatus.setConnected();
      expect(connectionStatus.isConnected).toBe(true);
      expect(connectionStatus.lastError).toBeNull();
      expect(mockDOM.hasClass(element, "connected")).toBe(true);
    });
  });
});
