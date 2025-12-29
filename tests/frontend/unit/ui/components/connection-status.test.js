import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComponentLifecycle } from "@/core/component-lifecycle.js";
import { ConnectionStatus } from "@/ui/components/connection-status.js";

const mocks = vi.hoisted(() => {
  return {
    mockDomAdapter: {
      createElement: vi.fn(),
      addClass: vi.fn(),
      removeClass: vi.fn(),
      appendChild: vi.fn(),
      setTextContent: vi.fn(),
      querySelector: vi.fn(),
      setStyle: vi.fn(),
      remove: vi.fn(),
    },
    mockAppState: {
      subscribe: vi.fn(() => vi.fn()),
    },
    mockLifecycleManager: {
      addUnsubscriber: vi.fn(),
    },
    mockMessageQueueService: {
      hasItems: vi.fn(),
      process: vi.fn(),
    },
  };
});

// Mock Imports
vi.mock("@/core/component-lifecycle.js", () => ({
  ComponentLifecycle: {
    mount: vi.fn((instance) => {
      instance._lifecycle = {};
    }),
    unmount: vi.fn(),
  },
}));

vi.mock("@/core/lifecycle-manager.js", () => ({
  globalLifecycleManager: mocks.mockLifecycleManager,
}));

vi.mock("@/services/message-queue-service.js", () => ({
  getMessageQueueService: vi.fn(() => mocks.mockMessageQueueService),
}));

describe("ConnectionStatus", () => {
  let connectionStatus;
  let mockElement;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Mock DOM Element
    mockElement = { classList: { add: vi.fn(), remove: vi.fn() } };
    mocks.mockDomAdapter.createElement.mockReturnValue(mockElement);
    mocks.mockDomAdapter.querySelector.mockReturnValue(mockElement);

    connectionStatus = new ConnectionStatus(mocks.mockDomAdapter, { appState: mocks.mockAppState });
  });

  afterEach(() => {
    connectionStatus.destroy();
  });

  describe("Initialization", () => {
    it("should mount on creation", () => {
      expect(ComponentLifecycle.mount).toHaveBeenCalled();
    });

    it("should setup state subscriptions if appState provided", () => {
      connectionStatus.render();
      expect(mocks.mockAppState.subscribe).toHaveBeenCalledWith("connection.status", expect.any(Function));
    });
  });

  describe("Rendering", () => {
    it("should render structure correctly", () => {
      const el = connectionStatus.render();
      expect(mocks.mockDomAdapter.createElement).toHaveBeenCalledTimes(3);
      expect(mocks.mockDomAdapter.addClass).toHaveBeenCalledWith(el, "connection-status");
      expect(mocks.mockDomAdapter.setTextContent).toHaveBeenCalledWith(expect.anything(), "Connected");
    });
  });

  describe("State Updates", () => {
    beforeEach(() => {
      connectionStatus.render();
    });

    it("should handle CONNECTED state", () => {
      connectionStatus.setConnected();
      expect(connectionStatus.isConnected).toBe(true);
      expect(mocks.mockDomAdapter.addClass).toHaveBeenCalledWith(expect.anything(), "connected");
      expect(mocks.mockDomAdapter.removeClass).toHaveBeenCalledWith(expect.anything(), "disconnected");
    });

    it("should handle DISCONNECTED state", () => {
      connectionStatus.setDisconnected("Error msg");
      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.lastError).toBe("Error msg");
      expect(mocks.mockDomAdapter.addClass).toHaveBeenCalledWith(expect.anything(), "disconnected");
      expect(mocks.mockDomAdapter.setTextContent).toHaveBeenCalledWith(expect.anything(), "Disconnected");
    });

    it("should handle RECONNECTING state", () => {
      connectionStatus.setReconnecting();
      expect(connectionStatus.isConnected).toBe(false);
      expect(mocks.mockDomAdapter.addClass).toHaveBeenCalledWith(expect.anything(), "reconnecting");
      expect(mocks.mockDomAdapter.setTextContent).toHaveBeenCalledWith(expect.anything(), "Reconnecting...");
    });
  });

  describe("Queue Processing", () => {
    it("should process queue on reconnection", () => {
      vi.useFakeTimers();
      connectionStatus.render();

      connectionStatus.isConnected = false;
      mocks.mockMessageQueueService.hasItems.mockReturnValue(true);

      connectionStatus.setConnected();

      vi.advanceTimersByTime(200);
      expect(mocks.mockMessageQueueService.process).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("Visibility & Lifecycle", () => {
    beforeEach(() => {
      connectionStatus.render();
    });

    it("should show/hide element", () => {
      connectionStatus.show();
      expect(mocks.mockDomAdapter.setStyle).toHaveBeenCalledWith(expect.anything(), "display", "flex");

      connectionStatus.hide();
      expect(mocks.mockDomAdapter.setStyle).toHaveBeenCalledWith(expect.anything(), "display", "none");
    });

    it("should cleanup on destroy", () => {
      connectionStatus.destroy();
      expect(mocks.mockDomAdapter.remove).toHaveBeenCalled();
      expect(ComponentLifecycle.unmount).toHaveBeenCalled();
    });
  });

  describe("Event Handling", () => {
    it("should respond to appState events", () => {
      connectionStatus.render();
      const callback = mocks.mockAppState.subscribe.mock.calls[0][1];

      callback("DISCONNECTED");
      expect(connectionStatus.isConnected).toBe(false);

      callback("CONNECTED");
      expect(connectionStatus.isConnected).toBe(true);

      callback("RECONNECTING");
      expect(mocks.mockDomAdapter.addClass).toHaveBeenCalledWith(expect.anything(), "reconnecting");

      callback("ERROR");
      expect(connectionStatus.lastError).toBe("Connection error");
    });
  });
});
