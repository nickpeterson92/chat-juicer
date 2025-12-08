/**
 * Message Handlers V2 - EventBus Integration
 * Uses EventBus for decoupled, event-driven message processing
 */

import { globalEventBus } from "../core/event-bus.js";
import { getMessageQueueService } from "../services/message-queue-service.js";
import {
  cancelPendingRender,
  completeStreamingMessage,
  createStreamingAssistantMessage,
  updateAssistantMessage,
} from "../ui/chat-ui.js";

/**
 * Check if a message is for the active session (Phase 1: Concurrent Sessions)
 * Messages without session_id are considered for the active session (backward compatible)
 * @param {Object} message - Message with optional session_id field
 * @param {Object} appState - Application state with session.current
 * @returns {boolean} True if message is for active session
 */
function isActiveSessionMessage(message, appState) {
  // Backward compatible: messages without session_id are for active session
  if (!message.session_id) {
    return true;
  }

  // Check if message session_id matches current active session
  const currentSessionId = appState.getState("session.current");
  return message.session_id === currentSessionId;
}

import {
  createFunctionCallCard,
  scheduleFunctionCardCleanup,
  updateFunctionArguments,
  updateFunctionCallStatus,
} from "../ui/function-card-ui.js";
import { initializeCodeCopyButtons, processMermaidDiagrams, renderMarkdown } from "../utils/markdown-renderer.js";
import { scheduleScroll } from "../utils/scroll-utils.js";
import { showToast } from "../utils/toast.js";

/**
 * Register all message handlers with EventBus
 * @param {Object} context - Application context
 */
