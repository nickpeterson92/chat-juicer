/**
 * ChatUI Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as chatUI from "@/ui/chat-ui.js";

// Mock dependencies
vi.mock("@/utils/markdown-renderer.js", () => ({
  renderMarkdown: vi.fn((content) => `<p>${content}</p>`),
  processMermaidDiagrams: vi.fn(() => Promise.resolve()),
  initializeCodeCopyButtons: vi.fn(),
}));

vi.mock("@/utils/lottie-color.js", () => ({
  initLottieWithColor: vi.fn(),
}));

vi.mock("@/utils/scroll-utils.js", () => ({
  scheduleScroll: vi.fn(),
}));

// Mock ComponentLifecycle to handle internal component mounting
vi.mock("@/core/component-lifecycle.js", () => ({
  ComponentLifecycle: {
    mount: vi.fn((component) => {
      component.setTimeout = (fn, delay) => setTimeout(fn, delay);
      component.clearTimer = (id) => clearTimeout(id);
      component._lifecycle = true;
      return component;
    }),
  },
}));

describe("ChatUI", () => {
  let chatContainer;

  beforeEach(() => {
    chatContainer = document.createElement("div");
    document.body.appendChild(chatContainer);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("createMessageElement", () => {
    it("should create a user message element", () => {
      const { messageDiv, contentDiv } = chatUI.createMessageElement(chatContainer, "Hello World", "user");

      expect(messageDiv.classList.contains("user")).toBe(true);
      expect(contentDiv.textContent).toBe("Hello World");
    });

    it("should create an assistant message element", () => {
      const { messageDiv, contentDiv } = chatUI.createMessageElement(chatContainer, "AI Response", "assistant");

      expect(messageDiv.classList.contains("assistant")).toBe(true);
      // Assistant type uses innerHTML due to markdown rendering
      expect(contentDiv.innerHTML).toContain("AI Response");
    });

    it("should handle system messages", () => {
      const { messageDiv, contentDiv } = chatUI.createMessageElement(chatContainer, "System Info", "system");

      expect(messageDiv.classList.contains("system")).toBe(true);
      expect(contentDiv.textContent).toBe("System Info");
    });

    it("should mark partial messages", () => {
      const { messageDiv } = chatUI.createMessageElement(chatContainer, "Partial...", "assistant", { partial: true });

      expect(messageDiv.classList.contains("message-partial")).toBe(true);
    });

    it("should create an error message element", () => {
      const { messageDiv, contentDiv } = chatUI.createMessageElement(chatContainer, "Error occurred", "error");

      expect(messageDiv.classList.contains("error")).toBe(true);
      expect(contentDiv.textContent).toBe("Error occurred");
    });
  });

  describe("addMessage", () => {
    it("should append message to container", () => {
      chatUI.addMessage(chatContainer, "Test Message", "user");

      expect(chatContainer.children.length).toBe(1);
      expect(chatContainer.textContent).toContain("Test Message");
    });
  });

  describe("clearChat", () => {
    it("should remove all messages", () => {
      chatUI.addMessage(chatContainer, "Msg 1", "user");
      chatUI.addMessage(chatContainer, "Msg 2", "assistant");

      expect(chatContainer.children.length).toBe(2);

      chatUI.clearChat(chatContainer);

      expect(chatContainer.children.length).toBe(0);
    });
  });

  describe("updateAssistantMessage", () => {
    it("should update content via RAF", async () => {
      // Create initial message
      const { contentDiv } = chatUI.createMessageElement(chatContainer, "Initial", "assistant");

      // Update
      chatUI.updateAssistantMessage(chatContainer, contentDiv, "Updated Content");

      // Should not update immediately (RAF)
      // Note: testing internal RAF behavior via fake timers
      // We need to make sure the mocked processMermaidDiagrams returns a Promise
      // as it is called in the chain
      vi.runAllTimers(); // Trigger all pending timers/RAF
      await Promise.resolve(); // Flush microtasks

      expect(contentDiv.innerHTML).toContain("Updated Content");
    });

    it("should handle null content gracefully", () => {
      const { contentDiv } = chatUI.createMessageElement(chatContainer, "Initial", "assistant");
      chatUI.updateAssistantMessage(chatContainer, contentDiv, null);
      // Should verify no error thrown
    });
  });

  describe("cancelPendingRender", () => {
    it("should flush pending content", () => {
      const { contentDiv } = chatUI.createMessageElement(chatContainer, "Initial", "assistant");
      chatUI.updateAssistantMessage(chatContainer, contentDiv, "Pending Content");

      chatUI.cancelPendingRender();

      expect(contentDiv.innerHTML).toContain("Pending Content");
    });
  });

  describe("createStreamingAssistantMessage", () => {
    it("should create streaming message structure", () => {
      const { textSpan, messageId } = chatUI.createStreamingAssistantMessage(chatContainer);

      const messageDiv = chatContainer.querySelector(`[data-message-id="${messageId}"]`);
      expect(messageDiv).not.toBeNull();
      expect(messageDiv.classList.contains("streaming")).toBe(true);
      expect(textSpan).toBeDefined();
    });
  });

  describe("completeStreamingMessage", () => {
    it("should remove streaming indicators", () => {
      chatUI.createStreamingAssistantMessage(chatContainer);
      const streamingMsg = chatContainer.querySelector(".streaming");
      expect(streamingMsg).not.toBeNull();

      chatUI.completeStreamingMessage(chatContainer);

      expect(streamingMsg.classList.contains("streaming")).toBe(false);
      expect(streamingMsg.getAttribute("data-streaming")).toBeNull();
    });
  });

  describe("Message Management", () => {
    it("should evict old messages when limit reached", () => {
      chatUI.clearChat(chatContainer);

      // Loop slightly more than 100 to force eviction
      for (let i = 0; i < 110; i++) {
        chatUI.addMessage(chatContainer, `Message ${i}`, "user");
      }

      // Check that we capped at 100
      expect(chatContainer.children.length).toBe(100);
      expect(chatContainer.textContent).toContain("Message 109"); // Latest should exist
      expect(chatContainer.textContent).not.toContain("Message 0"); // Oldest should be evicted
    });
  });

  describe("Optimization Features", () => {
    it("should use render cache for repeated content", () => {
      const { contentDiv: d1 } = chatUI.createMessageElement(chatContainer, "Cached Content", "assistant");
      const html1 = d1.innerHTML;

      const { contentDiv: d2 } = chatUI.createMessageElement(chatContainer, "Cached Content", "assistant");
      expect(d2.innerHTML).toBe(html1);
    });

    it("should coalesce rapid updates (RAF batching)", async () => {
      const { contentDiv } = chatUI.createMessageElement(chatContainer, "Start", "assistant");

      chatUI.updateAssistantMessage(chatContainer, contentDiv, "Update 1");
      chatUI.updateAssistantMessage(chatContainer, contentDiv, "Update 2");
      chatUI.updateAssistantMessage(chatContainer, contentDiv, "Update 3");

      expect(contentDiv.textContent).not.toContain("Update 3");

      vi.runAllTimers();
      await Promise.resolve();

      expect(contentDiv.innerHTML).toContain("Update 3");
    });
  });

  describe("Streaming Components", () => {
    it("should initialize streaming message with loading lamp", async () => {
      chatUI.createStreamingAssistantMessage(chatContainer);
      const loadingLamp = chatContainer.querySelector(".loading-lamp");

      expect(loadingLamp).not.toBeNull();
      expect(loadingLamp.textContent).toBe("●");

      vi.runAllTimers();
      await Promise.resolve();
    });

    it("should transition loading lamp out on completion", async () => {
      chatUI.createStreamingAssistantMessage(chatContainer);
      const loadingLamp = chatContainer.querySelector(".loading-lamp");
      expect(loadingLamp).toBeDefined();

      chatUI.completeStreamingMessage(chatContainer);

      expect(loadingLamp.style.opacity).toBe("0");

      vi.advanceTimersByTime(800);

      expect(chatContainer.querySelector(".loading-lamp")).toBeNull();
    });
  });
});
