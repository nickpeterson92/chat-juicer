/**
 * MessageViewModel Unit Tests
 * Tests for message transformation and validation
 */

import { describe, expect, it } from "vitest";
import {
  createMessageViewModel,
  parseMessageContent,
  shouldDisplayMessage,
  truncateMessageContent,
  validateMessage,
} from "@/viewmodels/message-viewmodel.js";

describe("parseMessageContent", () => {
  it("should return string content as-is", () => {
    const result = parseMessageContent("Hello world");

    expect(result).toBe("Hello world");
  });

  it("should extract text from array of content parts", () => {
    const content = [{ text: "Hello " }, { text: "world" }];

    const result = parseMessageContent(content);

    expect(result).toBe("Hello world");
  });

  it("should extract text from objects with text property", () => {
    const content = [{ text: "Message" }];

    const result = parseMessageContent(content);

    expect(result).toBe("Message");
  });

  it("should extract output from objects with output property", () => {
    const content = [{ output: "Output text" }];

    const result = parseMessageContent(content);

    expect(result).toBe("Output text");
  });

  it("should handle mixed array content", () => {
    const content = ["Direct string", { text: "Object text" }, { output: "Output" }];

    const result = parseMessageContent(content);

    expect(result).toBe("Direct stringObject textOutput");
  });

  it("should filter out empty items in arrays", () => {
    const content = [{ text: "Hello" }, {}, { text: "World" }];

    const result = parseMessageContent(content);

    expect(result).toBe("HelloWorld");
  });

  it("should stringify non-string, non-array objects", () => {
    const content = { data: "value" };

    const result = parseMessageContent(content);

    expect(result).toBe('{"data":"value"}');
  });
});

describe("shouldDisplayMessage", () => {
  it("should display user message with content", () => {
    const msg = { role: "user", content: "Hello" };

    const result = shouldDisplayMessage(msg);

    expect(result).toBe(true);
  });

  it("should display assistant message with content", () => {
    const msg = { role: "assistant", content: "Hi there" };

    const result = shouldDisplayMessage(msg);

    expect(result).toBe(true);
  });

  it("should not display system messages", () => {
    const msg = { role: "system", content: "System message" };

    const result = shouldDisplayMessage(msg);

    expect(result).toBe(false);
  });

  it("should not display messages with empty content", () => {
    const msg = { role: "user", content: "" };

    const result = shouldDisplayMessage(msg);

    expect(result).toBeFalsy();
  });

  it("should not display messages with whitespace-only content", () => {
    const msg = { role: "user", content: "   " };

    const result = shouldDisplayMessage(msg);

    expect(result).toBe(false);
  });

  it("should default to assistant role if not specified", () => {
    const msg = { content: "Hello" };

    const result = shouldDisplayMessage(msg);

    expect(result).toBe(true);
  });
});

describe("createMessageViewModel", () => {
  it("should create view model for user message", () => {
    const msg = { role: "user", content: "Hello" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.role).toBe("user");
    expect(viewModel.content).toBe("Hello");
    expect(viewModel.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
    expect(viewModel.shouldRenderMarkdown).toBe(false);
  });

  it("should create view model for assistant message", () => {
    const msg = { role: "assistant", content: "Hi there" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.role).toBe("assistant");
    expect(viewModel.content).toBe("Hi there");
    expect(viewModel.shouldRenderMarkdown).toBe(true);
  });

  it("should create view model for system message", () => {
    const msg = { role: "system", content: "System message" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.role).toBe("system");
    expect(viewModel.content).toBe("System message");
    expect(viewModel.shouldRenderMarkdown).toBe(false);
  });

  it("should create view model for error message", () => {
    const msg = { role: "error", content: "Error occurred" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.role).toBe("error");
    expect(viewModel.content).toBe("Error occurred");
    expect(viewModel.shouldRenderMarkdown).toBe(false);
  });

  it("should default to assistant role if not specified", () => {
    const msg = { content: "Hello" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.role).toBe("assistant");
    expect(viewModel.shouldRenderMarkdown).toBe(true);
  });

  it("should include base classes for all messages", () => {
    const msg = { role: "user", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.baseClasses).toContain("message");
    expect(viewModel.baseClasses).toContain("mb-6");
    expect(viewModel.baseClasses).toContain("animate-slideIn");
  });

  it("should include user-specific classes", () => {
    const msg = { role: "user", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.baseClasses).toContain("user");
    expect(viewModel.baseClasses).toContain("text-left");
  });

  it("should include assistant-specific classes", () => {
    const msg = { role: "assistant", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.baseClasses).toContain("assistant");
  });

  it("should include system-specific classes", () => {
    const msg = { role: "system", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.baseClasses).toContain("system");
  });

  it("should include error-specific classes", () => {
    const msg = { role: "error", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.baseClasses).toContain("error");
  });

  it("should include user content classes", () => {
    const msg = { role: "user", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.contentClasses).toContain("bg-user-gradient");
    expect(viewModel.contentClasses).toContain("text-white");
  });

  it("should include assistant content classes", () => {
    const msg = { role: "assistant", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.contentClasses).toContain("message-content");
    expect(viewModel.contentClasses).toContain("text-gray-800");
  });

  it("should include system content classes", () => {
    const msg = { role: "system", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.contentClasses).toContain("bg-amber-50");
    expect(viewModel.contentClasses).toContain("text-amber-900");
    expect(viewModel.contentClasses).toContain("italic");
  });

  it("should include error content classes", () => {
    const msg = { role: "error", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.contentClasses).toContain("bg-red-50");
    expect(viewModel.contentClasses).toContain("text-red-900");
  });

  it("should handle unknown role with default classes", () => {
    const msg = { role: "unknown", content: "Test" };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.baseClasses).toContain("message");
    expect(viewModel.contentClasses).toContain("message-content"); // defaults to assistant
  });

  it("should parse complex content", () => {
    const msg = { role: "user", content: [{ text: "Hello " }, { text: "world" }] };

    const viewModel = createMessageViewModel(msg);

    expect(viewModel.content).toBe("Hello world");
  });

  it("should generate unique message IDs", () => {
    const msg = { role: "user", content: "Test" };

    const viewModel1 = createMessageViewModel(msg);
    const viewModel2 = createMessageViewModel(msg);

    expect(viewModel1.id).not.toBe(viewModel2.id);
  });
});

