/**
 * MessageRenderer Unit Tests
 */

import { MockDOMAdapter } from "@test-helpers/MockDOMAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getMessageContent,
  getMessageId,
  renderAssistantMessage,
  renderErrorMessage,
  renderMessage,
  renderMessageBatch,
  renderSystemMessage,
  renderUserMessage,
  updateMessageContent,
} from "@/ui/renderers/message-renderer.js";

describe("MessageRenderer", () => {
  let mockDOM;

  beforeEach(() => {
    mockDOM = new MockDOMAdapter();
  });

  describe("renderMessage", () => {
    it("should render user message from view model", () => {
      const viewModel = {
        id: "msg-123",
        role: "user",
        content: "Hello world",
        baseClasses: "message mb-6 user",
        contentClasses: "inline-block py-3 px-4 bg-user-gradient text-white",
        shouldRenderMarkdown: false,
      };

      const element = renderMessage(viewModel, mockDOM);

      expect(element).toBeDefined();
      expect(mockDOM.getAttribute(element, "data-message-id")).toBe("msg-123");
      expect(mockDOM.hasClass(element, "message")).toBe(true);
      expect(mockDOM.hasClass(element, "user")).toBe(true);
    });

    it("should render assistant message from view model", () => {
      const viewModel = {
        id: "msg-456",
        role: "assistant",
        content: "<p>Hi there</p>",
        baseClasses: "message mb-6 assistant",
        contentClasses: "message-content text-gray-800",
        shouldRenderMarkdown: true,
      };

      const element = renderMessage(viewModel, mockDOM);

      expect(element).toBeDefined();
      expect(mockDOM.getAttribute(element, "data-message-id")).toBe("msg-456");
      expect(mockDOM.hasClass(element, "assistant")).toBe(true);
    });

    it("should use innerHTML for markdown content", () => {
      const viewModel = {
        id: "msg-789",
        role: "assistant",
        content: "<p>Markdown</p>",
        baseClasses: "message assistant",
        contentClasses: "message-content",
        shouldRenderMarkdown: true,
      };

      const element = renderMessage(viewModel, mockDOM);
      const contentDiv = mockDOM.querySelector(element, "div");

      expect(mockDOM.getInnerHTML(contentDiv)).toContain("<p>Markdown</p>");
    });

    it("should use textContent for plain text", () => {
      const viewModel = {
        id: "msg-101",
        role: "user",
        content: "Plain text",
        baseClasses: "message user",
        contentClasses: "inline-block",
        shouldRenderMarkdown: false,
      };

      const element = renderMessage(viewModel, mockDOM);
      const contentDiv = mockDOM.querySelector(element, "div");

      expect(mockDOM.getTextContent(contentDiv)).toBe("Plain text");
    });
  });

  describe("renderMessageBatch", () => {
    it("should render multiple messages in fragment", () => {
      const viewModels = [
        {
          id: "msg-1",
          role: "user",
          content: "First",
          baseClasses: "message user",
          contentClasses: "inline-block",
          shouldRenderMarkdown: false,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Second",
          baseClasses: "message assistant",
          contentClasses: "message-content",
          shouldRenderMarkdown: true,
        },
      ];

      const fragment = renderMessageBatch(viewModels, mockDOM);

      expect(fragment).toBeDefined();
      expect(fragment.childNodes.length).toBe(2);
    });

    it("should handle empty array", () => {
      const fragment = renderMessageBatch([], mockDOM);

      expect(fragment).toBeDefined();
      expect(fragment.childNodes.length).toBe(0);
    });
  });

  describe("renderUserMessage", () => {
    it("should create user message element", () => {
      const element = renderUserMessage("Hello", mockDOM);

      expect(element).toBeDefined();
      expect(mockDOM.hasClass(element, "user")).toBe(true);
      expect(mockDOM.hasClass(element, "message")).toBe(true);
    });

    it("should set message content", () => {
      const element = renderUserMessage("Test content", mockDOM);
      const contentDiv = mockDOM.querySelector(element, "div");

      expect(mockDOM.getTextContent(contentDiv)).toBe("Test content");
    });

    it("should generate unique message ID", () => {
      const element1 = renderUserMessage("First", mockDOM);
      const element2 = renderUserMessage("Second", mockDOM);

      const id1 = mockDOM.getAttribute(element1, "data-message-id");
      const id2 = mockDOM.getAttribute(element2, "data-message-id");

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^msg-/);
      expect(id2).toMatch(/^msg-/);
    });
  });

  describe("renderAssistantMessage", () => {
    it("should create assistant message element", () => {
      const element = renderAssistantMessage("<p>Hi</p>", mockDOM);

      expect(element).toBeDefined();
      expect(mockDOM.hasClass(element, "assistant")).toBe(true);
    });

    it("should use innerHTML for markdown", () => {
      const element = renderAssistantMessage("<p>Markdown</p>", mockDOM);
      const contentDiv = mockDOM.querySelector(element, ".message-content");

      expect(mockDOM.getInnerHTML(contentDiv)).toBe("<p>Markdown</p>");
    });
  });

  describe("renderErrorMessage", () => {
    it("should create error message element", () => {
      const element = renderErrorMessage("Error occurred", mockDOM);

      expect(element).toBeDefined();
      expect(mockDOM.hasClass(element, "error")).toBe(true);
    });

    it("should set error content", () => {
      const element = renderErrorMessage("Something went wrong", mockDOM);
      const contentDiv = mockDOM.querySelector(element, "div");

      expect(mockDOM.getTextContent(contentDiv)).toBe("Something went wrong");
    });
  });

  describe("renderSystemMessage", () => {
    it("should create system message element", () => {
      const element = renderSystemMessage("System notification", mockDOM);

      expect(element).toBeDefined();
      expect(mockDOM.hasClass(element, "system")).toBe(true);
    });

    it("should set system content", () => {
      const element = renderSystemMessage("System info", mockDOM);
      const contentDiv = mockDOM.querySelector(element, "div");

      expect(mockDOM.getTextContent(contentDiv)).toBe("System info");
    });
  });

  describe("updateMessageContent", () => {
    it("should update markdown content", () => {
      const element = renderAssistantMessage("<p>Old</p>", mockDOM);

      updateMessageContent(element, "<p>New</p>", mockDOM);

      const contentDiv = mockDOM.querySelector(element, ".message-content");
      expect(mockDOM.getInnerHTML(contentDiv)).toBe("<p>New</p>");
    });

    it("should update plain text content", () => {
      const element = renderUserMessage("Old text", mockDOM);

      updateMessageContent(element, "New text", mockDOM);

      const contentDiv = mockDOM.querySelector(element, "div");
      expect(mockDOM.getTextContent(contentDiv)).toBe("New text");
    });

    it("should handle missing content div gracefully", () => {
      const emptyElement = mockDOM.createElement("div");

      // Should not throw
      expect(() => {
        updateMessageContent(emptyElement, "Content", mockDOM);
      }).not.toThrow();
    });
  });

  describe("getMessageContent", () => {
    it("should extract content from user message", () => {
      const element = renderUserMessage("Test message", mockDOM);

      const content = getMessageContent(element, mockDOM);

      expect(content).toBe("Test message");
    });

    it("should extract content from assistant message", () => {
      const element = renderAssistantMessage("Assistant response", mockDOM);

      const content = getMessageContent(element, mockDOM);

      expect(content).toBe("Assistant response");
    });

    it("should return empty string if no content div", () => {
      const emptyElement = mockDOM.createElement("div");

      const content = getMessageContent(emptyElement, mockDOM);

      expect(content).toBe("");
    });
  });

  describe("getMessageId", () => {
    it("should extract message ID", () => {
      const element = renderUserMessage("Test", mockDOM);

      const id = getMessageId(element, mockDOM);

      expect(id).toMatch(/^msg-/);
    });

    it("should return null if no ID attribute", () => {
      const element = mockDOM.createElement("div");

      const id = getMessageId(element, mockDOM);

      expect(id).toBeNull();
    });
  });
});
