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
  // Check if message session_id matches current active session
  const currentSessionId = appState.getState("session.current");

  // No active session yet (startup or mid-switch) — do not treat as active
  if (!currentSessionId) {
    return false;
  }

  // Backward compatible: messages without session_id are for the current session when it exists
  if (!message.session_id) {
    return true;
  }

  return message.session_id === currentSessionId;
}

/**
 * Resolve session ID for incoming message, returning null when unavailable.
 * Avoids buffering under undefined which would merge multiple sessions.
 * @param {Object} message
 * @param {Object} appState
 * @returns {string|null}
 */
function resolveSessionId(message, appState) {
  return message.session_id || appState.getState("session.current") || null;
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
  const { streamManager } = services;

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

  createHandler("assistant_start", (message) => {
    const sessionId = resolveSessionId(message, appState);
    const isActive = isActiveSessionMessage(message, appState);

    // Drop messages that cannot be associated with a session to avoid undefined buffer keys
    if (!sessionId) {
      console.warn("[MessageHandlersV2] assistant_start without session_id and no active session");
      return;
    }

    // Start stream tracking for this session
    streamManager.startStream(sessionId);

    // Only update UI for active session
    if (isActive) {
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
    }
  });

  createHandler("assistant_delta", (message) => {
    const sessionId = resolveSessionId(message, appState);
    const isActive = isActiveSessionMessage(message, appState);

    // CRITICAL FIX: If we have an active streaming element, always render to it
    // This matches main branch behavior and prevents message loss when:
    // 1. session.current is null (timing issue during session creation)
    // 2. Backend sends assistant_delta without session_id (which is normal)
    // The currentAssistant element existing means we're actively streaming TO the UI
    if (appState.message.currentAssistant) {
      const isFirstToken = appState.message.assistantBuffer === "";
      const newBuffer = appState.message.assistantBuffer + message.content;

      // DEBUG: Log buffer state when receiving tokens after reconstruction
      if (isFirstToken) {
        console.log(
          "[message-handlers] assistant_delta FIRST TOKEN with currentAssistant, buffer was:",
          appState.message.assistantBuffer.length
        );
      }

      appState.setState("message.assistantBuffer", newBuffer);

      // Hide lottie indicator on first token arrival for instant feedback
      if (isFirstToken) {
        // Update state - subscriptions will handle DOM manipulation
        appState.setState("ui.loadingLampVisible", false);
      }

      updateAssistantMessage(elements.chatContainer, appState.message.currentAssistant, newBuffer);
      return;
    }

    // If no active streaming element, use session routing for background buffering
    if (!sessionId && !isActive) {
      // No way to route this message - drop it
      console.warn("[MessageHandlersV2] assistant_delta without session_id and no active session");
      return;
    }

    if (isActive) {
      // Active session but no streaming element yet - this shouldn't normally happen
      // (assistant_start should have created it), but handle gracefully
      const newBuffer = appState.message.assistantBuffer + message.content;
      appState.setState("message.assistantBuffer", newBuffer);
    } else {
      // Background session - buffer only
      streamManager.appendToBuffer(sessionId, message.content);
    }
  });

  createHandler("assistant_end", async (message) => {
    const sessionId = resolveSessionId(message, appState);

    if (!sessionId) {
      console.warn("[MessageHandlersV2] assistant_end without session_id and no active session");
      return;
    }

    // End stream tracking for this session
    streamManager.endStream(sessionId);

    if (isActiveSessionMessage(message, appState)) {
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
    } else {
      // Background session completed - show toast notification
      const session = services?.sessionService?.getSession(sessionId);
      showToast(`"${session?.title || "Session"}" completed`, "success");
    }
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
    const sessionId = resolveSessionId(message, appState);

    if (isActiveSessionMessage(message, appState)) {
      // Active session - render tool card
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
    } else {
      // Background session - buffer for later reconstruction
      if (!sessionId) {
        console.warn("[MessageHandlersV2] function_detected without session_id and no active session");
        return;
      }
      streamManager.bufferToolEvent(sessionId, message.call_id, "start", { name: message.name });
    }

    // Track function call
    globalEventBus.emit("analytics:event", {
      category: "function",
      action: "detected",
      label: message.name,
    });
  });

  createHandler("function_executing", (message) => {
    const sessionId = resolveSessionId(message, appState);

    if (isActiveSessionMessage(message, appState)) {
      // Active session - update UI
      if (services?.functionCallService) {
        services.functionCallService.updateCallStatus(message.call_id, "streaming");
        if (message.arguments) {
          services.functionCallService.appendArgumentsDelta(message.call_id, JSON.stringify(message.arguments));
        }
      }

      updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "executing...", {
        arguments: message.arguments,
      });
    } else {
      // Background session - buffer arguments
      if (message.arguments) {
        if (!sessionId) {
          console.warn("[MessageHandlersV2] function_executing without session_id and no active session");
          return;
        }
        streamManager.bufferToolEvent(sessionId, message.call_id, "arguments_delta", {
          delta: JSON.stringify(message.arguments),
        });
      }
    }
  });

  createHandler("function_completed", (message) => {
    const sessionId = resolveSessionId(message, appState);

    if (isActiveSessionMessage(message, appState)) {
      // Active session - update UI
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
    } else {
      // Background session - update buffer state so reconstruction shows correct status
      if (!sessionId) {
        console.warn("[MessageHandlersV2] function_completed without session_id and no active session");
        return;
      }
      const result = message.result || message.output || message.error;
      const error = !message.success && !message.interrupted ? result : null;
      streamManager.bufferToolEvent(sessionId, message.call_id, "end", {
        result: message.success ? result : null,
        error: error,
      });
    }

    // Track function completion
    globalEventBus.emit("analytics:event", {
      category: "function",
      action: message.interrupted ? "interrupted" : message.success ? "completed" : "failed",
      label: message.name || "unknown",
    });
  });

  createHandler("function_executed", (message) => {
    const sessionId = resolveSessionId(message, appState);

    if (isActiveSessionMessage(message, appState)) {
      // Active session - update UI
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
    } else {
      // Background session - update buffer state so reconstruction shows correct status
      if (!sessionId) {
        console.warn("[MessageHandlersV2] function_executed without session_id and no active session");
        return;
      }
      const result = message.result_preview || message.error;
      const error = !message.success ? result : null;
      streamManager.bufferToolEvent(sessionId, message.call_id, "end", {
        result: message.success ? result : null,
        error: error,
      });
    }
  });

  createHandler("function_call_arguments_delta", (message) => {
    const sessionId = resolveSessionId(message, appState);

    if (message.item_id || message.call_id) {
      const callId = message.call_id || message.item_id;

      if (isActiveSessionMessage(message, appState)) {
        // Active session - update UI
        updateFunctionArguments(
          appState.functions.activeCalls,
          appState.functions.argumentsBuffer,
          callId,
          message.delta,
          false
        );
      } else {
        // Background session - buffer delta
        if (!sessionId) {
          console.warn("[MessageHandlersV2] function_call_arguments_delta without session_id and no active session");
          return;
        }
        streamManager.bufferToolEvent(sessionId, callId, "arguments_delta", {
          delta: message.delta,
        });
      }
    }
  });

  createHandler("function_call_arguments_done", (message) => {
    // Only update UI for active session - background sessions don't need this intermediate state
    if (!isActiveSessionMessage(message, appState)) {
      return;
    }

    if (message.item_id || message.call_id) {
      const callId = message.call_id || message.item_id;
      updateFunctionArguments(appState.functions.activeCalls, appState.functions.argumentsBuffer, callId, null, true);
    }
  });

  createHandler("function_call_ready", (message) => {
    // Only update UI for active session - background sessions don't need this intermediate state
    if (!isActiveSessionMessage(message, appState)) {
      return;
    }

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

  // ===== Stream Reconstruction Handler =====
  // Called when switching to a session that's streaming in background

  globalEventBus.on("stream:reconstruct", (eventDataWrapper) => {
    // CRITICAL: Unwrap data from EventBus wrapper (same pattern as createHandler)
    const eventData = eventDataWrapper.data || eventDataWrapper;
    const { sessionId, buffer, tools, isStreaming } = eventData;

    console.log("[message-handlers] stream:reconstruct received:", {
      sessionId,
      bufferLength: buffer?.length || 0,
      bufferPreview: buffer?.substring(0, 100) || "(empty)",
      isStreaming,
    });

    // Only reconstruct if this is now the active session
    const currentSessionId = appState.getState("session.current");
    if (sessionId !== currentSessionId) {
      console.log("[message-handlers] stream:reconstruct SKIPPED - not active session", {
        sessionId,
        currentSessionId,
      });
      return;
    }

    // If still streaming (even with empty buffer = thinking phase), create streaming message
    // This ensures the thinking indicator shows during tool orchestration
    if (isStreaming || buffer) {
      // RACE CONDITION FIX: Tokens may have arrived between session switch and reconstruction.
      // Those tokens went to appState.message.assistantBuffer (which was cleared on switch).
      // We need to preserve them by appending to the reconstructed buffer.
      const arrivedDuringSwitch = appState.getState("message.assistantBuffer") || "";
      const mergedBuffer = (buffer || "") + arrivedDuringSwitch;

      console.log("[message-handlers] stream:reconstruct MERGE buffers:", {
        fromStreamManager: buffer?.length || 0,
        arrivedDuringSwitch: arrivedDuringSwitch.length,
        merged: mergedBuffer.length,
      });

      // Create streaming message element
      const chatContainerComponent = getChatContainerComponent();
      console.log(
        "[message-handlers] stream:reconstruct creating element, chatContainer:",
        !!chatContainerComponent,
        !!elements.chatContainer
      );

      const textSpan =
        chatContainerComponent?.createStreamingMessage?.() || createStreamingAssistantMessage(elements.chatContainer);

      console.log(
        "[message-handlers] stream:reconstruct element created:",
        !!textSpan,
        "parent:",
        textSpan?.parentElement?.className
      );

      // Set up appState so live updates continue to work
      appState.setState("message.currentAssistant", textSpan);
      appState.setState("message.assistantBuffer", mergedBuffer);
      console.log("[message-handlers] stream:reconstruct SET buffer to appState:", mergedBuffer.length);

      // If still streaming, mark UI as streaming
      if (isStreaming) {
        appState.setState("message.isStreaming", true);
        appState.setState("python.status", "busy_streaming");
        // Only show loading lamp if no content yet (thinking phase)
        // If we have content, tokens have already arrived - don't show thinking indicator
        appState.setState("ui.loadingLampVisible", mergedBuffer.length === 0);
      }

      // Render the buffered content (if any)
      if (mergedBuffer) {
        updateAssistantMessage(elements.chatContainer, textSpan, mergedBuffer);
        console.log(
          "[message-handlers] stream:reconstruct RENDERED content, textSpan innerHTML length:",
          textSpan?.innerHTML?.length
        );
      }
    }

    // Reconstruct tool cards for any buffered tools
    // IMPORTANT: Only recreate in-flight calls. Completed/error calls are already
    // persisted in Layer 2 and rendered in-order by setMessages; recreating them
    // here would append them to the bottom of the chat.
    if (tools && tools.length > 0) {
      for (const [callId, toolState] of tools) {
        if (toolState.status === "completed" || toolState.status === "error") {
          continue;
        }

        // Skip if card already exists in DOM (rendered by setMessages from Layer 2)
        const existingCard = document.getElementById(`function-${callId}`);
        if (existingCard) {
          continue;
        }

        // Create the tool card
        createFunctionCallCard(
          elements.chatContainer,
          appState.functions.activeCalls,
          appState,
          callId,
          toolState.name,
          toolState.status
        );

        // If there are arguments, update the card
        if (toolState.arguments) {
          updateFunctionCallStatus(appState.functions.activeCalls, callId, toolState.status, {
            arguments: toolState.arguments,
            result: toolState.result,
          });
        }
      }
    }

    // Scroll to bottom to show reconstructed content
    scheduleScroll(elements.chatContainer);
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
