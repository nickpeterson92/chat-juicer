/**
 * ChatContainer Component Unit Tests
 * Phase 4 State Management Migration
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppState } from "@/core/state.js";
import { ChatContainer } from "@/ui/components/chat-container.js";

// Mock chat-ui and function-card-ui modules
vi.mock("@/ui/chat-ui.js", () => ({
  addMessage: vi.fn(),
  clearChat: vi.fn(),
  completeStreamingMessage: vi.fn(),
  createStreamingAssistantMessage: vi.fn(() => document.createElement("div")),
  updateAssistantMessage: vi.fn(),
}));

vi.mock("@/ui/function-card-ui.js", () => ({
  clearFunctionCards: vi.fn(),
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
  });

  describe("constructor", () => {
    it("should initialize without appState (backwards compatibility)", () => {
      const chatContainer = new ChatContainer(containerElement);

      expect(chatContainer.element).toBe(containerElement);
      expect(chatContainer.appState).toBeNull();
      expect(chatContainer.unsubscribers).toEqual([]);
      expect(chatContainer.currentStreamingMessage).toBeNull();
    });

    it("should initialize with appState", () => {
      const chatContainer = new ChatContainer(containerElement, {
        appState,
      });

      expect(chatContainer.appState).toBe(appState);
      expect(chatContainer.unsubscribers).toEqual([]); // No subscriptions yet
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
      expect(chatContainer.currentStreamingMessage).toBe(result);
    });

    it("should update streaming message", async () => {
      const { updateAssistantMessage } = await import("@/ui/chat-ui.js");
      const chatContainer = new ChatContainer(containerElement);

      const streamingElement = chatContainer.createStreamingMessage();
      chatContainer.updateStreamingMessage("New content");

      expect(updateAssistantMessage).toHaveBeenCalledWith(containerElement, streamingElement, "New content");
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
      chatContainer.unsubscribers.push(() => {});

      chatContainer.destroy();

      expect(chatContainer.unsubscribers).toEqual([]);
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
    it("should work with appState for future enhancements", () => {
      const chatContainer = new ChatContainer(containerElement, {
        appState,
      });

      // Currently no subscriptions, but component is ready for future state integration
      expect(chatContainer.appState).toBe(appState);
    });
  });
});
