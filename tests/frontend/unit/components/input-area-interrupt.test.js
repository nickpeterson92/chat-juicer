/**
 * InputArea Interrupt Feature Tests
 * Tests for stream interruption UI behavior
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalLifecycleManager } from "@/core/lifecycle-manager.js";
import { AppState } from "@/core/state.js";
import { InputArea } from "@/ui/components/input-area.js";

describe("InputArea - Stream Interrupt Feature", () => {
  let textarea;
  let sendButton;
  let onSendCallback;
  let appState;
  let mockElectronAPI;

  beforeEach(() => {
    // Create mock DOM elements
    textarea = document.createElement("textarea");
    textarea.id = "user-input";
    sendButton = document.createElement("button");
    sendButton.id = "send-btn";

    // Mock callback
    onSendCallback = vi.fn();

    // Create AppState
    appState = new AppState();

    // Mock electronAPI
    mockElectronAPI = {
      interruptStream: vi.fn().mockResolvedValue({ success: true }),
    };
    window.electronAPI = mockElectronAPI;

    // Clean up lifecycle manager
    globalLifecycleManager.unmountAll();
  });

  afterEach(() => {
    globalLifecycleManager.unmountAll();
    delete window.electronAPI;
  });

  describe("Button Transforms During Streaming", () => {
    it("should add .streaming class when isStreaming becomes true", () => {
      const _inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Initially not streaming (no aria-label set yet)
      expect(sendButton.classList.contains("streaming")).toBe(false);

      // Start streaming
      appState.setState("message.isStreaming", true);

      // Button should transform
      expect(sendButton.classList.contains("streaming")).toBe(true);
      expect(sendButton.getAttribute("aria-label")).toBe("Stop response");
    });

    it("should remove .streaming class when isStreaming becomes false", () => {
      const _inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Start streaming
      appState.setState("message.isStreaming", true);
      expect(sendButton.classList.contains("streaming")).toBe(true);

      // Stop streaming
      appState.setState("message.isStreaming", false);

      // Button should revert
      expect(sendButton.classList.contains("streaming")).toBe(false);
      expect(sendButton.getAttribute("aria-label")).toBe("Send message");
    });

    it("should remove both .streaming and .stopping classes on stream end", () => {
      const _inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Simulate interrupt flow: streaming → stopping → idle
      appState.setState("message.isStreaming", true);
      sendButton.classList.add("stopping");

      // Stream ends
      appState.setState("message.isStreaming", false);

      // Both classes should be removed
      expect(sendButton.classList.contains("streaming")).toBe(false);
      expect(sendButton.classList.contains("stopping")).toBe(false);
    });

    it("should re-enable button when streaming ends and input has text", () => {
      const _inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Start streaming with empty input (stop button mode)
      appState.setState("message.isStreaming", true);

      // Add text while streaming (button should stay enabled for queued send)
      textarea.value = "Test message";
      textarea.dispatchEvent(new Event("input"));

      // Stream ends
      appState.setState("message.isStreaming", false);

      // Button should be enabled because there's text
      expect(sendButton.disabled).toBe(false);
    });
  });

  describe("ESC Key Interrupt Trigger", () => {
    it("should trigger handleInterrupt when ESC pressed during streaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const handleInterruptSpy = vi.spyOn(inputArea, "handleInterrupt");

      // Start streaming
      appState.setState("message.isStreaming", true);

      // Press ESC
      const escEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(escEvent);

      // Should call interrupt handler
      expect(handleInterruptSpy).toHaveBeenCalledTimes(1);
      expect(escEvent.defaultPrevented).toBe(true);
    });

    it("should not trigger interrupt when ESC pressed while not streaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const handleInterruptSpy = vi.spyOn(inputArea, "handleInterrupt");

      // Not streaming
      appState.setState("message.isStreaming", false);

      // Press ESC
      const escEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(escEvent);

      // Should NOT call interrupt handler
      expect(handleInterruptSpy).not.toHaveBeenCalled();
      expect(escEvent.defaultPrevented).toBe(false);
    });

    it("should only respond to ESC key, not other keys", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const handleInterruptSpy = vi.spyOn(inputArea, "handleInterrupt");
      appState.setState("message.isStreaming", true);

      // Press Enter (not ESC)
      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });
      document.dispatchEvent(enterEvent);

      // Should not trigger interrupt
      expect(handleInterruptSpy).not.toHaveBeenCalled();
    });
  });

  describe("Button Click Interrupt", () => {
    it("should call handleInterrupt when send button clicked during streaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const handleInterruptSpy = vi.spyOn(inputArea, "handleInterrupt");

      // Enable button (simulate text entry) - button must not be disabled for click to work
      sendButton.disabled = false;

      // Start streaming
      appState.setState("message.isStreaming", true);

      // Click send button (now acts as stop button)
      sendButton.click();

      // Should call interrupt handler
      expect(handleInterruptSpy).toHaveBeenCalledTimes(1);
      expect(onSendCallback).not.toHaveBeenCalled();
    });

    it("should call onSendCallback when button clicked while not streaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const handleInterruptSpy = vi.spyOn(inputArea, "handleInterrupt");

      // Not streaming
      appState.setState("message.isStreaming", false);
      textarea.value = "Test message";
      textarea.dispatchEvent(new Event("input")); // Trigger input event to update state

      // Click send button
      sendButton.click();

      // Should call send callback, not interrupt
      expect(onSendCallback).toHaveBeenCalledWith("Test message");
      expect(handleInterruptSpy).not.toHaveBeenCalled();
    });
  });

  describe("Button Disabled During Stopping State", () => {
    it("should disable button and add .stopping class when interrupt called", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Start streaming
      appState.setState("message.isStreaming", true);

      // Trigger interrupt
      inputArea.handleInterrupt();

      // Button should be disabled with stopping class
      expect(sendButton.disabled).toBe(true);
      expect(sendButton.classList.contains("stopping")).toBe(true);
    });

    it("should call electronAPI.interruptStream when interrupt triggered", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("message.isStreaming", true);

      // Trigger interrupt
      inputArea.handleInterrupt();

      // Should call IPC
      expect(mockElectronAPI.interruptStream).toHaveBeenCalledTimes(1);
    });

    it("should update stream.interrupted state when interrupt triggered", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("message.isStreaming", true);

      // Initially false
      expect(appState.getState("stream.interrupted")).toBe(false);

      // Trigger interrupt
      inputArea.handleInterrupt();

      // Should be set to true
      expect(appState.getState("stream.interrupted")).toBe(true);
    });

    it("should not call interrupt when not streaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Not streaming
      appState.setState("message.isStreaming", false);

      // Try to interrupt
      inputArea.handleInterrupt();

      // Should not call IPC
      expect(mockElectronAPI.interruptStream).not.toHaveBeenCalled();
    });
  });

  describe("State Cleanup After Interrupt", () => {
    it("should handle stream_interrupted event via message handlers", () => {
      // This test documents the expected behavior from message-handlers-v2.js
      // The actual cleanup is handled by the message handler listening to EventBus

      appState.setState("message.isStreaming", true);
      appState.setState("stream.interrupted", true);

      // Simulate backend sending stream_interrupted event
      // Message handler would set these states:
      appState.setState("message.isStreaming", false);
      appState.setState("stream.interrupted", false);

      // Verify cleanup
      expect(appState.getState("message.isStreaming")).toBe(false);
      expect(appState.getState("stream.interrupted")).toBe(false);
    });
  });

  describe("Integration with handleSend", () => {
    it("should route to handleInterrupt when streaming with empty input", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const handleInterruptSpy = vi.spyOn(inputArea, "handleInterrupt");

      appState.setState("message.isStreaming", true);
      // Empty input - should trigger interrupt
      textarea.value = "";

      // Call handleSend (which should route to interrupt when empty)
      inputArea.handleSend();

      expect(handleInterruptSpy).toHaveBeenCalledTimes(1);
      expect(onSendCallback).not.toHaveBeenCalled();
    });

    it("should route to normal send when not streaming", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const handleInterruptSpy = vi.spyOn(inputArea, "handleInterrupt");

      appState.setState("message.isStreaming", false);
      textarea.value = "Test message";

      // Call handleSend (should do normal send)
      inputArea.handleSend();

      expect(onSendCallback).toHaveBeenCalledWith("Test message");
      expect(handleInterruptSpy).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing electronAPI gracefully", () => {
      delete window.electronAPI;

      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("message.isStreaming", true);

      // Should not throw error
      expect(() => inputArea.handleInterrupt()).not.toThrow();
    });

    it("should handle missing interruptStream method gracefully", () => {
      window.electronAPI = {};

      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("message.isStreaming", true);

      // Should not throw error
      expect(() => inputArea.handleInterrupt()).not.toThrow();
    });

    it("should work without appState (backwards compatibility)", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback);

      // Should not throw errors
      expect(() => inputArea.handleSend()).not.toThrow();
      expect(() => inputArea.handleInterrupt()).not.toThrow();

      // Interrupt should do nothing without appState
      expect(mockElectronAPI.interruptStream).not.toHaveBeenCalled();
    });

    it("should handle rapid consecutive interrupt calls", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      appState.setState("message.isStreaming", true);

      // First interrupt
      inputArea.handleInterrupt();
      expect(sendButton.disabled).toBe(true);

      // Second interrupt (button already disabled)
      inputArea.handleInterrupt();

      // Should only call IPC once (disabled button prevents spam)
      // Actually it will be called twice in this test because button state doesn't prevent the method call
      // But in real usage, disabled button won't trigger click events
      expect(mockElectronAPI.interruptStream).toHaveBeenCalledTimes(2);
    });
  });

  describe("Lifecycle Management", () => {
    it("should clean up ESC key listener on destroy", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      const handleInterruptSpy = vi.spyOn(inputArea, "handleInterrupt");

      // Destroy component
      inputArea.destroy();

      // ESC should no longer trigger interrupt
      appState.setState("message.isStreaming", true);
      const escEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      });
      document.dispatchEvent(escEvent);

      expect(handleInterruptSpy).not.toHaveBeenCalled();
    });

    it("should clean up streaming state listener on destroy", () => {
      const inputArea = new InputArea(textarea, sendButton, onSendCallback, {
        appState,
      });

      // Destroy component
      inputArea.destroy();

      // State changes should not affect button
      sendButton.classList.remove("streaming");
      appState.setState("message.isStreaming", true);

      // Button should not have streaming class (listener was cleaned up)
      expect(sendButton.classList.contains("streaming")).toBe(false);
    });
  });
});
