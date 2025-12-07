/**
 * Function call card UI components for inline tool execution visualization
 * Uses Claude Code-style disclosure pattern: "ToolName args..." expandable
 */

import { FUNCTION_CARD_CLEANUP_DELAY } from "../config/constants.js";
import { safeParse } from "../utils/json-cache.js";

// Throttled status update queue for batched DOM updates
const pendingUpdates = new Map();
let updateScheduled = false;

// Chevron SVG for expand/collapse indicator
const CHEVRON_DOWN =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
const CHEVRON_UP =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg>';

// SVG icon mapping for functions
const FUNCTION_ICONS = {
  list_directory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
  search_files:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  read_file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8m8 4H8m8-8H8"/></svg>',
  generate_document:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6m-3 3h6"/></svg>',
  edit_file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  sequentialthinking:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/></svg>',
  fetch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  // Tavily MCP tools (search, extract, map, crawl)
  tavily_search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/><path d="M11 8v6M8 11h6"/></svg>',
  tavily_extract:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg>',
  tavily_map:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/><path d="M9 3v15M15 6v15"/></svg>',
  tavily_crawl:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 6v6l4 2"/><path d="M2 12h4M18 12h4"/></svg>',
  default:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
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
 * Extract primary argument for display in collapsed state
 * Returns the most relevant argument value for inline display
 * @param {Object|string} args - Function arguments
 * @param {string} _functionName - Function name for context
 * @returns {string} Primary argument for display
 */
function extractPrimaryArg(args, _functionName) {
  if (!args) return "";

  const parsed = typeof args === "string" ? safeParse(args, {}) : args;
  if (typeof parsed !== "object" || parsed === null) return String(args);

  // Priority order for common argument keys
  const priorityKeys = ["path", "file_path", "filename", "url", "query", "pattern", "thought", "name", "command"];

  for (const key of priorityKeys) {
    if (parsed[key]) {
      let value = String(parsed[key]);
      // Truncate long values
      if (value.length > 60) {
        value = value.substring(0, 57) + "...";
      }
      return value;
    }
  }

  // Fallback: use first string value found
  for (const value of Object.values(parsed)) {
    if (typeof value === "string" && value.length > 0) {
      return value.length > 60 ? value.substring(0, 57) + "..." : value;
    }
  }

  return "";
}

/**
 * Format tool name for display (human-readable)
 * @param {string} functionName - Raw function name
 * @returns {string} Formatted display name
 */
function formatToolName(functionName) {
  // Handle MCP server prefixed names like "sequentialthinking"
  const name = functionName.replace(/^mcp_/, "");

  // Special case mappings
  const nameMap = {
    sequentialthinking: "Thought",
    read_file: "Read",
    list_directory: "List",
    search_files: "Search",
    generate_document: "Generate",
    edit_file: "Edit",
    text_edit: "Edit",
    regex_edit: "Regex",
    insert_text: "Insert",
    fetch: "Fetch",
    // Tavily MCP tools
    tavily_search: "Search",
    tavilysearch: "Search",
    tavily_extract: "Extract",
    tavilyextract: "Extract",
    tavily_map: "Map",
    tavilymap: "Map",
    tavily_crawl: "Crawl",
    tavilycrawl: "Crawl",
  };

  const normalized = name.toLowerCase().replace(/[_-]/g, "");
  for (const [key, display] of Object.entries(nameMap)) {
    if (normalized.includes(key.replace(/[_-]/g, ""))) {
      return display;
    }
  }

  // Default: capitalize first letter, replace underscores with spaces
  return name
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Create or get an inline function call card (Claude Code disclosure style)
 * Collapsed: "ToolName primary_arg ▼"
 * Expanded: Shows full arguments, result, reasoning
 *
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
  // Handle case where callId might not be provided initially
  if (!callId) {
    callId = `temp-${Date.now()}`;
  }

  let card = activeCalls.get(callId);

  // Check if card exists AND has an element - FunctionCallService may have created
  // a call object without a DOM element, so we need to create the element
  if (!card || !card.element) {
    // Create new disclosure card (collapsed by default)
    const cardDiv = document.createElement("div");
    cardDiv.className = "function-disclosure";
    cardDiv.id = `function-${callId}`;
    cardDiv.dataset.expanded = "false";
    cardDiv.dataset.status = status;

    // Header row: [icon] ToolName args... ▼
    const headerDiv = document.createElement("div");
    headerDiv.className = "disclosure-header";

    const iconSpan = document.createElement("span");
    iconSpan.className = "disclosure-icon";
    iconSpan.innerHTML = getFunctionIcon(functionName);

    const toolNameSpan = document.createElement("span");
    toolNameSpan.className = "disclosure-tool-name";
    toolNameSpan.textContent = formatToolName(functionName);

    const argsSpan = document.createElement("span");
    argsSpan.className = "disclosure-args-preview";
    argsSpan.textContent = ""; // Will be updated when args arrive

    const chevronSpan = document.createElement("span");
    chevronSpan.className = "disclosure-chevron";
    chevronSpan.innerHTML = CHEVRON_DOWN;

    headerDiv.appendChild(iconSpan);
    headerDiv.appendChild(toolNameSpan);
    headerDiv.appendChild(argsSpan);
    headerDiv.appendChild(chevronSpan);
    cardDiv.appendChild(headerDiv);

    // Expandable content container (hidden by default)
    const contentDiv = document.createElement("div");
    contentDiv.className = "disclosure-content";
    cardDiv.appendChild(contentDiv);

    // Add click handler for expand/collapse (only on header)
    headerDiv.addEventListener("click", (e) => {
      e.stopPropagation();
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

    // Merge with existing card properties (from FunctionCallService) or create new
    const existingCard = activeCalls.get(callId);
    card = {
      ...existingCard, // Preserve FunctionCallService properties (id, args, status, etc.)
      element: cardDiv,
      name: functionName,
      rawName: functionName, // Keep original for expanded view
      timestamp: existingCard?.timestamp || Date.now(),
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
 * @param {Map} activeCalls - Map of active function calls
 * @param {Set} _activeTimers - Set of active timer IDs (unused, kept for API compatibility)
 * @param {string} callId - Call identifier
 */
function toggleFunctionCard(cardElement, activeCalls, _activeTimers, callId) {
  const isExpanded = cardElement.dataset.expanded === "true";
  const chevron = cardElement.querySelector(".disclosure-chevron");

  if (isExpanded) {
    // Collapsing
    cardElement.classList.remove("expanded");
    cardElement.dataset.expanded = "false";
    if (chevron) chevron.innerHTML = CHEVRON_DOWN;

    // Update card object state
    if (callId && activeCalls) {
      const card = activeCalls.get(callId);
      if (card) {
        card.expanded = false;
      }
    }
  } else {
    // Expanding
    cardElement.classList.add("expanded");
    cardElement.dataset.expanded = "true";
    if (chevron) chevron.innerHTML = CHEVRON_UP;

    // Update card object state
    if (callId && activeCalls) {
      const card = activeCalls.get(callId);
      if (card) {
        card.expanded = true;
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
 * @param {boolean} forceFlush - If true, apply update immediately (for completion events)
 */
export function updateFunctionCallStatus(activeCalls, callId, status, data = {}, forceFlush = false) {
  // Queue update instead of applying immediately
  pendingUpdates.set(callId, { status, data });

  if (forceFlush) {
    // Immediately flush for completion events (before card gets deleted from activeCalls)
    flushStatusUpdates(activeCalls);
  } else if (!updateScheduled) {
    // Schedule batch update if not already scheduled
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
    // Skip if card doesn't exist or has no DOM element
    if (!card || !card.element) {
      continue;
    }

    // Update data-status attribute for CSS styling
    card.element.dataset.status = status;

    // Update expanded content with detailed info
    const contentDiv = card.element.querySelector(".disclosure-content");

    // Update args preview in header when arguments arrive
    if (data.arguments) {
      const argsPreview = card.element.querySelector(".disclosure-args-preview");
      if (argsPreview) {
        const primaryArg = extractPrimaryArg(data.arguments, card.rawName || card.name);
        argsPreview.textContent = primaryArg;
      }

      // Add full arguments to expanded content
      if (contentDiv && !contentDiv.querySelector(".disclosure-arguments")) {
        const parsedArgs = safeParse(data.arguments, data.arguments);
        const argsText = typeof parsedArgs === "string" ? parsedArgs : JSON.stringify(parsedArgs, null, 2);

        const argsSection = document.createElement("div");
        argsSection.className = "disclosure-arguments";

        const argsLabel = document.createElement("div");
        argsLabel.className = "disclosure-section-label";
        argsLabel.textContent = "Arguments";
        argsSection.appendChild(argsLabel);

        const argsContent = document.createElement("pre");
        argsContent.className = "disclosure-section-content";
        argsContent.textContent = argsText;
        argsSection.appendChild(argsContent);

        contentDiv.appendChild(argsSection);
      }
    }

    // Add or update reasoning in expanded content
    if (data.reasoning !== undefined && contentDiv) {
      let reasoningSection = contentDiv.querySelector(".disclosure-reasoning");

      if (!reasoningSection) {
        reasoningSection = document.createElement("div");
        reasoningSection.className = "disclosure-reasoning";

        const reasoningLabel = document.createElement("div");
        reasoningLabel.className = "disclosure-section-label";
        reasoningLabel.textContent = "Thinking";
        reasoningSection.appendChild(reasoningLabel);

        const reasoningContent = document.createElement("div");
        reasoningContent.className = "disclosure-reasoning-content";
        reasoningSection.appendChild(reasoningContent);

        // Insert reasoning before arguments
        const argsSection = contentDiv.querySelector(".disclosure-arguments");
        if (argsSection) {
          contentDiv.insertBefore(reasoningSection, argsSection);
        } else {
          contentDiv.appendChild(reasoningSection);
        }
      }

      const reasoningContent = reasoningSection.querySelector(".disclosure-reasoning-content");
      if (reasoningContent) {
        reasoningContent.textContent = data.reasoning;
      }
    }

    // Add result to expanded content
    if (data.result && contentDiv && !contentDiv.querySelector(".disclosure-result")) {
      const resultSection = document.createElement("div");
      resultSection.className = "disclosure-result";

      const resultLabel = document.createElement("div");
      resultLabel.className = "disclosure-section-label";
      resultLabel.textContent = "Result";
      resultSection.appendChild(resultLabel);

      const resultContent = document.createElement("pre");
      resultContent.className = "disclosure-section-content";
      // Truncate very long results
      const resultText = data.result.length > 2000 ? `${data.result.substring(0, 2000)}\n... (truncated)` : data.result;
      resultContent.textContent = resultText;
      resultSection.appendChild(resultContent);

      contentDiv.appendChild(resultSection);
    }

    // Add error to expanded content
    if (data.error && contentDiv && !contentDiv.querySelector(".disclosure-error")) {
      const errorSection = document.createElement("div");
      errorSection.className = "disclosure-error";

      const errorLabel = document.createElement("div");
      errorLabel.className = "disclosure-section-label";
      errorLabel.textContent = "Error";
      errorSection.appendChild(errorLabel);

      const errorContent = document.createElement("div");
      errorContent.className = "disclosure-section-content error-text";
      errorContent.textContent = data.error;
      errorSection.appendChild(errorContent);

      contentDiv.appendChild(errorSection);
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
  // Skip if card doesn't exist or has no DOM element
  if (!card || !card.element) return;

  // Initialize buffer for this call if needed
  if (!argumentsBuffer.has(callId)) {
    argumentsBuffer.set(callId, "");
  }

  if (delta) {
    argumentsBuffer.set(callId, argumentsBuffer.get(callId) + delta);
  }

  const bufferedArgs = argumentsBuffer.get(callId);

  // Update header args preview with streaming content
  const argsPreview = card.element.querySelector(".disclosure-args-preview");
  if (argsPreview) {
    const primaryArg = extractPrimaryArg(bufferedArgs, card.rawName || card.name);
    argsPreview.textContent = primaryArg || "...";
  }

  // Update expanded content if exists
  const contentDiv = card.element.querySelector(".disclosure-content");
  if (contentDiv) {
    let argsSection = contentDiv.querySelector(".disclosure-arguments");

    if (!argsSection) {
      argsSection = document.createElement("div");
      argsSection.className = "disclosure-arguments";

      const argsLabel = document.createElement("div");
      argsLabel.className = "disclosure-section-label";
      argsLabel.textContent = "Arguments";
      argsSection.appendChild(argsLabel);

      const argsContent = document.createElement("pre");
      argsContent.className = "disclosure-section-content streaming";
      argsSection.appendChild(argsContent);

      contentDiv.appendChild(argsSection);
    }

    const argsContent = argsSection.querySelector(".disclosure-section-content");
    if (argsContent) {
      if (isDone) {
        argsContent.classList.remove("streaming");
        const parsedArgs = safeParse(bufferedArgs, bufferedArgs);
        argsContent.textContent = typeof parsedArgs === "string" ? parsedArgs : JSON.stringify(parsedArgs, null, 2);
        argumentsBuffer.delete(callId);
      } else {
        argsContent.textContent = `${bufferedArgs}...`;
      }
    }
  }
}

/**
 * Schedule cleanup of a function card after delay.
 * Cleans DOM element + activeCalls entry to avoid long-lived references.
 *
 * @param {Map} activeCalls - Map of active function calls
 * @param {Set} activeTimers - Set of active timer IDs
 * @param {string} callId - Call identifier
 * @param {number} delay - Cleanup delay in ms (default: FUNCTION_CARD_CLEANUP_DELAY)
 */
export function scheduleFunctionCardCleanup(activeCalls, activeTimers, callId, delay = FUNCTION_CARD_CLEANUP_DELAY) {
  if (!callId || !activeCalls) return;

  const card = activeCalls.get(callId);
  if (!card) return;

  // Prevent duplicate timers
  if (card.cleanupTimerId) {
    return;
  }

  const timerId = window.setTimeout(() => {
    const targetCard = activeCalls.get(callId);

    // Skip cleanup if card is expanded (user is viewing it)
    if (targetCard?.element?.hasAttribute("open")) {
      // Clear the timer reference so it can be rescheduled later
      targetCard.cleanupTimerId = null;
      activeCalls.set(callId, targetCard);
      activeTimers.delete(timerId);
      // Reschedule cleanup for when user closes it
      scheduleFunctionCardCleanup(activeCalls, activeTimers, callId, delay);
      return;
    }

    // Remove DOM element if it still exists
    if (targetCard?.element?.parentNode) {
      targetCard.element.remove();
    }

    // Remove from active calls map
    activeCalls.delete(callId);

    // Clear timer tracking
    activeTimers.delete(timerId);
  }, delay);

  // Track timer for this card so we don't schedule twice
  card.cleanupTimerId = timerId;
  activeCalls.set(callId, card);
  activeTimers.add(timerId);
}

/**
 * Clear all function cards
 * @param {HTMLElement} chatContainer - The chat container element
 */
export function clearFunctionCards(chatContainer) {
  // Remove all disclosure cards from chat container
  const cards = chatContainer.querySelectorAll(".function-disclosure");
  for (const card of cards) {
    card.remove();
  }
}
