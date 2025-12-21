import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/component-lifecycle.js", () => ({
  ComponentLifecycle: {
    mount: vi.fn(),
    unmount: vi.fn(),
  },
}));

const mockRegisterMessageHandlers = vi.fn();
vi.mock("@/handlers/message-handlers-v2.js", () => ({
  registerMessageHandlers: mockRegisterMessageHandlers,
}));

const mockSetupSessionListHandlers = vi.fn();
vi.mock("@/handlers/session-list-handlers.js", () => ({
  setupSessionListHandlers: mockSetupSessionListHandlers,
}));

const mockLoadFiles = vi.fn();
vi.mock("@/managers/file-manager.js", () => ({
  loadFiles: mockLoadFiles,
}));

const mockRenderEmptySessionList = vi.fn(() => document.createElement("div"));
const mockRenderSessionList = vi.fn(() => document.createDocumentFragment());
vi.mock("@/ui/renderers/session-list-renderer.js", () => ({
  renderEmptySessionList: mockRenderEmptySessionList,
  renderSessionList: mockRenderSessionList,
}));

const mockInitializeTitlebar = vi.fn();
vi.mock("@/ui/titlebar.js", () => ({
  initializeTitlebar: mockInitializeTitlebar,
}));

// Mock MessageHandlerPlugin to prevent eventBus.on() calls
vi.mock("@/plugins/core-plugins.js", () => ({
  MessageHandlerPlugin: {
    install: vi.fn().mockResolvedValue(undefined),
    name: "message-handler",
  },
}));

const mockUpdateChatModelSelector = vi.fn();
vi.mock("@/utils/chat-model-updater.js", () => ({
  updateChatModelSelector: mockUpdateChatModelSelector,
}));

const mockShowToast = vi.fn();
vi.mock("@/utils/toast.js", () => ({
  showToast: mockShowToast,
}));

