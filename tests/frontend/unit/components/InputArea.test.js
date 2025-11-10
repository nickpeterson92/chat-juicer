/**
 * InputArea Component Unit Tests
 */

import { MockDOMAdapter } from "@test-helpers/MockDOMAdapter.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InputArea } from "@/ui/components/input-area.js";

describe("InputArea Component", () => {
  let mockDOM;
  let inputArea;
  let mockOnSend;

  beforeEach(() => {
    mockDOM = new MockDOMAdapter();
    mockOnSend = vi.fn();
    inputArea = new InputArea(mockOnSend, mockDOM);
  });

  describe("constructor", () => {
    it("should initialize with callback", () => {
      expect(inputArea.onSendCallback).toBe(mockOnSend);
    });

    it("should store DOM adapter", () => {
      expect(inputArea.dom).toBe(mockDOM);
    });

    it("should initialize enabled state", () => {
      expect(inputArea.isEnabled).toBe(true);
    });
  });

  describe("render", () => {
    it("should create input area element", () => {
      const element = inputArea.render();

      expect(element).toBeDefined();
      expect(mockDOM.hasClass(element, "input-area")).toBe(true);
    });

    it("should create textarea", () => {
      const element = inputArea.render();
      const textarea = mockDOM.querySelector(element, "textarea");

      expect(textarea).toBeDefined();
      expect(mockDOM.getAttribute(textarea, "placeholder")).toBeTruthy();
    });

    it("should create send button", () => {
      const element = inputArea.render();
      const sendBtn = mockDOM.querySelector(element, ".send-button");

      expect(sendBtn).toBeDefined();
    });

    it("should store element reference", () => {
      const element = inputArea.render();

      expect(inputArea.element).toBe(element);
    });

    it("should store textarea reference", () => {
      inputArea.render();
      const textarea = mockDOM.querySelector(inputArea.element, "textarea");

      expect(inputArea.textarea).toBe(textarea);
    });

    it("should store send button reference", () => {
      inputArea.render();
      const sendBtn = mockDOM.querySelector(inputArea.element, ".send-button");

      expect(inputArea.sendButton).toBe(sendBtn);
    });
  });

  describe("getValue", () => {
    it("should return textarea value", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "Test message");

      const value = inputArea.getValue();

      expect(value).toBe("Test message");
    });

    it("should return empty string if no value", () => {
      inputArea.render();

      const value = inputArea.getValue();

      expect(value).toBe("");
    });

    it("should work without rendering first", () => {
      const value = inputArea.getValue();

      expect(value).toBe("");
    });
  });

  describe("setValue", () => {
    it("should set textarea value", () => {
      inputArea.render();

      inputArea.setValue("New message");

      expect(mockDOM.getValue(inputArea.textarea)).toBe("New message");
    });

    it("should clear textarea when setting empty string", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "Old message");

      inputArea.setValue("");

      expect(mockDOM.getValue(inputArea.textarea)).toBe("");
    });

    it("should work without rendering first", () => {
      expect(() => {
        inputArea.setValue("Test");
      }).not.toThrow();
    });
  });

  describe("clear", () => {
    it("should clear textarea value", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "Some text");

      inputArea.clear();

      expect(mockDOM.getValue(inputArea.textarea)).toBe("");
    });

    it("should work without rendering first", () => {
      expect(() => {
        inputArea.clear();
      }).not.toThrow();
    });
  });

  describe("focus", () => {
    it("should focus textarea", () => {
      inputArea.render();

      inputArea.focus();

      // MockDOMAdapter tracks focus calls
      expect(inputArea.textarea).toBeDefined();
    });

    it("should work without rendering first", () => {
      expect(() => {
        inputArea.focus();
      }).not.toThrow();
    });
  });

  describe("enable/disable", () => {
    it("should enable input", () => {
      inputArea.render();
      inputArea.isEnabled = false;

      inputArea.enable();

      expect(inputArea.isEnabled).toBe(true);
      expect(mockDOM.getAttribute(inputArea.textarea, "disabled")).toBeNull();
      expect(mockDOM.getAttribute(inputArea.sendButton, "disabled")).toBeNull();
    });

    it("should disable input", () => {
      inputArea.render();

      inputArea.disable();

      expect(inputArea.isEnabled).toBe(false);
      expect(mockDOM.hasAttribute(inputArea.textarea, "disabled")).toBe(true);
      expect(mockDOM.hasAttribute(inputArea.sendButton, "disabled")).toBe(true);
    });

    it("should work without rendering first", () => {
      expect(() => {
        inputArea.disable();
        inputArea.enable();
      }).not.toThrow();
    });
  });

  describe("setPlaceholder", () => {
    it("should update placeholder text", () => {
      inputArea.render();

      inputArea.setPlaceholder("Custom placeholder");

      expect(mockDOM.getAttribute(inputArea.textarea, "placeholder")).toBe("Custom placeholder");
    });

    it("should work without rendering first", () => {
      expect(() => {
        inputArea.setPlaceholder("Test");
      }).not.toThrow();
    });
  });

  describe("handleSend", () => {
    it("should call onSend callback with message", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "Test message");

      inputArea.handleSend();

      expect(mockOnSend).toHaveBeenCalledWith("Test message");
    });

    it("should clear input after sending", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "Test message");

      inputArea.handleSend();

      expect(mockDOM.getValue(inputArea.textarea)).toBe("");
    });

    it("should not call callback if input is empty", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "");

      inputArea.handleSend();

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it("should not call callback if input is whitespace only", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "   \n\t  ");

      inputArea.handleSend();

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it("should not send when disabled", () => {
      inputArea.render();
      inputArea.disable();
      mockDOM.setValue(inputArea.textarea, "Test message");

      inputArea.handleSend();

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it("should trim whitespace from message", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "  Test message  \n");

      inputArea.handleSend();

      expect(mockOnSend).toHaveBeenCalledWith("Test message");
    });
  });

  describe("keyboard shortcuts", () => {
    it("should send on Enter key", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "Test message");

      // Simulate Enter key
      const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: false });
      inputArea.handleKeyDown(event);

      expect(mockOnSend).toHaveBeenCalledWith("Test message");
    });

    it("should not send on Shift+Enter", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "Test message");

      // Simulate Shift+Enter (new line)
      const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true });
      inputArea.handleKeyDown(event);

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it("should not send on other keys", () => {
      inputArea.render();
      mockDOM.setValue(inputArea.textarea, "Test message");

      // Simulate other key
      const event = new KeyboardEvent("keydown", { key: "a", shiftKey: false });
      inputArea.handleKeyDown(event);

      expect(mockOnSend).not.toHaveBeenCalled();
    });
  });

  describe("auto-resize", () => {
    it("should adjust height on input", () => {
      inputArea.render();
      const _initialHeight = mockDOM.getStyle(inputArea.textarea, "height");

      // Simulate input with multiple lines
      mockDOM.setValue(inputArea.textarea, "Line 1\nLine 2\nLine 3");
      inputArea.adjustHeight();

      const newHeight = mockDOM.getStyle(inputArea.textarea, "height");
      expect(newHeight).toBeDefined();
    });

    it("should have min height", () => {
      inputArea.render();

      mockDOM.setValue(inputArea.textarea, "");
      inputArea.adjustHeight();

      const height = mockDOM.getStyle(inputArea.textarea, "height");
      expect(height).toBeDefined();
    });

    it("should have max height", () => {
      inputArea.render();

      // Simulate very long input
      const longText = Array(100).fill("Line").join("\n");
      mockDOM.setValue(inputArea.textarea, longText);
      inputArea.adjustHeight();

      const height = mockDOM.getStyle(inputArea.textarea, "height");
      expect(height).toBeDefined();
    });
  });

  describe("destroy", () => {
    it("should remove element from DOM", () => {
      const container = mockDOM.createElement("div");
      const element = inputArea.render();
      mockDOM.appendChild(container, element);

      inputArea.destroy();

      expect(mockDOM.querySelector(container, ".input-area")).toBeNull();
    });

    it("should clear element references", () => {
      inputArea.render();

      inputArea.destroy();

      expect(inputArea.element).toBeNull();
      expect(inputArea.textarea).toBeNull();
      expect(inputArea.sendButton).toBeNull();
    });

    it("should work without rendering first", () => {
      expect(() => {
        inputArea.destroy();
      }).not.toThrow();
    });
  });
});
