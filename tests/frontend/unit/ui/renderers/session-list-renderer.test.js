/**
 * Unit tests for SessionListRenderer
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock lottie-color before importing the module
vi.mock("@utils/lottie-color.js", () => ({
  initLottieWithColor: vi.fn(() => ({
    destroy: vi.fn(),
  })),
}));

// Mock the JSON import
vi.mock("../../../ui/Smoke.json", () => ({
  default: { layers: [] },
}));

describe("SessionListRenderer", () => {
  let renderSessionItem;
  let renderSessionList;
  let renderEmptySessionList;
  let updateSessionActive;
  let updateSessionTitle;
  let findSessionElement;
  let updateSessionStreamingIndicator;
  let initLottieWithColor;
  let domAdapter;

  beforeEach(async () => {
    vi.resetModules();

    const module = await import("@ui/renderers/session-list-renderer.js");
    renderSessionItem = module.renderSessionItem;
    renderSessionList = module.renderSessionList;
    renderEmptySessionList = module.renderEmptySessionList;
    updateSessionActive = module.updateSessionActive;
    updateSessionTitle = module.updateSessionTitle;
    findSessionElement = module.findSessionElement;
    updateSessionStreamingIndicator = module.updateSessionStreamingIndicator;

    const lottieModule = await import("@utils/lottie-color.js");
    initLottieWithColor = lottieModule.initLottieWithColor;

    // Create a real DOM adapter
    domAdapter = {
      createElement: (tag) => document.createElement(tag),
      addClass: (el, ...classes) => el.classList.add(...classes),
      removeClass: (el, cls) => el.classList.remove(cls),
      setAttribute: (el, attr, value) => el.setAttribute(attr, value),
      getAttribute: (el, attr) => el.getAttribute(attr),
      setTextContent: (el, text) => {
        el.textContent = text;
      },
      appendChild: (parent, child) => parent.appendChild(child),
      closest: (el, selector) => el.closest(selector),
      querySelector: (el, selector) => el.querySelector(selector),
      remove: (el) => el.remove(),
      getDocument: () => document,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  describe("renderSessionItem", () => {
    it("should render basic session item", () => {
      const session = {
        id: "session-1",
        title: "Test Session",
        created_at: new Date().toISOString(),
      };

      const element = renderSessionItem(session, false, domAdapter);

      expect(element.classList.contains("session-item")).toBe(true);
      expect(element.getAttribute("data-session-id")).toBe("session-1");
      expect(element.querySelector(".session-title").textContent).toBe("Test Session");
    });

    it("should add active class when isActive is true", () => {
      const session = { id: "session-1", title: "Test" };

      const element = renderSessionItem(session, true, domAdapter);

      expect(element.classList.contains("active")).toBe(true);
    });

    it("should handle pinned sessions", () => {
      const session = { id: "session-1", title: "Pinned Session", pinned: true };

      const element = renderSessionItem(session, false, domAdapter);

      expect(element.classList.contains("session-pinned")).toBe(true);
      expect(element.getAttribute("data-pinned")).toBe("true");
    });

    it("should handle unpinned sessions (pinned=false)", () => {
      const session = { id: "session-1", title: "Normal Session", pinned: false };

      const element = renderSessionItem(session, false, domAdapter);

      expect(element.classList.contains("session-pinned")).toBe(false);
    });

    it("should use fallback title for untitled sessions", () => {
      const session = { id: "session-1", title: null };

      const element = renderSessionItem(session, false, domAdapter);

      expect(element.querySelector(".session-title").textContent).toBe("Untitled Session");
    });

    it("should add streaming indicator when streamManager says streaming", async () => {
      const session = { id: "session-1", title: "Streaming Session" };
      const mockStreamManager = {
        isStreaming: vi.fn().mockReturnValue(true),
      };

      const element = renderSessionItem(session, false, domAdapter, mockStreamManager);

      expect(element.classList.contains("session-streaming")).toBe(true);
      expect(mockStreamManager.isStreaming).toHaveBeenCalledWith("session-1");
    });

    it("should not add streaming class when not streaming", () => {
      const session = { id: "session-1", title: "Not Streaming" };
      const mockStreamManager = {
        isStreaming: vi.fn().mockReturnValue(false),
      };

      const element = renderSessionItem(session, false, domAdapter, mockStreamManager);

      expect(element.classList.contains("session-streaming")).toBe(false);
    });

    it("should handle null streamManager gracefully", () => {
      const session = { id: "session-1", title: "Test" };

      expect(() => {
        renderSessionItem(session, false, domAdapter, null);
      }).not.toThrow();
    });
  });

  describe("renderSessionList", () => {
    it("should render multiple sessions", () => {
      const sessions = [
        { id: "session-1", title: "First" },
        { id: "session-2", title: "Second" },
      ];

      const fragment = renderSessionList(sessions, "session-1", domAdapter);

      expect(fragment.childNodes.length).toBe(2);
    });

    it("should return null for null adapter", () => {
      const result = renderSessionList([], null, null);

      expect(result).toBeNull();
    });

    it("should return null for adapter without getDocument", () => {
      const result = renderSessionList([], null, { createElement: () => {} });

      expect(result).toBeNull();
    });

    it("should mark active session correctly", () => {
      const sessions = [
        { id: "session-1", title: "First" },
        { id: "session-2", title: "Second" },
      ];

      const fragment = renderSessionList(sessions, "session-2", domAdapter);
      const container = document.createElement("div");
      container.appendChild(fragment);

      const activeItem = container.querySelector('[data-session-id="session-2"]');
      expect(activeItem.classList.contains("active")).toBe(true);

      const inactiveItem = container.querySelector('[data-session-id="session-1"]');
      expect(inactiveItem.classList.contains("active")).toBe(false);
    });
  });

  describe("renderEmptySessionList", () => {
    it("should render empty state with message", () => {
      const element = renderEmptySessionList("No chats found", domAdapter);

      expect(element.classList.contains("session-list-empty")).toBe(true);
      expect(element.querySelector(".empty-message").textContent).toBe("No chats found");
    });

    it("should use default message when null provided", () => {
      const element = renderEmptySessionList(null, domAdapter);

      expect(element.querySelector(".empty-message").textContent).toBe("No sessions yet");
    });

    it("should use default message when empty string provided", () => {
      const element = renderEmptySessionList("", domAdapter);

      expect(element.querySelector(".empty-message").textContent).toBe("No sessions yet");
    });
  });

  describe("updateSessionActive", () => {
    it("should add active class when isActive is true", () => {
      const element = document.createElement("div");

      updateSessionActive(element, true, domAdapter);

      expect(element.classList.contains("active")).toBe(true);
    });

    it("should remove active class when isActive is false", () => {
      const element = document.createElement("div");
      element.classList.add("active");

      updateSessionActive(element, false, domAdapter);

      expect(element.classList.contains("active")).toBe(false);
    });
  });

  describe("updateSessionTitle", () => {
    it("should update title text", () => {
      const element = document.createElement("div");
      const titleDiv = document.createElement("div");
      titleDiv.className = "session-title";
      titleDiv.textContent = "Old Title";
      element.appendChild(titleDiv);

      updateSessionTitle(element, "New Title", domAdapter);

      expect(titleDiv.textContent).toBe("New Title");
    });

    it("should handle missing title element gracefully", () => {
      const element = document.createElement("div");

      expect(() => {
        updateSessionTitle(element, "New Title", domAdapter);
      }).not.toThrow();
    });
  });

  describe("findSessionElement", () => {
    it("should find session element by ID", () => {
      const container = document.createElement("div");
      const item = document.createElement("div");
      item.setAttribute("data-session-id", "find-me");
      container.appendChild(item);

      const result = findSessionElement(container, "find-me", domAdapter);

      expect(result).toBe(item);
    });

    it("should return null when session not found", () => {
      const container = document.createElement("div");

      const result = findSessionElement(container, "not-found", domAdapter);

      expect(result).toBeNull();
    });
  });

  describe("updateSessionStreamingIndicator", () => {
    it("should add streaming class and init Lottie when streaming starts", () => {
      const sessionItem = document.createElement("div");
      sessionItem.setAttribute("data-session-id", "stream-test");
      const indicator = document.createElement("div");
      indicator.className = "session-streaming-indicator";
      sessionItem.appendChild(indicator);
      document.body.appendChild(sessionItem);

      updateSessionStreamingIndicator("stream-test", true);

      expect(sessionItem.classList.contains("session-streaming")).toBe(true);
      expect(initLottieWithColor).toHaveBeenCalled();
    });

    it("should remove streaming class and cleanup when streaming stops", () => {
      const sessionItem = document.createElement("div");
      sessionItem.setAttribute("data-session-id", "stream-test-2");
      sessionItem.classList.add("session-streaming");
      const indicator = document.createElement("div");
      indicator.className = "session-streaming-indicator";
      indicator.innerHTML = "<div>animation</div>";
      sessionItem.appendChild(indicator);
      document.body.appendChild(sessionItem);

      updateSessionStreamingIndicator("stream-test-2", false);

      expect(sessionItem.classList.contains("session-streaming")).toBe(false);
      expect(indicator.innerHTML).toBe("");
    });

    it("should handle missing session item gracefully", () => {
      expect(() => {
        updateSessionStreamingIndicator("nonexistent", true);
      }).not.toThrow();
    });

    it("should handle missing indicator element gracefully", () => {
      const sessionItem = document.createElement("div");
      sessionItem.setAttribute("data-session-id", "no-indicator");
      document.body.appendChild(sessionItem);

      expect(() => {
        updateSessionStreamingIndicator("no-indicator", true);
      }).not.toThrow();
    });
  });
});
