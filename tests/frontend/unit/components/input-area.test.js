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
      expect(entry?.listeners ?? 0).toBe(0);
    });

    it("should initialize with appState", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      expect(inputArea.appState).toBe(appState);
      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "InputArea");
      expect(entry?.listeners).toBe(1); // isStreaming subscription
    });

    it("should throw error without required elements", () => {
      expect(() => new InputArea(null, sendButton, onSendCallback)).toThrow(
        "InputArea requires existing textarea and button elements"
      );
    });
  });

  describe("AppState integration", () => {
    it("should subscribe to message.isStreaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      expect(inputArea.isEnabled).toBe(true);

      // Start streaming - should disable
      appState.setState("message.isStreaming", true);
      expect(inputArea.isEnabled).toBe(false);
      expect(textarea.hasAttribute("disabled")).toBe(true);

      // Stop streaming - should enable
      appState.setState("message.isStreaming", false);
      expect(inputArea.isEnabled).toBe(true);
      expect(textarea.hasAttribute("disabled")).toBe(false);
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
      expect(entryBefore?.listeners).toBe(1);

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
  });
});
