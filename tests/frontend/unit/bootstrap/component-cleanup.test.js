/**
 * Cleanup integration for lifecycle-managed components
 *
 * Verifies that initializeEventHandlers.cleanup() invokes component destroy()
 * methods so AppState subscriptions are removed on teardown.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { initializeEventHandlers } from "@/bootstrap/phases/phase5-event-handlers.js";
import { AppState } from "@/core/state.js";

// Mock dependencies that are not under test
vi.mock("@/handlers/message-handlers-v2.js", () => ({
  registerMessageHandlers: vi.fn(),
}));

vi.mock("@/handlers/session-list-handlers.js", () => ({
  setupSessionListHandlers: vi.fn(),
}));

vi.mock("@/managers/file-manager.js", () => ({
  loadFiles: vi.fn(),
}));

vi.mock("@/ui/titlebar.js", () => ({
  initializeTitlebar: vi.fn(),
}));

describe("bootstrap cleanup", () => {
  let components;
  let cleanup;

  beforeEach(async () => {
    // Minimal DOM required for handler registration
    document.body.innerHTML = `
      <div id="sidebar"></div>
      <button id="sidebar-toggle"></button>
      <div id="chat-container"></div>
    `;

    components = {
      chatContainer: { destroy: vi.fn(), clear: vi.fn() },
      filePanel: {
        destroy: vi.fn(),
        isVisible: vi.fn().mockReturnValue(false),
        setSession: vi.fn(),
        clear: vi.fn(),
      },
      inputArea: { destroy: vi.fn() },
      connectionStatus: { destroy: vi.fn() },
    };

    const services = {
      messageService: {},
      fileService: {},
      functionCallService: {},
      sessionService: {
        getCurrentSessionId: vi.fn().mockReturnValue(null),
        getSessions: vi.fn().mockReturnValue([]),
        createSession: vi.fn(),
        loadSessions: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
        clearCurrentSession: vi.fn(),
        updateSession: vi.fn(),
      },
    };

    const ipcAdapter = {
      onBotMessage: vi.fn(),
      onPythonStderr: vi.fn(),
      onPythonExit: vi.fn(),
      openExternalUrl: vi.fn(),
      restartBot: vi.fn(),
    };

    ({ cleanup } = await initializeEventHandlers({
      elements: {},
      appState: new AppState(),
      services,
      components,
      ipcAdapter,
      domAdapter: {},
      eventBus: { emit: vi.fn() },
      sendMessage: vi.fn(),
    }));
  });

  it("calls destroy on all registered components during cleanup", () => {
    cleanup();

    expect(components.chatContainer.destroy).toHaveBeenCalledTimes(1);
    expect(components.filePanel.destroy).toHaveBeenCalledTimes(1);
    expect(components.inputArea.destroy).toHaveBeenCalledTimes(1);
    expect(components.connectionStatus.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not call destroy more than once when cleanup is repeated", () => {
    cleanup();
    cleanup(); // second call should be a no-op

    expect(components.chatContainer.destroy).toHaveBeenCalledTimes(1);
    expect(components.filePanel.destroy).toHaveBeenCalledTimes(1);
    expect(components.inputArea.destroy).toHaveBeenCalledTimes(1);
    expect(components.connectionStatus.destroy).toHaveBeenCalledTimes(1);
  });
});
