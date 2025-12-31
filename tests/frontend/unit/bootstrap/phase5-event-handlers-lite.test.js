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

// Mock view-manager to prevent importing chat-ui.js and welcome-page.js (0% coverage files)
const mockShowWelcomeView = vi.fn().mockResolvedValue();
vi.mock("@/managers/view-manager.js", () => ({
  showWelcomeView: mockShowWelcomeView,
  showChatView: vi.fn().mockResolvedValue(),
}));

describe("phase5-event-handlers coverage", () => {
  let initializeEventHandlers;
  let cleanupFunc;

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
    if (cleanupFunc) cleanupFunc();
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
      session: {
        current: null,
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
          refresh: vi.fn(),
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
        readFile: vi.fn(),
        sendSessionCommand: vi.fn().mockResolvedValue({}),
        openFileDialog: vi.fn().mockResolvedValue([]),
      },
      domAdapter: {},
      eventBus: {
        emit: vi.fn(),
        on: vi.fn(() => vi.fn()), // returns an unsubscribe function
      },
      sendMessage: vi.fn(),
    };
  }

  it("initializes handlers and returns cleanup/updateSessionsList", async () => {
    const deps = createDeps();

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    expect(result).toHaveProperty("cleanup");
    expect(result).toHaveProperty("updateSessionsList");
    expect(mockRegisterMessageHandlers).toHaveBeenCalled();
    expect(mockSetupSessionListHandlers).toHaveBeenCalled();
    expect(mockInitializeTitlebar).toHaveBeenCalled();
  });

  it("updates session list and renders empty state", async () => {
    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;
    const { updateSessionsList: updateList } = result;

    updateList([]);
    expect(mockRenderEmptySessionList).toHaveBeenCalled();

    updateList([{ session_id: "s1", title: "One", created_at: new Date().toISOString() }]);
    expect(mockRenderSessionList).toHaveBeenCalled();
  });

  it("cleans up listeners and components", async () => {
    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;
    const { cleanup: runCleanup } = result;

    expect(() => runCleanup()).not.toThrow();
  });

  it("toggles sidebar and closes panel on outside click", async () => {
    const deps = createDeps();
    const { appState, components } = deps;
    components.filePanel.isVisible = () => true;
    const panel = document.createElement("div");
    components.filePanel.getPanel = () => panel;
    document.body.appendChild(panel);

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

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

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    const clickEvent = new MouseEvent("click", { bubbles: true });
    link.dispatchEvent(clickEvent);

    expect(deps.ipcAdapter.openExternalUrl).toHaveBeenCalledWith(expect.stringContaining("https://example.com"));
  });

  it("handles drag/drop visibility and hiding", async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

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

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

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

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

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
    expect(pendingFiles[0].previewType).toBe("text"); // 'txt' maps to code/text
  });

  it("buffers PDF files with icon placeholder (no blob URL)", async () => {
    const deps = createDeps();
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);
    deps.services.fileService.uploadFile = vi.fn();

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [new File(["%PDF"], "test.pdf", { type: "application/pdf" })] },
    });
    document.getElementById("file-drop-zone").dispatchEvent(drop);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // PDFs use icon placeholders instead of blob URLs (pdf.js integration TBD)
    const pendingFiles = deps.appState.getState("ui.pendingWelcomeFiles");
    expect(pendingFiles.length).toBe(1);
    expect(pendingFiles[0].name).toBe("test.pdf");
    expect(pendingFiles[0].previewType).toBe("pdf");
    expect(pendingFiles[0].previewUrl).toBeNull();
  });

  it("wires IPC error/exit handlers", async () => {
    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    expect(deps.ipcAdapter.onPythonStderr).toHaveBeenCalled();
    expect(deps.ipcAdapter.onPythonExit).toHaveBeenCalled();

    const stderrHandler = deps.ipcAdapter.onPythonStderr.mock.calls[0][0];
    const exitHandler = deps.ipcAdapter.onPythonExit.mock.calls[0][0];

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    stderrHandler("bad");
    exitHandler();

    expect(consoleErrorSpy).toHaveBeenCalledWith("Bot error:", "bad");
    expect(consoleWarnSpy).toHaveBeenCalledWith("Bot disconnected", undefined);

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("uploads single file and refreshes panel with success toast", async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "sess-2");
    deps.services.fileService.uploadFile = vi.fn().mockResolvedValue({ success: true });
    deps.components.filePanel.refresh = vi.fn().mockResolvedValue();

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

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

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

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
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    expect(() => document.body.click()).not.toThrow();
  });

  it("skips session rendering when sessions list element is missing", async () => {
    const deps = createDeps();
    document.getElementById("sessions-list")?.remove();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;
    const { updateSessionsList: updateList } = result;

    expect(() => updateList([{ session_id: "x", title: "X" }])).not.toThrow();
  });

  it("handles session-created event and updates services/UI", async () => {
    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

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
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

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

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    window.dispatchEvent(new CustomEvent("session-updated", { detail: {} }));

    expect(mockRenderSessionList).toHaveBeenCalled();
  });

  it("warns when file exceeds MAX_PENDING_FILE_SIZE", async () => {
    const deps = createDeps();
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    const drop = new Event("drop", { bubbles: true });
    // Create a mock large file
    const largeFile = {
      name: "large.mov",
      size: 50 * 1024 * 1024 + 1, // Exceeds limit
      type: "video/quicktime",
    };
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [largeFile] },
    });

    document.getElementById("file-drop-zone").dispatchEvent(drop);

    // Wait for processing
    await new Promise((r) => setTimeout(r, 10));

    expect(mockShowToast).toHaveBeenCalledWith("large.mov exceeds 50MB limit", "warning", 3000);
    // Should NOT have added to pending files
    expect(deps.appState.getState("ui.pendingWelcomeFiles")).toEqual([]);
  });

  it("handles image file types correctly", async () => {
    const deps = createDeps();
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);

    // Mock URL.createObjectURL
    const mockUrl = "blob:test";
    global.URL.createObjectURL = vi.fn(() => mockUrl);

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    const drop = new Event("drop", { bubbles: true });
    const imageFile = new File(["img"], "pic.png", { type: "image/png" });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [imageFile] },
    });

    document.getElementById("file-drop-zone").dispatchEvent(drop);
    await new Promise((r) => setTimeout(r, 10));

    const pending = deps.appState.getState("ui.pendingWelcomeFiles");
    expect(pending[0].previewType).toBe("image");
    expect(pending[0].previewUrl).toBe(mockUrl);
  });

  // =========================================
  // handleFilesFromDialog tests
  // =========================================

  it("handles files-selected-from-dialog on welcome page without session", async () => {
    const deps = createDeps();
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);
    deps.ipcAdapter.readFile = vi.fn().mockResolvedValue({
      success: true,
      data: btoa("file content"),
      mimeType: "text/plain",
    });

    global.URL.createObjectURL = vi.fn(() => "blob:test");

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: { filePaths: ["/path/to/test.txt"] },
      })
    );

    await new Promise((r) => setTimeout(r, 50));

    const pending = deps.appState.getState("ui.pendingWelcomeFiles");
    expect(pending.length).toBe(1);
    expect(pending[0].name).toBe("test.txt");
    expect(deps.ipcAdapter.readFile).toHaveBeenCalledWith("/path/to/test.txt");
  });

  it("handles files-selected-from-dialog with empty filePaths", async () => {
    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Should not throw
    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: { filePaths: [] },
      })
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(deps.appState.getState("ui.pendingWelcomeFiles")).toEqual([]);
  });

  it("handles files-selected-from-dialog with no filePaths", async () => {
    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: {},
      })
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(deps.appState.getState("ui.pendingWelcomeFiles")).toEqual([]);
  });

  it("handles files-selected-from-dialog upload with active session", async () => {
    const deps = createDeps();
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "sess-active");
    deps.services.fileService.uploadFile = vi.fn().mockResolvedValue({ success: true });
    deps.ipcAdapter.readFile = vi.fn().mockResolvedValue({
      success: true,
      data: btoa("content"),
      mimeType: "text/plain",
    });
    deps.components.filePanel.refresh = vi.fn().mockResolvedValue();

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: { filePaths: ["/path/to/upload.txt"] },
      })
    );

    await vi.waitFor(() => expect(deps.services.fileService.uploadFile).toHaveBeenCalled());
    expect(deps.components.filePanel.refresh).toHaveBeenCalled();
  });

  it("handles files-selected-from-dialog upload failure with active session", async () => {
    const deps = createDeps();
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "sess-active");
    deps.services.fileService.uploadFile = vi.fn().mockResolvedValue({ success: false, error: "fail" });
    deps.ipcAdapter.readFile = vi.fn().mockResolvedValue({
      success: true,
      data: btoa("content"),
      mimeType: "text/plain",
    });

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: { filePaths: ["/path/to/fail.txt"] },
      })
    );

    await vi.waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Failed to upload fail.txt", "error", 3000));
  });

  it("handles files-selected-from-dialog with read file failure", async () => {
    const deps = createDeps();
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);
    deps.ipcAdapter.readFile = vi.fn().mockResolvedValue({
      success: false,
      error: "Read error",
    });

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: { filePaths: ["/path/to/bad.txt"] },
      })
    );

    await vi.waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Error processing file", "error", 3000));
  });

  it("handles files-selected-from-dialog large file rejection on welcome page", async () => {
    const deps = createDeps();
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);

    // Create a large file response
    const largeContent = "x".repeat(100);
    deps.ipcAdapter.readFile = vi.fn().mockResolvedValue({
      success: true,
      data: btoa(largeContent),
      mimeType: "text/plain",
    });

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Mock File constructor to return large size
    const originalFile = global.File;
    global.File = class extends originalFile {
      constructor(parts, name, options) {
        super(parts, name, options);
        Object.defineProperty(this, "size", { value: 60 * 1024 * 1024 }); // 60MB
      }
    };

    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: { filePaths: ["/path/to/huge.txt"] },
      })
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(mockShowToast).toHaveBeenCalledWith("huge.txt exceeds 50MB limit", "warning", 3000);

    global.File = originalFile;
  });

  it("handles files-selected-from-dialog with image file on welcome page", async () => {
    const deps = createDeps();
    deps.appState.setState("ui.bodyViewClass", "view-welcome");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => null);
    deps.ipcAdapter.readFile = vi.fn().mockResolvedValue({
      success: true,
      data: btoa("imagedata"),
      mimeType: "image/png",
    });

    global.URL.createObjectURL = vi.fn(() => "blob:image-url");

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: { filePaths: ["/path/to/image.png"] },
      })
    );

    await new Promise((r) => setTimeout(r, 50));

    const pending = deps.appState.getState("ui.pendingWelcomeFiles");
    expect(pending.length).toBe(1);
    expect(pending[0].previewType).toBe("image");
    expect(pending[0].previewUrl).toBe("blob:image-url");
  });

  it("handles files-selected-from-dialog image upload adds to pending attachments", async () => {
    const deps = createDeps();
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "sess-img");
    deps.services.fileService.uploadFile = vi.fn().mockResolvedValue({ success: true });
    deps.ipcAdapter.readFile = vi.fn().mockResolvedValue({
      success: true,
      data: btoa("pngdata"),
      mimeType: "image/png",
    });
    deps.components.filePanel.refresh = vi.fn().mockResolvedValue();

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    window.dispatchEvent(
      new CustomEvent("files-selected-from-dialog", {
        detail: { filePaths: ["/path/to/photo.png"] },
      })
    );

    await vi.waitFor(() => expect(deps.services.fileService.uploadFile).toHaveBeenCalled());

    const attachments = deps.appState.getState("message.pendingAttachments") || [];
    expect(attachments.length).toBe(1);
    expect(attachments[0].type).toBe("image_ref");
    expect(attachments[0].filename).toBe("photo.png");
  });

  // =========================================
  // MCP attachment menu tests
  // =========================================

  it("opens and closes chat attachment menu", async () => {
    const chatAttachmentBtn = document.createElement("button");
    chatAttachmentBtn.id = "chat-attachment-plus-btn";
    document.body.appendChild(chatAttachmentBtn);

    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Open menu
    chatAttachmentBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chatAttachmentBtn.classList.contains("open")).toBe(true);
    const menu = document.getElementById("chat-attachment-context-menu");
    expect(menu).not.toBeNull();
    expect(menu.classList.contains("visible")).toBe(true);

    // Close menu
    chatAttachmentBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chatAttachmentBtn.classList.contains("open")).toBe(false);
    expect(menu.classList.contains("visible")).toBe(false);
  });

  it("toggles MCP server states in menu", async () => {
    vi.useFakeTimers();
    const chatAttachmentBtn = document.createElement("button");
    chatAttachmentBtn.id = "chat-attachment-plus-btn";
    document.body.appendChild(chatAttachmentBtn);

    const deps = createDeps();
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "mcp-sess");

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Open menu
    chatAttachmentBtn.click();
    await vi.advanceTimersByTimeAsync(10);

    const menu = document.getElementById("chat-attachment-context-menu");
    const sequentialToggle = menu.querySelector('[data-mcp="sequential"]');

    expect(sequentialToggle).not.toBeNull();
    expect(sequentialToggle.classList.contains("active")).toBe(true);

    // Toggle off
    sequentialToggle.click();
    await vi.advanceTimersByTimeAsync(10);

    expect(sequentialToggle.classList.contains("active")).toBe(false);

    // Wait for debounced config update
    await vi.advanceTimersByTimeAsync(350);

    expect(deps.ipcAdapter.sendSessionCommand).toHaveBeenCalledWith(
      "update_config",
      expect.objectContaining({
        session_id: "mcp-sess",
      })
    );

    vi.useRealTimers();
  });

  it("closes menu on outside click", async () => {
    const chatAttachmentBtn = document.createElement("button");
    chatAttachmentBtn.id = "chat-attachment-plus-btn";
    document.body.appendChild(chatAttachmentBtn);

    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Open menu
    chatAttachmentBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const menu = document.getElementById("chat-attachment-context-menu");
    expect(menu.classList.contains("visible")).toBe(true);

    // Click outside
    document.body.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(menu.classList.contains("visible")).toBe(false);
  });

  it("syncs MCP states on session change", async () => {
    const chatAttachmentBtn = document.createElement("button");
    chatAttachmentBtn.id = "chat-attachment-plus-btn";
    document.body.appendChild(chatAttachmentBtn);

    const deps = createDeps();
    // Mock getCurrentSessionId to return the current state value
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => deps.appState.getState("session.current"));
    deps.services.sessionService.getSession = vi.fn(() => ({
      session_id: "sess-sync",
      mcp_config: ["fetch"], // Only fetch enabled
    }));

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Trigger session change - this will call syncMcpStatesWithSession
    deps.appState.setState("session.current", "sess-sync");
    await new Promise((r) => setTimeout(r, 50));

    // Open menu to check states - menu was already created and synced
    chatAttachmentBtn.click();
    await new Promise((r) => setTimeout(r, 50));

    const menu = document.getElementById("chat-attachment-context-menu");
    const fetchToggle = menu.querySelector('[data-mcp="fetch"]');
    const sequentialToggle = menu.querySelector('[data-mcp="sequential"]');

    expect(fetchToggle.classList.contains("active")).toBe(true);
    expect(sequentialToggle.classList.contains("active")).toBe(false);
  });

  it("resets MCP states when session cleared", async () => {
    const chatAttachmentBtn = document.createElement("button");
    chatAttachmentBtn.id = "chat-attachment-plus-btn";
    document.body.appendChild(chatAttachmentBtn);

    const deps = createDeps();
    deps.appState.setState("session.current", "some-session");

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Clear session (go to welcome page)
    deps.appState.setState("session.current", null);
    await new Promise((r) => setTimeout(r, 10));

    // Open menu
    chatAttachmentBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const menu = document.getElementById("chat-attachment-context-menu");
    // All should be active (defaults)
    const toggles = menu.querySelectorAll(".mcp-toggle-item");
    toggles.forEach((toggle) => {
      expect(toggle.classList.contains("active")).toBe(true);
    });
  });

  it("handles attach file menu item click", async () => {
    const chatAttachmentBtn = document.createElement("button");
    chatAttachmentBtn.id = "chat-attachment-plus-btn";
    document.body.appendChild(chatAttachmentBtn);

    const deps = createDeps();
    deps.ipcAdapter.openFileDialog = vi.fn().mockResolvedValue(["/selected/file.txt"]);

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Open menu
    chatAttachmentBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const menu = document.getElementById("chat-attachment-context-menu");
    const attachItem = menu.querySelector('[data-action="attach-file"]');

    // Mock window dispatch to capture event
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    attachItem.click();
    await vi.waitFor(() => expect(deps.ipcAdapter.openFileDialog).toHaveBeenCalled());

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "files-selected-from-dialog",
      })
    );

    dispatchSpy.mockRestore();
  });

  it("handles attach file dialog cancellation", async () => {
    const chatAttachmentBtn = document.createElement("button");
    chatAttachmentBtn.id = "chat-attachment-plus-btn";
    document.body.appendChild(chatAttachmentBtn);

    const deps = createDeps();
    deps.ipcAdapter.openFileDialog = vi.fn().mockResolvedValue([]);

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    chatAttachmentBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const menu = document.getElementById("chat-attachment-context-menu");
    const attachItem = menu.querySelector('[data-action="attach-file"]');

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    attachItem.click();
    await vi.waitFor(() => expect(deps.ipcAdapter.openFileDialog).toHaveBeenCalled());

    // Should NOT dispatch event for empty selection
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "files-selected-from-dialog",
      })
    );

    dispatchSpy.mockRestore();
  });

  // =========================================
  // Session management button tests
  // =========================================

  it("handles new session button click", async () => {
    const newSessionBtn = document.createElement("button");
    newSessionBtn.id = "new-session-btn";
    document.body.appendChild(newSessionBtn);

    const deps = createDeps();
    deps.appState.setState("session.current", "old-session");
    deps.services.sessionService.getCurrentSessionId = vi.fn(() => "old-session");
    deps.components.filePanel.clear = vi.fn();

    global.URL.revokeObjectURL = vi.fn();

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    newSessionBtn.click();
    await new Promise((r) => setTimeout(r, 50));

    expect(deps.components.filePanel.setSession).toHaveBeenCalledWith(null);
    expect(deps.components.filePanel.clear).toHaveBeenCalled();
    expect(deps.appState.getState("session.current")).toBeNull();
    expect(deps.components.chatContainer.clear).toHaveBeenCalled();
  });

  it("handles settings button click", async () => {
    const settingsBtn = document.createElement("button");
    settingsBtn.id = "settings-btn";
    document.body.appendChild(settingsBtn);

    // Define window.alert if not present (jsdom doesn't have it)
    const originalAlert = window.alert;
    window.alert = vi.fn();

    const deps = createDeps();
    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    settingsBtn.click();
    expect(window.alert).toHaveBeenCalledWith("Coming Soon!");

    window.alert = originalAlert;
  });

  // =========================================
  // Loading lamp visibility tests
  // =========================================

  it("updates loading lamp visibility on state change", async () => {
    const deps = createDeps();

    // Create a streaming message with loading lamp
    const messageEl = document.createElement("div");
    messageEl.className = "message";
    messageEl.dataset.streaming = "true";
    const loadingLamp = document.createElement("span");
    loadingLamp.className = "loading-lamp";
    messageEl.appendChild(loadingLamp);
    document.body.appendChild(messageEl);

    const result = await initializeEventHandlers(deps);
    cleanupFunc = result.cleanup;

    // Show lamp
    deps.appState.setState("ui.loadingLampVisible", true);
    await new Promise((r) => setTimeout(r, 10));

    expect(loadingLamp.style.opacity).toBe("1");
    expect(loadingLamp.style.display).toBe("inline-block");

    // Hide lamp
    deps.appState.setState("ui.loadingLampVisible", false);
    await new Promise((r) => setTimeout(r, 10));

    expect(loadingLamp.style.opacity).toBe("0");
  });
});
