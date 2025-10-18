/**
 * Function call card UI components for inline tool execution visualization
 * Optimized with JSON caching and collapsible design
 */

import { FUNCTION_CARD_CLEANUP_DELAY } from "../config/constants.js";
import { safeParse } from "../utils/json-cache.js";

// Throttled status update queue for batched DOM updates
const pendingUpdates = new Map();
let updateScheduled = false;

/**
 * Create or get an inline function call card (collapsed by default)
 * @param {HTMLElement} chatContainer - The chat container element (not tools container)
 * @param {Map} activeCalls - Map of active function calls
 * @param {Object} appState - Application state with message.currentAssistant
 * @param {string} callId - Unique call identifier
 * @param {string} functionName - Function name
 * @param {string} status - Initial status
 * @returns {Object} Card object with element, name, timestamp, expanded state
 */
export function createFunctionCallCard(
  chatContainer,
  activeCalls,
  appState,
  callId,
  functionName,
  status = "preparing"
) {
  window.electronAPI.log("info", "Creating inline function card", { callId, functionName, status });

  // Handle case where callId might not be provided initially
  if (!callId) {
    callId = `temp-${Date.now()}`;
  }

  let card = activeCalls.get(callId);

  if (!card) {
    // Create new inline card (collapsed by default)
    const cardDiv = document.createElement("div");
    cardDiv.className = "function-call-card executing";
    cardDiv.id = `function-${callId}`;
    cardDiv.dataset.expanded = "false";

    const headerDiv = document.createElement("div");
    headerDiv.className = "function-header";

    const iconDiv = document.createElement("div");
    iconDiv.className = "function-icon";
    iconDiv.innerHTML = "🔧";

    const nameDiv = document.createElement("div");
    nameDiv.className = "function-name";
    nameDiv.textContent = functionName;

    const statusDiv = document.createElement("div");
    statusDiv.className = "function-status";
    statusDiv.textContent = status;

    const expandIndicator = document.createElement("div");
    expandIndicator.className = "function-expand-indicator";
    expandIndicator.textContent = "▶";

    headerDiv.appendChild(iconDiv);
    headerDiv.appendChild(nameDiv);
    headerDiv.appendChild(statusDiv);
    headerDiv.appendChild(expandIndicator);
    cardDiv.appendChild(headerDiv);

    // Add click handler for expand/collapse
    cardDiv.addEventListener("click", () => toggleFunctionCard(cardDiv));

    // Insert function card BEFORE the current streaming assistant message
    // This ensures tool calls appear above the model's response
    if (appState?.message?.currentAssistant) {
      // Find the parent message div of the current assistant text span
      const currentAssistantSpan = appState.message.currentAssistant;
      const assistantMessageDiv = currentAssistantSpan.closest(".message");

      if (assistantMessageDiv) {
        // Insert before the streaming assistant message
        chatContainer.insertBefore(cardDiv, assistantMessageDiv);
      } else {
        // Fallback: append at end
        chatContainer.appendChild(cardDiv);
      }
    } else {
      // No current assistant message, append at end
      chatContainer.appendChild(cardDiv);
    }
    chatContainer.scrollTop = chatContainer.scrollHeight;

    card = {
      element: cardDiv,
      name: functionName,
      timestamp: Date.now(),
      expanded: false,
    };
    activeCalls.set(callId, card);
  }

  return card;
}

/**
 * Toggle function card between collapsed and expanded states
 * @param {HTMLElement} cardElement - The card element to toggle
 */
function toggleFunctionCard(cardElement) {
  const isExpanded = cardElement.dataset.expanded === "true";

  if (isExpanded) {
    cardElement.classList.remove("expanded");
    cardElement.dataset.expanded = "false";
  } else {
    cardElement.classList.add("expanded");
    cardElement.dataset.expanded = "true";
  }
}

/**
 * Update function call card status (throttled for performance)
 * @param {Map} activeCalls - Map of active function calls
 * @param {string} callId - Call identifier
 * @param {string} status - New status
 * @param {Object} data - Additional data (arguments, result, error)
 */
export function updateFunctionCallStatus(activeCalls, callId, status, data = {}) {
  // Queue update instead of applying immediately
  pendingUpdates.set(callId, { status, data });

  // Schedule batch update if not already scheduled
  if (!updateScheduled) {
    updateScheduled = true;
    requestAnimationFrame(() => {
      flushStatusUpdates(activeCalls);
      updateScheduled = false;
    });
  }
}

