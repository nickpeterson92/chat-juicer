/**
 * ViewManager Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppState } from "@/core/state.js";

// Define mocks using hoisted helper
const welcomePageMocks = vi.hoisted(() => ({
  showWelcomePage: vi.fn(),
  hideWelcomePage: vi.fn(),
  getSuggestionPrompt: vi.fn((category) => `Prompt for ${category}`),
  getMcpConfig: vi.fn(),
  getModelConfig: vi.fn(),
}));

vi.mock("@/ui/welcome-page.js", () => welcomePageMocks);

vi.mock("@/core/component-lifecycle.js", () => ({
  ComponentLifecycle: {
    mount: vi.fn((component) => {
      // Mock component methods directly on the object passed
      component.setTimeout = (fn, delay) => setTimeout(fn, delay);
      component.clearTimer = (id) => clearTimeout(id);
      component._lifecycle = true;
      return component;
    }),
  },
}));

vi.mock("@/core/lifecycle-manager.js", () => ({
  globalLifecycleManager: {
    addUnsubscriber: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock("@/ui/chat-ui.js", () => ({
  addMessage: vi.fn(),
}));

// Ensure file-manager mock supports named imports when imported via default or named
vi.mock("@/managers/file-manager.js", () => {
  return {
    renderFileList: vi.fn(),
    renderPendingFilesGrid: vi.fn(),
    loadFilesIntoState: vi.fn().mockResolvedValue({ success: true, files: [] }),
    // Ensure it looks like a module
    __esModule: true,
  };
});

vi.mock("@/ui/components/model-selector.js", () => ({
  ModelSelector: class {
    constructor(container, options) {
      this.container = container;
      this.options = options;
    }
    initialize() {
      return Promise.resolve();
    }
    getSelection() {
      return { model: "gpt-4", reasoning_effort: "medium" };
    }
  },
}));

// Mock chat-model-updater
vi.mock("@/utils/chat-model-updater.js", () => ({
  updateChatModelSelector: vi.fn(),
}));

describe("ViewManager", () => {
  let appState;
  let elements;
  let mockElectronAPI;
  let viewManager;
  let domContainer;

  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();

    // Reset mocks state
    welcomePageMocks.showWelcomePage.mockClear();

    welcomePageMocks.hideWelcomePage.mockClear();
    welcomePageMocks.getSuggestionPrompt.mockClear();
    welcomePageMocks.getMcpConfig.mockReturnValue({});
    welcomePageMocks.getModelConfig.mockReturnValue({ model: "gpt-4", reasoning_effort: "medium" });

    appState = new AppState();
    appState.setState("connection.status", "CONNECTED");

    // Create a real DOM environment for event listeners
    domContainer = document.createElement("div");
    document.body.appendChild(domContainer);

    elements = {
      welcomePageContainer: document.createElement("div"),
      chatContainer: document.createElement("div"),
      userInput: document.createElement("input"),
      fileDropZone: document.createElement("div"),
    };
    elements.welcomePageContainer.id = "welcome-page-container";
    domContainer.appendChild(elements.welcomePageContainer);

    // Create required DOM elements for welcome page listeners
    const welcomeInput = document.createElement("input");
    welcomeInput.id = "welcome-input";
    domContainer.appendChild(welcomeInput);

    const welcomeSendBtn = document.createElement("button");
    welcomeSendBtn.id = "welcome-send-btn";
    domContainer.appendChild(welcomeSendBtn);

    const welcomeFilesContainer = document.createElement("div");
    welcomeFilesContainer.id = "welcome-files-container";
    domContainer.appendChild(welcomeFilesContainer);

    const welcomeFilesSection = document.createElement("div");
    welcomeFilesSection.id = "welcome-files-section";
    domContainer.appendChild(welcomeFilesSection);

    const welcomeFilesRefreshBtn = document.createElement("button");
    welcomeFilesRefreshBtn.id = "welcome-files-refresh";
    domContainer.appendChild(welcomeFilesRefreshBtn);

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
          getCurrentSessionId: vi.fn().mockReturnValue(null), // Default no session
          loadSessions: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
        },
        fileService: {
          uploadFile: vi.fn().mockResolvedValue({ success: true }),
        },
      },
      adapters: {
        ipcAdapter: {
          sendMessage: vi.fn(),
          getUsername: vi.fn().mockResolvedValue("Test User"),
          sendSessionCommand: vi.fn().mockResolvedValue({}),
          log: vi.fn(),
        },
      },
      connection: { status: "CONNECTED" },
    };

    window.components = {};

    // Standard import
    viewManager = await import("@/managers/view-manager.js");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.useRealTimers();
    delete window.electronAPI;
    delete window.app;
    delete window.components;
  });

  describe("showWelcomeView", () => {
    it("should update state and show welcome page", async () => {
      await viewManager.showWelcomeView(elements, appState);
      expect(appState.getState("ui.currentView")).toBe("welcome");
      expect(window.app.adapters.ipcAdapter.getUsername).toHaveBeenCalled();
      expect(welcomePageMocks.showWelcomePage).toHaveBeenCalled();
    });

    it("should attach event listeners including drag/drop", async () => {
      await viewManager.showWelcomeView(elements, appState);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const dragEnterEvent = new Event("dragenter", { bubbles: true });
      Object.defineProperty(dragEnterEvent, "dataTransfer", {
        value: { types: ["Files"] },
      });
      elements.welcomePageContainer.dispatchEvent(dragEnterEvent);
      expect(elements.fileDropZone.classList.contains("active")).toBe(true);
    });

    it("should handle welcome file rendering when files.inputList changes", async () => {
      // Need a session ID for file rendering
      window.app.services.sessionService.getCurrentSessionId.mockReturnValue("sess-1");

      const fileManager = await import("@/managers/file-manager.js");

      // Set view to welcome and run setup
      appState.setState("ui.currentView", "welcome");
      await viewManager.showWelcomeView(elements, appState);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Ensure mocks are clear
      fileManager.renderFileList.mockClear();

      // Trigger update
      const testFiles = [{ name: "test.txt" }];
      appState.setState("files.inputList", testFiles);

      // Wait for debounce and async processing
      await vi.waitUntil(() => fileManager.renderFileList.mock.calls.length > 0, { timeout: 2000 });

      // Check if renderFileList was called
      expect(fileManager.renderFileList).toHaveBeenCalled();
      const callArgs = fileManager.renderFileList.mock.calls[0];
      expect(callArgs[0]).toEqual(testFiles);
      expect(callArgs[1].id).toBe("welcome-files-container");
    });

    it("should render pending files when ui.pendingWelcomeFiles changes", async () => {
      appState.setState("ui.currentView", "welcome");
      const fileManager = await import("@/managers/file-manager.js");

      await viewManager.showWelcomeView(elements, appState);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pendingFiles = [{ name: "pending.png", type: "image/png" }];
      appState.setState("ui.pendingWelcomeFiles", pendingFiles);

      // Wait for async
      await vi.waitUntil(() => fileManager.renderPendingFilesGrid.mock.calls.length > 0, { timeout: 1000 });

      expect(fileManager.renderPendingFilesGrid).toHaveBeenCalled();
    });
  });

  describe("welcome page interactions", () => {
    beforeEach(async () => {
      await viewManager.showWelcomeView(elements, appState);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should create session and send message on send button click", async () => {
      const input = document.getElementById("welcome-input");
      const btn = document.getElementById("welcome-send-btn");
      const sessionService = window.app.services.sessionService;
      const ipcAdapter = window.app.adapters.ipcAdapter;

      input.value = "Hello World";
      btn.click();

      // Wait for async operations
      await vi.waitUntil(() => sessionService.createSession.mock.calls.length > 0);
      await vi.waitUntil(() => ipcAdapter.sendMessage.mock.calls.length > 0);

      expect(sessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Hello World",
          model: "gpt-4",
          reasoningEffort: "medium",
        })
      );

      expect(ipcAdapter.sendMessage).toHaveBeenCalledWith("Hello World", "new-session-123");
      expect(appState.getState("ui.currentView")).toBe("chat");
    });

    it("should create session and send message on Enter key", async () => {
      const input = document.getElementById("welcome-input");
      const sessionService = window.app.services.sessionService;

      input.value = "Enter Key Message";

      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        shiftKey: false,
        bubbles: true,
      });
      input.dispatchEvent(enterEvent);

      await vi.waitUntil(() => sessionService.createSession.mock.calls.length > 0);

      expect(sessionService.createSession).toHaveBeenCalled();
      expect(window.app.adapters.ipcAdapter.sendMessage).toHaveBeenCalledWith("Enter Key Message", "new-session-123");
    });

    it("should NOT send on Shift+Enter", async () => {
      const input = document.getElementById("welcome-input");
      input.value = "Shift Enter";

      const shiftEnterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        shiftKey: true, // Should not trigger send
        bubbles: true,
      });
      input.dispatchEvent(shiftEnterEvent);

      // Advance timers to make sure nothing happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(window.app.services.sessionService.createSession).not.toHaveBeenCalled();
    });

    it("should reuse existing session if available", async () => {
      const input = document.getElementById("welcome-input");
      const btn = document.getElementById("welcome-send-btn");
      const sessionService = window.app.services.sessionService;
      const ipcAdapter = window.app.adapters.ipcAdapter;

      sessionService.getCurrentSessionId.mockReturnValue("existing-session-456");

      input.value = "Hello Again";
      btn.click();

      await vi.waitUntil(() => ipcAdapter.sendMessage.mock.calls.length > 0);

      expect(sessionService.createSession).not.toHaveBeenCalled();
      expect(ipcAdapter.sendMessage).toHaveBeenCalledWith("Hello Again", "existing-session-456");
    });

    it("should upload pending files before creating session", async () => {
      const input = document.getElementById("welcome-input");
      const btn = document.getElementById("welcome-send-btn");
      const fileService = window.app.services.fileService;
      const sessionService = window.app.services.sessionService;

      const pendingFile = new File(["content"], "test.png", { type: "image/png" });
      appState.setState("ui.pendingWelcomeFiles", [{ file: pendingFile, name: "test.png", type: "image/png" }]);

      input.value = "Check this image";
      btn.click();

      await vi.waitUntil(() => sessionService.createSession.mock.calls.length > 0);
      await vi.waitUntil(() => fileService.uploadFile.mock.calls.length > 0);

      expect(sessionService.createSession).toHaveBeenCalled();
      expect(fileService.uploadFile).toHaveBeenCalledWith(expect.anything(), "new-session-123");
    });

    it("should handle refresh button click", async () => {
      const refreshBtn = document.getElementById("welcome-files-refresh");
      window.app.services.sessionService.getCurrentSessionId.mockReturnValue("sess-1");

      const fileManager = await import("@/managers/file-manager.js");

      refreshBtn.click();
      await vi.waitUntil(() => fileManager.loadFilesIntoState.mock.calls.length > 0);

      expect(fileManager.loadFilesIntoState).toHaveBeenCalledWith(appState, "data/files/sess-1/input", "input");
    });

    it("should populate input from suggestion pills", async () => {
      // Create a suggestion pill
      const pill = document.createElement("div");
      pill.className = "suggestion-pill";
      pill.dataset.category = "code";
      // Append to welcome container before listeners attached (wait, listeners already attached in beforeEach)
      // Since listeners are attached to existing DOM elements, adding one now won't have the listener.
      // We need to simulate the 'suggestionPills' being present at startup.

      // Let's create a new test setup for this or re-run showWelcomeView.
      // We'll re-run showWelcomeView.
      elements.welcomePageContainer.appendChild(pill);

      await viewManager.showWelcomeView(elements, appState);
      await new Promise((resolve) => setTimeout(resolve, 100));

      pill.click();

      const input = document.getElementById("welcome-input");
      expect(input.value).toBe("Prompt for code");
      expect(welcomePageMocks.getSuggestionPrompt).toHaveBeenCalledWith("code");
    });
  });

  describe("Model Configuration", () => {
    it("should initialize ModelSelector with cached config", async () => {
      // Setup cached config to avoid extra calls
      appState.setState("ui.cachedModelConfig", {
        models: [{ id: "gpt-4" }],
        reasoning_levels: ["low", "high"],
      });

      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => cb());

      const container = document.createElement("div");
      container.className = "model-config-inline";
      elements.welcomePageContainer.appendChild(container);

      await viewManager.showWelcomeView(elements, appState);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(appState.getState("ui.welcomeModelConfig")).toEqual({
        model: "gpt-4",
        reasoning_effort: "medium",
      });
    });

    it("should handle model config changes updates via IPC", async () => {
      // Initialize with cached config so we don't trigger "config_metadata"
      appState.setState("ui.cachedModelConfig", {
        models: [{ id: "gpt-4" }],
        reasoning_levels: ["low", "high"],
      });

      await viewManager.showWelcomeView(elements, appState);
      await new Promise((resolve) => setTimeout(resolve, 100));

      window.app.services.sessionService.getCurrentSessionId.mockReturnValue("sess-1");

      window.app.services.sessionService.loadSessions.mockResolvedValue({
        success: true,
        sessions: [{ session_id: "sess-1", message_count: 0 }],
      });

      const card2 = document.createElement("div");
      card2.className = "model-card";
      document.body.appendChild(card2);

      // Re-run listener attachment
      await viewManager.showWelcomeView(elements, appState);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Clear previous calls from showWelcomeView
      window.app.adapters.ipcAdapter.sendSessionCommand.mockClear();

      card2.click();

      await vi.waitUntil(() => window.app.adapters.ipcAdapter.sendSessionCommand.mock.calls.length > 0);

      expect(window.app.services.sessionService.loadSessions).toHaveBeenCalled();
      expect(window.app.adapters.ipcAdapter.sendSessionCommand).toHaveBeenCalledWith(
        "update_config",
        expect.objectContaining({ session_id: "sess-1" })
      );

      card2.remove();
    });
  });

  describe("showChatView", () => {
    it("should update state and show chat view", async () => {
      await viewManager.showChatView(elements, appState);
      expect(welcomePageMocks.hideWelcomePage).toHaveBeenCalled();
      expect(appState.getState("ui.currentView")).toBe("chat");
    });

    it("should focus input area", async () => {
      const inputAreaMock = { focus: vi.fn() };
      window.components.inputArea = inputAreaMock;

      await viewManager.showChatView(elements, appState);

      expect(inputAreaMock.focus).toHaveBeenCalled();
    });

    it("should focus fallback input if component missing", async () => {
      window.components.inputArea = undefined;
      elements.userInput.focus = vi.fn();

      await viewManager.showChatView(elements, appState);

      expect(elements.userInput.focus).toHaveBeenCalled();
    });
  });
});
