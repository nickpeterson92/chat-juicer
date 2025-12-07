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
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/></svg>',
  fetch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.1374 2.73779C13.3942 3.48102 13.0092 4.77646 13.2895 5.7897C13.438 6.32603 13.4622 6.97541 13.0687 7.3689L7.3689 13.0687C6.97541 13.4622 6.32603 13.438 5.7897 13.2895C4.77646 13.0092 3.48101 13.3942 2.73779 14.1374C1.75407 15.1212 1.75407 16.7161 2.73779 17.6998C3.72152 18.6835 5.31646 18.6835 6.30018 17.6998C5.31646 18.6835 5.31645 20.2785 6.30018 21.2622C7.28391 22.2459 8.87884 22.2459 9.86257 21.2622C10.6058 20.519 10.9908 19.2235 10.7105 18.2103C10.562 17.674 10.5378 17.0246 10.9313 16.6311L16.6311 10.9313C17.0246 10.5378 17.674 10.562 18.2103 10.7105C19.2235 10.9908 20.519 10.6058 21.2622 9.86257C22.2459 8.87884 22.2459 7.28391 21.2622 6.30018C20.2785 5.31646 18.6835 5.31646 17.6998 6.30018C18.6835 5.31646 18.6835 3.72152 17.6998 2.73779C16.7161 1.75407 15.1212 1.75407 14.1374 2.73779Z"/></svg>',
  // Tavily MCP tools (search, extract, map, crawl)
  tavily_search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  tavily_extract:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0-12l-4 4m4-4l4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
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
    search_files: "File Search",
    generate_document: "Generate",
    edit_file: "Edit",
    text_edit: "Edit",
    regex_edit: "Regex",
    insert_text: "Insert",
    fetch: "Fetch",
    // Tavily MCP tools
    tavily_search: "Web Search",
    tavilysearch: "Web Search",
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
      toggleFunctionCard(cardDiv);
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
      cleanupTimerId: null, // Track timer for cancellation
    };
    activeCalls.set(callId, card);
  }

  return card;
}

/**
 * Toggle function card between collapsed and expanded states
 * Pure DOM manipulation - no Map tracking needed since cards are persisted to SQLite
 * @param {HTMLElement} cardElement - The card element to toggle
 */
