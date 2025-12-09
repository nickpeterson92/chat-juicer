/**
 * ChatContainer Component Unit Tests
 * Phase 4 State Management Migration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalLifecycleManager } from "@/core/lifecycle-manager.js";
import { AppState } from "@/core/state.js";
import { ChatContainer } from "@/ui/components/chat-container.js";

// Mock lottie-web to avoid canvas errors in tests
vi.mock("lottie-web", () => ({
  default: {
    loadAnimation: vi.fn(() => ({
      destroy: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
    })),
  },
}));

// Mock lottie-color utility
vi.mock("@/utils/lottie-color.js", () => ({
  initLottieWithColor: vi.fn(() => ({
    destroy: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
  })),
}));

// Mock chat-ui and function-card-ui modules
vi.mock("@/ui/chat-ui.js", () => ({
  addMessage: vi.fn(),
  clearChat: vi.fn(),
  completeStreamingMessage: vi.fn(),
  createStreamingAssistantMessage: vi.fn(() => {
    // Return structure matching new return signature + DOM expectations
    const span = document.createElement("span");
    span.className = "streaming-text";

    // Parent wrapper needed for closest('.message') lookups
    const wrapper = document.createElement("div");
    wrapper.className = "message";
    wrapper.dataset.messageId = "mock-msg-id";
    wrapper.appendChild(span);

    // Return object format as expected by updated code
    return {
      textSpan: span,
      messageId: "mock-msg-id",
    };
  }),
  createMessageElement: vi.fn((_container, text, _role, _options) => {
    const node = document.createElement("div");
    node.textContent = text;
    return { messageDiv: node };
  }),
  updateAssistantMessage: vi.fn(),
}));

vi.mock("@/ui/function-card-ui.js", () => ({
  clearFunctionCards: vi.fn(),
  createCompletedToolCard: vi.fn(),
}));

describe("ChatContainer", () => {
  let containerElement;
  let appState;

  beforeEach(() => {
    containerElement = document.createElement("div");
    containerElement.id = "chat-container";
    appState = new AppState();

    // Reset mocks
    vi.clearAllMocks();
    globalLifecycleManager.unmountAll();
  });

  afterEach(() => {
    globalLifecycleManager.unmountAll();
  });

  describe("constructor", () => {
    it("should initialize without appState (backwards compatibility)", () => {
      const chatContainer = new ChatContainer(containerElement);

      expect(chatContainer.element).toBe(containerElement);
      expect(chatContainer.appState).toBeNull();
      expect(chatContainer.currentStreamingMessage).toBeNull();

      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "ChatContainer");
      expect(entry?.listeners ?? 0).toBe(0);
    });

    it("should initialize with appState", () => {
      const chatContainer = new ChatContainer(containerElement, {
        appState,
      });

      expect(chatContainer.appState).toBe(appState);
      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "ChatContainer");
      // Should have registered 5 subscriptions: currentAssistant, assistantBuffer, isStreaming, queue.items, queue:processing event
      expect(entry?.listeners).toBe(5);
    });

    it("should throw error without element", () => {
      expect(() => new ChatContainer(null)).toThrow("ChatContainer requires an existing DOM element");
    });
  });

  describe("addUserMessage", () => {
    it("should call addMessage with user role", async () => {
      const { addMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.addUserMessage("Hello world");

      expect(addMessage).toHaveBeenCalledWith(containerElement, "Hello world", "user");
    });
  });

  describe("addAssistantMessage", () => {
    it("should call addMessage with assistant role", async () => {
      const { addMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.addAssistantMessage("Hi there", { test: true });

      expect(addMessage).toHaveBeenCalledWith(containerElement, "Hi there", "assistant", { test: true });
    });
  });

  describe("addSystemMessage", () => {
    it("should call addMessage with system role", async () => {
      const { addMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.addSystemMessage("System notification");

      expect(addMessage).toHaveBeenCalledWith(containerElement, "System notification", "system");
    });
  });

  describe("addErrorMessage", () => {
    it("should call addMessage with error role", async () => {
      const { addMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.addErrorMessage("Error occurred");

      expect(addMessage).toHaveBeenCalledWith(containerElement, "Error occurred", "error");
    });
  });

  describe("streaming", () => {
    it("should create streaming message", async () => {
      const { createStreamingAssistantMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      const result = chatContainer.createStreamingMessage();

      expect(createStreamingAssistantMessage).toHaveBeenCalledWith(containerElement);
      // Result is now an object { textSpan, messageId }
      expect(chatContainer.currentStreamingMessage).toBe(result.textSpan);
    });

    it("should update streaming message", async () => {
      const { updateAssistantMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      const result = chatContainer.createStreamingMessage();
      chatContainer.updateStreamingMessage("New content");

      expect(updateAssistantMessage).toHaveBeenCalledWith(containerElement, result.textSpan, "New content");
    });

    it("should complete streaming", async () => {
      const { completeStreamingMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.createStreamingMessage();
      chatContainer.completeStreaming();

      expect(completeStreamingMessage).toHaveBeenCalledWith(containerElement);
      expect(chatContainer.currentStreamingMessage).toBeNull();
    });

    it("should not update if no streaming message", async () => {
      const { updateAssistantMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.updateStreamingMessage("Content");

      expect(updateAssistantMessage).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("should clear chat and function cards", async () => {
      const { clearChat } = await import("@/ui/chat-ui.js");
      const { clearFunctionCards } = await import("@/ui/function-card-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.createStreamingMessage();
      chatContainer.clear();

      expect(clearChat).toHaveBeenCalledWith(containerElement);
      expect(clearFunctionCards).toHaveBeenCalledWith(containerElement);
      expect(chatContainer.currentStreamingMessage).toBeNull();
    });
  });

  describe("message rendering helpers", () => {
    it("should extract text content from strings, arrays, objects, and fall back to empty", () => {
      const chatContainer = new ChatContainer(containerElement);
      expect(chatContainer._extractTextContent("plain")).toBe("plain");
      expect(
        chatContainer._extractTextContent([
          { type: "text", text: "part1" },
          { type: "output_text", text: "part2" },
          { type: "other", text: "ignore" },
        ])
      ).toBe("part1\npart2");
      expect(chatContainer._extractTextContent({ text: "object-text" })).toBe("object-text");
      expect(chatContainer._extractTextContent({})).toBe("");
    });

    it("should set messages from history and render completed tool cards", async () => {
      const { createMessageElement } = await import("@/ui/chat-ui.js");
      const { createCompletedToolCard } = await import("@/ui/function-card-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.setMessages([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "tool_call", call_id: "123", status: "detected", arguments: "{a:1}" },
        { role: "tool_call", call_id: "123", status: "completed", result: "ok", success: true },
      ]);

      expect(createMessageElement).toHaveBeenCalledWith(containerElement, "hello", "user");
      expect(createMessageElement).toHaveBeenCalledWith(containerElement, "hi", "assistant", { partial: false });
      expect(createCompletedToolCard).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          call_id: "123",
          arguments: "{a:1}",
          result: "ok",
          success: true,
          status: "completed",
        })
      );
    });

    it("should handle empty or invalid message lists safely", async () => {
      const { clearChat } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.setMessages(null);
      expect(clearChat).toHaveBeenCalledWith(containerElement);

      clearChat.mockClear();
      chatContainer.setMessages("not-an-array");
      expect(clearChat).toHaveBeenCalledWith(containerElement);
    });

    it("should prepend messages while preserving scroll position", async () => {
      const chatContainer = new ChatContainer(containerElement);
      containerElement.appendChild(document.createElement("div"));

      let scrollHeightValue = 200;
      Object.defineProperty(containerElement, "scrollHeight", {
        get() {
          return scrollHeightValue;
        },
      });
      Object.defineProperty(containerElement, "scrollTop", { value: 20, writable: true });

      // Simulate height change after insert
      const originalInsertBefore = containerElement.insertBefore.bind(containerElement);
      containerElement.insertBefore = (...args) => {
        scrollHeightValue = 260;
        return originalInsertBefore(...args);
      };

      chatContainer.prependMessages([
        { role: "user", content: "older user" },
        { role: "assistant", content: "older assistant" },
        { role: "tool_call", call_id: "abc", status: "completed", result: "done" },
      ]);

      expect(containerElement.textContent).toContain("older user");
      expect(containerElement.textContent).toContain("older assistant");
      expect(containerElement.scrollTop).toBe(80); // 20 + (260-200)
    });
  });

  describe("scrolling", () => {
    it("should scroll to bottom when element exists", () => {
      const chatContainer = new ChatContainer(containerElement);
      containerElement.scrollTo = vi.fn();

      chatContainer.scrollToBottom();

      expect(containerElement.scrollTo).toHaveBeenCalledWith({
        top: containerElement.scrollHeight,
        behavior: "smooth",
      });
    });
  });

  describe("getElement", () => {
    it("should return the container element", () => {
      const chatContainer = new ChatContainer(containerElement);

      expect(chatContainer.getElement()).toBe(containerElement);
    });
  });

  describe("initialize", () => {
    it("should return the element", () => {
      const chatContainer = new ChatContainer(containerElement);

      const result = chatContainer.initialize();

      expect(result).toBe(containerElement);
    });
  });

  describe("destroy", () => {
    it("should clean up AppState subscriptions", () => {
      const chatContainer = new ChatContainer(containerElement, {
        appState,
      });

      // Add a mock subscription
      globalLifecycleManager.addUnsubscriber(chatContainer, () => {});

      chatContainer.destroy();

      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "ChatContainer");
      expect(entry).toBeUndefined();
    });

    it("should clear streaming message reference", () => {
      const chatContainer = new ChatContainer(containerElement);

      chatContainer.createStreamingMessage();
      expect(chatContainer.currentStreamingMessage).not.toBeNull();

      chatContainer.destroy();

      expect(chatContainer.currentStreamingMessage).toBeNull();
    });

    it("should work without appState", () => {
      const chatContainer = new ChatContainer(containerElement);

      expect(() => chatContainer.destroy()).not.toThrow();
    });
  });

  describe("AppState integration", () => {
    it("should register appState subscriptions for streaming and queue state", () => {
      const chatContainer = new ChatContainer(containerElement, {
        appState,
      });

      expect(chatContainer.appState).toBe(appState);
      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "ChatContainer");
      // 5 subscriptions: currentAssistant, assistantBuffer, isStreaming, queue.items, queue:processing event
      expect(entry?.listeners).toBe(5);
    });
  });
});
