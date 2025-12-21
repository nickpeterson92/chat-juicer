/**
 * InputArea Component Unit Tests
 * Phase 4 State Management Migration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalLifecycleManager } from "@/core/lifecycle-manager.js";
import { AppState } from "@/core/state.js";
import { InputArea } from "@/ui/components/input-area.js";

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
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
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
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
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

    it("should respect min height of 40px", async () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      Object.defineProperty(textarea, "scrollHeight", {
        value: 20,
        writable: true,
      });

      inputArea.adjustHeight();

      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(textarea.style.height).toBe("40px");
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
});
