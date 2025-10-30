/**
 * Message handlers using registry pattern
 * Replaces the massive switch statement with isolated, testable handler functions
 */

import {
  addMessage,
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
 * Handle assistant_start message
 */
function handleAssistantStart(_message, context) {
  const { appState, elements } = context;

  // Hide AI thinking indicator (static one if it exists)
  if (elements.aiThinking) {
    elements.aiThinking.classList.remove("active");
  }

  // Hide legacy typing indicator and start new message
  elements.typingIndicator.classList.remove("active");
  elements.typingIndicator.parentElement.style.display = "none";
  appState.setState("message.isTyping", false);

  // Create assistant message with streaming indicator
  const textSpan = createStreamingAssistantMessage(elements.chatContainer);
  appState.setState("message.currentAssistant", textSpan);
  appState.setState("message.assistantBuffer", "");
}

/**
 * Handle assistant_delta message (streaming content)
 */
function handleAssistantDelta(message, context) {
  const { appState, elements } = context;

  window.electronAPI.log("debug", "Assistant delta received", { content: message.content });

  if (appState.message.currentAssistant) {
    const newBuffer = appState.message.assistantBuffer + message.content;
    appState.setState("message.assistantBuffer", newBuffer);
    updateAssistantMessage(elements.chatContainer, appState.message.currentAssistant, newBuffer);
  } else {
    window.electronAPI.log("warn", "No current assistant message element");
  }
}

/**
 * Handle assistant_end message
 */
function handleAssistantEnd(_message, context) {
  const { appState, elements } = context;

  // Get the current assistant message content before clearing state
  const currentAssistantElement = appState.message.currentAssistant;

  // Message complete, remove streaming indicators
  completeStreamingMessage(elements.chatContainer);
  appState.setState("message.currentAssistant", null);

  // Ensure AI thinking indicator is hidden
  if (elements.aiThinking) {
    elements.aiThinking.classList.remove("active");
  }

  // CRITICAL: Cancel any pending render callbacks to prevent race condition
  // Pending requestIdleCallback could fire after Mermaid rendering and destroy SVGs
  cancelPendingRender();

  // Process Mermaid diagrams and initialize copy buttons after streaming is complete
  // Uses atomic innerHTML replacement to prevent race conditions
  if (currentAssistantElement && document.body.contains(currentAssistantElement)) {
    // Navigate to parent .message-content div which contains all rendered markdown
    const messageContentDiv = currentAssistantElement.closest(".message-content");
    if (messageContentDiv) {
      // CRITICAL: Initialize copy buttons AFTER Mermaid processing completes
      // processMermaidDiagrams does atomic innerHTML replacement which would destroy event listeners
      processMermaidDiagrams(messageContentDiv)
        .catch((err) => window.electronAPI.log("error", "Mermaid processing error", { error: err.message }))
        .finally(() => {
          // Attach copy button listeners after DOM is stable
          initializeCodeCopyButtons(messageContentDiv);
        });
    }
  }
}

/**
 * Handle error message
 */
function handleError(message, context) {
  const { appState, elements } = context;

  window.electronAPI.log("error", "Error from backend", { message: message.message });

  if (elements.aiThinking) {
    elements.aiThinking.classList.remove("active");
  }

  // Hide typing indicator
  elements.typingIndicator.classList.remove("active");
  elements.typingIndicator.parentElement.style.display = "none";
  appState.setState("message.isTyping", false);

  // Add error message with red styling
  addMessage(elements.chatContainer, message.message, "error");
}

/**
 * Handle function_detected message
 */
function handleFunctionDetected(message, context) {
  const { appState, elements } = context;

  window.electronAPI.log("debug", "Function detected", message);

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
}

/**
 * Handle function_executing message
 */
function handleFunctionExecuting(message, context) {
  const { appState } = context;

  window.electronAPI.log("debug", "Function executing", message);

  updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "executing...", {
    arguments: message.arguments,
  });
}

/**
 * Handle function_completed message
 */
function handleFunctionCompleted(message, context) {
  const { appState } = context;

  window.electronAPI.log("debug", "Function completed", message);

  if (message.success) {
    const result = message.result || message.output || "Success";
    updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "completed", { result });
  } else {
    updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "error", {
      error: message.error || message.result || message.output || "Unknown error",
    });
  }

  // Clean up after a delay
  scheduleFunctionCardCleanup(appState.functions.activeCalls, appState.functions.activeTimers, message.call_id);
}

/**
 * Handle rate_limit_hit message
 */
function handleRateLimitHit(message, context) {
  const { elements } = context;

  window.electronAPI.log("info", "Rate limit hit", message);
  addMessage(
    elements.chatContainer,
    `Rate limit reached. Waiting ${message.wait_time}s before retry (attempt ${message.retry_count})...`,
    "system"
  );
}

/**
 * Handle rate_limit_failed message
 */
function handleRateLimitFailed(message, context) {
  const { elements } = context;

  window.electronAPI.log("error", "Rate limit failed", message);
  addMessage(elements.chatContainer, `${message.message}. Please try again later.`, "error");
}

/**
 * Handle function_call_arguments_delta message
 */
function handleFunctionCallArgumentsDelta(message, context) {
  const { appState } = context;

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
}

/**
 * Handle function_call_arguments_done message
 */