/**
 * Flush all pending status updates in a single batch
 * Reduces layout thrashing by batching DOM writes
 * @param {Map} activeCalls - Map of active function calls
 */
function flushStatusUpdates(activeCalls) {
  for (const [callId, { status, data }] of pendingUpdates.entries()) {
    const card = activeCalls.get(callId);
    if (!card) continue;

    const statusDiv = card.element.querySelector(".function-status");
    if (statusDiv) {
      statusDiv.textContent = status;
    }

    // Update card styling based on status
    if (status === "executing") {
      card.element.className =
        card.element.dataset.expanded === "true"
          ? "function-call-card executing expanded"
          : "function-call-card executing";
    } else if (status === "completed") {
      card.element.className =
        card.element.dataset.expanded === "true" ? "function-call-card success expanded" : "function-call-card success";
    } else if (status === "error") {
      card.element.className =
        card.element.dataset.expanded === "true" ? "function-call-card error expanded" : "function-call-card error";
    }

    // Add arguments if provided (optimized with JSON cache)
    if (data.arguments && !card.element.querySelector(".function-arguments")) {
      const argsDiv = document.createElement("div");
      argsDiv.className = "function-arguments";

      const parsedArgs = safeParse(data.arguments, data.arguments);
      argsDiv.textContent = typeof parsedArgs === "string" ? parsedArgs : JSON.stringify(parsedArgs, null, 2);

      card.element.appendChild(argsDiv);
    }

    // Add result if provided
    if (data.result && !card.element.querySelector(".function-result")) {
      const resultDiv = document.createElement("div");
      resultDiv.className = "function-result";
      resultDiv.textContent = data.result;
      card.element.appendChild(resultDiv);
    }

    // Add error if provided
    if (data.error && !card.element.querySelector(".function-result")) {
      const resultDiv = document.createElement("div");
      resultDiv.className = "function-result";
      resultDiv.textContent = `Error: ${data.error}`;
      card.element.appendChild(resultDiv);
    }
  }

  pendingUpdates.clear();
}

/**
 * Update function arguments during streaming (optimized with JSON cache)
 * @param {Map} activeCalls - Map of active function calls
 * @param {Map} argumentsBuffer - Arguments buffer map
 * @param {string} callId - Call identifier
 * @param {string} delta - New arguments delta
 * @param {boolean} isDone - Whether streaming is complete
 */
export function updateFunctionArguments(activeCalls, argumentsBuffer, callId, delta, isDone = false) {
  const card = activeCalls.get(callId);
  if (!card) return;

  // Initialize buffer for this call if needed
  if (!argumentsBuffer.has(callId)) {
    argumentsBuffer.set(callId, "");
  }

  if (delta) {
    argumentsBuffer.set(callId, argumentsBuffer.get(callId) + delta);
  }

  let argsDiv = card.element.querySelector(".function-arguments");
  if (!argsDiv) {
    argsDiv = document.createElement("div");
    argsDiv.className = "function-arguments streaming";
    card.element.appendChild(argsDiv);
  }

  if (isDone) {
    argsDiv.classList.remove("streaming");

    // Use cached JSON parsing
    const parsedArgs = safeParse(argumentsBuffer.get(callId), argumentsBuffer.get(callId));
    argsDiv.textContent = typeof parsedArgs === "string" ? parsedArgs : JSON.stringify(parsedArgs, null, 2);

    argumentsBuffer.delete(callId);
  } else {
    // Show partial arguments while streaming
    argsDiv.textContent = `${argumentsBuffer.get(callId)}...`;
  }
}

/**
 * Schedule cleanup of a function card after delay
 * @param {Map} activeCalls - Map of active function calls
 * @param {Set} activeTimers - Set of active timer IDs
 * @param {string} callId - Call identifier to clean up
 */
export function scheduleFunctionCardCleanup(activeCalls, activeTimers, callId) {
  const timerId = setTimeout(() => {
    activeCalls.delete(callId);
    activeTimers.delete(timerId);
  }, FUNCTION_CARD_CLEANUP_DELAY);
  activeTimers.add(timerId);
}

/**
 * Clear all function cards
 * @param {HTMLElement} chatContainer - The chat container element
 */
export function clearFunctionCards(chatContainer) {
  // Remove all function cards from chat container
  const cards = chatContainer.querySelectorAll(".function-call-card");
  for (const card of cards) {
    card.remove();
  }
}
