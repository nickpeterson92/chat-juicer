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
        addUserMessage: vi.fn(),
        addAssistantMessage: vi.fn(),
        getElement: vi.fn(() => document.createElement("div")),
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
    };

    updateSessionsList = vi.fn();
    elements = {};
    appState = {
      setState: vi.fn(),
      functions: { activeCalls: new Map(), argumentsBuffer: new Map() },
    };
    ipcAdapter = { commandQueue: [1], processQueue: vi.fn(async () => {}) };

    container = document.createElement("div");
    container.id = "sessions-list";
    document.body.appendChild(container);

    setupSessionListHandlers({
      sessionListContainer: container,
      sessionService,
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

  it("cancels delete when confirm is rejected", async () => {
    confirmSpy.mockReturnValue(false);
    const { deleteBtn } = createSessionItem("keep");

    deleteBtn.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();

    expect(sessionService.deleteSession).not.toHaveBeenCalled();
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

  it("alerts when rename result fails", async () => {
    const { item, renameBtn } = createSessionItem("r3");
    const titleDiv = document.createElement("div");
    titleDiv.className = "session-title";
    titleDiv.textContent = "Title";
    item.appendChild(titleDiv);
    sessionService.renameSession.mockResolvedValue({ success: false, error: "nope" });

    renameBtn.dispatchEvent(new Event("click", { bubbles: true }));
    const input = item.querySelector("input.session-title-input");
    input.value = "NewTitle";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await Promise.resolve();

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("nope"));
  });

  it("skips rename when title unchanged or empty", async () => {
    const { item, renameBtn } = createSessionItem("r1");
    const titleDiv = document.createElement("div");
    titleDiv.className = "session-title";
    titleDiv.textContent = "Old";
    item.appendChild(titleDiv);

    renameBtn.dispatchEvent(new Event("click", { bubbles: true }));

    const input = item.querySelector("input.session-title-input");
    input.value = "   ";
    input.dispatchEvent(new Event("blur"));
    await Promise.resolve();

    expect(sessionService.renameSession).not.toHaveBeenCalled();
  });

  it("does not switch when clicking current session", async () => {
    sessionService.getCurrentSessionId.mockReturnValue("same");
    const { item } = createSessionItem("same");

    item.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();

    expect(sessionService.switchSession).not.toHaveBeenCalled();
  });

  it("handles summarize errors and resets status", async () => {
    sessionService.summarizeSession.mockRejectedValue(new Error("boom"));
    const { summarizeBtn } = createSessionItem("active");

    summarizeBtn.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();

    expect(appState.setState).toHaveBeenCalledWith("python.status", "idle");
  });

  it("switches sessions and renders history", async () => {
    document.body.classList.add("view-welcome");
    const { item } = createSessionItem("next");

    item.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();

    expect(sessionService.switchSession).toHaveBeenCalledWith("next");
    expect(window.components.chatContainer.clear).toHaveBeenCalled();
    expect(window.components.chatContainer.addAssistantMessage).toHaveBeenCalledWith("hi");
    expect(updateSessionsList).toHaveBeenCalled();

    const sidebar = document.getElementById("sidebar");
    expect(sidebar.classList.contains("collapsed")).toBe(true);
  });
});