describe("validateMessage", () => {
  it("should validate valid user message", () => {
    const msg = { role: "user", content: "Hello" };

    const result = validateMessage(msg);

    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("should validate valid assistant message", () => {
    const msg = { role: "assistant", content: "Hi there" };

    const result = validateMessage(msg);

    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("should reject null message", () => {
    const result = validateMessage(null);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("object");
  });

  it("should reject non-object message", () => {
    const result = validateMessage("not an object");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("object");
  });

  it("should reject message without role", () => {
    const msg = { content: "Hello" };

    const result = validateMessage(msg);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("role");
  });

  it("should reject message with undefined content", () => {
    const msg = { role: "user", content: undefined };

    const result = validateMessage(msg);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("content");
  });

  it("should reject message with null content", () => {
    const msg = { role: "user", content: null };

    const result = validateMessage(msg);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("content");
  });

  it("should reject message with empty string content", () => {
    const msg = { role: "user", content: "" };

    const result = validateMessage(msg);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("should reject message with whitespace-only content", () => {
    const msg = { role: "user", content: "   " };

    const result = validateMessage(msg);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("should reject message with invalid role", () => {
    const msg = { role: "invalid", content: "Hello" };

    const result = validateMessage(msg);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid role");
    expect(result.error).toContain("invalid");
  });

  it("should accept system role", () => {
    const msg = { role: "system", content: "System message" };

    const result = validateMessage(msg);

    expect(result.valid).toBe(true);
  });

  it("should accept error role", () => {
    const msg = { role: "error", content: "Error message" };

    const result = validateMessage(msg);

    expect(result.valid).toBe(true);
  });

  it("should handle complex content types", () => {
    const msg = { role: "user", content: [{ text: "Hello" }] };

    const result = validateMessage(msg);

    expect(result.valid).toBe(true);
  });
});

describe("truncateMessageContent", () => {
  it("should not truncate short content", () => {
    const result = truncateMessageContent("Short message");

    expect(result).toBe("Short message");
  });

  it("should truncate long content with default length", () => {
    const longMessage = "a".repeat(150);

    const result = truncateMessageContent(longMessage);

    expect(result).toBe(`${"a".repeat(100)}...`);
    expect(result.length).toBe(103); // 100 + "..."
  });

  it("should truncate with custom maxLength", () => {
    const longMessage = "Hello world this is a long message";

    const result = truncateMessageContent(longMessage, 10);

    expect(result).toBe("Hello worl...");
  });

  it("should handle exact maxLength", () => {
    const message = "a".repeat(100);

    const result = truncateMessageContent(message, 100);

    expect(result).toBe(message);
  });

  it("should handle array content", () => {
    const content = [{ text: "a".repeat(150) }];

    const result = truncateMessageContent(content, 50);

    expect(result).toBe(`${"a".repeat(50)}...`);
  });

  it("should handle object content", () => {
    const content = { data: "value" };

    const result = truncateMessageContent(content, 10);

    expect(result).toBe('{"data":"v...');
  });

  it("should handle empty content", () => {
    const result = truncateMessageContent("");

    expect(result).toBe("");
  });

  it("should handle content shorter than maxLength", () => {
    const result = truncateMessageContent("Hi", 100);

    expect(result).toBe("Hi");
  });
});