function toggleFunctionCard(cardElement) {
  const isExpanded = cardElement.dataset.expanded === "true";
  const chevron = cardElement.querySelector(".disclosure-chevron");

  if (isExpanded) {
    cardElement.classList.remove("expanded");
    cardElement.dataset.expanded = "false";
    if (chevron) chevron.innerHTML = CHEVRON_DOWN;
  } else {
    cardElement.classList.add("expanded");
    cardElement.dataset.expanded = "true";
    if (chevron) chevron.innerHTML = CHEVRON_UP;
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

        // Fade in args and chevron when we have content
        if (primaryArg) {
          argsPreview.classList.add("visible");
          const chevron = card.element.querySelector(".disclosure-chevron");
          if (chevron) chevron.classList.add("visible");
        }
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
    argsPreview.textContent = primaryArg || "";

    // Fade in args and chevron when we have extractable content
    if (primaryArg && !argsPreview.classList.contains("visible")) {
      argsPreview.classList.add("visible");
      const chevron = card.element.querySelector(".disclosure-chevron");
      if (chevron) chevron.classList.add("visible");
    }
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
 * Schedule cleanup of a function card's Map entry after delay.
 * DOM element is preserved (cards persist visually) since tool calls are
 * now stored in Layer 2 (SQLite) and will be restored on session load.
 *
 * This only cleans up the activeCalls Map entry to free memory while
 * keeping the visual card in the chat for reference.
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
    // Mark the DOM element as persisted (no longer tracked in activeCalls)
    const targetCard = activeCalls.get(callId);
    if (targetCard?.element) {
      targetCard.element.dataset.persisted = "true";
    }

    // Remove from active calls map (frees memory)
    // DOM element stays visible - tool call is persisted in Layer 2
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

/**
 * Create a completed tool card from persisted session data
 * Used for restoring tool cards on session load (not for active/streaming calls)
 *
 * @param {HTMLElement} chatContainer - The chat container element
 * @param {Object} toolData - Persisted tool call data
 * @param {string} toolData.call_id - Unique call identifier
 * @param {string} toolData.name - Tool/function name
 * @param {string|Object} toolData.arguments - Tool arguments
 * @param {string} toolData.result - Tool result
 * @param {boolean} toolData.success - Whether the call succeeded
 * @returns {HTMLElement} The created card element
 */
export function createCompletedToolCard(chatContainer, toolData) {
  const { call_id, name, arguments: args, result, success = true } = toolData;

  // Create disclosure card (collapsed by default)
  const cardDiv = document.createElement("div");
  cardDiv.className = "function-disclosure";
  cardDiv.id = `function-${call_id}`;
  cardDiv.dataset.expanded = "false";
  cardDiv.dataset.status = success ? "completed" : "error";
  cardDiv.dataset.persisted = "true"; // Mark as loaded from persistence

  // Header row: [icon] ToolName args... ▼
  const headerDiv = document.createElement("div");
  headerDiv.className = "disclosure-header";

  const iconSpan = document.createElement("span");
  iconSpan.className = "disclosure-icon";
  iconSpan.innerHTML = getFunctionIcon(name);

  const toolNameSpan = document.createElement("span");
  toolNameSpan.className = "disclosure-tool-name";
  toolNameSpan.textContent = formatToolName(name);

  const argsSpan = document.createElement("span");
  const primaryArg = extractPrimaryArg(args, name);
  argsSpan.className = "disclosure-args-preview" + (primaryArg ? " visible" : "");
  argsSpan.textContent = primaryArg;

  const chevronSpan = document.createElement("span");
  // Show chevron if there's content to expand (args or result)
  chevronSpan.className = "disclosure-chevron" + (primaryArg || result ? " visible" : "");
  chevronSpan.innerHTML = CHEVRON_DOWN;

  headerDiv.appendChild(iconSpan);
  headerDiv.appendChild(toolNameSpan);
  headerDiv.appendChild(argsSpan);
  headerDiv.appendChild(chevronSpan);
  cardDiv.appendChild(headerDiv);

  // Expandable content container (hidden by default)
  const contentDiv = document.createElement("div");
  contentDiv.className = "disclosure-content";

  // Add arguments section
  if (args) {
    const parsedArgs = safeParse(args, args);
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

  // Add result section
  if (result) {
    const resultSection = document.createElement("div");
    resultSection.className = success ? "disclosure-result" : "disclosure-error";

    const resultLabel = document.createElement("div");
    resultLabel.className = "disclosure-section-label";
    resultLabel.textContent = success ? "Result" : "Error";
    resultSection.appendChild(resultLabel);

    const resultContent = document.createElement("pre");
    resultContent.className = success ? "disclosure-section-content" : "disclosure-section-content error-text";
    // Truncate very long results
    const resultText = result.length > 2000 ? `${result.substring(0, 2000)}\n... (truncated)` : result;
    resultContent.textContent = resultText;
    resultSection.appendChild(resultContent);

    contentDiv.appendChild(resultSection);
  }

  cardDiv.appendChild(contentDiv);

  // Add click handler for expand/collapse (only on header)
  headerDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    const isExpanded = cardDiv.dataset.expanded === "true";
    const chevron = cardDiv.querySelector(".disclosure-chevron");

    if (isExpanded) {
      cardDiv.classList.remove("expanded");
      cardDiv.dataset.expanded = "false";
      if (chevron) chevron.innerHTML = CHEVRON_DOWN;
    } else {
      cardDiv.classList.add("expanded");
      cardDiv.dataset.expanded = "true";
      if (chevron) chevron.innerHTML = CHEVRON_UP;
    }
  });

  // Append to chat container
  chatContainer.appendChild(cardDiv);

  return cardDiv;
}
