/**
 * SessionListRenderer Unit Tests
 */

import { MockDOMAdapter } from "@test-helpers/MockDOMAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  findSessionElement,
  removeSessionItem,
  renderSessionItem,
  renderSessionList,
  updateSessionActive,
  updateSessionTitle,
} from "@/ui/renderers/session-list-renderer.js";

describe("SessionListRenderer", () => {
  let mockDOM;

  beforeEach(() => {
    mockDOM = new MockDOMAdapter();
  });

  describe("renderSessionItem", () => {
    it("should render basic session item", () => {
      const session = {
        id: "session-123",
        title: "Test Session",
        created_at: new Date().toISOString(),
      };

      const element = renderSessionItem(session, false, mockDOM);

      expect(element).toBeDefined();
      expect(mockDOM.getAttribute(element, "data-session-id")).toBe("session-123");
      expect(mockDOM.hasClass(element, "session-item")).toBe(true);
    });

    it("should mark active session with class", () => {
      const session = {
        id: "session-456",
        title: "Active Session",
        created_at: new Date().toISOString(),
      };

      const element = renderSessionItem(session, true, mockDOM);

      expect(mockDOM.hasClass(element, "active")).toBe(true);
    });

    it("should not mark inactive session", () => {
      const session = {
        id: "session-789",
        title: "Inactive Session",
        created_at: new Date().toISOString(),
      };

      const element = renderSessionItem(session, false, mockDOM);

      expect(mockDOM.hasClass(element, "active")).toBe(false);
    });

    it("should render session title", () => {
      const session = {
        id: "session-111",
        title: "My Important Session",
        created_at: new Date().toISOString(),
      };

      const element = renderSessionItem(session, false, mockDOM);
      const titleDiv = mockDOM.querySelector(element, ".session-title");

      expect(mockDOM.getTextContent(titleDiv)).toBe("My Important Session");
    });

    it("should include action buttons", () => {
      const session = {
        id: "session-222",
        title: "Test",
        created_at: new Date().toISOString(),
      };

      const element = renderSessionItem(session, false, mockDOM);
      const actions = mockDOM.querySelector(element, ".session-actions");

      expect(actions).toBeDefined();
      expect(mockDOM.querySelector(actions, ".rename-btn")).toBeDefined();
      expect(mockDOM.querySelector(actions, ".delete-btn")).toBeDefined();
    });

    it("should format timestamp", () => {
      const session = {
        id: "session-333",
        title: "Test",
        created_at: "2023-01-15T10:30:00Z",
      };

      const element = renderSessionItem(session, false, mockDOM);
      const timestamp = mockDOM.querySelector(element, ".session-timestamp");

      expect(timestamp).toBeDefined();
      expect(mockDOM.getTextContent(timestamp)).toBeTruthy();
    });
  });

  describe("renderSessionList", () => {
    it("should render multiple sessions", () => {
      const sessions = [
        { id: "session-1", title: "First", created_at: new Date().toISOString() },
        { id: "session-2", title: "Second", created_at: new Date().toISOString() },
        { id: "session-3", title: "Third", created_at: new Date().toISOString() },
      ];

      const fragment = renderSessionList(sessions, "session-2", mockDOM);

      expect(fragment).toBeDefined();
      expect(fragment.childNodes.length).toBe(3);
    });

    it("should mark correct session as active", () => {
      const sessions = [
        { id: "session-1", title: "First", created_at: new Date().toISOString() },
        { id: "session-2", title: "Second", created_at: new Date().toISOString() },
      ];

      const fragment = renderSessionList(sessions, "session-1", mockDOM);
      const firstSession = fragment.childNodes[0];

      expect(mockDOM.hasClass(firstSession, "active")).toBe(true);
    });

    it("should handle empty session list", () => {
      const fragment = renderSessionList([], null, mockDOM);

      expect(fragment).toBeDefined();
      expect(fragment.childNodes.length).toBe(0);
    });

    it("should handle null activeSessionId", () => {
      const sessions = [{ id: "session-1", title: "First", created_at: new Date().toISOString() }];

      const fragment = renderSessionList(sessions, null, mockDOM);
      const firstSession = fragment.childNodes[0];

      expect(mockDOM.hasClass(firstSession, "active")).toBe(false);
    });
  });

  describe("updateSessionActive", () => {
    it("should activate session element", () => {
      const session = {
        id: "session-444",
        title: "Test",
        created_at: new Date().toISOString(),
      };
      const element = renderSessionItem(session, false, mockDOM);

      updateSessionActive(element, true, mockDOM);

      expect(mockDOM.hasClass(element, "active")).toBe(true);
    });

    it("should deactivate session element", () => {
      const session = {
        id: "session-555",
        title: "Test",
        created_at: new Date().toISOString(),
      };
      const element = renderSessionItem(session, true, mockDOM);

      updateSessionActive(element, false, mockDOM);

      expect(mockDOM.hasClass(element, "active")).toBe(false);
    });
  });

  describe("updateSessionTitle", () => {
    it("should update session title text", () => {
      const session = {
        id: "session-666",
        title: "Old Title",
        created_at: new Date().toISOString(),
      };
      const element = renderSessionItem(session, false, mockDOM);

      updateSessionTitle(element, "New Title", mockDOM);

      const titleDiv = mockDOM.querySelector(element, ".session-title");
      expect(mockDOM.getTextContent(titleDiv)).toBe("New Title");
    });

    it("should handle empty title", () => {
      const session = {
        id: "session-777",
        title: "Original",
        created_at: new Date().toISOString(),
      };
      const element = renderSessionItem(session, false, mockDOM);

      updateSessionTitle(element, "", mockDOM);

      const titleDiv = mockDOM.querySelector(element, ".session-title");
      expect(mockDOM.getTextContent(titleDiv)).toBe("");
    });
  });

  describe("removeSessionItem", () => {
    it("should remove element from parent", () => {
      const container = mockDOM.createElement("div");
      const session = {
        id: "session-888",
        title: "Test",
        created_at: new Date().toISOString(),
      };
      const element = renderSessionItem(session, false, mockDOM);

      mockDOM.appendChild(container, element);
      expect(mockDOM.querySelector(container, `[data-session-id="session-888"]`)).toBeDefined();

      removeSessionItem(element, mockDOM);

      expect(mockDOM.querySelector(container, `[data-session-id="session-888"]`)).toBeNull();
    });

    it("should handle element without parent", () => {
      const session = {
        id: "session-999",
        title: "Test",
        created_at: new Date().toISOString(),
      };
      const element = renderSessionItem(session, false, mockDOM);

      // Should not throw
      expect(() => {
        removeSessionItem(element, mockDOM);
      }).not.toThrow();
    });
  });

  describe("findSessionElement", () => {
    it("should find session by ID in container", () => {
      const container = mockDOM.createElement("div");
      const session1 = {
        id: "session-aaa",
        title: "First",
        created_at: new Date().toISOString(),
      };
      const session2 = {
        id: "session-bbb",
        title: "Second",
        created_at: new Date().toISOString(),
      };

      mockDOM.appendChild(container, renderSessionItem(session1, false, mockDOM));
      mockDOM.appendChild(container, renderSessionItem(session2, false, mockDOM));

      const found = findSessionElement(container, "session-bbb", mockDOM);

      expect(found).toBeDefined();
      expect(mockDOM.getAttribute(found, "data-session-id")).toBe("session-bbb");
    });

    it("should return null if session not found", () => {
      const container = mockDOM.createElement("div");

      const found = findSessionElement(container, "nonexistent", mockDOM);

      expect(found).toBeNull();
    });
  });
});
