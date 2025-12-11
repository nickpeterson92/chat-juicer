/**
 * MessageService Unit Tests
 */

import { MockIPCAdapter } from "@test-helpers/MockIPCAdapter.js";
import { MockStorageAdapter } from "@test-helpers/MockStorageAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import { MessageService } from "@/services/message-service.js";

describe("MessageService", () => {
  let messageService;
  let mockIPC;
  let mockStorage;

  beforeEach(() => {
    mockIPC = new MockIPCAdapter();
    mockStorage = new MockStorageAdapter();

    messageService = new MessageService({
      ipcAdapter: mockIPC,
      storageAdapter: mockStorage,
    });
  });

  describe("constructor", () => {
    it("should initialize with adapters", () => {
      expect(messageService.ipc).toBe(mockIPC);
      expect(messageService.storage).toBe(mockStorage);
    });

    it("should initialize message state", () => {
      expect(messageService.currentAssistantMessage).toBeNull();
      expect(messageService.assistantBuffer).toBe("");
      expect(messageService.messageCache).toBeInstanceOf(Map);
    });
  });

  describe("sendMessage", () => {
    it("should send message to backend", async () => {
      mockIPC.setResponse("user-input", { success: true });

      const result = await messageService.sendMessage("Hello", "session-123");

      expect(result.success).toBe(true);
      const calls = mockIPC.getCalls("user-input");
      expect(calls).toHaveLength(1);
      // Message is normalized to array format for batch support
      expect(calls[0].content).toEqual(["Hello"]);
      // Note: session_id is NOT sent - backend manages session context
    });

    it("should trim message content", async () => {
      mockIPC.setResponse("user-input", { success: true });

      await messageService.sendMessage("  Hello  ", "session-123");

      const calls = mockIPC.getCalls("user-input");
      // Message is normalized to array with trimmed content
      expect(calls[0].content).toEqual(["Hello"]);
    });

    it("should reject empty message", async () => {
      const result = await messageService.sendMessage("", "session-123");

      expect(result.success).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should reject whitespace-only message", async () => {
      const result = await messageService.sendMessage("   ", "session-123");

      expect(result.success).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should send message without session ID", async () => {
      mockIPC.setResponse("user-input", { success: true });

      const result = await messageService.sendMessage("Hello");

      expect(result.success).toBe(true);
      const calls = mockIPC.getCalls("user-input");
      expect(calls).toHaveLength(1);
      // Message is normalized to array format for batch support
      expect(calls[0].content).toEqual(["Hello"]);
    });

    it("should accept array inputs without re-wrapping", async () => {
      mockIPC.setResponse("user-input", { success: true });

      const result = await messageService.sendMessage(["Hello", "World"]);

      expect(result.success).toBe(true);
      const calls = mockIPC.getCalls("user-input");
      expect(calls[0].content).toEqual(["Hello", "World"]);
    });

    it("should handle IPC errors", async () => {
      mockIPC.setResponse("user-input", new Error("Network error"));

      const result = await messageService.sendMessage("Hello");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("startAssistantMessage", () => {
    it("should create new assistant message", () => {
      const messageId = messageService.startAssistantMessage();

      expect(messageId).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(messageService.currentAssistantMessage).toBe(messageId);
      expect(messageService.assistantBuffer).toBe("");
    });

    it("should generate unique message IDs", () => {
      const id1 = messageService.startAssistantMessage();
      messageService.finalizeAssistantMessage();
      const id2 = messageService.startAssistantMessage();

      expect(id1).not.toBe(id2);
    });
  });

  describe("appendAssistantDelta", () => {
    it("should append delta to buffer", () => {
      messageService.startAssistantMessage();

      const result = messageService.appendAssistantDelta("Hello");

      expect(result.content).toBe("Hello");
      expect(messageService.assistantBuffer).toBe("Hello");
    });

    it("should accumulate multiple deltas", () => {
      messageService.startAssistantMessage();

      messageService.appendAssistantDelta("Hello");
      messageService.appendAssistantDelta(" ");
      const result = messageService.appendAssistantDelta("world");

      expect(result.content).toBe("Hello world");
      expect(messageService.assistantBuffer).toBe("Hello world");
    });

    it("should auto-start message if not started", () => {
      const result = messageService.appendAssistantDelta("Hello");

      expect(result.messageId).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(result.content).toBe("Hello");
    });
  });

  describe("finalizeAssistantMessage", () => {
    it("should finalize current message", () => {
      messageService.startAssistantMessage();
      messageService.appendAssistantDelta("Hello world");

      const message = messageService.finalizeAssistantMessage();

      expect(message).toBeDefined();
      expect(message.role).toBe("assistant");
      expect(message.content).toBe("Hello world");
      expect(message.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
    });

    it("should clear current message state", () => {
      messageService.startAssistantMessage();
      messageService.appendAssistantDelta("Hello");

      messageService.finalizeAssistantMessage();

      expect(messageService.currentAssistantMessage).toBeNull();
      expect(messageService.assistantBuffer).toBe("");
    });

    it("should return null if no current message", () => {
      const result = messageService.finalizeAssistantMessage();

      expect(result).toBeNull();
    });
  });

  describe("getCurrentAssistantMessage", () => {
    it("should return current message state", () => {
      const id = messageService.startAssistantMessage();
      messageService.appendAssistantDelta("Hello");

      const current = messageService.getCurrentAssistantMessage();

      expect(current).toBeDefined();
      expect(current.id).toBe(id);
      expect(current.content).toBe("Hello");
    });

    it("should return null if no current message", () => {
      const current = messageService.getCurrentAssistantMessage();

      expect(current).toBeNull();
    });
  });

  describe("clearCurrentAssistantMessage", () => {
    it("should clear current message", () => {
      messageService.startAssistantMessage();
      messageService.appendAssistantDelta("Hello");

      messageService.clearCurrentAssistantMessage();

      expect(messageService.currentAssistantMessage).toBeNull();
      expect(messageService.assistantBuffer).toBe("");
    });
  });

  describe("createUserMessage", () => {
    it("should create user message view model", () => {
      const viewModel = messageService.createUserMessage("Hello");

      expect(viewModel.role).toBe("user");
      expect(viewModel.content).toBe("Hello");
      expect(viewModel.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(viewModel.shouldRenderMarkdown).toBe(false);
    });

    it("should throw on invalid message", () => {
      expect(() => messageService.createUserMessage("")).toThrow();
    });
  });

  describe("createAssistantMessage", () => {
    it("should create assistant message view model", () => {
      const viewModel = messageService.createAssistantMessage("Hello");

      expect(viewModel.role).toBe("assistant");
      expect(viewModel.content).toBe("Hello");
      expect(viewModel.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(viewModel.shouldRenderMarkdown).toBe(true);
    });

    it("should throw on invalid assistant message", () => {
      expect(() => messageService.createAssistantMessage("")).toThrow();
    });
  });

  describe("createErrorMessage", () => {
    it("should create error message view model", () => {
      const viewModel = messageService.createErrorMessage("Error occurred");

      expect(viewModel.role).toBe("error");
      expect(viewModel.content).toBe("Error occurred");
      expect(viewModel.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
    });
  });

  describe("createSystemMessage", () => {
    it("should create system message view model", () => {
      const viewModel = messageService.createSystemMessage("System message");

      expect(viewModel.role).toBe("system");
      expect(viewModel.content).toBe("System message");
      expect(viewModel.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
    });
  });

  describe("batchProcessMessages", () => {
    it("should process array of messages", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];

      const viewModels = messageService.batchProcessMessages(messages);

      expect(viewModels).toHaveLength(2);
      expect(viewModels[0].role).toBe("user");
      expect(viewModels[1].role).toBe("assistant");
    });

    it("should filter invalid messages", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "user" }, // Missing content
        { role: "assistant", content: "Hi" },
      ];

      const viewModels = messageService.batchProcessMessages(messages);

      expect(viewModels).toHaveLength(2);
    });

    it("should handle empty array", () => {
      const viewModels = messageService.batchProcessMessages([]);

      expect(viewModels).toEqual([]);
    });

    it("should handle non-array input", () => {
      const viewModels = messageService.batchProcessMessages(null);

      expect(viewModels).toEqual([]);
    });
  });

  describe("cacheRenderedMessage", () => {
    it("should cache rendered HTML", () => {
      messageService.cacheRenderedMessage("msg-123", "<p>Hello</p>");

      const cached = messageService.getCachedRenderedMessage("msg-123");

      expect(cached).toBe("<p>Hello</p>");
    });

    it("should limit cache size to 100", () => {
      // Fill cache beyond limit
      for (let i = 0; i < 150; i++) {
        messageService.cacheRenderedMessage(`msg-${i}`, `<p>Content ${i}</p>`);
      }

      const stats = messageService.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(100);
    });
  });

  describe("getCachedRenderedMessage", () => {
    it("should return cached message", () => {
      messageService.cacheRenderedMessage("msg-123", "<p>Hello</p>");

      const cached = messageService.getCachedRenderedMessage("msg-123");

      expect(cached).toBe("<p>Hello</p>");
    });

    it("should return null for non-cached message", () => {
      const cached = messageService.getCachedRenderedMessage("msg-999");

      expect(cached).toBeNull();
    });
  });

  describe("clearMessageCache", () => {
    it("should clear all cached messages", () => {
      messageService.cacheRenderedMessage("msg-1", "<p>One</p>");
      messageService.cacheRenderedMessage("msg-2", "<p>Two</p>");

      messageService.clearMessageCache();

      expect(messageService.getCachedRenderedMessage("msg-1")).toBeNull();
      expect(messageService.getCachedRenderedMessage("msg-2")).toBeNull();
      expect(messageService.getCacheStats().size).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", () => {
      messageService.cacheRenderedMessage("msg-1", "<p>One</p>");
      messageService.cacheRenderedMessage("msg-2", "<p>Two</p>");

      const stats = messageService.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
    });
  });

  describe("reset", () => {
    it("should reset all service state", () => {
      messageService.startAssistantMessage();
      messageService.appendAssistantDelta("Hello");
      messageService.cacheRenderedMessage("msg-1", "<p>One</p>");

      messageService.reset();

      expect(messageService.currentAssistantMessage).toBeNull();
      expect(messageService.assistantBuffer).toBe("");
      expect(messageService.getCacheStats().size).toBe(0);
    });
  });
});
