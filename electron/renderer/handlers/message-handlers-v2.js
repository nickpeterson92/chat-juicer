/**
 * Message Handlers V2 - EventBus Integration
 * Uses EventBus for decoupled, event-driven message processing
 */

import { globalEventBus } from "../core/event-bus.js";
import {
  cancelPendingRender,
  completeStreamingMessage,
  createStreamingAssistantMessage,
  updateAssistantMessage,
} from "../ui/chat-ui.js";
import {
  createFunctionCallCard,
  scheduleFunctionCardCleanup,
  updateFunctionArguments,
  updateFunctionCallStatus,
} from "../ui/function-card-ui.js";
import { initializeCodeCopyButtons, processMermaidDiagrams } from "../utils/markdown-renderer.js";

/**
 * Register all message handlers with EventBus
 * @param {Object} context - Application context
 */
export function registerMessageHandlers(context) {
  const { appState, elements, services, ipcAdapter } = context;

  // Helper to create scoped handler
  const createHandler = (type, handler) => {
    console.log(`[MessageHandlersV2] Registering handler for: message:${type}`);
    globalEventBus.on(`message:${type}`, (eventData) => {
      // Unwrap the message from EventBus event wrapper
      // EventData is either { data: message, ... } or just the message
      const message = eventData.data || eventData;

      console.log(`[MessageHandlersV2] Handler triggered for: message:${type}`, message);
      try {
        handler(message, context);

        // Emit success event
        globalEventBus.emit(`message:${type}:success`, message);
      } catch (error) {
        console.error(`[MessageHandlersV2] Handler error for: message:${type}`, error);

        // Emit error event
        globalEventBus.emit(`message:${type}:error`, {
          error,
          message,
        });

        window.electronAPI?.log("error", `Message handler error: ${type}`, {
          error: error.message,
          stack: error.stack,
        });
      }
    });
  };

  // ===== Assistant Message Handlers =====

  createHandler("assistant_start", (_message) => {
    // Track Python status - streaming started
    appState.setState("python.status", "busy_streaming");
    console.log("🔄 Python status: busy_streaming");

    // Hide AI thinking indicator
    if (elements.aiThinking) {
      elements.aiThinking.classList.remove("active");
    }

    // Hide typing indicator
    elements.typingIndicator.classList.remove("active");
    elements.typingIndicator.parentElement.style.display = "none";
    appState.setState("message.isTyping", false);

    // Create streaming message
    const textSpan = createStreamingAssistantMessage(elements.chatContainer);
    appState.setState("message.currentAssistant", textSpan);
    appState.setState("message.assistantBuffer", "");

    // Emit performance tracking event
    globalEventBus.emit("performance:message_render_start");
  });

  createHandler("assistant_delta", (message) => {
    if (appState.message.currentAssistant) {
      const newBuffer = appState.message.assistantBuffer + message.content;
      appState.setState("message.assistantBuffer", newBuffer);
      updateAssistantMessage(elements.chatContainer, appState.message.currentAssistant, newBuffer);
    }
  });

  createHandler("assistant_end", async (_message) => {
    const currentAssistantElement = appState.message.currentAssistant;

    // Complete streaming
    completeStreamingMessage(elements.chatContainer);
    appState.setState("message.currentAssistant", null);

    // Track Python status - streaming ended
    appState.setState("python.status", "idle");
    console.log("✅ Python status: idle");

    // Process queued commands
    if (ipcAdapter && ipcAdapter.commandQueue.length > 0) {
      console.log("📦 Processing queued commands after streaming...");
      await ipcAdapter.processQueue();
    }

    // Hide AI thinking indicator
    if (elements.aiThinking) {
      elements.aiThinking.classList.remove("active");
    }

    // Cancel pending renders
    cancelPendingRender();

    // Process Mermaid and code blocks
    if (currentAssistantElement && document.body.contains(currentAssistantElement)) {
      const messageContentDiv = currentAssistantElement.closest(".message-content");
      if (messageContentDiv) {
        processMermaidDiagrams(messageContentDiv)
          .catch((err) =>
            window.electronAPI?.log("error", "Mermaid processing error", {
              error: err.message,
            })
          )
          .finally(() => {
            initializeCodeCopyButtons(messageContentDiv);
          });
      }
    }

    // Emit performance tracking event
    globalEventBus.emit("performance:message_render_complete");
  });

  // ===== Error Handler =====

  createHandler("error", (message) => {
    window.electronAPI?.log("error", "Error from backend", {
      message: message.message,
    });

    if (elements.aiThinking) {
      elements.aiThinking.classList.remove("active");
    }

    elements.typingIndicator.classList.remove("active");
    elements.typingIndicator.parentElement.style.display = "none";
    appState.setState("message.isTyping", false);

    // Add error message (Phase 7: use ChatContainer component)
    if (window.components?.chatContainer) {
      window.components.chatContainer.addErrorMessage(message.message);
    } else {
      console.error("⚠️ ChatContainer component not available - message not displayed");
    }

    // Track error
    globalEventBus.emit("error:backend", {
      message: message.message,
    });
  });

  // ===== Function Call Handlers =====

  createHandler("function_detected", (message) => {
    // Use service if available
    if (services?.functionCallService) {
      services.functionCallService.createCall(message.call_id, message.name, message.arguments || {});
    }

    createFunctionCallCard(
      elements.chatContainer,
      appState.functions.activeCalls,
      appState,
      message.call_id,
      message.name,
      "preparing..."
    );

    if (message.arguments) {
      updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "ready", {
        arguments: message.arguments,
      });
    }

    // Track function call
    globalEventBus.emit("analytics:event", {
      category: "function",
      action: "detected",
      label: message.name,
    });
  });

  createHandler("function_executing", (message) => {
    if (services?.functionCallService) {
      services.functionCallService.updateCallStatus(message.call_id, "streaming");
      if (message.arguments) {
        services.functionCallService.appendArgumentsDelta(message.call_id, JSON.stringify(message.arguments));
      }
    }

    updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "executing...", {
      arguments: message.arguments,
    });
  });

  createHandler("function_completed", (message) => {
    if (services?.functionCallService) {
      if (message.success) {
        const result = message.result || message.output || "Success";
        services.functionCallService.setCallResult(message.call_id, result);
      } else {
        const error = message.error || message.result || message.output || "Unknown error";
        services.functionCallService.setCallError(message.call_id, error);
      }
    }

    if (message.success) {
      const result = message.result || message.output || "Success";
      updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "completed", { result });
    } else {
      updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "error", {
        error: message.error || message.result || message.output || "Unknown error",
      });
    }

    scheduleFunctionCardCleanup(appState.functions.activeCalls, appState.functions.activeTimers, message.call_id);

    // Track function completion
    globalEventBus.emit("analytics:event", {
      category: "function",
      action: message.success ? "completed" : "failed",
      label: message.name || "unknown",
    });
  });

  createHandler("function_executed", (message) => {
    if (services?.functionCallService) {
      if (message.success) {
        services.functionCallService.setCallResult(message.call_id, message.result_preview || "Success");
      } else {
        services.functionCallService.setCallError(message.call_id, message.error || "Unknown error");
      }
    }

    if (message.success) {
      updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "completed", {
        result: message.result_preview || "Success",
      });
    } else {
      updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "error", { error: message.error });
    }

    scheduleFunctionCardCleanup(appState.functions.activeCalls, appState.functions.activeTimers, message.call_id);
  });

  createHandler("function_call_arguments_delta", (message) => {
    if (message.item_id || message.call_id) {
      const callId = message.call_id || message.item_id;
      updateFunctionArguments(
        appState.functions.activeCalls,
        appState.functions.argumentsBuffer,
        callId,
        message.delta,
        false
      );
    }
  });

  createHandler("function_call_arguments_done", (message) => {
    if (message.item_id || message.call_id) {
      const callId = message.call_id || message.item_id;
      updateFunctionArguments(appState.functions.activeCalls, appState.functions.argumentsBuffer, callId, null, true);
    }
  });

  createHandler("function_call_ready", (message) => {
    updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "ready to execute");
  });

  // ===== Rate Limit Handlers =====

  createHandler("rate_limit_hit", (message) => {
    const content = `Rate limit reached. Waiting ${message.wait_time}s before retry (attempt ${message.retry_count})...`;

    // Add system message (Phase 7: use ChatContainer component)
    if (window.components?.chatContainer) {
      window.components.chatContainer.addSystemMessage(content);
    } else {
      console.error("⚠️ ChatContainer component not available - message not displayed");
    }

    globalEventBus.emit("analytics:event", {
      category: "api",
      action: "rate_limit_hit",
      value: message.wait_time,
    });
  });

  createHandler("rate_limit_failed", (message) => {
    const content = `${message.message}. Please try again later.`;

    // Add error message (Phase 7: use ChatContainer component)
    if (window.components?.chatContainer) {
      window.components.chatContainer.addErrorMessage(content);
    } else {
      console.error("⚠️ ChatContainer component not available - message not displayed");
    }

    globalEventBus.emit("error:rate_limit", {
      message: message.message,
    });
  });

  // ===== Session Handlers =====

  createHandler("session_created", (message) => {
    const isFromFileUpload = !!message.session;
    const sessionId = message.session?.session_id || message.session_id;
    const title = message.session?.title || message.title;

    window.electronAPI?.log("info", "Session created", {
      session_id: sessionId,
      title: title,
      from_file_upload: isFromFileUpload,
    });

    // Transition to chat view if from first message
    if (!isFromFileUpload && appState.ui && appState.ui.currentView === "welcome") {
      appState.setState("ui.currentView", "chat");
    } else if (isFromFileUpload) {
      const welcomeFilesSection = document.getElementById("welcome-files-section");
      if (welcomeFilesSection) {
        welcomeFilesSection.style.display = "block";
      }
    }

    // Emit custom event for session list update
    window.dispatchEvent(
      new CustomEvent("session-created", {
        detail: {
          session_id: sessionId,
          title: title,
          from_file_upload: isFromFileUpload,
        },
      })
    );

    // Track session creation
    globalEventBus.emit("analytics:event", {
      category: "session",
      action: "created",
      label: isFromFileUpload ? "file_upload" : "first_message",
    });
  });

  createHandler("session_updated", (message) => {
    if (message.data?.success && message.data.session) {
      // Use SessionService instead of sessionState
      if (services?.sessionService) {
        services.sessionService.updateSession(message.data.session);
      }

      window.dispatchEvent(
        new CustomEvent("session-updated", {
          detail: message.data,
        })
      );
    }

    // Track session update
    globalEventBus.emit("analytics:event", {
      category: "session",
      action: "updated",
    });
  });

  // Legacy/no-op handlers
  createHandler("function_call_added", () => {});
  createHandler("session_response", () => {});
  createHandler("agent_updated", () => {});

  console.log("[MessageHandlersV2] All message handlers registered with EventBus");
}

/**
 * Process incoming message through EventBus
 * @param {Object} message - Message object with 'type' field
 * @param {Object} context - Application context
 */
export function processMessageV2(message, _context) {
  // Emit message received event (will be routed by setupMessageRouter)
  globalEventBus.emit("message:received", message, {
    source: "backend",
  });
}