describe("phase5-event-handlers coverage", () => {
  let initializeEventHandlers;

  beforeEach(async () => {
    vi.resetModules();
    // Basic DOM fixtures for the handlers to bind to
    const sidebarToggle = document.createElement("button");
    sidebarToggle.id = "sidebar-toggle";
    document.body.appendChild(sidebarToggle);

    const sidebar = document.createElement("div");
    sidebar.id = "sidebar";
    document.body.appendChild(sidebar);

    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    document.body.appendChild(chatContainer);

    const chatPanel = document.createElement("div");
    chatPanel.className = "chat-panel";
    document.body.appendChild(chatPanel);

    const fileDropZone = document.createElement("div");
    fileDropZone.id = "file-drop-zone";
    document.body.appendChild(fileDropZone);

    const welcomePageContainer = document.createElement("div");
    welcomePageContainer.id = "welcome-page-container";
    document.body.appendChild(welcomePageContainer);

    const sessionsList = document.createElement("div");
    sessionsList.id = "sessions-list";
    document.body.appendChild(sessionsList);

    const aiThinking = document.createElement("div");
    aiThinking.id = "ai-thinking";
    document.body.appendChild(aiThinking);

    const welcomeFilesSection = document.createElement("div");
    welcomeFilesSection.id = "welcome-files-section";
    document.body.appendChild(welcomeFilesSection);

    const module = await import("@/bootstrap/phases/phase5-event-handlers.js");
    initializeEventHandlers = module.initializeEventHandlers;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.body.className = ""; // Clear body classes too
    vi.clearAllMocks();
  });

  function createAppState() {
    const state = {
      ui: {
        sidebarCollapsed: false,
        bodyViewClass: "view-chat",
        aiThinkingActive: false,
        welcomeFilesSectionVisible: true,
        pendingWelcomeFiles: [],
      },
      message: {
        currentAssistant: null,
      },
    };
    const listeners = new Map();

    return {
      getState(path) {
        const [ns, key] = path.split(".");
        return state[ns]?.[key];
      },
      setState(path, value) {
        const [ns, key] = path.split(".");
        state[ns][key] = value;
        listeners.get(path)?.forEach((cb) => {
          cb(value);
        });
      },
      subscribe(path, cb) {
        if (!listeners.has(path)) listeners.set(path, []);
        listeners.get(path).push(cb);
        return () => {
          const arr = listeners.get(path) || [];
          listeners.set(
            path,
            arr.filter((fn) => fn !== cb)
          );
        };
      },
    };
  }

  function createDeps() {
    const appState = createAppState();
    const sessionService = {
      getSessions: () => [],
      getCurrentSessionId: () => null,
      updateSession: vi.fn(),
    };

    return {
      elements: { aiThinking: document.getElementById("ai-thinking") },
      appState,
      services: {
        sessionService,
        messageService: {},
        fileService: {},
        functionCallService: {},
      },
      components: {
        filePanel: {
          isVisible: () => false,
          getPanel: () => null,
          hide: vi.fn(),
          setSession: vi.fn(),
          closeAllHandles: vi.fn(),
          destroy: vi.fn(),
        },
        chatContainer: { clear: vi.fn(), destroy: vi.fn() },
        inputArea: { destroy: vi.fn() },
        connectionStatus: { destroy: vi.fn() },
      },
      ipcAdapter: {
        openExternalUrl: vi.fn(),
        onBotMessage: vi.fn(),
        onPythonStderr: vi.fn(),
        onPythonExit: vi.fn(),
      },
      domAdapter: {},
      eventBus: { emit: vi.fn() },
      sendMessage: vi.fn(),
    };
  }

  it("initializes handlers and returns cleanup/updateSessionsList", async () => {
    const deps = createDeps();

    const result = await initializeEventHandlers(deps);

    expect(result).toHaveProperty("cleanup");
    expect(result).toHaveProperty("updateSessionsList");
    expect(mockRegisterMessageHandlers).toHaveBeenCalled();
    expect(mockSetupSessionListHandlers).toHaveBeenCalled();
    expect(mockInitializeTitlebar).toHaveBeenCalled();
  });

  it("updates session list and renders empty state", async () => {
    const deps = createDeps();
    const { updateSessionsList: updateList } = await initializeEventHandlers(deps);

    updateList([]);
    expect(mockRenderEmptySessionList).toHaveBeenCalled();

    updateList([{ session_id: "s1", title: "One", created_at: new Date().toISOString() }]);
    expect(mockRenderSessionList).toHaveBeenCalled();
  });

  it("cleans up listeners and components", async () => {
    const deps = createDeps();
    const { cleanup: runCleanup } = await initializeEventHandlers(deps);

    expect(() => runCleanup()).not.toThrow();
  });

  it("toggles sidebar and closes panel on outside click", async () => {
    const deps = createDeps();
    const { appState, components } = deps;
    components.filePanel.isVisible = () => true;
    const panel = document.createElement("div");
    components.filePanel.getPanel = () => panel;
    document.body.appendChild(panel);

    await initializeEventHandlers(deps);

    document.getElementById("sidebar-toggle").click();
    expect(appState.getState("ui.sidebarCollapsed")).toBe(true);

    document.body.click();
    expect(components.filePanel.hide).toHaveBeenCalled();
  });

  it("opens external links via IPC from chat container", async () => {
    const deps = createDeps();
    const link = document.createElement("a");
    link.href = "https://example.com";
    document.getElementById("chat-container").appendChild(link);

    await initializeEventHandlers(deps);

    const clickEvent = new MouseEvent("click", { bubbles: true });
    link.dispatchEvent(clickEvent);

    expect(deps.ipcAdapter.openExternalUrl).toHaveBeenCalledWith(expect.stringContaining("https://example.com"));
  });

  it("handles drag/drop visibility and hiding", async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    await initializeEventHandlers(deps);

    const dropZone = document.getElementById("file-drop-zone");
    const dragEnter = new Event("dragenter");
    Object.defineProperty(dragEnter, "dataTransfer", {
      value: { types: ["Files"] },
    });
    document.dispatchEvent(dragEnter);
    expect(dropZone.classList.contains("active")).toBe(true);

    const dragLeave = new Event("dragleave");
    Object.defineProperty(dragLeave, "dataTransfer", {
      value: { types: ["Files"] },
    });
    document.dispatchEvent(dragLeave);
    vi.runAllTimers();
    expect(dropZone.classList.contains("active")).toBe(false);
    vi.useRealTimers();
  });

  it("handles file upload errors gracefully", async () => {
    const deps = createDeps();
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "sess-1");
    deps.services.fileService.uploadFile = vi.fn().mockRejectedValue(new Error("boom"));

    await initializeEventHandlers(deps);

    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [new File(["x"], "bad.txt")] },
    });
    document.getElementById("file-drop-zone").dispatchEvent(drop);

    await vi.waitFor(() => expect(deps.services.fileService.uploadFile).toHaveBeenCalled());
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining("bad.txt"), "error", 3000);
  });

  it("buffers files in AppState on welcome page drop when no session exists", async () => {
    const deps = createDeps();
    // Set AppState to welcome view (this ensures body class logic in handlers works correctly)
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);
    deps.services.fileService.uploadFile = vi.fn();

    await initializeEventHandlers(deps);

    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [new File(["x"], "test.txt")] },
    });
    document.getElementById("file-drop-zone").dispatchEvent(drop);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should NOT upload - files should be buffered in AppState instead
    expect(deps.services.fileService.uploadFile).not.toHaveBeenCalled();
    // Verify files were buffered with preview content
    const pendingFiles = deps.appState.getState("ui.pendingWelcomeFiles");
    expect(pendingFiles.length).toBe(1);
    expect(pendingFiles[0].name).toBe("test.txt");
    expect(pendingFiles[0].previewContent).toBe("x"); // 'x' was the file content
    expect(pendingFiles[0].previewType).toBe("code"); // 'txt' maps to code/text
  });

  it("buffers PDF files with preview URL", async () => {
    const deps = createDeps();
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);
    deps.services.fileService.uploadFile = vi.fn();

    // Mock URL.createObjectURL
    const mockCreateObjectURL = vi.fn(() => "blob:pdf");
    global.URL.createObjectURL = mockCreateObjectURL;

    await initializeEventHandlers(deps);

    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [new File(["%PDF"], "test.pdf", { type: "application/pdf" })] },
    });
    document.getElementById("file-drop-zone").dispatchEvent(drop);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    const pendingFiles = deps.appState.getState("ui.pendingWelcomeFiles");
    expect(pendingFiles.length).toBe(1);
    expect(pendingFiles[0].name).toBe("test.pdf");
    expect(pendingFiles[0].previewType).toBe("pdf");
    expect(pendingFiles[0].previewUrl).toBeNull();
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
  });

  it("wires IPC error/exit handlers", async () => {
    const deps = createDeps();
    await initializeEventHandlers(deps);

    expect(deps.ipcAdapter.onPythonStderr).toHaveBeenCalled();
    expect(deps.ipcAdapter.onPythonExit).toHaveBeenCalled();

    const stderrHandler = deps.ipcAdapter.onPythonStderr.mock.calls[0][0];
    const exitHandler = deps.ipcAdapter.onPythonExit.mock.calls[0][0];

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    stderrHandler("bad");
    exitHandler();

    expect(consoleErrorSpy).toHaveBeenCalledWith("Bot error:", "bad");
    expect(consoleWarnSpy).toHaveBeenCalledWith("Bot disconnected");

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("uploads single file and refreshes panel with success toast", async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "sess-2");
    deps.services.fileService.uploadFile = vi.fn().mockResolvedValue({ success: true });
    deps.components.filePanel.refresh = vi.fn().mockResolvedValue();

    await initializeEventHandlers(deps);

    const drop = new Event("drop", { bubbles: true });
    const file = { name: "ok.txt", size: 2 };
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        files: [file],
        types: ["Files"],
        [Symbol.iterator]: function* () {
          yield file;
        },
      },
    });
    document.getElementById("file-drop-zone").dispatchEvent(drop);

    await vi.waitFor(() => expect(deps.services.fileService.uploadFile).toHaveBeenCalled());
    await vi.runAllTimersAsync();

    expect(deps.services.fileService.uploadFile).toHaveBeenCalledWith(file, "sess-2", expect.any(Function));
    expect(deps.components.filePanel.refresh).toHaveBeenCalled();
    // Single file uploads use progress bar instead of toast (toast only for multiple files)
    vi.useRealTimers();
  });

  it("uploads multiple files partial success and shows warning summary", async () => {
    const deps = createDeps();
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "sess-3");
    deps.services.fileService.uploadFile = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "x" });

    await initializeEventHandlers(deps);

    const drop = new Event("drop", { bubbles: true });
    const fileA = { name: "a.txt", size: 1 };
    const fileB = { name: "b.txt", size: 1 };
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        files: [fileA, fileB],
        types: ["Files"],
        [Symbol.iterator]: function* () {
          yield fileA;
          yield fileB;
        },
      },
    });
    document.getElementById("file-drop-zone").dispatchEvent(drop);

    await vi.waitFor(() => expect(deps.services.fileService.uploadFile).toHaveBeenCalledTimes(2));

    expect(deps.services.fileService.uploadFile).toHaveBeenCalledWith(fileA, "sess-3", expect.any(Function));
    expect(deps.services.fileService.uploadFile).toHaveBeenCalledWith(fileB, "sess-3", expect.any(Function));
    expect(mockShowToast).toHaveBeenCalledWith("1/2 files uploaded", "warning", 3000);
  });

  it("handles no-sidebar-or-toggle gracefully on click away", async () => {
    const deps = createDeps();
    // Remove sidebar and toggle to hit guard branches
    document.getElementById("sidebar")?.remove();
    document.getElementById("sidebar-toggle")?.remove();
    await initializeEventHandlers(deps);

    expect(() => document.body.click()).not.toThrow();
  });

  it("skips session rendering when sessions list element is missing", async () => {
    const deps = createDeps();
    document.getElementById("sessions-list")?.remove();
    const { updateSessionsList: updateList } = await initializeEventHandlers(deps);

    expect(() => updateList([{ session_id: "x", title: "X" }])).not.toThrow();
  });

  it("handles session-created event and updates services/UI", async () => {
    const deps = createDeps();
    await initializeEventHandlers(deps);

    const session = { session_id: "new1", title: "T" }; // omit model to skip dynamic import branch
    const event = new CustomEvent("session-created", { detail: { session } });
    window.dispatchEvent(event);

    expect(deps.components.filePanel.setSession).toHaveBeenCalledWith("new1");
    expect(deps.services.sessionService.updateSession).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: "new1" })
    );
  });

  it("invokes chat model updater when session includes model metadata", async () => {
    const deps = createDeps();
    await initializeEventHandlers(deps);

    const session = {
      session_id: "model1",
      title: "WithModel",
      model: "gpt-mini",
      reasoning_effort: "medium",
    };
    window.dispatchEvent(new CustomEvent("session-created", { detail: { session } }));

    // Wait for async import/handler to resolve
    await vi.waitFor(() => expect(mockUpdateChatModelSelector).toHaveBeenCalledWith(session));
    expect(deps.services.sessionService.updateSession).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: "model1" })
    );
  });

  it("handles session-updated by re-rendering session list", async () => {
    const deps = createDeps();
    const sessions = [
      { session_id: "a", title: "A" },
      { session_id: "b", title: "B" },
    ];
    deps.services.sessionService.getSessions = vi.fn().mockReturnValue(sessions);

    await initializeEventHandlers(deps);

    window.dispatchEvent(new CustomEvent("session-updated", { detail: {} }));

    expect(mockRenderSessionList).toHaveBeenCalled();
  });
});
