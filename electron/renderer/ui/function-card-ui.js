/**
 * Function call card UI components for tool execution visualization
 * Optimized with JSON caching and throttled status updates
 */

import { FUNCTION_CARD_CLEANUP_DELAY } from "../config/constants.js";
import { safeParse } from "../utils/json-cache.js";

// Throttled status update queue for batched DOM updates
const pendingUpdates = new Map();
let updateScheduled = false;

/**
 * Create or get a function call card
 * @param {HTMLElement} toolsContainer - The tools container element
 * @param {Map} activeCalls - Map of active function calls
 * @param {string} callId - Unique call identifier
 * @param {string} functionName - Function name
 * @param {string} status - Initial status
 * @returns {Object} Card object with element, name, timestamp
 */
export function createFunctionCallCard(toolsContainer, activeCalls, callId, functionName, status = "preparing") {
  window.electronAPI.log("info", "Creating function card", { callId, functionName, status });

  // Handle case where callId might not be provided initially
  if (!callId) {
    callId = `temp-${Date.now()}`;
  }

  let card = activeCalls.get(callId);

  if (!card) {
    // Create new card
    const cardDiv = document.createElement("div");
    cardDiv.className = "function-call-card executing function-executing-pulse";
    cardDiv.id = `function-${callId}`;

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

    headerDiv.appendChild(iconDiv);
    headerDiv.appendChild(nameDiv);
    headerDiv.appendChild(statusDiv);
    cardDiv.appendChild(headerDiv);

    toolsContainer.appendChild(cardDiv);
    toolsContainer.scrollTop = toolsContainer.scrollHeight;

    card = { element: cardDiv, name: functionName, timestamp: Date.now() };
    activeCalls.set(callId, card);
  }

  return card;
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
      card.element.className = "function-call-card executing function-executing-pulse";
    } else if (status === "completed") {
      card.element.className = "function-call-card success";
      card.element.classList.remove("function-executing-pulse");
    } else if (status === "error") {
      card.element.className = "function-call-card error";
      card.element.classList.remove("function-executing-pulse");
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
 * @param {HTMLElement} toolsContainer - The tools container element
 */
export function clearFunctionCards(toolsContainer) {
  toolsContainer.innerHTML = "";
}
