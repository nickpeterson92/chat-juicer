import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sessionHeaderDisplay from "@/ui/components/session-header-display.js";

// Mock logging
const _mockLog = vi.spyOn(console, "error").mockImplementation(() => {});

// Mock dependencies
const mockAppState = {
  subscribe: vi.fn(() => vi.fn()),
  getState: vi.fn(),
  setState: vi.fn(),
};

const mockSessionService = {
  getSession: vi.fn(),
  setSessionPinned: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  loadSessions: vi.fn(),
};

// Mock event bus
vi.mock("@/core/event-bus.js", () => ({
  globalEventBus: {
    emit: vi.fn(),
  },
}));

describe("SessionHeaderDisplay", () => {
  let container;
  let displayElement, nameElement, chevronButton, sidebarElement;
  let mockLog;

  beforeEach(() => {
    mockLog = vi.spyOn(console, "error").mockImplementation(() => {});

    // Stub window.confirm
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );

    container = document.createElement("div");
    document.body.appendChild(container);

    displayElement = document.createElement("div");
    displayElement.id = "header-session-display";

    nameElement = document.createElement("div");
    nameElement.id = "header-session-name";

    chevronButton = document.createElement("button");
    chevronButton.id = "header-session-chevron";

    sidebarElement = document.createElement("div");
    sidebarElement.id = "sidebar";

    container.appendChild(displayElement);
    container.appendChild(nameElement);
    container.appendChild(chevronButton);
    container.appendChild(sidebarElement);

    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionHeaderDisplay.destroySessionHeaderDisplay();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("Initialization", () => {
    it("should initialize correctly with elements", () => {
      sessionHeaderDisplay.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      expect(document.getElementById("session-header-menu")).toBeTruthy();
    });

    it("should handle missing elements gracefully", () => {
      displayElement.remove();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      sessionHeaderDisplay.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Required elements not found"));
    });

    it("should subscribe to session changes", () => {
      sessionHeaderDisplay.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      expect(mockAppState.subscribe).toHaveBeenCalledWith("session.current", expect.any(Function));
    });

    it("should initialize with existing session from state", () => {
      mockAppState.getState.mockReturnValue("s1");
      mockSessionService.getSession.mockReturnValue({ title: "Existing", pinned: false });

      sessionHeaderDisplay.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });

      expect(mockSessionService.getSession).toHaveBeenCalledWith("s1");
      expect(nameElement.textContent).toBe("Existing");
    });
  });

  describe("Menu Actions", () => {
    beforeEach(() => {
      mockAppState.getState.mockReturnValue(null);
      sessionHeaderDisplay.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });
      sessionHeaderDisplay.updateSessionHeaderDisplay({
        session_id: "s1",
        title: "Session 1",
        pinned: false,
      });
    });

    it("should handle pin action", async () => {
      mockSessionService.setSessionPinned.mockResolvedValue({ success: true });
      const pinBtn = document.querySelector(".pin-item");
      await pinBtn.click();
      expect(mockSessionService.setSessionPinned).toHaveBeenCalledWith("s1", true);
    });

    it("should handle pin failure", async () => {
      mockSessionService.setSessionPinned.mockRejectedValue(new Error("Pin failed"));
      const pinBtn = document.querySelector(".pin-item");
      await pinBtn.click();
      // Wait for catch block
      await new Promise((r) => setTimeout(r, 0));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Pin failed"), expect.any(Error));
    });

    it("should handle delete action with confirmation", async () => {
      mockSessionService.deleteSession.mockResolvedValue({ success: true });
      mockSessionService.loadSessions.mockResolvedValue({ success: true, sessions: [] });

      const deleteBtn = document.querySelector(".delete-item");
      await deleteBtn.click();

      // WAIT for async handler
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSessionService.deleteSession).toHaveBeenCalledWith("s1");
      expect(displayElement.classList.contains("has-session")).toBe(false);
    });

    it("should handle delete failure", async () => {
      mockSessionService.deleteSession.mockRejectedValue(new Error("Delete failed"));
      const deleteBtn = document.querySelector(".delete-item");
      await deleteBtn.click();
      // Wait for catch block
      await new Promise((r) => setTimeout(r, 0));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Delete failed"), expect.any(Error));
    });
  });

  describe("Rename Logic", () => {
    beforeEach(() => {
      sessionHeaderDisplay.initSessionHeaderDisplay({
        appState: mockAppState,
        sessionService: mockSessionService,
      });
      sessionHeaderDisplay.updateSessionHeaderDisplay({ session_id: "s1", title: "Old", pinned: false });
    });

    it("should handle rename failure", async () => {
      mockSessionService.renameSession.mockRejectedValue(new Error("Rename failed"));
      document.querySelector(".rename-item").click();
      const input = document.querySelector(".header-session-rename-input");

      input.value = "New Name";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0)); // Wait for catch

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Rename failed"), expect.any(Error));
    });
  });
});