export function registerMessageHandlers(context) {
  const { appState, elements, services, ipcAdapter, components } = context;

  // Prefer the ChatContainer component when available to keep internal streaming state in sync
  const getChatContainerComponent = () =>
    components?.chatContainer || (typeof window !== "undefined" ? window.components?.chatContainer : null);

  // Helper to create scoped handler
  const createHandler = (type, handler) => {
    globalEventBus.on(`message:${type}`, (eventData) => {
      // Unwrap the message from EventBus event wrapper
      // EventData is either { data: message, ... } or just the message
      const message = eventData.data || eventData;

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
    appState.setState("message.isStreaming", true);
    appState.setState("message.isTyping", false);

    // Create streaming message before toggling lamp visibility so the element exists
    const chatContainerComponent = getChatContainerComponent();
    const textSpan =
      chatContainerComponent?.createStreamingMessage?.() || createStreamingAssistantMessage(elements.chatContainer);
    appState.setState("message.currentAssistant", textSpan);
    appState.setState("message.assistantBuffer", "");

    // Reset loading lamp visibility for this streaming message so the first token transition can run
    appState.setState("ui.loadingLampVisible", true);

    // Hide AI thinking indicator
    appState.setState("ui.aiThinkingActive", false);

    // Emit performance tracking event
    globalEventBus.emit("performance:message_render_start");
  });

  createHandler("assistant_delta", (message) => {
    if (appState.message.currentAssistant) {
      const isFirstToken = appState.message.assistantBuffer === "";
      const newBuffer = appState.message.assistantBuffer + message.content;
      appState.setState("message.assistantBuffer", newBuffer);

      // Hide lottie indicator on first token arrival for instant feedback
      if (isFirstToken) {
        // Update state - subscriptions will handle DOM manipulation
        appState.setState("ui.loadingLampVisible", false);

        // NOTE: UI update handled by subscription in bootstrap/phases/phase5a-subscriptions.js
        // Subscription listens to ui.loadingLampVisible and applies transition + removal
      }

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
    appState.setState("message.isStreaming", false);

    // Process queued commands
    if (ipcAdapter && ipcAdapter.commandQueue.length > 0) {
      await ipcAdapter.processQueue();
    }

    // Process message queue - send next queued user message if any
    // MessageQueueService subscribes to python.status, but we also explicitly call here
    // to ensure queue is processed after assistant response completes
    const messageQueueService = getMessageQueueService();
    if (messageQueueService?.hasItems()) {
      // Small delay to allow UI to settle before sending next message
      setTimeout(async () => {
        const processed = await messageQueueService.process();
        if (processed) {
          // If a queued message was sent, show it in the chat
          // The queue service will emit events that ChatContainer listens to
          globalEventBus.emit("queue:message_sent");
        }
      }, 100);
    }

    // Hide AI thinking indicator
    appState.setState("ui.aiThinkingActive", false);

    // Cancel pending renders
    cancelPendingRender();

    // Final re-render with isComplete=true for footnotes and other complete-content features
    // During streaming, renderMarkdown uses basic parser; now we use full parser with footnotes
    if (currentAssistantElement && document.body.contains(currentAssistantElement)) {
      const finalContent = appState.message.assistantBuffer;
      if (finalContent) {
        currentAssistantElement.innerHTML = renderMarkdown(finalContent, true);
      }
    }

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
            // Scroll again after Mermaid diagrams render (they add height to the message)
            scheduleScroll(elements.chatContainer);
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

    appState.setState("ui.aiThinkingActive", false);

    appState.setState("message.isTyping", false);

    // Reset streaming state on error - backend is now idle
    appState.setState("python.status", "idle");
    appState.setState("message.isStreaming", false);

    // Add error message (Phase 7: use ChatContainer component)
    if (window.components?.chatContainer) {
      window.components.chatContainer.addErrorMessage(message.message);
    } else {
      console.error("ChatContainer component not available - message not displayed");
    }

    // Track error
    globalEventBus.emit("error:backend", {
      message: message.message,
    });

    // Continue processing queue after error (Section 7.B of queue spec)
    // Queue should continue with next message even if current one failed
    const messageQueueService = getMessageQueueService();
    if (messageQueueService?.hasItems()) {
      setTimeout(async () => {
        await messageQueueService.process();
      }, 100);
    }
  });

  // ===== Stream Interrupt Handler =====

  createHandler("stream_interrupted", (_message) => {
    // Reset streaming state
    appState.setState("message.isStreaming", false);
    appState.setState("stream.interrupted", false);
    appState.setState("stream.toolInProgress", false);
    appState.setState("python.status", "idle");

    // Show toast notification
    showToast("Response interrupted", "info");

    // Track interrupt
    globalEventBus.emit("analytics:event", {
      category: "stream",
      action: "interrupted",
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

    // Only update to "ready" if we have real arguments (not empty "{}" from early detection)
    if (message.arguments && message.arguments !== "{}") {
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
    // IMPORTANT: Update UI status FIRST, before FunctionCallService moves call to completedCalls
    // FunctionCallService.setCallResult/setCallError deletes from activeCalls, breaking UI updates

    // Handle interrupted tool calls (synthetic completions from interrupt handler)
    if (message.interrupted) {
      updateFunctionCallStatus(
        appState.functions.activeCalls,
        message.call_id,
        "interrupted",
        {
          result: message.result || "[Interrupted before completion]",
          interrupted: true,
        },
        true
      );
    } else if (message.success) {
      const result = message.result || message.output || "Success";
      updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "completed", { result }, true);
    } else {
      updateFunctionCallStatus(
        appState.functions.activeCalls,
        message.call_id,
        "error",
        {
          error: message.error || message.result || message.output || "Unknown error",
        },
        true
      );
    }

    // Now update the FunctionCallService state (this moves call from activeCalls to completedCalls)
    if (services?.functionCallService) {
      if (message.interrupted) {
        // Treat interrupted as error for service state
        services.functionCallService.setCallError(message.call_id, message.result || "[Interrupted]");
      } else if (message.success) {
        const result = message.result || message.output || "Success";
        services.functionCallService.setCallResult(message.call_id, result);
      } else {
        const error = message.error || message.result || message.output || "Unknown error";
        services.functionCallService.setCallError(message.call_id, error);
      }
    }

    scheduleFunctionCardCleanup(appState.functions.activeCalls, appState.functions.activeTimers, message.call_id);

    // Track function completion
    globalEventBus.emit("analytics:event", {
      category: "function",
      action: message.interrupted ? "interrupted" : message.success ? "completed" : "failed",
      label: message.name || "unknown",
    });
  });

  createHandler("function_executed", (message) => {
    // IMPORTANT: Update UI status FIRST, before FunctionCallService moves call to completedCalls
    if (message.success) {
      updateFunctionCallStatus(
        appState.functions.activeCalls,
        message.call_id,
        "completed",
        {
          result: message.result_preview || "Success",
        },
        true
      );
    } else {
      updateFunctionCallStatus(
        appState.functions.activeCalls,
        message.call_id,
        "error",
        { error: message.error },
        true
      );
    }

    // Now update the FunctionCallService state (this moves call from activeCalls to completedCalls)
    if (services?.functionCallService) {
      if (message.success) {
        services.functionCallService.setCallResult(message.call_id, message.result_preview || "Success");
      } else {
        services.functionCallService.setCallError(message.call_id, message.error || "Unknown error");
      }
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
      console.error("ChatContainer component not available - message not displayed");
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
      console.error("ChatContainer component not available - message not displayed");
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
      appState.setState("ui.bodyViewClass", "view-chat");
    } else if (isFromFileUpload) {
      appState.setState("ui.welcomeFilesSectionVisible", true);
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

/**
 * Export session routing utility for use in other modules
 */
export { isActiveSessionMessage };
