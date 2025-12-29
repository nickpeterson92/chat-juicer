/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dynamic imports
vi.mock("@/core/event-bus.js", () => ({
  globalEventBus: {
    emit: vi.fn(),
  },
}));

describe("SessionHeaderDisplay", () => {
  let displayElement;
  let nameElement;
  let chevronButton;
  let mockAppState;
  let mockSessionService;
  let module;

  beforeEach(async () => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="header-session-display">
        <span id="header-session-name"></span>
        <button id="header-session-chevron"></button>
      </div>
    `;

    displayElement = document.getElementById("header-session-display");
    nameElement = document.getElementById("header-session-name");
    chevronButton = document.getElementById("header-session-chevron");

    // Mock appState
    mockAppState = {
      subscribe: vi.fn((_path, callback) => {
        mockAppState._callback = callback;
        return vi.fn(); // unsubscribe
      }),
      getState: vi.fn().mockReturnValue(null),
      setState: vi.fn(),
    };

    // Mock sessionService
    mockSessionService = {
      getSession: vi.fn().mockReturnValue(null),
      setSessionPinned: vi.fn().mockResolvedValue({ success: true }),
      renameSession: vi.fn().mockResolvedValue({ success: true }),
      deleteSession: vi.fn().mockResolvedValue({ success: true }),
    };

    // Fresh import for each test
    vi.resetModules();
    module = await import("@/ui/components/session-header-display.js");
  });

  afterEach(() => {
    if (module.destroySessionHeaderDisplay) {
      module.destroySessionHeaderDisplay();
    }
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  describe("initSessionHeaderDisplay", () => {
    it("should warn when required elements not found", () => {
      document.body.innerHTML = "";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      expect(warnSpy).toHaveBeenCalledWith("[SessionHeaderDisplay] Required elements not found");
      warnSpy.mockRestore();
    });

    it("should initialize successfully with required elements", () => {
      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      expect(mockAppState.subscribe).toHaveBeenCalledWith("session.current", expect.any(Function));
    });

    it("should update display when session changes via subscription", () => {
      const session = {
        session_id: "sess_123",
        title: "Test Session",
        pinned: false,
      };
      mockSessionService.getSession.mockReturnValue(session);

      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      // Trigger subscription callback
      mockAppState._callback("sess_123");

      expect(nameElement.textContent).toBe("Test Session");
      expect(displayElement.classList.contains("has-session")).toBe(true);
    });

    it("should clear display when session is null", () => {
      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      // Trigger with null
      mockAppState._callback(null);

      expect(nameElement.textContent).toBe("");
      expect(displayElement.classList.contains("has-session")).toBe(false);
    });

    it("should use default title for untitled session", () => {
      const session = { session_id: "sess_123", title: null, pinned: false };
      mockSessionService.getSession.mockReturnValue(session);

      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      mockAppState._callback("sess_123");

      expect(nameElement.textContent).toBe("Untitled Session");
    });
  });

  describe("updateSessionHeaderDisplay", () => {
    it("should update display externally", () => {
      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      module.updateSessionHeaderDisplay({
        session_id: "sess_456",
        title: "External Update",
        pinned: true,
      });

      expect(nameElement.textContent).toBe("External Update");
    });
  });

  describe("destroySessionHeaderDisplay", () => {
    it("should clean up all resources", () => {
      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      // Menu should exist
      expect(document.getElementById("session-header-menu")).not.toBeNull();

      module.destroySessionHeaderDisplay();

      // Menu should be removed
      expect(document.getElementById("session-header-menu")).toBeNull();
    });
  });

  describe("menu interactions", () => {
    beforeEach(() => {
      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });
    });

    it("should toggle menu on chevron click", () => {
      const menu = document.getElementById("session-header-menu");

      // Open
      chevronButton.click();
      expect(menu.classList.contains("visible")).toBe(true);
      expect(chevronButton.classList.contains("open")).toBe(true);

      // Close
      chevronButton.click();
      expect(menu.classList.contains("visible")).toBe(false);
      expect(chevronButton.classList.contains("open")).toBe(false);
    });

    it("should close menu on outside click", () => {
      const menu = document.getElementById("session-header-menu");

      // Open menu
      chevronButton.click();
      expect(menu.classList.contains("visible")).toBe(true);

      // Click outside
      document.body.click();
      expect(menu.classList.contains("visible")).toBe(false);
    });

    it("should start inline rename on name click", () => {
      const session = {
        session_id: "sess_123",
        title: "Test",
        pinned: false,
      };
      mockSessionService.getSession.mockReturnValue(session);
      mockAppState._callback("sess_123");

      nameElement.click();

      const input = document.querySelector(".header-session-rename-input");
      expect(input).not.toBeNull();
      expect(input.value).toBe("Test");
    });
  });

  describe("pin state", () => {
    it("should show pinned state correctly", () => {
      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      const pinnedSession = {
        session_id: "sess_123",
        title: "Pinned",
        pinned: true,
      };
      mockSessionService.getSession.mockReturnValue(pinnedSession);
      mockAppState._callback("sess_123");

      const pinItem = document.querySelector(".pin-item");
      expect(pinItem.classList.contains("pinned")).toBe(true);

      const label = pinItem.querySelector(".pin-label");
      expect(label.textContent).toBe("Pinned");
    });

    it("should show unpinned state correctly", () => {
      module.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      const unpinnedSession = {
        session_id: "sess_123",
        title: "Unpinned",
        pinned: false,
      };
      mockSessionService.getSession.mockReturnValue(unpinnedSession);
      mockAppState._callback("sess_123");

      const pinItem = document.querySelector(".pin-item");
      expect(pinItem.classList.contains("pinned")).toBe(false);

      const label = pinItem.querySelector(".pin-label");
      expect(label.textContent).toBe("Pin");
    });
  });
});
