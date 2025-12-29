import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupSessionListHandlers } from "@/handlers/session-list-handlers.js";

vi.mock("@/utils/chat-model-updater.js", () => ({
  updateChatModelSelector: vi.fn(),
}));

vi.mock("@/utils/scroll-utils.js", () => ({
  scheduleScroll: vi.fn(),
}));

vi.mock("@/managers/view-manager.js", () => ({
  showWelcomeView: vi.fn().mockResolvedValue(),
  showChatView: vi.fn().mockResolvedValue(),
}));

describe("Session List Handlers", () => {
  let container;
  let sessionService;
  let updateSessionsList;
  let elements;
  let appState;
  let ipcAdapter;
  let alertSpy;
  let confirmSpy;

  const createSessionItem = (id) => {
    const item = document.createElement("div");
    item.classList.add("session-item");
    item.dataset.sessionId = id;

    const summarizeBtn = document.createElement("button");
    summarizeBtn.dataset.action = "summarize";
    summarizeBtn.dataset.sessionId = id;
    item.appendChild(summarizeBtn);

    const renameBtn = document.createElement("button");
    renameBtn.dataset.action = "rename";
    renameBtn.dataset.sessionId = id;
    item.appendChild(renameBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.dataset.action = "delete";
    deleteBtn.dataset.sessionId = id;
    item.appendChild(deleteBtn);

    container.appendChild(item);

    return { item, summarizeBtn, renameBtn, deleteBtn };
  };

  beforeEach(() => {
    document.body.innerHTML = `<div id="sidebar"></div>`;
    alertSpy = vi.fn();
    confirmSpy = vi.fn(() => true);
    // Provide browser globals for happy-dom
    global.alert = alertSpy;
    global.confirm = confirmSpy;

    window.components = {
      chatContainer: {
        clear: vi.fn(),
        setMessages: vi.fn(),
        addUserMessage: vi.fn(),
        addAssistantMessage: vi.fn(),
        getElement: vi.fn(() => document.createElement("div")),
        showSkeleton: vi.fn(),
        prependMessages: vi.fn(),
      },
      filePanel: {
        setSession: vi.fn(),
        clear: vi.fn(),
        closeAllHandles: vi.fn(),
        isVisible: vi.fn(() => false),
      },
    };

    sessionService = {
      getCurrentSessionId: vi.fn(() => "active"),
      summarizeSession: vi.fn(async () => ({ success: true })),
      renameSession: vi.fn(async () => ({ success: true })),
      deleteSession: vi.fn(async () => ({ success: true })),
      loadSessions: vi.fn(async () => ({ success: true, sessions: [] })),
      switchSession: vi.fn(async () => ({
        success: true,
        session: { model: "gpt", reasoning_effort: "medium" },
        fullHistory: [{ role: "assistant", content: "hi" }],
      })),
      loadMoreMessages: vi.fn().mockResolvedValue({ success: false }),
    };

    updateSessionsList = vi.fn();
    elements = {};
    appState = {
      setState: vi.fn(),
      getState: vi.fn(),
      functions: { activeCalls: new Map(), argumentsBuffer: new Map() },
    };
    ipcAdapter = { commandQueue: [1], processQueue: vi.fn(async () => {}) };

    const streamManager = {
      startStream: vi.fn(),
      appendToBuffer: vi.fn(),
      endStream: vi.fn(),
      isStreaming: vi.fn(() => false),
      bufferToolEvent: vi.fn(),
      getBuffer: vi.fn(() => ""),
      getBufferedTools: vi.fn(() => []),
      reconstructStreamState: vi.fn(),
      cleanupSession: vi.fn(),
    };

    container = document.createElement("div");
    container.id = "sessions-list";
    document.body.appendChild(container);

    setupSessionListHandlers({
      sessionListContainer: container,
      sessionService,
      streamManager,
      updateSessionsList,
      elements,
      appState,
      ipcAdapter,
    });
  });

  it("summarizes current session via action button", async () => {
    const { summarizeBtn } = createSessionItem("active");

    summarizeBtn.dispatchEvent(new Event("click", { bubbles: true }));
    await vi.waitFor(() => expect(sessionService.summarizeSession).toHaveBeenCalled());

    expect(sessionService.summarizeSession).toHaveBeenCalledWith("active");
    expect(appState.setState).toHaveBeenCalledWith("python.status", "busy_summarizing");
    expect(ipcAdapter.processQueue).toHaveBeenCalled();
  });

  it("prompts to switch before summarizing non-active session", async () => {
    sessionService.getCurrentSessionId.mockReturnValue("other");
    const { summarizeBtn } = createSessionItem("inactive");

    summarizeBtn.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();

    expect(alertSpy).toHaveBeenCalled();
    expect(sessionService.summarizeSession).not.toHaveBeenCalled();
  });

  it("deletes the active session and updates UI", async () => {
    sessionService.getCurrentSessionId.mockReturnValue("delete-me");
    const { deleteBtn } = createSessionItem("delete-me");

    deleteBtn.dispatchEvent(new Event("click", { bubbles: true }));
    await vi.waitFor(() => expect(sessionService.deleteSession).toHaveBeenCalled());

    expect(confirmSpy).toHaveBeenCalled();
    expect(sessionService.deleteSession).toHaveBeenCalledWith("delete-me");
    await vi.waitFor(() => expect(updateSessionsList).toHaveBeenCalled());
    expect(window.components.filePanel.closeAllHandles).toHaveBeenCalled();
    expect(window.components.filePanel.setSession).toHaveBeenCalledWith(null);
  });

  it("renames session on enter with success result", async () => {
    const { item, renameBtn } = createSessionItem("r2");
    const titleDiv = document.createElement("div");
    titleDiv.className = "session-title";
    titleDiv.textContent = "Old";
    item.appendChild(titleDiv);
    sessionService.renameSession.mockResolvedValue({ success: true });

    renameBtn.dispatchEvent(new Event("click", { bubbles: true }));
    const input = item.querySelector("input.session-title-input");
    input.value = "New";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await Promise.resolve();

    expect(sessionService.renameSession).toHaveBeenCalledWith("r2", "New");
    expect(titleDiv.textContent).toBe("New");
  });

  it("switches sessions and renders history", async () => {
    document.body.classList.add("view-welcome");
    const { item } = createSessionItem("next");

    item.dispatchEvent(new Event("click", { bubbles: true }));
    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 50));
    await vi.waitFor(() => expect(window.components.chatContainer.setMessages).toHaveBeenCalled());

    expect(sessionService.switchSession).toHaveBeenCalledWith("next", expect.any(Object));
    expect(window.components.chatContainer.setMessages).toHaveBeenCalled();
    expect(updateSessionsList).toHaveBeenCalled();

    const sidebar = document.getElementById("sidebar");
    expect(sidebar.classList.contains("collapsed")).toBe(true);
  });

  it("loads remaining messages in background if history is incomplete", async () => {
    // Mock session switch returning incomplete history
    sessionService.switchSession.mockResolvedValue({
      success: true,
      session: { model: "gpt" },
      fullHistory: [{ role: "assistant", content: "newest" }],
      loadedCount: 1, // Only 1 loaded
      messageCount: 5, // Total 5
      hasMore: true,
    });

    // Mock loadMoreMessages
    sessionService.loadMoreMessages = vi
      .fn()
      .mockResolvedValueOnce({ success: true, messages: [{ content: "msg1" }, { content: "msg2" }] }) // Chunk 1
      .mockResolvedValueOnce({ success: true, messages: [{ content: "msg3" }, { content: "msg4" }] }); // Chunk 2 (completes it)

    const { item } = createSessionItem("pagination-session");
    item.dispatchEvent(new Event("click", { bubbles: true }));

    // Initial switch
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sessionService.switchSession).toHaveBeenCalled();

    // Wait for recursive pagination loop (multiple async steps)
    // 2 chunks -> multiple awaits
    await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Check calls
    expect(sessionService.loadMoreMessages).toHaveBeenCalled();
    expect(window.components.chatContainer.prependMessages).toHaveBeenCalled();
  });
});
