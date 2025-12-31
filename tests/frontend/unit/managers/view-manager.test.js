/**
 * ViewManager Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppState } from "@/core/state.js";

// Define mocks using hoisted helper
const welcomePageMocks = vi.hoisted(() => ({
  showWelcomePage: vi.fn(),
  hideWelcomePage: vi.fn(),
  getSuggestionPrompt: vi.fn(),
  getMcpConfig: vi.fn(),
  getModelConfig: vi.fn(),
}));

welcomePageMocks.getMcpConfig.mockReturnValue({});
welcomePageMocks.getModelConfig.mockReturnValue({ model: "gpt-4", reasoning_effort: "medium" });

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

vi.mock("@/ui/welcome-page.js", () => welcomePageMocks);

vi.mock("@/ui/chat-ui.js", () => ({
  addMessage: vi.fn(),
}));

vi.mock("@/managers/file-manager.js", () => ({
  renderFileList: vi.fn(),
  renderPendingFilesGrid: vi.fn(),
  loadFilesIntoState: vi.fn().mockResolvedValue({ success: true, files: [] }),
}));

describe("ViewManager", () => {
  let appState;
  let elements;
  let mockElectronAPI;
  let viewManager;

  beforeEach(async () => {
    // Reset mocks state
    welcomePageMocks.getModelConfig.mockClear();
    welcomePageMocks.getModelConfig.mockReturnValue({ model: "gpt-4", reasoning_effort: "medium" });
    welcomePageMocks.getMcpConfig.mockReturnValue({});

    // Use standard import
    viewManager = await import("@/managers/view-manager.js");

    vi.useRealTimers();

    appState = new AppState();

    elements = {
      welcomePageContainer: document.createElement("div"),
      chatContainer: document.createElement("div"),
      userInput: document.createElement("input"),
    };
    elements.welcomePageContainer.id = "welcome-page-container";

    mockElectronAPI = {
      getUsername: vi.fn().mockResolvedValue("Test User"),
      sessionCommand: vi.fn().mockResolvedValue({}),
      log: vi.fn(),
      sendUserInput: vi.fn(),
    };
    window.electronAPI = mockElectronAPI;

    window.app = {
      appState,
      services: {
        sessionService: {
          createSession: vi.fn().mockResolvedValue({
            success: true,
            sessionId: "new-session-123",
            title: "New Chat",
          }),
          getCurrentSessionId: vi.fn().mockReturnValue("session-123"),
        },
      },
      adapters: {
        ipcAdapter: {
          sendMessage: vi.fn(),
          getUsername: vi.fn().mockResolvedValue("Test User"),
          sendSessionCommand: vi.fn().mockResolvedValue({}),
        },
      },
    };
    window.components = {};
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete window.electronAPI;
    delete window.app;
    delete window.components;
    vi.clearAllMocks();
  });

  describe("showWelcomeView", () => {
    it("should update state and show welcome page", async () => {
      await viewManager.showWelcomeView(elements, appState);
      expect(appState.getState("ui.currentView")).toBe("welcome");
      expect(window.app.adapters.ipcAdapter.getUsername).toHaveBeenCalled();
    });

    it("should log warning if username fetch fails", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      window.app.adapters.ipcAdapter.getUsername.mockRejectedValue(new Error("API Error"));
      await viewManager.showWelcomeView(elements, appState);
      expect(consoleSpy).toHaveBeenCalledWith("Failed to get username", "API Error");
      consoleSpy.mockRestore();
    });
  });

  describe("showChatView", () => {
    it("should update state and show chat view", async () => {
      await viewManager.showChatView(elements, appState);
      expect(welcomePageMocks.hideWelcomePage).toHaveBeenCalled();
      expect(appState.getState("ui.currentView")).toBe("chat");
    });
  });
});
