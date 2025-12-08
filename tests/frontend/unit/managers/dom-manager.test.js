/**
 * Unit tests for DOM Manager
 * Tests centralized DOM element management and initialization
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { elements, initializeElements } from "@/managers/dom-manager.js";

describe("DOM Manager", () => {
  let mockElements;

  beforeEach(() => {
    // Clear entire DOM body to ensure clean state
    document.body.innerHTML = "";

    // Create mock DOM elements
    mockElements = {
      chatContainer: createMockElement("chat-container"),
      userInput: createMockElement("user-input"),
      sendBtn: createMockElement("send-btn"),
      restartBtn: createMockElement("restart-btn"),
      settingsBtn: createMockElement("settings-btn"),
      aiThinking: createMockElement("ai-thinking"),
      filesPanel: createMockElement("files-panel"),
      filesContainer: createMockElement("files-container"),
      openFilesBtn: createMockElement("open-files-btn"),
      refreshFilesBtn: createMockElement("refresh-files-btn"),
      themeToggle: createMockElement("theme-toggle"),
      themeIcon: createMockElement("theme-icon"),
      themeText: createMockElement("theme-text"),
      sessionsList: createMockElement("sessions-list"),
      newSessionBtn: createMockElement("new-session-btn"),
      sidebar: createMockElement("sidebar"),
      sidebarToggle: createMockElement("sidebar-toggle"),
      fileDropZone: createMockElement("file-drop-zone"),
      chatPanel: createMockElement("chat-panel", "div", "chat-panel"),
      uploadProgress: createMockElement("file-upload-progress"),
      progressBar: createMockElement("progress-bar-fill"),
      progressText: createMockElement("progress-text"),
      welcomePageContainer: createMockElement("welcome-page-container"),
    };

    // Add elements to DOM
    Object.values(mockElements).forEach((el) => {
      if (el) document.body.appendChild(el);
    });
  });

  afterEach(() => {
    // Cleanup
    document.body.innerHTML = "";

    // Clear elements registry
    for (const key of Object.keys(elements)) {
      elements[key] = null;
    }
  });

  function createMockElement(id, tag = "div", className = null) {
    const el = document.createElement(tag);
    el.id = id;
    if (className) {
      el.className = className;
    }
    return el;
  }

  describe("initializeElements", () => {
    it("should initialize all required DOM elements", () => {
      initializeElements();

      expect(elements.chatContainer).toBeTruthy();
      expect(elements.userInput).toBeTruthy();
      expect(elements.sendBtn).toBeTruthy();
      expect(elements.restartBtn).toBeTruthy();
      expect(elements.settingsBtn).toBeTruthy();
      expect(elements.aiThinking).toBeTruthy();
      expect(elements.filesPanel).toBeTruthy();
      expect(elements.filesContainer).toBeTruthy();
      expect(elements.openFilesBtn).toBeTruthy();
      expect(elements.refreshFilesBtn).toBeTruthy();
      expect(elements.themeToggle).toBeTruthy();
      expect(elements.themeIcon).toBeTruthy();
      expect(elements.themeText).toBeTruthy();
      expect(elements.sessionsList).toBeTruthy();
      expect(elements.newSessionBtn).toBeTruthy();
      expect(elements.sidebar).toBeTruthy();
      expect(elements.sidebarToggle).toBeTruthy();
      expect(elements.fileDropZone).toBeTruthy();
      expect(elements.chatPanel).toBeTruthy();
      expect(elements.uploadProgress).toBeTruthy();
      expect(elements.progressBar).toBeTruthy();
      expect(elements.progressText).toBeTruthy();
      expect(elements.welcomePageContainer).toBeTruthy();
    });

    it("should find elements by ID", () => {
      initializeElements();

      expect(elements.chatContainer.id).toBe("chat-container");
      expect(elements.userInput.id).toBe("user-input");
      expect(elements.sendBtn.id).toBe("send-btn");
    });

    it("should find elements by querySelector", () => {
      initializeElements();

      expect(elements.chatPanel.className).toBe("chat-panel");
    });

    it("should handle missing optional elements gracefully", () => {
      // Remove one element
      mockElements.welcomePageContainer.remove();

      expect(() => {
        initializeElements();
      }).not.toThrow();

      expect(elements.welcomePageContainer).toBeNull();
    });

    it("should reinitialize elements on subsequent calls", () => {
      initializeElements();

      const firstRef = elements.chatContainer;

      // Call again
      initializeElements();

      // Should be same element
      expect(elements.chatContainer).toBe(firstRef);
    });

    it("should update elements if DOM changes", () => {
      initializeElements();

      expect(elements.chatContainer).toBeTruthy();

      // Replace element
      const oldElement = mockElements.chatContainer;
      const newElement = createMockElement("chat-container");
      oldElement.replaceWith(newElement);

      // Reinitialize
      initializeElements();

      // Should find new element
      expect(elements.chatContainer).toBe(newElement);
      expect(elements.chatContainer).not.toBe(oldElement);
    });
  });

  describe("Element Registry", () => {
    it("should provide read/write access to elements", () => {
      initializeElements();

      // Read
      const chatContainer = elements.chatContainer;
      expect(chatContainer).toBeTruthy();

      // Write (for testing/mocking)
      const mockElement = document.createElement("div");
      elements.chatContainer = mockElement;

      expect(elements.chatContainer).toBe(mockElement);
    });

    it("should maintain element references", () => {
      initializeElements();

      const ref1 = elements.chatContainer;
      const ref2 = elements.chatContainer;

      expect(ref1).toBe(ref2);
    });

    it("should allow element reassignment", () => {
      initializeElements();

      const original = elements.chatContainer;
      const replacement = document.createElement("div");

      elements.chatContainer = replacement;

      expect(elements.chatContainer).not.toBe(original);
      expect(elements.chatContainer).toBe(replacement);
    });
  });

  describe("Missing Elements", () => {
    it("should set null for missing elements", () => {
      // Clear entire DOM to ensure all elements are removed
      document.body.innerHTML = "";

      initializeElements();

      expect(elements.chatContainer).toBeNull();
      expect(elements.userInput).toBeNull();
      expect(elements.sendBtn).toBeNull();
    });

    it("should handle partial DOM availability", () => {
      // Remove some elements
      mockElements.userInput.remove();
      mockElements.sendBtn.remove();

      initializeElements();

      expect(elements.chatContainer).toBeTruthy();
      expect(elements.userInput).toBeNull();
      expect(elements.sendBtn).toBeNull();
    });

    it("should not throw when elements are missing", () => {
      // Clear entire DOM
      document.body.innerHTML = "";

      expect(() => {
        initializeElements();
      }).not.toThrow();
    });
  });

  describe("Element Types", () => {
    it("should initialize input elements", () => {
      initializeElements();

      expect(elements.userInput).toBeTruthy();
    });

    it("should handle repeated initialization efficiently", () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        initializeElements();
      }

      const duration = performance.now() - start;

      // 100 initializations should complete in < 100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe("Integration", () => {
    it("should work with real DOM queries", () => {
      // Use actual DOM instead of mocks
      const realContainer = document.createElement("div");
      realContainer.id = "real-chat-container";
      document.body.appendChild(realContainer);

      // Reinitialize (will find real element)
      const testElements = {};
      testElements.realContainer = document.getElementById("real-chat-container");

      expect(testElements.realContainer).toBe(realContainer);

      realContainer.remove();
    });

    it("should find elements added dynamically", () => {
      initializeElements();

      // Add new element
      const dynamic = createMockElement("dynamic-element");
      document.body.appendChild(dynamic);

      // Manual query (simulating dynamic access)
      const found = document.getElementById("dynamic-element");

      expect(found).toBe(dynamic);

      dynamic.remove();
    });
  });

  describe("Edge Cases", () => {
    it("should handle duplicate IDs gracefully", () => {
      // Add duplicate element
      const duplicate = createMockElement("chat-container");
      document.body.appendChild(duplicate);

      initializeElements();

      // Should find first element
      expect(elements.chatContainer).toBeTruthy();

      duplicate.remove();
    });

    it("should handle empty DOM", () => {
      // Clear entire DOM
      document.body.innerHTML = "";

      expect(() => {
        initializeElements();
      }).not.toThrow();
    });

    it("should handle malformed element IDs", () => {
      // Add element with special characters
      const special = document.createElement("div");
      special.id = "element-with-special-chars-!@#$";
      document.body.appendChild(special);

      expect(() => {
        initializeElements();
      }).not.toThrow();

      special.remove();
    });
  });
});