function handleFunctionCallArgumentsDone(message, context) {
  const { appState } = context;

  if (message.item_id || message.call_id) {
    const callId = message.call_id || message.item_id;
    updateFunctionArguments(appState.functions.activeCalls, appState.functions.argumentsBuffer, callId, null, true);
  }
}

/**
 * Handle function_call_ready message
 */
function handleFunctionCallReady(message, context) {
  const { appState } = context;

  updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "ready to execute");
}

/**
 * Handle function_executed message
 */
function handleFunctionExecuted(message, context) {
  const { appState } = context;

  if (message.success) {
    updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "completed", {
      result: message.result_preview || "Success",
    });
  } else {
    updateFunctionCallStatus(appState.functions.activeCalls, message.call_id, "error", { error: message.error });
  }

  // Clean up after a delay
  scheduleFunctionCardCleanup(appState.functions.activeCalls, appState.functions.activeTimers, message.call_id);
}

/**
 * Handle session_created message
 * Two cases:
 * 1. From file upload: {type: "session_created", session: {...}} - Stay on welcome page
 * 2. From first message: {type: "session_created", session_id: "...", title: "..."} - Transition to chat
 */
function handleSessionCreated(message, context) {
  const { appState } = context;

  // Distinguish between file upload (has session object) vs first message (has separate fields)
  const isFromFileUpload = !!message.session;
  const sessionId = message.session?.session_id || message.session_id;
  const title = message.session?.title || message.title;

  window.electronAPI.log("info", "Session created", {
    session_id: sessionId,
    title: title,
    from_file_upload: isFromFileUpload,
  });

  // Only transition to chat view if this is from first message, not file upload
  if (!isFromFileUpload && appState.ui && appState.ui.currentView === "welcome") {
    appState.setState("ui.currentView", "chat");
    window.electronAPI.log("debug", "Transitioned from welcome to chat view (first message)");
  } else if (isFromFileUpload) {
    window.electronAPI.log("debug", "Session created from file upload - staying on welcome page");

    // Show file section on welcome page now that we have a session
    const welcomeFilesSection = document.getElementById("welcome-files-section");
    if (welcomeFilesSection) {
      welcomeFilesSection.style.display = "block";
    }
  }

  // Trigger custom event to reload sessions list
  // This ensures the sidebar updates immediately when a session is created
  window.dispatchEvent(
    new CustomEvent("session-created", {
      detail: {
        session_id: sessionId,
        title: title,
        from_file_upload: isFromFileUpload,
      },
    })
  );
}

/**
 * Handle session_response message (replies to session commands)
 */
function handleSessionResponse(message, context) {
  // Session command responses are handled by main process IPC handlers
  // This is just a placeholder for any edge cases
  window.electronAPI.log("debug", "session_response received in renderer", message);
}

/**
 * Handle session_updated message (spontaneous updates like title generation)
 */
function handleSessionUpdated(message, context) {
  window.electronAPI.log("info", "session_updated received", message);

  // Delta update: only update the specific session that changed
  if (message.data && message.data.success && message.data.session) {
    import("../services/session-service.js").then(({ sessionState }) => {
      // Find and update the specific session (in-place for reactivity)
      const session = sessionState.sessions.find((s) => s.session_id === message.data.session.session_id);

      if (session) {
        // Update existing session
        Object.assign(session, message.data.session);
      } else {
        // New session - add to list
        sessionState.sessions.push(message.data.session);
        // Sort by last_used (most recent first)
        sessionState.sessions.sort((a, b) => new Date(b.last_used) - new Date(a.last_used));
      }

      // Dispatch event to trigger UI update
      window.dispatchEvent(
        new CustomEvent("session-updated", {
          detail: message.data,
        })
      );
    });
  }
}

/**
 * Message handler registry
 * Maps message types to their handler functions
 */
export const messageHandlers = {
  assistant_start: handleAssistantStart,
  assistant_delta: handleAssistantDelta,
  assistant_end: handleAssistantEnd,
  error: handleError,
  function_detected: handleFunctionDetected,
  function_executing: handleFunctionExecuting,
  function_completed: handleFunctionCompleted,
  rate_limit_hit: handleRateLimitHit,
  rate_limit_failed: handleRateLimitFailed,
  function_call_added: () => {}, // Legacy event - no-op
  function_call_arguments_delta: handleFunctionCallArgumentsDelta,
  function_call_arguments_done: handleFunctionCallArgumentsDone,
  function_call_ready: handleFunctionCallReady,
  function_executed: handleFunctionExecuted,
  session_created: handleSessionCreated,
  session_response: handleSessionResponse,
  session_updated: handleSessionUpdated,
  agent_updated: () => {}, // Agent state change event - informational only, no UI action needed
};

/**
 * Process a message by routing to appropriate handler
 * @param {Object} message - The message object with a 'type' field
 * @param {Object} context - Context object with appState and elements
 */
export function processMessage(message, context) {
  try {
    const handler = messageHandlers[message.type];

    if (handler) {
      handler(message, context);
    } else {
      window.electronAPI.log("warn", `Unknown message type: ${message.type}`);
    }
  } catch (e) {
    window.electronAPI.log("error", "Error processing message", {
      error: e.message,
      stack: e.stack,
      messageType: message.type,
    });
  }
}
