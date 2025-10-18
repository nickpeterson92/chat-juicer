/**
 * Message handlers using registry pattern
 * Replaces the massive switch statement with isolated, testable handler functions
 */

import {
  addMessage,
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
import { processMermaidDiagrams } from "../utils/markdown-renderer.js";

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

  // Process Mermaid diagrams after streaming is complete
  // Uses atomic innerHTML replacement to prevent race conditions
  if (currentAssistantElement && document.body.contains(currentAssistantElement)) {
    processMermaidDiagrams(currentAssistantElement).catch((err) =>
      window.electronAPI.log("error", "Mermaid processing error", { error: err.message })
    );
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
  session_response: () => {}, // Handled by main process via IPC, no renderer action needed
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
