/**
 * MessageViewModel Unit Tests
 */

import { describe, expect, it } from "vitest";
import {
  calculateMessageStats,
  createMessageListViewModel,
  createMessageViewModel,
  parseMessageContent,
  shouldDisplayMessage,
  truncateMessageContent,
  validateMessage,
} from "@/viewmodels/message-viewmodel.js";

describe("MessageViewModel", () => {
  describe("parseMessageContent", () => {
    it("should return string content as-is", () => {
      const content = "Hello world";
      expect(parseMessageContent(content)).toBe("Hello world");
    });

    it("should parse array of strings", () => {
      const content = ["Hello", " ", "world"];
      expect(parseMessageContent(content)).toBe("Hello world");
    });

    it("should parse array of objects with text property", () => {
      const content = [{ text: "Hello" }, { text: "world" }];
      expect(parseMessageContent(content)).toBe("Helloworld");
    });

    it("should parse array of objects with output property", () => {
      const content = [{ output: "Result" }];
      expect(parseMessageContent(content)).toBe("Result");
    });

    it("should filter empty items", () => {
      const content = [{ text: "Hello" }, {}, { text: "world" }];
      expect(parseMessageContent(content)).toBe("Helloworld");
    });

    it("should stringify non-string/non-array content", () => {
      const content = { data: "value" };
      expect(parseMessageContent(content)).toBe('{"data":"value"}');
    });
  });

  describe("shouldDisplayMessage", () => {
    it("should display user messages with content", () => {
      const msg = { role: "user", content: "Hello" };
      expect(shouldDisplayMessage(msg)).toBe(true);
    });

    it("should display assistant messages with content", () => {
      const msg = { role: "assistant", content: "Hi there" };
      expect(shouldDisplayMessage(msg)).toBe(true);
    });

    it("should not display messages without content", () => {
      const msg = { role: "user", content: "" };
      expect(shouldDisplayMessage(msg)).toBe(false);
    });

    it("should not display messages with whitespace-only content", () => {
      const msg = { role: "user", content: "   " };
      expect(shouldDisplayMessage(msg)).toBe(false);
    });

    it("should not display system messages", () => {
      const msg = { role: "system", content: "Internal message" };
      expect(shouldDisplayMessage(msg)).toBe(false);
    });

    it("should not display tool messages", () => {
      const msg = { role: "tool", content: "Tool result" };
      expect(shouldDisplayMessage(msg)).toBe(false);
    });
  });

  describe("createMessageViewModel", () => {
    it("should create user message view model", () => {
      const msg = { role: "user", content: "Hello" };
      const vm = createMessageViewModel(msg);

      expect(vm.role).toBe("user");
      expect(vm.content).toBe("Hello");
      expect(vm.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(vm.shouldRenderMarkdown).toBe(false);
      expect(vm.baseClasses).toContain("user");
    });

    it("should create assistant message view model", () => {
      const msg = { role: "assistant", content: "Hi there" };
      const vm = createMessageViewModel(msg);

      expect(vm.role).toBe("assistant");
      expect(vm.shouldRenderMarkdown).toBe(true);
      expect(vm.baseClasses).toContain("assistant");
    });

    it("should create error message view model", () => {
      const msg = { role: "error", content: "Error occurred" };
      const vm = createMessageViewModel(msg);

      expect(vm.role).toBe("error");
      expect(vm.contentClasses).toContain("red");
    });

    it("should create system message view model", () => {
      const msg = { role: "system", content: "System message" };
      const vm = createMessageViewModel(msg);

      expect(vm.role).toBe("system");
    });

    it("should default to assistant role if not specified", () => {
      const msg = { content: "Hello" };
      const vm = createMessageViewModel(msg);

      expect(vm.role).toBe("assistant");
    });

    it("should have proper CSS classes structure", () => {
      const msg = { role: "user", content: "Hello" };
      const vm = createMessageViewModel(msg);

      expect(vm.baseClasses).toContain("message");
      expect(vm.baseClasses).toContain("mb-6");
      expect(vm.baseClasses).toContain("animate-slideIn");
    });

    it("should generate unique message IDs", () => {
      const msg = { role: "user", content: "Hello" };
      const vm1 = createMessageViewModel(msg);
      const vm2 = createMessageViewModel(msg);

      expect(vm1.id).not.toBe(vm2.id);
    });
  });

  describe("createMessageListViewModel", () => {
    it("should create view models for multiple messages", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];

      const viewModels = createMessageListViewModel(messages);

      expect(viewModels).toHaveLength(2);
      expect(viewModels[0].role).toBe("user");
      expect(viewModels[1].role).toBe("assistant");
    });

    it("should filter non-displayable messages", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "system", content: "Internal" }, // Filtered
        { role: "assistant", content: "Hi" },
      ];

      const viewModels = createMessageListViewModel(messages);

      expect(viewModels).toHaveLength(2);
    });

    it("should handle empty array", () => {
      const viewModels = createMessageListViewModel([]);

      expect(viewModels).toEqual([]);
    });

    it("should handle null input", () => {
      const viewModels = createMessageListViewModel(null);

      expect(viewModels).toEqual([]);
    });

    it("should handle non-array input", () => {
      const viewModels = createMessageListViewModel("not an array");

      expect(viewModels).toEqual([]);
    });
  });

  describe("calculateMessageStats", () => {
    it("should calculate statistics for messages", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
      ];

      const stats = calculateMessageStats(messages);

      expect(stats.total).toBe(3);
      expect(stats.userMessages).toBe(2);
      expect(stats.assistantMessages).toBe(1);
      expect(stats.totalCharacters).toBeGreaterThan(0);
    });

    it("should handle empty array", () => {
      const stats = calculateMessageStats([]);

      expect(stats.total).toBe(0);
      expect(stats.userMessages).toBe(0);
      expect(stats.assistantMessages).toBe(0);
      expect(stats.totalCharacters).toBe(0);
    });

    it("should handle null input", () => {
      const stats = calculateMessageStats(null);

      expect(stats.total).toBe(0);
    });

    it("should count characters correctly", () => {
      const messages = [{ role: "user", content: "Hello" }]; // 5 chars

      const stats = calculateMessageStats(messages);

      expect(stats.totalCharacters).toBe(5);
    });

    it("should handle array content", () => {
      const messages = [{ role: "user", content: [{ text: "Hello" }, { text: "world" }] }];

      const stats = calculateMessageStats(messages);

      expect(stats.totalCharacters).toBe(10); // "Helloworld"
    });
  });

  describe("validateMessage", () => {
    it("should validate valid message", () => {
      const msg = { role: "user", content: "Hello" };
      const result = validateMessage(msg);

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it("should reject non-object", () => {
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

    it("should reject message without content", () => {
      const msg = { role: "user" };
      const result = validateMessage(msg);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("content");
    });

    it("should accept null content", () => {
      // Content can be null but must be present
      const msg = { role: "user", content: null };
      const result = validateMessage(msg);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("content");
    });

    it("should accept empty string content", () => {
      // Empty string is valid content (validation only checks presence)
      const msg = { role: "user", content: "" };
      const result = validateMessage(msg);

      expect(result.valid).toBe(true);
    });

    it("should reject invalid role", () => {
      const msg = { role: "invalid", content: "Hello" };
      const result = validateMessage(msg);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid role");
    });

    it("should accept all valid roles", () => {
      const roles = ["user", "assistant", "system", "error"];

      for (const role of roles) {
        const msg = { role, content: "test" };
        const result = validateMessage(msg);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe("truncateMessageContent", () => {
    it("should truncate long content", () => {
      const content = "A".repeat(200);
      const truncated = truncateMessageContent(content, 100);

      expect(truncated.length).toBe(103); // 100 + "..."
      expect(truncated.endsWith("...")).toBe(true);
    });

    it("should not truncate short content", () => {
      const content = "Short content";
      const truncated = truncateMessageContent(content, 100);

      expect(truncated).toBe("Short content");
    });

    it("should use default max length", () => {
      const content = "A".repeat(200);
      const truncated = truncateMessageContent(content);

      expect(truncated.length).toBe(103); // 100 (default) + "..."
    });

    it("should handle array content", () => {
      const content = [{ text: "Hello" }, { text: "world" }];
      const truncated = truncateMessageContent(content, 5);

      expect(truncated).toBe("Hello...");
    });

    it("should handle object content", () => {
      const content = { data: "A".repeat(200) };
      const truncated = truncateMessageContent(content, 20);

      expect(truncated.length).toBe(23); // 20 + "..."
      expect(truncated.endsWith("...")).toBe(true);
    });
  });
});
