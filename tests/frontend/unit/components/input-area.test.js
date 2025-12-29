/**
 * InputArea Component Unit Tests
 * Phase 4 State Management Migration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalEventBus } from "@/core/event-bus.js";
import { globalLifecycleManager } from "@/core/lifecycle-manager.js";
import { AppState } from "@/core/state.js";
import { InputArea } from "@/ui/components/input-area.js";
import * as toast from "@/utils/toast.js";

vi.mock("@/utils/toast.js", () => ({
  showToast: vi.fn(),
}));

vi.mock("@/ui/components/model-selector.js", () => {
  return {
    ModelSelector: class {
      constructor(_container, options) {
        this.initialize = vi.fn().mockResolvedValue();
        this.destroy = vi.fn();
        this.options = options;
      }
    },
  };
});

describe("InputArea", () => {
  let textarea;
  let sendButton;
  let onSendCallback;
  let appState;

  beforeEach(() => {
    // Create mock DOM elements
    textarea = document.createElement("textarea");
    textarea.id = "user-input";
    sendButton = document.createElement("button");
    sendButton.id = "send-btn";

    onSendCallback = vi.fn();
    appState = new AppState();
    globalLifecycleManager.unmountAll();
  });

  afterEach(() => {
    globalLifecycleManager.unmountAll();
  });

  describe("constructor", () => {
    it("should initialize without appState (backwards compatibility)", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      expect(inputArea.textarea).toBe(textarea);
      expect(inputArea.sendButton).toBe(sendButton);
      expect(inputArea.onSendCallback).toBe(onSendCallback);
      expect(inputArea.appState).toBeNull();

      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "InputArea");
      // 4 DOM listeners: click, keydown, input, ESC key
      expect(entry?.listeners ?? 0).toBe(4);
    });

    it("should initialize with appState", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      expect(inputArea.appState).toBe(appState);
      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "InputArea");
      // 6 total: 4 DOM (click, keydown, input, ESC) + 2 appState subscriptions (queue.items, message.isStreaming)
      expect(entry?.listeners).toBe(6);
    });

    it("should throw error without required elements", () => {
      expect(() => new InputArea(null, sendButton, onSendCallback)).toThrow(
        "InputArea requires existing textarea and button elements"
      );
    });
  });

  describe("AppState integration", () => {
    it("should subscribe to queue.items for badge updates", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Input should always be enabled (queue feature - messages queue when agent is busy)
      expect(inputArea.isEnabled).toBe(true);

      // During streaming, input stays enabled (messages get queued)
      appState.setState("message.isStreaming", true);
      expect(inputArea.isEnabled).toBe(true);
      expect(textarea.hasAttribute("disabled")).toBe(false);

      // Badge appears when queue has items
      appState.setState("queue.items", [{ id: "1", text: "test", status: "queued" }]);
      expect(inputArea.queueBadge).not.toBeNull();
      expect(inputArea.queueBadge.textContent).toBe("1");

      // Badge removed when queue is empty
      appState.setState("queue.items", []);
      expect(inputArea.queueBadge).toBeNull();
    });

    it("should work without appState", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      // Manual enable/disable should still work
      inputArea.disable();
      expect(inputArea.isEnabled).toBe(false);

      inputArea.enable();
      expect(inputArea.isEnabled).toBe(true);
    });
  });

  describe("enable/disable", () => {
    it("should enable input area", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.disable();

      inputArea.enable();

      expect(inputArea.isEnabled).toBe(true);
      expect(textarea.hasAttribute("disabled")).toBe(false);
      expect(sendButton.hasAttribute("disabled")).toBe(false);
    });

    it("should disable input area", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      inputArea.disable();

      expect(inputArea.isEnabled).toBe(false);
      expect(textarea.getAttribute("disabled")).toBe("true");
      expect(sendButton.getAttribute("disabled")).toBe("true");
    });
  });

  describe("handleSend", () => {
    it("should call onSendCallback with trimmed message", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      textarea.value = "  Hello World  ";

      inputArea.handleSend();

      expect(onSendCallback).toHaveBeenCalledWith("Hello World");
      expect(textarea.value).toBe("");
    });

    it("should not send empty message", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      textarea.value = "   ";

      inputArea.handleSend();

      expect(onSendCallback).not.toHaveBeenCalled();
    });

    it("should not send when disabled", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.disable();
      textarea.value = "Hello";

      inputArea.handleSend();

      expect(onSendCallback).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("should clean up AppState subscriptions", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const snapshotBefore = globalLifecycleManager.getDebugSnapshot();
      const entryBefore = snapshotBefore.components.find((c) => c.name === "InputArea");
      expect(entryBefore?.listeners).toBe(6);

      inputArea.destroy();

      const snapshotAfter = globalLifecycleManager.getDebugSnapshot();
      const entryAfter = snapshotAfter.components.find((c) => c.name === "InputArea");
      expect(entryAfter).toBeUndefined();
    });

    it("should work without appState", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      expect(() => inputArea.destroy()).not.toThrow();
    });

    it("should clean up model selector if present", () => {
      const mockModelSelector = {
        destroy: vi.fn(),
      };

      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.modelSelector = mockModelSelector;

      inputArea.destroy();

      expect(mockModelSelector.destroy).toHaveBeenCalled();
    });

    it("should clean up token indicator if present", () => {
      const parent = document.createElement("div");
      const modelSelectorContainer = document.createElement("div");
      parent.appendChild(modelSelectorContainer);

      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        modelSelectorContainer,
      });

      const unsubscribeSpy = vi.fn();
      inputArea.tokenIndicatorUnsubscribe = unsubscribeSpy;

      const indicator = inputArea.tokenIndicator;
      expect(indicator).not.toBeNull();
      expect(indicator.parentElement).not.toBeNull();

      inputArea.destroy();

      expect(unsubscribeSpy).toHaveBeenCalled();
      expect(inputArea.tokenIndicator).toBeNull();
      expect(indicator.parentElement).toBeNull();
    });

    it("should clean up queue badge if present", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("queue.items", [{ id: "1", text: "test" }]);
      const badge = inputArea.queueBadge;
      expect(badge).not.toBeNull();
      expect(badge.parentElement).toBe(sendButton);

      inputArea.destroy();

      expect(inputArea.queueBadge).toBeNull();
      expect(badge.parentElement).toBeNull();
    });
  });

  describe("getValue/setValue", () => {
    it("should get and set value", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      inputArea.setValue("Test message");
      expect(inputArea.getValue()).toBe("Test message");

      inputArea.clear();
      expect(inputArea.getValue()).toBe("");
    });

    it("should return empty string when textarea is null", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.textarea = null;

      expect(inputArea.getValue()).toBe("");
    });

    it("should handle setValue when textarea is null", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.textarea = null;

      // Should not throw
      expect(() => inputArea.setValue("test")).not.toThrow();
    });
  });

  describe("updateQueueBadge", () => {
    it("should display 99+ for queue count over 99", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Create array with 100 items
      const items = Array(100)
        .fill(null)
        .map((_, i) => ({ id: String(i), text: "test", status: "queued" }));
      appState.setState("queue.items", items);

      expect(inputArea.queueBadge).not.toBeNull();
      expect(inputArea.queueBadge.textContent).toBe("99+");
    });

    it("should handle updateQueueBadge when sendButton is null", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });
      inputArea.sendButton = null;

      // Should not throw when sendButton is null
      expect(() => inputArea.updateQueueBadge(5)).not.toThrow();
    });
  });

  describe("updateButtonForStreamingState", () => {
    it("should show send button when streaming with text in input", () => {
      const _inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Enter text first
      textarea.value = "Test message";

      // Start streaming - should show send button (not stop) because there's text
      appState.setState("message.isStreaming", true);

      // Button should NOT have streaming class when there's text
      expect(sendButton.classList.contains("streaming")).toBe(false);
      expect(sendButton.getAttribute("aria-label")).toBe("Send message");
      expect(sendButton.disabled).toBe(false);
      expect(sendButton.classList.contains("ready")).toBe(true);
    });

    it("should update button during input while streaming", () => {
      const _inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Start streaming with empty input
      appState.setState("message.isStreaming", true);
      expect(sendButton.classList.contains("streaming")).toBe(true);

      // Type text while streaming
      textarea.value = "New message";
      textarea.dispatchEvent(new Event("input"));

      // Button should switch to send mode (not stop)
      expect(sendButton.classList.contains("streaming")).toBe(false);
      expect(sendButton.classList.contains("ready")).toBe(true);
    });

    it("should handle updateButtonForStreamingState when sendButton is null", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });
      inputArea.sendButton = null;

      // Should not throw
      expect(() => inputArea.updateButtonForStreamingState(true)).not.toThrow();
    });
  });

  describe("updateSendButtonState", () => {
    it("should handle updateSendButtonState when sendButton is null", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.sendButton = null;

      // Should not throw
      expect(() => inputArea.updateSendButtonState()).not.toThrow();
    });
  });

  describe("handleKeyDown", () => {
    it("should send on Enter without Shift", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      textarea.value = "Test message";

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: false,
        bubbles: true,
        cancelable: true,
      });
      inputArea.handleKeyDown(event);

      expect(onSendCallback).toHaveBeenCalledWith("Test message");
      expect(event.defaultPrevented).toBe(true);
    });

    it("should not send on Shift+Enter (allow new line)", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      textarea.value = "Test message";

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      inputArea.handleKeyDown(event);

      expect(onSendCallback).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it("should ignore other keys", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      textarea.value = "Test";

      const event = new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
      });
      inputArea.handleKeyDown(event);

      expect(onSendCallback).not.toHaveBeenCalled();
    });
  });

  describe("focus/setPlaceholder/getTextarea/getSendButton", () => {
    it("should focus textarea", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      const focusSpy = vi.spyOn(textarea, "focus");

      inputArea.focus();

      expect(focusSpy).toHaveBeenCalled();
    });

    it("should handle focus when textarea is null", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.textarea = null;

      expect(() => inputArea.focus()).not.toThrow();
    });

    it("should set placeholder text", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      inputArea.setPlaceholder("Type here...");

      expect(textarea.getAttribute("placeholder")).toBe("Type here...");
    });

    it("should handle setPlaceholder when textarea is null", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.textarea = null;

      expect(() => inputArea.setPlaceholder("test")).not.toThrow();
    });

    it("should return textarea element", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      expect(inputArea.getTextarea()).toBe(textarea);
    });

    it("should return sendButton element", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      expect(inputArea.getSendButton()).toBe(sendButton);
    });
  });

  describe("adjustHeight", () => {
    it("should adjust height based on content", async () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      // Mock scrollHeight
      Object.defineProperty(textarea, "scrollHeight", {
        value: 100,
        writable: true,
      });

      inputArea.adjustHeight();

      // Wait for RAF
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(textarea.style.height).toBe("100px");
    });

    it("should respect min height of 44px", async () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      Object.defineProperty(textarea, "scrollHeight", {
        value: 20,
        writable: true,
      });

      inputArea.adjustHeight();

      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(textarea.style.height).toBe("44px");
    });

    it("should respect max height of 200px", async () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      Object.defineProperty(textarea, "scrollHeight", {
        value: 500,
        writable: true,
      });

      inputArea.adjustHeight();

      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(textarea.style.height).toBe("200px");
    });

    it("should handle adjustHeight when textarea is null", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      inputArea.textarea = null;

      expect(() => inputArea.adjustHeight()).not.toThrow();
    });

    it("should cancel pending RAF when called again", async () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);
      const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");

      Object.defineProperty(textarea, "scrollHeight", {
        value: 100,
        writable: true,
      });

      inputArea.adjustHeight();
      inputArea.adjustHeight(); // Second call should cancel first

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe("Token Usage Indicator", () => {
    let modelSelectorContainer;

    beforeEach(() => {
      modelSelectorContainer = document.createElement("div");
      modelSelectorContainer.id = "chat-model-selector";
      document.body.appendChild(modelSelectorContainer);
    });

    afterEach(() => {
      modelSelectorContainer.remove();
    });

    it("should setup token indicator when dependencies are met", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        modelSelectorContainer,
      });

      expect(inputArea.tokenIndicator).not.toBeNull();
      expect(document.querySelector(".token-usage-indicator")).not.toBeNull();
      expect(document.querySelector(".token-usage-ring")).not.toBeNull();
    });

    it("should not setup token indicator if modelSelectorContainer is missing", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      expect(inputArea.tokenIndicator).toBeNull();
    });

    it("should update visuals on token usage change", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        modelSelectorContainer,
      });

      appState.setState("session.tokenUsage", {
        current: 50,
        limit: 100,
        threshold: 80,
      });

      expect(inputArea.tokenIndicator.title).toContain("50/100 tokens (50%)");
      // JSDOM doesn't reliably support conic-gradient in style.background,
      // but we can verify the method didn't crash and title was updated.
    });

    it("should toggle full class when threshold is reached", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        modelSelectorContainer,
      });

      appState.setState("session.tokenUsage", {
        current: 85,
        limit: 100,
        threshold: 80,
      });

      expect(inputArea.tokenIndicator.classList.contains("token-usage-full")).toBe(true);
    });
  });

  describe("Summarization", () => {
    let mockSessionService;
    let modelSelectorContainer;

    beforeEach(() => {
      mockSessionService = {
        getCurrentSessionId: vi.fn().mockReturnValue("session-123"),
        summarizeSession: vi.fn().mockResolvedValue({ success: true, message: "Summarized" }),
      };
      modelSelectorContainer = document.createElement("div");
      document.body.appendChild(modelSelectorContainer);
    });

    afterEach(() => {
      modelSelectorContainer.remove();
      vi.clearAllMocks();
    });

    it("should trigger manual summarization on click", async () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        modelSelectorContainer,
        sessionService: mockSessionService,
      });

      const eventBusSpy = vi.spyOn(globalEventBus, "emit");

      inputArea.tokenIndicator.click();

      // Wait for async runSummarize
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockSessionService.summarizeSession).toHaveBeenCalledWith("session-123");
      expect(eventBusSpy).toHaveBeenCalledWith(
        "message:function_detected",
        expect.objectContaining({
          tool_name: "summarize_conversation",
        })
      );
      expect(toast.showToast).toHaveBeenCalledWith("Session summarized", "success", 2000);
    });

    it("should trigger auto-summarization when threshold reached", async () => {
      const _inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        modelSelectorContainer,
        sessionService: mockSessionService,
      });

      appState.setState("message.isStreaming", false);
      appState.setState("python.status", "idle");

      appState.setState("session.tokenUsage", {
        current: 100,
        limit: 100,
        threshold: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockSessionService.summarizeSession).toHaveBeenCalled();
    });

    it("should handle summarization error", async () => {
      mockSessionService.summarizeSession.mockResolvedValue({ success: false, error: "Failed" });

      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        modelSelectorContainer,
        sessionService: mockSessionService,
      });

      inputArea.tokenIndicator.click();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(toast.showToast).toHaveBeenCalledWith("Summarize failed: Failed", "error", 3500);
    });
  });

  describe("Interrupt Handling", () => {
    beforeEach(() => {
      window.electronAPI = {
        interruptStream: vi.fn(),
      };
    });

    afterEach(() => {
      delete window.electronAPI;
    });

    it("should trigger interrupt when sending empty message while streaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("message.isStreaming", true);
      textarea.value = "";

      inputArea.handleSend();

      expect(window.electronAPI.interruptStream).toHaveBeenCalled();
      expect(sendButton.classList.contains("stopping")).toBe(true);
      expect(appState.getState("stream.interrupted")).toBe(true);
    });

    it("should not trigger interrupt if not streaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("message.isStreaming", false);
      inputArea.handleInterrupt();

      expect(window.electronAPI.interruptStream).not.toHaveBeenCalled();
    });

    it("should trigger interrupt on Escape key when streaming", () => {
      const _inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("message.isStreaming", true);
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(window.electronAPI.interruptStream).toHaveBeenCalled();
    });
  });

  describe("Summarization Cleanup", () => {
    it("should process command queue after summarization", async () => {
      const mockIpcAdapter = {
        commandQueue: [{ type: "test" }],
        processQueue: vi.fn().mockResolvedValue(),
      };
      const mockSessionService = {
        getCurrentSessionId: vi.fn().mockReturnValue("123"),
        summarizeSession: vi.fn().mockResolvedValue({ success: true }),
      };

      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        ipcAdapter: mockIpcAdapter,
        sessionService: mockSessionService,
      });

      await inputArea.runSummarize("manual");

      expect(mockIpcAdapter.processQueue).toHaveBeenCalled();
    });
  });

  describe("initializeModelSelector", () => {
    it("should initialize model selector when dependencies provided", async () => {
      const container = document.createElement("div");
      const mockIpcAdapter = {};
      const mockSessionService = { getCurrentSessionId: vi.fn() };

      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
        modelSelectorContainer: container,
        ipcAdapter: mockIpcAdapter,
        sessionService: mockSessionService,
      });

      await inputArea.initializeModelSelector([], []);

      expect(inputArea.modelSelector).not.toBeNull();

      // Trigger onChange to cover column 14 (console.log)
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      inputArea.modelSelector.options.onChange("gpt-4", "high");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Chat page model selection changed"),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it("should warn if dependencies are missing", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      await inputArea.initializeModelSelector([], []);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
