/**
 * Function call card UI components for inline tool execution visualization
 * Optimized with JSON caching and collapsible design
 */

import { FUNCTION_CARD_CLEANUP_DELAY } from "../config/constants.js";
import { safeParse } from "../utils/json-cache.js";

// Throttled status update queue for batched DOM updates
const pendingUpdates = new Map();
let updateScheduled = false;

// SVG icon mapping for functions
const FUNCTION_ICONS = {
  list_directory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
  search_files:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  read_file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8m8 4H8m8-8H8"/></svg>',
  generate_document:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  edit_file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  sequentialthinking:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/></svg>',
  fetch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  default:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
};

// Status icon mapping for WCAG 1.4.1 compliance (color-independent indicators)
const STATUS_ICONS = {
  executing:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>',
  completed:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  error:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  preparing:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/></svg>',
};

/**
 * Get SVG icon for a function
 * @param {string} functionName - Function name
 * @returns {string} SVG icon HTML
 */
function getFunctionIcon(functionName) {
  const normalizedName = functionName.toLowerCase().replace(/[_-]/g, "");

  for (const [key, icon] of Object.entries(FUNCTION_ICONS)) {
    if (normalizedName.includes(key.toLowerCase().replace(/[_-]/g, ""))) {
      return icon;
    }
  }

  return FUNCTION_ICONS.default;
}

/**
 * Get status icon for WCAG 1.4.1 compliance (color-independent indicators)
 * @param {string} status - Status name
 * @returns {string} SVG icon HTML
 */
function getStatusIcon(status) {
  // Map common status variants to standard statuses
  if (status === "success" || status === "completed") {
    return STATUS_ICONS.completed;
  }
  return STATUS_ICONS[status] || STATUS_ICONS.preparing;
}

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
    iconDiv.innerHTML = getFunctionIcon(functionName);

    const nameDiv = document.createElement("div");
    nameDiv.className = "function-name";
    nameDiv.textContent = functionName;

    const paramsDiv = document.createElement("div");
    paramsDiv.className = "function-params";
    paramsDiv.textContent = "()"; // Will be updated with actual params

    const statusDiv = document.createElement("div");
    statusDiv.className = "function-status";
    // Include status icon for WCAG 1.4.1 compliance (color-independent indicators)
    statusDiv.innerHTML = `<span class="status-icon">${getStatusIcon(status)}</span><span class="status-text">${status}</span>`;

    headerDiv.appendChild(iconDiv);
    headerDiv.appendChild(nameDiv);
    headerDiv.appendChild(paramsDiv);
    headerDiv.appendChild(statusDiv);
    cardDiv.appendChild(headerDiv);

    // Add click handler for expand/collapse
    cardDiv.addEventListener("click", () => {
      window.electronAPI.log("debug", "Function card clicked", { callId });
      toggleFunctionCard(cardDiv, activeCalls, appState.functions.activeTimers, callId);
    });

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
      cleanupTimerId: null, // Track timer for cancellation
    };
    activeCalls.set(callId, card);
  }

  return card;
}

/**
 * Toggle function card between collapsed and expanded states
 * @param {HTMLElement} cardElement - The card element to toggle
 */
function toggleFunctionCard(cardElement, activeCalls, activeTimers, callId) {
  const isExpanded = cardElement.dataset.expanded === "true";

  if (isExpanded) {
    // Collapsing - remove expanded state and trigger cleanup
    cardElement.classList.remove("expanded");
    cardElement.dataset.expanded = "false";

    // Update card object state
    if (callId && activeCalls) {
      const card = activeCalls.get(callId);
      if (card) {
        card.expanded = false;
      }

      // Trigger cleanup now that card is collapsed
      if (activeTimers) {
        scheduleFunctionCardCleanup(activeCalls, activeTimers, callId);
      }
    }
  } else {
    // Expanding - add expanded state and cancel any pending cleanup
    cardElement.classList.add("expanded");
    cardElement.dataset.expanded = "true";

    // Update card object state and cancel cleanup timer
    if (callId && activeCalls) {
      const card = activeCalls.get(callId);
      if (card) {
        card.expanded = true;

        // Cancel any pending cleanup timer since user wants to keep it visible
        if (card.cleanupTimerId && activeTimers) {
          clearTimeout(card.cleanupTimerId);
          activeTimers.delete(card.cleanupTimerId);
          card.cleanupTimerId = null;
          window.electronAPI.log("debug", "Cancelled cleanup timer on expand", { callId });
        }
      }
    }
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
      // Update both icon and text for WCAG 1.4.1 compliance
      statusDiv.innerHTML = `<span class="status-icon">${getStatusIcon(status)}</span><span class="status-text">${status}</span>`;
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
      const parsedArgs = safeParse(data.arguments, data.arguments);
      const argsText = typeof parsedArgs === "string" ? parsedArgs : JSON.stringify(parsedArgs, null, 2);

      // Update params display for collapsed state - show full params inline
      const paramsDiv = card.element.querySelector(".function-params");
      if (paramsDiv) {
        // Show compact inline JSON representation
        const compactJson = typeof parsedArgs === "object" ? JSON.stringify(parsedArgs) : parsedArgs;
        paramsDiv.textContent = compactJson;
      }

      // Create full arguments section for expanded state
      const argsDiv = document.createElement("div");
      argsDiv.className = "function-arguments";
      argsDiv.textContent = argsText;
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

    // Update params display for collapsed state - show full params inline
    const paramsDiv = card.element.querySelector(".function-params");
    if (paramsDiv) {
      const compactJson = typeof parsedArgs === "object" ? JSON.stringify(parsedArgs) : parsedArgs;
      paramsDiv.textContent = compactJson;
    }

    argumentsBuffer.delete(callId);
  } else {
    // Show partial arguments while streaming
    argsDiv.textContent = `${argumentsBuffer.get(callId)}...`;

    // Update params to show streaming indicator
    const paramsDiv = card.element.querySelector(".function-params");
    if (paramsDiv) {
      paramsDiv.textContent = argumentsBuffer.get(callId);
    }
  }
}

/**
 * Schedule cleanup of a function card after delay
 * @param {Map} activeCalls - Map of active function calls
 * @param {Set} activeTimers - Set of active timer IDs
 * @param {string} callId - Call identifier to clean up
 */
export function scheduleFunctionCardCleanup(activeCalls, activeTimers, callId) {
  const card = activeCalls.get(callId);

  // Don't clean up if card is expanded - user is still reviewing it
  if (card?.expanded) {
    window.electronAPI.log("debug", "Skipping cleanup for expanded card", { callId });
    return;
  }

  // Cancel any existing timer for this card before scheduling new one
  if (card?.cleanupTimerId) {
    clearTimeout(card.cleanupTimerId);
    activeTimers.delete(card.cleanupTimerId);
    window.electronAPI.log("debug", "Cancelled previous cleanup timer", { callId });
  }

  const timerId = setTimeout(() => {
    const card = activeCalls.get(callId);

    if (card?.element) {
      // Remove from DOM with fade-out animation
      card.element.style.transition = "opacity 0.3s ease-out";
      card.element.style.opacity = "0";

      setTimeout(() => {
        card.element.remove(); // Actually remove from DOM
      }, 300);
    }

    activeCalls.delete(callId);
    activeTimers.delete(timerId);
  }, FUNCTION_CARD_CLEANUP_DELAY);

  // Store timer ID on card for later cancellation
  if (card) {
    card.cleanupTimerId = timerId;
  }
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
