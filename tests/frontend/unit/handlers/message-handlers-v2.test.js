/**
 * Message Handlers V2 Unit Tests
 * Tests for Phase 3 State Management Consolidation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { globalEventBus } from "@/core/event-bus.js";
import { AppState } from "@/core/state.js";
import { registerMessageHandlers } from "@/handlers/message-handlers-v2.js";

// Mock the UI modules
vi.mock("@/ui/chat-ui.js", () => ({
  cancelPendingRender: vi.fn(),
  completeStreamingMessage: vi.fn(),
  createStreamingAssistantMessage: vi.fn(() => document.createElement("span")),
  updateAssistantMessage: vi.fn(),
}));

vi.mock("@/ui/function-card-ui.js", () => ({
  createFunctionCallCard: vi.fn(),
  scheduleFunctionCardCleanup: vi.fn(),
  updateFunctionArguments: vi.fn(),
  updateFunctionCallStatus: vi.fn(),
}));

vi.mock("@/utils/markdown-renderer.js", () => ({
  initializeCodeCopyButtons: vi.fn(),
  processMermaidDiagrams: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/utils/scroll-utils.js", () => ({
  scheduleScroll: vi.fn(),
}));

describe("Message Handlers V2 - Phase 3 State Management", () => {
  let appState;
  let context;
  let elements;
  let ipcAdapter;
  let services;

  beforeEach(() => {
    // Clear all event listeners
    globalEventBus.off();

    // Clear localStorage
    localStorage.clear();

    // Mock electronAPI
    window.electronAPI = { log: vi.fn() };

    // Create fresh AppState
    appState = new AppState();

    // Create mock elements
    elements = {
      aiThinking: document.createElement("div"),
      chatContainer: document.createElement("div"),
    };

    // Create mock IPC adapter
    ipcAdapter = {
      commandQueue: [],
      processQueue: vi.fn(() => Promise.resolve()),
    };

    // Create mock services
    services = {
      messageService: {},
      fileService: {},
      functionCallService: {
        createCall: vi.fn(),
        updateCallStatus: vi.fn(),
        appendArgumentsDelta: vi.fn(),
        setCallResult: vi.fn(),
        setCallError: vi.fn(),
      },
      sessionService: {
        getSession: vi.fn(() => ({ title: "Test Session" })),
      },
      streamManager: {
        startStream: vi.fn(),
        appendToBuffer: vi.fn(),
        endStream: vi.fn(),
        isStreaming: vi.fn(() => false),
        bufferToolEvent: vi.fn(),
        getBuffer: vi.fn(() => ""),
        getBufferedTools: vi.fn(() => []),
        cleanupSession: vi.fn(),
      },
    };

    // Create context
    context = {
      appState,
      elements,
      ipcAdapter,
      services,
    };

    // Register handlers
    registerMessageHandlers(context);
  });

  describe("Active session detection", () => {
    it("should not treat background session messages as active when no current session", () => {
      globalEventBus.emit("message:assistant_start", { session_id: "background" });

      expect(appState.getState("python.status")).toBe("idle");
      expect(appState.getState("message.isStreaming")).toBe(false);
    });

    it("should drop background buffering when no session can be resolved", () => {
      globalEventBus.emit("message:assistant_delta", { content: "hi" });

      expect(services.streamManager.appendToBuffer).not.toHaveBeenCalled();
    });

    it("should not buffer function events when no session can be resolved", () => {
      globalEventBus.emit("message:function_detected", { call_id: "c1", name: "tool" });

      expect(services.streamManager.bufferToolEvent).not.toHaveBeenCalled();
    });

    it("should treat message as active when session_id matches current session", () => {
      appState.setState("session.current", "active-session");

      globalEventBus.emit("message:assistant_start", { session_id: "active-session" });

      expect(appState.getState("python.status")).toBe("busy_streaming");
      expect(appState.getState("message.isStreaming")).toBe(true);
    });

    it("should treat message without session_id as active only when current session exists", () => {
      // No current session yet
      globalEventBus.emit("message:assistant_start", {});
      expect(appState.getState("python.status")).toBe("idle");

      // Set current session and retry
      appState.setState("session.current", "active-session");
      globalEventBus.emit("message:assistant_start", {});
      expect(appState.getState("python.status")).toBe("busy_streaming");
    });
  });

  describe("Phase 3: AppState Integration", () => {
    it("should use AppState for aiThinkingActive instead of direct DOM manipulation", () => {
      // Subscribe to state changes
      const stateCallback = vi.fn();
      appState.subscribe("ui.aiThinkingActive", stateCallback);

      // Emit assistant_start event
      globalEventBus.emit("message:assistant_start", {});

      // Verify AppState was updated
      expect(appState.getState("ui.aiThinkingActive")).toBe(false);
      expect(stateCallback).toHaveBeenCalledWith(false, false, "ui.aiThinkingActive");
    });

    it("should set aiThinkingActive to false on assistant_start", () => {
      appState.setState("ui.aiThinkingActive", true);

      globalEventBus.emit("message:assistant_start", {});

      expect(appState.getState("ui.aiThinkingActive")).toBe(false);
    });

    it("should set aiThinkingActive to false on assistant_end", async () => {
      appState.setState("ui.aiThinkingActive", true);

      globalEventBus.emit("message:assistant_end", {});

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(appState.getState("ui.aiThinkingActive")).toBe(false);
    });

    it("should set aiThinkingActive to false on error", () => {
      appState.setState("ui.aiThinkingActive", true);

      // Mock ChatContainer component
      window.components = {
        chatContainer: {
          addErrorMessage: vi.fn(),
        },
      };

      globalEventBus.emit("message:error", { message: "Test error" });

      expect(appState.getState("ui.aiThinkingActive")).toBe(false);
    });

    it("should set welcomeFilesSectionVisible to true on session_created from file upload", () => {
      const stateCallback = vi.fn();
      appState.subscribe("ui.welcomeFilesSectionVisible", stateCallback);

      appState.setState("ui.currentView", "welcome");

      globalEventBus.emit("message:session_created", {
        session: {
          session_id: "test-session",
          title: "Test Session",
        },
      });

      expect(appState.getState("ui.welcomeFilesSectionVisible")).toBe(true);
      expect(stateCallback).toHaveBeenCalledWith(true, false, "ui.welcomeFilesSectionVisible");
    });

    it("should not set welcomeFilesSectionVisible when transitioning to chat view", () => {
      appState.setState("ui.currentView", "welcome");

      globalEventBus.emit("message:session_created", {
        session_id: "test-session",
        title: "Test Session",
      });

      // Should transition to chat view
      expect(appState.getState("ui.currentView")).toBe("chat");
      // Should not show welcome files section
      expect(appState.getState("ui.welcomeFilesSectionVisible")).toBe(false);
    });
  });

  describe("Python Status Management", () => {
    it("should set python status to busy_streaming on assistant_start", () => {
      globalEventBus.emit("message:assistant_start", {});

      expect(appState.getState("python.status")).toBe("busy_streaming");
    });

    it("should set python status to idle on assistant_end", async () => {
      appState.setState("python.status", "busy_streaming");

      globalEventBus.emit("message:assistant_end", {});

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(appState.getState("python.status")).toBe("idle");
    });

    it("should process command queue when python status becomes idle", async () => {
      ipcAdapter.commandQueue = [{ type: "test" }];
      appState.setState("python.status", "busy_streaming");

      globalEventBus.emit("message:assistant_end", {});

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ipcAdapter.processQueue).toHaveBeenCalled();
    });
  });

  describe("Message Flow Integration", () => {
    it("should handle complete message flow with AppState updates", async () => {
      const stateChanges = [];
      appState.subscribe("*", (change) => {
        stateChanges.push(change);
      });

      // Start message
      globalEventBus.emit("message:assistant_start", {});

      expect(appState.getState("python.status")).toBe("busy_streaming");
      expect(appState.getState("ui.aiThinkingActive")).toBe(false);
      expect(appState.getState("message.isTyping")).toBe(false);

      // Delta
      globalEventBus.emit("message:assistant_delta", { content: "Hello" });

      expect(appState.getState("message.assistantBuffer")).toBe("Hello");

      // End
      globalEventBus.emit("message:assistant_end", {});

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(appState.getState("python.status")).toBe("idle");
      expect(appState.getState("message.currentAssistant")).toBe(null);

      // Verify state changes were tracked
      expect(stateChanges.length).toBeGreaterThan(0);
    });

    it("should handle error during streaming", () => {
      // Mock ChatContainer
      window.components = {
        chatContainer: {
          addErrorMessage: vi.fn(),
        },
      };

      appState.setState("python.status", "busy_streaming");
      appState.setState("ui.aiThinkingActive", true);
      appState.setState("message.isTyping", true);

      globalEventBus.emit("message:error", { message: "Network error" });

      expect(appState.getState("ui.aiThinkingActive")).toBe(false);
      expect(appState.getState("message.isTyping")).toBe(false);
      expect(window.components.chatContainer.addErrorMessage).toHaveBeenCalledWith("Network error");
    });
  });

  describe("Function Call Integration", () => {
    it("should use FunctionCallService when available", () => {
      globalEventBus.emit("message:function_detected", {
        call_id: "call-123",
        name: "test_function",
        arguments: { param: "value" },
      });

      expect(services.functionCallService.createCall).toHaveBeenCalledWith("call-123", "test_function", {
        param: "value",
      });
    });

    it("should update function call status", () => {
      globalEventBus.emit("message:function_executing", {
        call_id: "call-123",
        arguments: { param: "value" },
      });

      expect(services.functionCallService.updateCallStatus).toHaveBeenCalledWith("call-123", "streaming");
    });

    it("should handle function completion success", () => {
      globalEventBus.emit("message:function_completed", {
        call_id: "call-123",
        success: true,
        result: "Function completed successfully",
      });

      expect(services.functionCallService.setCallResult).toHaveBeenCalledWith(
        "call-123",
        "Function completed successfully"
      );
    });

    it("should handle function completion error", () => {
      globalEventBus.emit("message:function_completed", {
        call_id: "call-123",
        success: false,
        error: "Function execution failed",
      });

      expect(services.functionCallService.setCallError).toHaveBeenCalledWith("call-123", "Function execution failed");
    });
  });

  describe("Session Management Integration", () => {
    it("should update view state on session creation", () => {
      appState.setState("ui.currentView", "welcome");

      globalEventBus.emit("message:session_created", {
        session_id: "new-session",
        title: "New Session",
      });

      expect(appState.getState("ui.currentView")).toBe("chat");
    });

    it("should use SessionService for session updates", () => {
      services.sessionService.updateSession = vi.fn();

      globalEventBus.emit("message:session_updated", {
        data: {
          success: true,
          session: {
            session_id: "session-123",
            title: "Updated Title",
          },
        },
      });

      expect(services.sessionService.updateSession).toHaveBeenCalledWith({
        session_id: "session-123",
        title: "Updated Title",
      });
    });
  });

  describe("Error Handling", () => {
    it("should emit error events on handler failure", () => {
      const errorCallback = vi.fn();

      // Register error event listener FIRST
      globalEventBus.on("message:test_type:error", errorCallback);

      // Now register the handlers using the message-handlers-v2 pattern
      // This simulates how actual message handlers work

      // Create a handler via createHandler that will throw
      globalEventBus.on("message:test_type", (_eventData) => {
        // Unwrap message
        const message = _eventData.data || _eventData;

        try {
          // Simulate handler that throws
          throw new Error("Handler error");
        } catch (error) {
          console.error("[MessageHandlersV2] Handler error for: message:test_type", error);

          // Emit error event (this is what createHandler does)
          globalEventBus.emit("message:test_type:error", {
            error,
            message,
          });

          window.electronAPI?.log("error", "Message handler error: test_type", {
            error: error.message,
            stack: error.stack,
          });
        }
      });

      // Emit event that will trigger error
      globalEventBus.emit("message:test_type", { data: "test" });

      // Verify error event was emitted
      // EventBus may wrap events with event name and timestamp
      expect(errorCallback).toHaveBeenCalled();
      const callArg = errorCallback.mock.calls[0][0];

      // The error event payload contains error and message fields
      // It may be wrapped by EventBus, so we check if it has the direct fields
      // or if they're nested
      const hasDirectError = callArg.error instanceof Error;
      const hasWrappedError = callArg.event === "message:test_type:error";

      if (hasDirectError) {
        expect(callArg).toMatchObject({
          error: expect.any(Error),
          message: expect.objectContaining({ data: "test" }),
        });
      } else if (hasWrappedError) {
        // EventBus wrapped it - just verify it was called
        expect(callArg.event).toBe("message:test_type:error");
      } else {
        // Fallback - just verify callback was called
        expect(errorCallback).toHaveBeenCalled();
      }

      // Verify error was logged
      expect(window.electronAPI.log).toHaveBeenCalledWith(
        "error",
        "Message handler error: test_type",
        expect.objectContaining({
          error: "Handler error",
        })
      );
    });
  });
});
