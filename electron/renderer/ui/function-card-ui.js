/**
 * Function call card UI components for inline tool execution visualization
 * Uses Claude Code-style disclosure pattern: "ToolName args..." expandable
 */

import { FUNCTION_CARD_CLEANUP_DELAY } from "../config/constants.js";
import { safeParse } from "../utils/json-cache.js";
import { highlightCode, renderMarkdown } from "../utils/markdown-renderer.js";

/**
 * Pretty-print and syntax highlight JSON content
 * @param {string|Object} content - JSON string or object to format
 * @returns {{html: string, isJson: boolean}} Highlighted HTML and whether it was valid JSON
 */
function prettyPrintJson(content) {
  let parsed;
  let jsonString;

  if (typeof content === "string") {
    parsed = safeParse(content, null);
    if (parsed === null) {
      // Not valid JSON, return as-is
      return { html: content, isJson: false };
    }
    jsonString = JSON.stringify(parsed, null, 2);
  } else if (typeof content === "object" && content !== null) {
    parsed = content;
    jsonString = JSON.stringify(parsed, null, 2);
  } else {
    return { html: String(content), isJson: false };
  }

  // Apply syntax highlighting using Shiki
  const highlighted = highlightCode(jsonString, "json");
  return { html: highlighted, isJson: true };
}

// Throttled status update queue for batched DOM updates
const pendingUpdates = new Map();
let updateScheduled = false;

// Throttled arguments update queue for batched DOM updates
const pendingArgUpdates = new Map();
let argUpdateScheduled = false;

// Chevron SVG for expand/collapse indicator
const CHEVRON_DOWN =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
const CHEVRON_UP =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg>';

// SVG icon mapping for functions
const FUNCTION_ICONS = {
  list_directory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/></svg>',
  search_files:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  read_file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M16 12h2"/><path d="M16 8h2"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/><path d="M6 12h2"/><path d="M6 8h2"/></svg>',
  generate_document:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>',
  edit_file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.226 5.226-2.52-2.52A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.351"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/></svg>',
  text_edit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.226 5.226-2.52-2.52A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.351"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/></svg>',
  regex_edit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.226 5.226-2.52-2.52A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.351"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/></svg>',
  insert_text:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.226 5.226-2.52-2.52A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.351"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/></svg>',
  sequentialthinking:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></svg>',
  fetch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z"/></svg>',
  // Tavily MCP tools (search, extract, map, crawl)
  tavily_search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  tavily_extract:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"/><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"/><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"/><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"/></svg>',
  tavily_map:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/><path d="M9 3v15M15 6v15"/></svg>',
  tavily_crawl:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 12-1.5 3"/><path d="M19.63 18.81 22 20"/><path d="M6.47 8.23a1.68 1.68 0 0 1 2.44 1.93l-.64 2.08a6.76 6.76 0 0 0 10.16 7.67l.42-.27a1 1 0 1 0-2.73-4.21l-.42.27a1.76 1.76 0 0 1-2.63-1.99l.64-2.08A6.66 6.66 0 0 0 3.94 3.9l-.7.4a1 1 0 1 0 2.55 4.34z"/></svg>',
  // Conversation summarization
  summarize_conversation:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>',
  // Code interpreter
  execute_python_code:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>',
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
 * Extract a value from potentially incomplete JSON using regex
 * Useful during streaming when JSON is still being built
 * @param {string} jsonStr - Partial or complete JSON string
 * @param {string} key - Key to extract
 * @returns {string|null} Extracted value or null
 */
function extractFromPartialJson(jsonStr, key) {
  // Match "key": "value" or "key": "value...  (streaming may cut off)
  // Use non-greedy match and handle escaped quotes
  const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, "i");
  const match = jsonStr.match(regex);
  if (match?.[1]) {
    // Unescape common escape sequences
    return match[1].replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return null;
}

/**
 * Extract primary argument for display in collapsed state
 * Returns the most relevant argument value for inline display
 * Works with both complete JSON and partial streaming JSON
 * @param {Object|string} args - Function arguments
 * @param {string} _functionName - Function name for context
 * @returns {string} Primary argument for display
 */
function extractPrimaryArg(args, _functionName) {
  if (!args) return "";

  // Priority order for common argument keys
  const priorityKeys = [
    "path",
    "file_path",
    "filename",
    "url",
    "urls", // Tavily extract (array)
    "query", // Tavily search
    "pattern",
    "thought",
    "name",
    "command",
    "code",
  ];

  // If args is a string (streaming JSON), try regex extraction first
  if (typeof args === "string") {
    // Try regex extraction for partial JSON (works during streaming)
    for (const key of priorityKeys) {
      const value = extractFromPartialJson(args, key);
      if (value && value.length > 0) {
        // Truncate long values
        return value.length > 60 ? `${value.substring(0, 57)}...` : value;
      }
    }

    // Fall back to full JSON parse if regex didn't find anything
    const parsed = safeParse(args, {});
    if (typeof parsed !== "object" || parsed === null) return "";

    for (const key of priorityKeys) {
      if (parsed[key]) {
        const value = formatArgValue(parsed[key]);
        if (value) return value;
      }
    }

    // Fallback: use first string value found (skip short enum-like values)
    for (const value of Object.values(parsed)) {
      if (typeof value === "string" && value.length > 3) {
        return value.length > 60 ? `${value.substring(0, 57)}...` : value;
      }
    }

    return "";
  }

  // Handle object args directly
  if (typeof args !== "object" || args === null) return String(args);

  for (const key of priorityKeys) {
    if (args[key]) {
      const value = formatArgValue(args[key]);
      if (value) return value;
    }
  }

  // Fallback: use first string value found (skip short enum-like values)
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.length > 3) {
      return value.length > 60 ? `${value.substring(0, 57)}...` : value;
    }
  }

  return "";
}

/**
 * Format an argument value for display, handling strings and arrays
 * @param {any} val - Value to format
 * @returns {string} Formatted value or empty string
 */
function formatArgValue(val) {
  if (Array.isArray(val)) {
    // For arrays, show first item (e.g., urls array)
    const first = val[0];
    if (typeof first === "string" && first.length > 0) {
      const suffix = val.length > 1 ? ` (+${val.length - 1})` : "";
      const display = first.length > 50 ? `${first.substring(0, 47)}...` : first;
      return display + suffix;
    }
    return "";
  }
  if (typeof val === "string" && val.length > 0) {
    return val.length > 60 ? `${val.substring(0, 57)}...` : val;
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
    summarize_conversation: "Summarize",
    summarizeconversation: "Summarize",
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
    // Code interpreter
    execute_python_code: "Code",
    executepythoncode: "Code",
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
  // Require callId for reliability; skip rendering orphan calls without IDs
  if (!callId) {
    return null;
  }

  // If a card already exists in the DOM for this call_id, reuse it and sync activeCalls
  const existingElement = document.getElementById(`function-${callId}`);
  if (existingElement) {
    let existingCard = activeCalls.get(callId);
    if (!existingCard) {
      existingCard = {
        id: callId,
        name: functionName,
        rawName: functionName,
        element: existingElement,
        timestamp: Date.now(),
        cleanupTimerId: null,
      };
    } else if (!existingCard.element) {
      existingCard = { ...existingCard, element: existingElement };
    }
    activeCalls.set(callId, existingCard);
    return existingCard;
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
    const currentAssistantId = appState?.message?.currentAssistantId;
    if (currentAssistantId) {
      // Find the streaming message element by ID
      const assistantMessageDiv = chatContainer.querySelector(`[data-message-id="${currentAssistantId}"]`);

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
 * Render code interpreter output with syntax highlighting, images, and file downloads
 * @param {Object} result - Parsed result from execute_python_code
 * @returns {HTMLElement} Rendered output element
 */
function renderCodeInterpreterOutput(result) {
  const container = document.createElement("div");
  container.className = "code-interpreter-output";

  // Show stdout if present
  if (result.stdout?.trim()) {
    const stdoutSection = document.createElement("div");
    stdoutSection.className = "code-output-section";

    const stdoutLabel = document.createElement("div");
    stdoutLabel.className = "disclosure-section-label";
    stdoutLabel.textContent = "Output";
    stdoutSection.appendChild(stdoutLabel);

    const stdoutPre = document.createElement("pre");
    stdoutPre.className = "code-output-terminal";
    stdoutPre.textContent = result.stdout;
    stdoutSection.appendChild(stdoutPre);

    container.appendChild(stdoutSection);
  }

  // Show stderr if present
  if (result.stderr?.trim()) {
    const stderrSection = document.createElement("div");
    stderrSection.className = "code-output-section code-output-error";

    const stderrLabel = document.createElement("div");
    stderrLabel.className = "disclosure-section-label";
    stderrLabel.textContent = "Errors";
    stderrSection.appendChild(stderrLabel);

    const stderrPre = document.createElement("pre");
    stderrPre.className = "code-output-terminal";
    stderrPre.textContent = result.stderr;
    stderrSection.appendChild(stderrPre);

    container.appendChild(stderrSection);
  }

  // Show generated files
  if (result.files && result.files.length > 0) {
    const filesSection = document.createElement("div");
    filesSection.className = "code-output-section";

    const filesLabel = document.createElement("div");
    filesLabel.className = "disclosure-section-label";
    filesLabel.textContent = "Generated Files";
    filesSection.appendChild(filesLabel);

    const filesContainer = document.createElement("div");
    filesContainer.className = "code-output-files";

    for (const file of result.files) {
      if (file.type?.startsWith("image/") && file.base64) {
        // Render inline image
        const imageContainer = document.createElement("div");
        imageContainer.className = "code-output-image-container";

        const img = document.createElement("img");
        img.className = "code-output-image";
        img.src = `data:${file.type};base64,${file.base64}`;
        img.alt = file.name || "Generated image";
        img.title = file.name || "Generated image";
        imageContainer.appendChild(img);

        const imageCaption = document.createElement("div");
        imageCaption.className = "code-output-image-caption";
        imageCaption.textContent = file.name || "Untitled";
        imageContainer.appendChild(imageCaption);

        filesContainer.appendChild(imageContainer);
      } else {
        // Render file download link
        const fileItem = document.createElement("div");
        fileItem.className = "code-output-file-item";

        const fileIcon = document.createElement("span");
        fileIcon.className = "code-output-file-icon";
        fileIcon.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/></svg>';
        fileItem.appendChild(fileIcon);

        const fileInfo = document.createElement("div");
        fileInfo.className = "code-output-file-info";

        const fileName = document.createElement("div");
        fileName.className = "code-output-file-name";
        fileName.textContent = file.name || "Untitled";
        fileInfo.appendChild(fileName);

        const fileSize = document.createElement("div");
        fileSize.className = "code-output-file-size";
        fileSize.textContent = formatFileSize(file.size || 0);
        fileInfo.appendChild(fileSize);

        fileItem.appendChild(fileInfo);

        const downloadBtn = document.createElement("button");
        downloadBtn.className = "code-output-download-btn";
        downloadBtn.title = "Download file";
        downloadBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
        downloadBtn.onclick = async () => {
          await downloadFile(file);
        };
        fileItem.appendChild(downloadBtn);

        filesContainer.appendChild(fileItem);
      }
    }

    filesSection.appendChild(filesContainer);
    container.appendChild(filesSection);
  }

  // Show execution metadata
  if (result.execution_time_ms !== undefined) {
    const metaSection = document.createElement("div");
    metaSection.className = "code-output-meta";
    metaSection.textContent = `Executed in ${result.execution_time_ms}ms`;
    container.appendChild(metaSection);
  }

  return container;
}

/**
 * Render web search results in a visually appealing card format
 * @param {Object} result - Parsed Tavily search response
 * @param {string} query - The search query used
 * @returns {HTMLElement} Container with formatted search results
 */
function renderWebSearchResults(result, query) {
  const container = document.createElement("div");
  container.className = "web-search-results";

  // Parse results - handle various formats
  let results = [];

  // Handle MCP response format: {type: "text", text: "...", annotations, meta}
  if (result?.type === "text" && result?.text) {
    results = parseTextSearchResults(result.text);
  } else if (Array.isArray(result)) {
    results = result;
  } else if (result?.results && Array.isArray(result.results)) {
    results = result.results;
  } else if (typeof result === "string") {
    // Parse Tavily MCP text format:
    // "Detailed Results:\n\nTitle: ...\nURL: ...\nContent: ...\n\nTitle: ..."
    results = parseTextSearchResults(result);
  } else if (typeof result === "object" && result !== null) {
    // Try to extract from object properties
    if (result.results) results = Array.isArray(result.results) ? result.results : [result.results];
    else if (result.data) results = Array.isArray(result.data) ? result.data : [result.data];
  }

  // Header with query and result count
  const header = document.createElement("div");
  header.className = "web-search-header";

  const queryContainer = document.createElement("div");
  queryContainer.className = "web-search-query-container";

  const globeIcon = document.createElement("span");
  globeIcon.className = "web-search-globe";
  globeIcon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
  queryContainer.appendChild(globeIcon);

  const queryText = document.createElement("span");
  queryText.className = "web-search-query";
  queryText.textContent = query || "Web Search";
  queryContainer.appendChild(queryText);

  header.appendChild(queryContainer);

  const resultCount = document.createElement("span");
  resultCount.className = "web-search-count";
  resultCount.textContent = `${results.length} result${results.length !== 1 ? "s" : ""}`;
  header.appendChild(resultCount);

  container.appendChild(header);

  // Results list
  const resultsList = document.createElement("div");
  resultsList.className = "web-search-list";

  for (const item of results) {
    const resultItem = document.createElement("a");
    resultItem.className = "web-search-item";
    resultItem.href = item.url || "#";
    resultItem.target = "_blank";
    resultItem.rel = "noopener noreferrer";

    // Favicon
    const favicon = document.createElement("img");
    favicon.className = "web-search-favicon";
    const domain = extractDomain(item.url);
    favicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    favicon.alt = "";
    favicon.onerror = () => {
      // Fallback to generic icon on error
      favicon.style.display = "none";
      const fallbackIcon = document.createElement("span");
      fallbackIcon.className = "web-search-favicon-fallback";
      fallbackIcon.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
      resultItem.insertBefore(fallbackIcon, resultItem.firstChild);
    };
    resultItem.appendChild(favicon);

    // Title and domain container
    const textContainer = document.createElement("div");
    textContainer.className = "web-search-text";

    const title = document.createElement("span");
    title.className = "web-search-title";
    title.textContent = item.title || "Untitled";
    title.title = item.title || "";
    textContainer.appendChild(title);

    resultItem.appendChild(textContainer);

    // Domain
    const domainSpan = document.createElement("span");
    domainSpan.className = "web-search-domain";
    domainSpan.textContent = domain;
    resultItem.appendChild(domainSpan);

    resultsList.appendChild(resultItem);
  }

  container.appendChild(resultsList);

  return container;
}

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} Domain name
 */
function extractDomain(url) {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Parse Tavily MCP text format search results
 * Format: "Detailed Results:\n\nTitle: ...\nURL: ...\nContent: ...\n\nTitle: ..."
 * @param {string} text - Raw text response from Tavily
 * @returns {Array<{title: string, url: string, content: string}>} Parsed results
 */
function parseTextSearchResults(text) {
  const results = [];

  if (!text || typeof text !== "string") {
    return results;
  }

  // Split by "Title:" to get individual results
  // First split removes the header "Detailed Results:" if present
  const cleanText = text.replace(/^Detailed Results:\s*/i, "");

  // Split on "Title:" but keep the delimiter for parsing
  const chunks = cleanText.split(/(?=Title:)/i).filter((chunk) => chunk.trim());

  for (const chunk of chunks) {
    const result = { title: "", url: "", content: "" };

    // Extract Title
    const titleMatch = chunk.match(/Title:\s*(.+?)(?=\nURL:|\n\n|$)/is);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
    }

    // Extract URL (handle both Content: and Raw Content: as next field)
    const urlMatch = chunk.match(/URL:\s*(.+?)(?=\nContent:|\nRaw Content:|\n\n|$)/is);
    if (urlMatch) {
      result.url = urlMatch[1].trim();
    }

    // Extract Content (check both "Content:" and "Raw Content:" for tavily-extract)
    const contentMatch = chunk.match(/Content:\s*(.+?)(?=\nRaw Content:|\nTitle:|\n\n\n|$)/is);
    if (contentMatch && contentMatch[1].trim() !== "undefined") {
      result.content = contentMatch[1].trim();
    }

    // Extract Raw Content (tavily-extract uses this instead of Content)
    const rawContentMatch = chunk.match(/Raw Content:\s*(.+?)(?=\nTitle:|\n\n\n|$)/is);
    if (rawContentMatch) {
      // Prefer Raw Content over Content (which is often "undefined" in extract)
      result.content = rawContentMatch[1].trim();
    }

    // Only add if we have at least a title or URL
    if (result.title || result.url) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Render web content extraction results (fetch, tavily-extract)
 * Shows URL, content preview, and stats
 * @param {Object|string} result - Parsed result or text content
 * @param {string} url - The source URL
 * @param {string} toolType - "fetch" or "extract" for labeling
 * @returns {HTMLElement} Container with formatted content
 */
function renderWebContentResult(result, url, toolType = "fetch") {
  const container = document.createElement("div");
  container.className = "web-content-result";

  // Extract text content from various formats
  let textContent = "";
  let extractedUrl = url;
  let extractedTitle = "";

  if (typeof result === "string") {
    textContent = result;
  } else if (result?.type === "text" && result?.text) {
    textContent = result.text;
  } else if (result?.content) {
    textContent = result.content;
  } else if (result?.text) {
    textContent = result.text;
  } else if (typeof result === "object") {
    textContent = JSON.stringify(result, null, 2);
  }

  // For tavily-extract, parse the "Detailed Results" format to get actual content
  if (toolType === "tavily-extract" || toolType === "tavily_extract" || toolType === "tavilyextract") {
    // Check if this looks like the Detailed Results format
    if (textContent.includes("Raw Content:") || textContent.includes("Title:")) {
      // Extract URL from response if not provided
      const urlMatch = textContent.match(/URL:\s*(.+?)(?=\nContent:|\nRaw Content:|\n\n|$)/i);
      if (urlMatch && !extractedUrl) {
        extractedUrl = urlMatch[1].trim();
      }

      // Extract Title
      const titleMatch = textContent.match(/Title:\s*(.+?)(?=\nURL:|\n\n|$)/i);
      if (titleMatch) {
        extractedTitle = titleMatch[1].trim();
      }

      // Extract Raw Content (preferred) or Content
      const rawContentMatch = textContent.match(/Raw Content:\s*([\s\S]+?)(?=\n\nTitle:|\n\n\n|$)/i);
      if (rawContentMatch) {
        textContent = rawContentMatch[1].trim();
      } else {
        const contentMatch = textContent.match(/Content:\s*(.+?)(?=\nRaw Content:|\nTitle:|\n\n\n|$)/is);
        if (contentMatch && contentMatch[1].trim() !== "undefined") {
          textContent = contentMatch[1].trim();
        }
      }
    }
  }

  // Use extracted URL
  url = extractedUrl;

  // Check if there's meaningful content before calculating stats
  const meaningfulContent = textContent?.trim() && textContent.trim() !== "Detailed Results:";

  // Calculate stats only if there's content
  const wordCount = meaningfulContent ? textContent.split(/\s+/).filter((w) => w.length > 0).length : 0;
  const readTime = meaningfulContent ? Math.max(1, Math.ceil(wordCount / 200)) : 0;

  // Show title if extracted (for tavily-extract)
  if (extractedTitle) {
    const titleEl = document.createElement("div");
    titleEl.className = "web-content-title";
    titleEl.textContent = extractedTitle;
    container.appendChild(titleEl);
  }

  // Header with URL
  const header = document.createElement("div");
  header.className = "web-content-header";

  // URL info (favicon + domain + full url)
  const urlContainer = document.createElement("a");
  urlContainer.className = "web-content-url";
  urlContainer.href = url || "#";
  urlContainer.target = "_blank";
  urlContainer.rel = "noopener noreferrer";

  const favicon = document.createElement("img");
  favicon.className = "web-content-favicon";
  const domain = extractDomain(url);
  favicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  favicon.alt = "";
  favicon.onerror = () => {
    favicon.style.display = "none";
  };
  urlContainer.appendChild(favicon);

  const urlText = document.createElement("span");
  urlText.className = "web-content-url-text";
  urlText.textContent = url || "Unknown URL";
  urlText.title = url || "";
  urlContainer.appendChild(urlText);

  header.appendChild(urlContainer);

  // Stats badge - only show if there's meaningful content
  if (meaningfulContent) {
    const stats = document.createElement("div");
    stats.className = "web-content-stats";
    stats.innerHTML = `
      <span class="web-content-stat">${wordCount.toLocaleString()} words</span>
      <span class="web-content-stat-divider">·</span>
      <span class="web-content-stat">${readTime} min read</span>
    `;
    header.appendChild(stats);
  }

  container.appendChild(header);

  // Content display - render as markdown
  const contentContainer = document.createElement("div");
  contentContainer.className = "web-content-preview";

  if (meaningfulContent) {
    const content = document.createElement("div");
    content.className = "web-content-markdown";
    content.innerHTML = renderMarkdown(textContent, true);
    contentContainer.appendChild(content);
  } else {
    // Show empty state message
    const emptyState = document.createElement("div");
    emptyState.className = "web-content-empty";
    emptyState.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>No content extracted from this URL</span>
    `;
    contentContainer.appendChild(emptyState);
  }

  container.appendChild(contentContainer);

  return container;
}

/**
 * Render crawl results (tavily-crawl)
 * Shows base URL header with list of crawled pages and their content
 * @param {Object|string} result - Crawl result data
 * @returns {HTMLElement} Container with formatted crawl results
 */
function renderCrawlResults(result) {
  const container = document.createElement("div");
  container.className = "crawl-results";

  // Parse the result
  let textContent = "";
  if (typeof result === "string") {
    textContent = result;
  } else if (result?.type === "text" && result?.text) {
    textContent = result.text;
  } else if (typeof result === "object") {
    textContent = JSON.stringify(result, null, 2);
  }

  // Parse crawl results from text format
  // Format: "Crawl Results:\nBase URL: ...\n\nCrawled Pages:\n\n[1] URL: ...\nContent: ..."
  const baseUrlMatch = textContent.match(/Base URL:\s*(.+?)(?=\n|$)/i);
  const baseUrl = baseUrlMatch ? baseUrlMatch[1].trim() : "";

  // Parse individual page results - split on numbered entries like [1], [2], etc.
  const pages = [];
  const pageChunks = textContent.split(/\n\[\d+\]\s*/i).filter((chunk) => chunk.includes("URL:"));

  for (const chunk of pageChunks) {
    // URL comes first, then Content
    const urlMatch = chunk.match(/URL:\s*(.+?)(?=\nContent:|\n\n|$)/i);
    const contentMatch = chunk.match(/Content:\s*([\s\S]+?)(?=\n\[\d+\]|\n\n\n|$)/i);

    if (urlMatch) {
      pages.push({
        url: urlMatch[1].trim(),
        content: contentMatch ? contentMatch[1].trim() : "",
      });
    }
  }

  // Header
  const header = document.createElement("div");
  header.className = "crawl-header";

  const domain = extractDomain(baseUrl);

  // Favicon for the domain
  const headerFavicon = document.createElement("img");
  headerFavicon.className = "crawl-header-favicon";
  headerFavicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  headerFavicon.alt = "";
  headerFavicon.onerror = () => {
    headerFavicon.style.display = "none";
  };
  header.appendChild(headerFavicon);

  const headerText = document.createElement("div");
  headerText.className = "crawl-header-text";
  headerText.innerHTML = `
    <span class="crawl-domain">${domain || "Unknown domain"}</span>
    <span class="crawl-count">Crawled ${pages.length} page${pages.length !== 1 ? "s" : ""}</span>
  `;
  header.appendChild(headerText);

  container.appendChild(header);

  // Pages list
  if (pages.length > 0) {
    const pagesList = document.createElement("div");
    pagesList.className = "crawl-pages";

    for (const page of pages) {
      const pageCard = document.createElement("div");
      pageCard.className = "crawl-page";

      // Page header with URL
      const pageHeader = document.createElement("div");
      pageHeader.className = "crawl-page-header";

      const favicon = document.createElement("img");
      favicon.className = "crawl-page-favicon";
      const pageDomain = extractDomain(page.url);
      favicon.src = `https://www.google.com/s2/favicons?domain=${pageDomain}&sz=32`;
      favicon.alt = "";
      favicon.onerror = () => {
        favicon.style.display = "none";
      };
      pageHeader.appendChild(favicon);

      const pageUrl = document.createElement("a");
      pageUrl.className = "crawl-page-url";
      pageUrl.href = page.url;
      pageUrl.target = "_blank";
      pageUrl.rel = "noopener noreferrer";
      pageUrl.textContent = page.url;
      pageUrl.title = page.url;
      pageHeader.appendChild(pageUrl);

      // Stats
      if (page.content) {
        const wordCount = page.content.split(/\s+/).filter((w) => w.length > 0).length;
        const stats = document.createElement("span");
        stats.className = "crawl-page-stats";
        stats.textContent = `${wordCount.toLocaleString()} words`;
        pageHeader.appendChild(stats);
      }

      pageCard.appendChild(pageHeader);

      // Collapsible content
      if (page.content) {
        const contentToggle = document.createElement("button");
        contentToggle.className = "crawl-content-toggle";
        contentToggle.textContent = "Show content";
        contentToggle.onclick = () => {
          const isExpanded = contentWrapper.classList.toggle("expanded");
          contentToggle.textContent = isExpanded ? "Hide content" : "Show content";
        };
        pageCard.appendChild(contentToggle);

        const contentWrapper = document.createElement("div");
        contentWrapper.className = "crawl-content-wrapper";

        const content = document.createElement("pre");
        content.className = "crawl-page-content";
        content.textContent = page.content;
        contentWrapper.appendChild(content);

        pageCard.appendChild(contentWrapper);
      }

      pagesList.appendChild(pageCard);
    }

    container.appendChild(pagesList);
  } else {
    // Empty state
    const emptyState = document.createElement("div");
    emptyState.className = "crawl-empty";
    emptyState.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>No pages were crawled</span>
    `;
    container.appendChild(emptyState);
  }

  return container;
}

/**
 * Render map results (tavily-map)
 * Shows a visual sitemap with grouped URLs
 * @param {Object|string} result - Map result data
 * @returns {HTMLElement} Container with formatted map results
 */
function renderMapResults(result) {
  const container = document.createElement("div");
  container.className = "map-results";

  // Parse the result
  let textContent = "";
  if (typeof result === "string") {
    textContent = result;
  } else if (result?.type === "text" && result?.text) {
    textContent = result.text;
  } else if (typeof result === "object") {
    textContent = JSON.stringify(result, null, 2);
  }

  // Parse map results - extract base URL and all discovered URLs
  const baseUrlMatch = textContent.match(/Base URL:\s*(.+?)(?=\n|$)/i);
  const baseUrl = baseUrlMatch ? baseUrlMatch[1].trim() : "";

  // Extract all URLs from the results
  const urls = [];
  const urlMatches = textContent.matchAll(/https?:\/\/[^\s\n"'\]]+/gi);
  for (const match of urlMatches) {
    const url = match[0].replace(/[,\]}"']$/, ""); // Clean trailing chars
    if (!urls.includes(url) && url !== baseUrl) {
      urls.push(url);
    }
  }

  // Group URLs by path prefix
  const groups = {};
  const baseDomain = extractDomain(baseUrl || urls[0] || "");

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter((p) => p);
      const groupKey = pathParts[0] || "(root)";

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(url);
    } catch {
      // Invalid URL, skip
    }
  }

  // Header
  const header = document.createElement("div");
  header.className = "map-header";

  // Favicon for the domain
  const favicon = document.createElement("img");
  favicon.className = "map-header-favicon";
  favicon.src = `https://www.google.com/s2/favicons?domain=${baseDomain}&sz=32`;
  favicon.alt = "";
  favicon.onerror = () => {
    // Replace with map icon on error
    favicon.style.display = "none";
  };
  header.appendChild(favicon);

  const headerText = document.createElement("div");
  headerText.className = "map-header-text";
  headerText.innerHTML = `
    <span class="map-domain">${baseDomain || "Unknown domain"}</span>
    <span class="map-count">Found ${urls.length} URL${urls.length !== 1 ? "s" : ""}</span>
  `;
  header.appendChild(headerText);

  container.appendChild(header);

  // URL groups
  if (Object.keys(groups).length > 0) {
    const groupsContainer = document.createElement("div");
    groupsContainer.className = "map-groups";

    const sortedGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

    for (const [groupName, groupUrls] of sortedGroups) {
      const group = document.createElement("div");
      group.className = "map-group";

      const groupHeader = document.createElement("div");
      groupHeader.className = "map-group-header";
      groupHeader.innerHTML = `
        <span class="map-group-name">/${groupName}</span>
        <span class="map-group-count">${groupUrls.length}</span>
      `;

      // Make group collapsible
      groupHeader.onclick = () => {
        group.classList.toggle("collapsed");
      };

      group.appendChild(groupHeader);

      const groupUrls_el = document.createElement("div");
      groupUrls_el.className = "map-group-urls";

      for (const url of groupUrls.slice(0, 10)) {
        // Show max 10 per group initially
        const urlLink = document.createElement("a");
        urlLink.className = "map-url";
        urlLink.href = url;
        urlLink.target = "_blank";
        urlLink.rel = "noopener noreferrer";

        // Show just the path part
        try {
          const urlObj = new URL(url);
          urlLink.textContent = urlObj.pathname + urlObj.search;
        } catch {
          urlLink.textContent = url;
        }
        urlLink.title = url;

        groupUrls_el.appendChild(urlLink);
      }

      // Show "and X more" if there are more URLs
      if (groupUrls.length > 10) {
        const moreCount = document.createElement("span");
        moreCount.className = "map-more-count";
        moreCount.textContent = `and ${groupUrls.length - 10} more...`;
        groupUrls_el.appendChild(moreCount);
      }

      group.appendChild(groupUrls_el);
      groupsContainer.appendChild(group);
    }

    container.appendChild(groupsContainer);
  } else {
    // Empty state
    const emptyState = document.createElement("div");
    emptyState.className = "map-empty";
    emptyState.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>No URLs discovered</span>
    `;
    container.appendChild(emptyState);
  }

  return container;
}

/**
 * Get file type icon and language for syntax highlighting
 * @param {string} filename - The filename
 * @returns {{icon: string, lang: string, label: string}}
 */
function getFileTypeInfo(filename) {
  const ext = filename?.split(".").pop()?.toLowerCase() || "";

  // SVG icons for file types (using currentColor for theming)
  const icons = {
    fileText:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
    braces:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>',
    python:
      '<svg viewBox="0 0 32 32" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.016 2C10.82 2 9.038 3.725 9.038 5.852V8.52h6.885v.74H5.978C3.781 9.26 2 10.984 2 13.111v5.778c0 2.127 1.781 3.852 3.978 3.852h2.295v-3.26c0-2.127 1.781-3.852 3.978-3.852h7.344c1.86 0 3.366-1.459 3.366-3.26V5.853C22.962 3.724 21.18 2 18.984 2h-5.968zm-0.918 4.74a1.377 1.377 0 1 0 0-2.666 1.377 1.377 0 0 0 0 2.667z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M18.983 30c2.197 0 3.978-1.725 3.978-3.852v-2.667h-6.885v-.74h10.946c2.197 0 3.978-1.725 3.978-3.852v-5.778c0-2.127-1.781-3.852-3.978-3.852h-2.295v3.26c0 2.127-1.781 3.852-3.978 3.852h-7.344c-1.86 0-3.366 1.459-3.366 3.259v6.518c0 2.128 1.781 3.852 3.978 3.852h5.966zm.918-4.74a1.377 1.377 0 1 0 0 2.666 1.377 1.377 0 0 0 0-2.667z"/></svg>',
    javascript:
      '<svg viewBox="0 0 32 32" fill="currentColor"><rect x="2" y="2" width="28" height="28"/><path d="M19 25.288l2.062-1.364c.161.508 1.184 1.713 2.477 1.713 1.292 0 1.892-.706 1.892-1.174 0-1.275-1.32-1.724-1.953-1.94l-.247-.09c-.03-.013-.075-.03-.133-.052-.707-.27-3.308-1.264-3.308-4.144 0-3.172 3.062-3.537 3.754-3.537.453 0 2.631.056 3.715 2.094l-2 1.396c-.439-.888-1.167-1.182-1.616-1.182-1.107 0-1.338.812-1.338 1.182 0 1.037 1.204 1.502 2.22 1.894l.734.303C26.369 20.91 28 21.767 28 24.463c0 1.35-1.133 3.537-3.985 3.537-3.83 0-4.846-2.3-5.015-2.712z" fill="var(--color-surface-1)"/><path d="M9 25.559l2.149-1.364c.168.507.822 1.443 1.771 1.443.95 0 1.436-.975 1.436-1.443V15h2.642v9.195c.043 1.269-.66 3.805-3.764 3.805-3.054 0-4.041-1.696-4.234-2.441z" fill="var(--color-surface-1)"/></svg>',
    typescript:
      '<svg viewBox="0 0 32 32" fill="currentColor"><rect x="2" y="2" width="28" height="28"/><path d="M18.245 23.759v3.068a6.492 6.492 0 0 0 1.764.575 11.56 11.56 0 0 0 2.146.192 9.968 9.968 0 0 0 2.088-.211 5.11 5.11 0 0 0 1.735-.7 3.542 3.542 0 0 0 1.181-1.266 4.469 4.469 0 0 0 .186-3.394 3.409 3.409 0 0 0-.717-1.117 5.236 5.236 0 0 0-1.123-.877 12.027 12.027 0 0 0-1.477-.734q-.6-.249-1.08-.484a5.5 5.5 0 0 1-.813-.479 2.089 2.089 0 0 1-.516-.518 1.091 1.091 0 0 1-.181-.618 1.039 1.039 0 0 1 .162-.571 1.4 1.4 0 0 1 .459-.436 2.439 2.439 0 0 1 .726-.283 4.211 4.211 0 0 1 .956-.1 5.942 5.942 0 0 1 .808.058 6.292 6.292 0 0 1 .856.177 5.994 5.994 0 0 1 .836.3 4.657 4.657 0 0 1 .751.422V13.9a7.509 7.509 0 0 0-1.525-.4 12.426 12.426 0 0 0-1.9-.129 8.767 8.767 0 0 0-2.064.235 5.239 5.239 0 0 0-1.716.733 3.655 3.655 0 0 0-1.171 1.271 3.731 3.731 0 0 0-.431 1.845 3.588 3.588 0 0 0 .789 2.34 6 6 0 0 0 2.395 1.639q.63.26 1.175.509a6.458 6.458 0 0 1 .942.517 2.463 2.463 0 0 1 .626.585 1.2 1.2 0 0 1 .23.719 1.1 1.1 0 0 1-.144.552 1.269 1.269 0 0 1-.435.441 2.381 2.381 0 0 1-.726.292 4.377 4.377 0 0 1-1.018.105 5.773 5.773 0 0 1-1.969-.35 5.874 5.874 0 0 1-1.805-1.045zm-5.154-7.638h4V13.594H5.938v2.527H9.92V27.375h3.171z" fill="var(--color-surface-1)"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
    yaml: '<svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="nonzero" clip-rule="nonzero" d="M0.828288 0.135541C1.17426 -0.103975 1.64888 -0.017679 1.8884 0.328288L3.58007 2.77182L5.48344 0.297431C5.74 -0.0360947 6.21836 -0.0984891 6.55189 0.158069C6.88541 0.414627 6.94781 0.892984 6.69125 1.22651L4.30958 4.32268V7.11115C4.30958 7.53194 3.96846 7.87305 3.54767 7.87305C3.12689 7.87305 2.78577 7.53194 2.78577 7.11115V4.30154L0.635541 1.19565C0.396025 0.849685 0.482321 0.375057 0.828288 0.135541ZM8.88099 6.89044e-05C9.18311 6.89044e-05 9.45669 0.178586 9.57837 0.455123L12.372 6.8043C12.5415 7.18945 12.3666 7.63906 11.9815 7.80853C11.5963 7.978 11.1467 7.80315 10.9772 7.418L10.2835 5.84131H7.47847L6.78473 7.418C6.61526 7.80315 6.16565 7.978 5.7805 7.80853C5.39535 7.63906 5.2205 7.18945 5.38997 6.8043L8.18361 0.455123C8.30528 0.178586 8.57886 6.89044e-05 8.88099 6.89044e-05ZM8.14894 4.31751H9.61303L8.88099 2.65377L8.14894 4.31751ZM9.60471 8.66615C9.92856 8.76179 10.1508 9.05918 10.1508 9.39685V15.2381C10.1508 15.6589 9.80971 16 9.38892 16C8.96813 16 8.62702 15.6589 8.62702 15.2381V11.9768L7.23495 14.1282C7.09962 14.3373 6.8706 14.4671 6.62164 14.4757C6.37268 14.4844 6.13523 14.3707 5.98576 14.1714L4.30958 11.9365V15.2381C4.30958 15.6589 3.96846 16 3.54767 16C3.12689 16 2.78577 15.6589 2.78577 15.2381V9.65082C2.78577 9.32288 2.99562 9.03172 3.30674 8.92802C3.61786 8.82431 3.96043 8.93132 4.1572 9.19368L6.5492 12.383L8.74925 8.98295C8.93269 8.69945 9.28086 8.57051 9.60471 8.66615ZM11.9286 8.63495C12.3494 8.63495 12.6905 8.97607 12.6905 9.39685V14.4762H14.7222C15.143 14.4762 15.4841 14.8173 15.4841 15.2381C15.4841 15.6589 15.143 16 14.7222 16H11.9286C11.5078 16 11.1667 15.6589 11.1667 15.2381V9.39685C11.1667 8.97607 11.5078 8.63495 11.9286 8.63495Z"/></svg>',
    html: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="0" fill="none" width="20" height="20"/><g><path d="M4 16v-2H2v2H1v-5h1v2h2v-2h1v5H4zM7 16v-4H5.6v-1h3.7v1H8v4H7zM10 16v-5h1l1.4 3.4h.1L14 11h1v5h-1v-3.1h-.1l-1.1 2.5h-.6l-1.1-2.5H11V16h-1zM19 16h-3v-5h1v4h2v1zM9.4 4.2L7.1 6.5l2.3 2.3-.6 1.2-3.5-3.5L8.8 3l.6 1.2zm1.2 4.6l2.3-2.3-2.3-2.3.6-1.2 3.5 3.5-3.5 3.5-.6-1.2z"/></g></svg>',
    css: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5C7.44772 5 7 5.44772 7 6C7 6.55228 7.44772 7 8 7H12.2344L8.50386 9.13176C8.11017 9.35672 7.91712 9.81842 8.0335 10.2567C8.14988 10.6949 8.54657 11 9 11H13.8C13.9105 11 14 11.0895 14 11.2V13.5029C14 13.556 13.9789 13.6069 13.9414 13.6444L12.1414 15.4444C12.0633 15.5225 11.9367 15.5225 11.8586 15.4444L9.70711 13.2929C9.31658 12.9024 8.68342 12.9024 8.2929 13.2929C7.90237 13.6834 7.90237 14.3166 8.2929 14.7071L11.2929 17.7071C11.6834 18.0976 12.3166 18.0976 12.7071 17.7071L15.7071 14.7071C15.8946 14.5196 16 14.2652 16 14V10C16 9.44772 15.5523 9 15 9H12.7656L16.4961 6.86824C16.8898 6.64328 17.0829 6.18158 16.9665 5.74333C16.8501 5.30509 16.4534 5 16 5H8Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M4.30602 1C2.48038 1 1.07799 2.61696 1.33617 4.42426L2.90519 15.4074C3.00668 16.1178 3.35946 16.7683 3.89953 17.2409L10.0245 22.6002C11.1556 23.5899 12.8444 23.5899 13.9755 22.6002L20.1005 17.2409C20.6405 16.7683 20.9933 16.1178 21.0948 15.4074L22.6638 4.42426C22.922 2.61696 21.5196 1 19.694 1H4.30602ZM3.31607 4.14142C3.23001 3.53899 3.69747 3 4.30602 3H19.694C20.3025 3 20.77 3.53899 20.6839 4.14142L19.1149 15.1245C19.0811 15.3613 18.9635 15.5782 18.7835 15.7357L12.6585 21.095C12.2815 21.4249 11.7185 21.4249 11.3415 21.095L5.21653 15.7357C5.03651 15.5782 4.91892 15.3613 4.88509 15.1245L3.31607 4.14142Z"/></svg>',
    shell:
      '<svg viewBox="0 0 512 512" fill="currentColor"><path d="M77.554,296.055l101.189-39.863v-0.611L77.554,215.413v-44.464l154.539,68.379v32.807L77.554,340.514 V296.055z M434.446,343.887v39.863H251.7v-39.863H434.446z M468.917,0.5H43.083C19.662,0.5,0.5,19.663,0.5,43.083v425.833 c0,23.421,19.162,42.583,42.583,42.583h425.834c23.421,0,42.583-19.162,42.583-42.583V43.083C511.5,19.663,492.338,0.5,468.917,0.5 z M468.917,468.917H43.083V106.958h425.834V468.917z"/></svg>',
  };

  const types = {
    md: { icon: icons.fileText, lang: "markdown", label: "Markdown" },
    markdown: { icon: icons.fileText, lang: "markdown", label: "Markdown" },
    py: { icon: icons.python, lang: "python", label: "Python" },
    js: { icon: icons.javascript, lang: "javascript", label: "JavaScript" },
    ts: { icon: icons.typescript, lang: "typescript", label: "TypeScript" },
    tsx: { icon: icons.typescript, lang: "typescript", label: "TypeScript" },
    jsx: { icon: icons.javascript, lang: "javascript", label: "JavaScript" },
    json: { icon: icons.braces, lang: "json", label: "JSON" },
    yaml: { icon: icons.yaml, lang: "yaml", label: "YAML" },
    yml: { icon: icons.yaml, lang: "yaml", label: "YAML" },
    html: { icon: icons.html, lang: "html", label: "HTML" },
    htm: { icon: icons.html, lang: "html", label: "HTML" },
    css: { icon: icons.css, lang: "css", label: "CSS" },
    scss: { icon: icons.css, lang: "scss", label: "SCSS" },
    sass: { icon: icons.css, lang: "sass", label: "Sass" },
    less: { icon: icons.css, lang: "less", label: "Less" },
    sql: { icon: icons.braces, lang: "sql", label: "SQL" },
    sh: { icon: icons.shell, lang: "bash", label: "Shell" },
    bash: { icon: icons.shell, lang: "bash", label: "Shell" },
    zsh: { icon: icons.shell, lang: "bash", label: "Shell" },
    txt: { icon: icons.fileText, lang: "text", label: "Text" },
  };
  // Default to markdown-style document icon for unknown types
  return types[ext] || { icon: icons.fileText, lang: "text", label: ext.toUpperCase() || "File" };
}

// Folder icon constant for reuse
const FOLDER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';

/**
 * Render generate_document arguments with pretty formatting
 * Shows filename header and rendered content preview
 * @param {Object} parsedArgs - Parsed arguments object
 * @returns {HTMLElement} Formatted args display
 */
function renderGenerateDocumentArgs(parsedArgs) {
  const container = document.createElement("div");
  container.className = "generate-doc-args";

  const filename = parsedArgs.filename || "untitled";
  const content = parsedArgs.content || "";
  const fileInfo = getFileTypeInfo(filename);

  // Header with filename and file type
  const header = document.createElement("div");
  header.className = "generate-doc-header";

  const fileIcon = document.createElement("span");
  fileIcon.className = "generate-doc-icon";
  fileIcon.innerHTML = fileInfo.icon;
  header.appendChild(fileIcon);

  const fileNameEl = document.createElement("span");
  fileNameEl.className = "generate-doc-filename";
  fileNameEl.textContent = filename;
  header.appendChild(fileNameEl);

  const fileType = document.createElement("span");
  fileType.className = "generate-doc-type";
  fileType.textContent = fileInfo.label;
  header.appendChild(fileType);

  container.appendChild(header);

  // Content preview
  if (content) {
    const contentSection = document.createElement("div");
    contentSection.className = "generate-doc-content";

    // For markdown, render it; for code, syntax highlight
    if (fileInfo.lang === "markdown") {
      // Render as markdown
      const rendered = document.createElement("div");
      rendered.className = "generate-doc-markdown";
      rendered.innerHTML = renderMarkdown(content, true);
      contentSection.appendChild(rendered);
    } else {
      // Syntax highlight for code files
      const codePre = document.createElement("pre");
      codePre.className = "generate-doc-code";

      const codeEl = document.createElement("code");
      codeEl.className = `shiki language-${fileInfo.lang}`;

      // Syntax highlight, fall back to plain text for unknown languages
      if (fileInfo.lang !== "text") {
        codeEl.innerHTML = highlightCode(content, fileInfo.lang);
      } else {
        codeEl.textContent = content;
      }

      codePre.appendChild(codeEl);
      contentSection.appendChild(codePre);
    }

    container.appendChild(contentSection);
  }

  return container;
}

/**
 * Render read_file results with pretty formatting
 * Shows filename header and rendered content
 * @param {Object} result - Parsed result object
 * @returns {HTMLElement} Formatted result display
 */
function renderReadFileResult(result) {
  const container = document.createElement("div");
  container.className = "read-file-result";

  const filePath = result.file_path || "";
  const content = result.content || "";
  const size = result.size || 0;
  const format = result.format || "";

  // Extract filename from path
  const filename = filePath.split("/").pop() || "unknown";
  const fileInfo = getFileTypeInfo(filename);

  // Header with filename, size, and format
  const header = document.createElement("div");
  header.className = "read-file-header";

  const fileIcon = document.createElement("span");
  fileIcon.className = "read-file-icon";
  fileIcon.innerHTML = fileInfo.icon;
  header.appendChild(fileIcon);

  const fileNameEl = document.createElement("span");
  fileNameEl.className = "read-file-filename";
  fileNameEl.textContent = filename;
  fileNameEl.title = filePath;
  header.appendChild(fileNameEl);

  // Size badge
  const sizeEl = document.createElement("span");
  sizeEl.className = "read-file-size";
  sizeEl.textContent = formatFileSize(size);
  header.appendChild(sizeEl);

  // Format badge if present
  if (format) {
    const formatEl = document.createElement("span");
    formatEl.className = "read-file-format";
    formatEl.textContent = format;
    header.appendChild(formatEl);
  }

  container.appendChild(header);

  // Content preview - render as markdown since markitdown converts everything
  if (content) {
    const contentSection = document.createElement("div");
    contentSection.className = "read-file-content";

    const rendered = document.createElement("div");
    rendered.className = "read-file-markdown";
    rendered.innerHTML = renderMarkdown(content, true);
    contentSection.appendChild(rendered);

    container.appendChild(contentSection);
  }

  return container;
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Render edit_file result as a visual diff
 * @param {Object} result - The edit result containing diff
 * @returns {HTMLElement} Rendered diff element
 */
function renderEditFileResult(result) {
  const container = document.createElement("div");
  container.className = "edit-file-result";

  const diff = result.diff || "";
  const changesMade = result.changes_made || 0;

  // Extract filename from diff header (--- a/filename or +++ b/filename)
  const fileMatch = diff.match(/^[-+]{3}\s+[ab]\/(.+)$/m);
  const filename = fileMatch ? fileMatch[1] : "unknown";
  const fileInfo = getFileTypeInfo(filename);

  // Header with filename and changes count
  const header = document.createElement("div");
  header.className = "edit-file-header";

  const fileIcon = document.createElement("span");
  fileIcon.className = "edit-file-icon";
  fileIcon.innerHTML = fileInfo.icon;
  header.appendChild(fileIcon);

  const fileNameEl = document.createElement("span");
  fileNameEl.className = "edit-file-filename";
  fileNameEl.textContent = filename;
  header.appendChild(fileNameEl);

  const changesBadge = document.createElement("span");
  changesBadge.className = "edit-file-changes";
  changesBadge.textContent = `${changesMade} edit${changesMade !== 1 ? "s" : ""}`;
  header.appendChild(changesBadge);

  container.appendChild(header);

  // Diff content with syntax highlighting
  if (diff) {
    const diffSection = document.createElement("div");
    diffSection.className = "edit-file-diff";

    const lines = diff.split("\n");
    for (const line of lines) {
      const lineEl = document.createElement("div");
      lineEl.className = "diff-line";

      // Apply appropriate class based on line type
      if (line.startsWith("+++") || line.startsWith("---")) {
        lineEl.classList.add("diff-file-header");
      } else if (line.startsWith("@@")) {
        lineEl.classList.add("diff-chunk-header");
      } else if (line.startsWith("+")) {
        lineEl.classList.add("diff-addition");
      } else if (line.startsWith("-")) {
        lineEl.classList.add("diff-deletion");
      } else {
        lineEl.classList.add("diff-context");
      }

      lineEl.textContent = line;
      diffSection.appendChild(lineEl);
    }

    container.appendChild(diffSection);
  } else {
    // No diff available
    const empty = document.createElement("div");
    empty.className = "edit-file-empty";
    empty.textContent = "No changes to display";
    container.appendChild(empty);
  }

  return container;
}

/**
 * Render Sequential Thinking args - just the thought content
 * @param {Object} args - The sequential thinking arguments
 * @returns {HTMLElement} Rendered thinking element
 */
function renderSequentialThinkingArgs(args) {
  const container = document.createElement("div");
  container.className = "sequential-thinking-content";

  const thought = args.thought || "";

  if (thought) {
    container.textContent = thought;
  }

  return container;
}

/**
 * Render list_directory result as a file tree
 * @param {Object} result - The directory listing result
 * @returns {HTMLElement} Rendered directory listing
 */
function renderListDirectoryResult(result) {
  const container = document.createElement("div");
  container.className = "list-directory-result";

  const items = result.items || [];
  const path = result.path || ".";

  // Header with path
  const header = document.createElement("div");
  header.className = "list-dir-header";
  header.textContent = path;
  container.appendChild(header);

  // Items list
  if (items.length > 0) {
    const list = document.createElement("div");
    list.className = "list-dir-items";

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "list-dir-item";

      const icon = document.createElement("span");
      icon.className = "list-dir-icon";
      icon.innerHTML = item.type === "folder" ? FOLDER_ICON : getFileTypeInfo(item.name).icon;
      row.appendChild(icon);

      const name = document.createElement("span");
      name.className = `list-dir-name${item.type === "folder" ? " is-folder" : ""}`;
      name.textContent = item.name;
      row.appendChild(name);

      // Size or file count
      const meta = document.createElement("span");
      meta.className = "list-dir-meta";
      if (item.type === "folder" && item.file_count != null) {
        meta.textContent = `${item.file_count} items`;
      } else if (item.type === "file" && item.size != null) {
        meta.textContent = formatFileSize(item.size);
      }
      row.appendChild(meta);

      list.appendChild(row);
    }

    container.appendChild(list);
  } else {
    const empty = document.createElement("div");
    empty.className = "list-dir-empty";
    empty.textContent = "Empty directory";
    container.appendChild(empty);
  }

  return container;
}

/**
 * Render search_files result as a file list
 * @param {Object} result - The search result
 * @returns {HTMLElement} Rendered search results
 */
function renderSearchFilesResult(result) {
  const container = document.createElement("div");
  container.className = "search-files-result";

  const items = result.items || [];
  const pattern = result.pattern || "";
  const count = result.count || items.length;
  const truncated = result.truncated || false;

  // Header with pattern and count
  const header = document.createElement("div");
  header.className = "search-files-header";

  const patternEl = document.createElement("span");
  patternEl.className = "search-files-pattern";
  patternEl.textContent = pattern;
  header.appendChild(patternEl);

  const countEl = document.createElement("span");
  countEl.className = "search-files-count";
  countEl.textContent = `${count} match${count !== 1 ? "es" : ""}${truncated ? " (truncated)" : ""}`;
  header.appendChild(countEl);

  container.appendChild(header);

  // Results list
  if (items.length > 0) {
    const list = document.createElement("div");
    list.className = "search-files-items";

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "search-files-item";

      const icon = document.createElement("span");
      icon.className = "search-files-icon";
      icon.innerHTML = item.type === "folder" ? FOLDER_ICON : getFileTypeInfo(item.name).icon;
      row.appendChild(icon);

      const name = document.createElement("span");
      name.className = "search-files-name";
      name.textContent = item.name;
      row.appendChild(name);

      if (item.size != null) {
        const size = document.createElement("span");
        size.className = "search-files-size";
        size.textContent = formatFileSize(item.size);
        row.appendChild(size);
      }

      list.appendChild(row);
    }

    container.appendChild(list);
  } else {
    const empty = document.createElement("div");
    empty.className = "search-files-empty";
    empty.textContent = "No matches found";
    container.appendChild(empty);
  }

  return container;
}

/**
 * Download a file from code interpreter output
 * @param {Object} file - File metadata
 */
async function downloadFile(file) {
  try {
    // Request file download via IPC
    const result = await window.electronAPI.invoke("download-code-output-file", {
      path: file.path,
      name: file.name,
    });

    if (!result.success) {
      console.error("[function-card-ui] Download failed:", result.error);
    }
  } catch (error) {
    console.error("[function-card-ui] Download error:", error);
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
 * Get or create cached element references for a card
 * @param {Object} card - The function card object
 * @returns {Object} Cached element references
 */
function getCardElements(card) {
  if (!card._statusElements) {
    card._statusElements = {
      contentDiv: card.element.querySelector(".disclosure-content"),
      argsPreview: card.element.querySelector(".disclosure-args-preview"),
      chevron: card.element.querySelector(".disclosure-chevron"),
    };
  }
  return card._statusElements;
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

    // Get cached element references
    const { contentDiv, argsPreview, chevron } = getCardElements(card);

    // Update args preview in header when arguments arrive
    // Skip args display entirely for summarize_conversation (cleaner card like Thought)
    const isSummarization = card.rawName === "summarize_conversation";
    const isCodeInterpreter = card.rawName === "execute_python_code" || card.rawName === "wrapped_execute_python_code";
    const isGenerateDocument = card.rawName === "generate_document" || card.rawName === "wrapped_generate_document";
    const isSequentialThinking = card.rawName === "sequentialthinking";

    // Tools with custom result renderers - skip generic args (info is in the rendered result)
    const hasCustomResultRenderer = [
      "read_file",
      "wrapped_read_file",
      "edit_file",
      "wrapped_edit_file",
      "list_directory",
      "wrapped_list_directory",
      "search_files",
      "wrapped_search_files",
      "tavily-search",
      "tavily_search",
      "tavilysearch",
      "fetch",
      "tavily-extract",
      "tavily_extract",
      "tavilyextract",
      "tavily-crawl",
      "tavily_crawl",
      "tavilycrawl",
      "tavily-map",
      "tavily_map",
      "tavilymap",
    ].includes(card.rawName);

    if (data.arguments && !isSummarization) {
      // Store arguments on card for later access (e.g., for web search query extraction)
      card.arguments = data.arguments;

      if (argsPreview) {
        const primaryArg = extractPrimaryArg(data.arguments, card.rawName || card.name);
        argsPreview.textContent = primaryArg;

        // Fade in args and chevron when we have content
        if (primaryArg) {
          argsPreview.classList.add("visible");
          if (chevron) chevron.classList.add("visible");
        }
      }

      // Add full arguments to expanded content (only once)
      if (contentDiv && !contentDiv.querySelector(".disclosure-arguments")) {
        // For code interpreter, show code with syntax highlighting
        if (isCodeInterpreter) {
          const parsedArgs = safeParse(data.arguments, {});
          const code = parsedArgs.code || "";

          if (code) {
            const codeSection = document.createElement("div");
            codeSection.className = "disclosure-arguments code-input-section";

            const codePre = document.createElement("pre");
            codePre.className = "code-input-display";

            // Apply Python syntax highlighting
            const highlighted = highlightCode(code, "python");
            const codeElement = document.createElement("code");
            codeElement.className = "shiki language-python";
            codeElement.innerHTML = highlighted;
            codePre.appendChild(codeElement);

            codeSection.appendChild(codePre);
            contentDiv.appendChild(codeSection);

            // Show chevron since we have code to display
            if (chevron) chevron.classList.add("visible");
          }
        } else if (isGenerateDocument) {
          // For generate_document, show pretty formatted file preview
          const parsedArgs = safeParse(data.arguments, {});
          const argsSection = document.createElement("div");
          argsSection.className = "disclosure-arguments";

          const argsElement = renderGenerateDocumentArgs(parsedArgs);
          argsSection.appendChild(argsElement);

          contentDiv.appendChild(argsSection);

          // Show chevron since we have content
          if (chevron) chevron.classList.add("visible");
        } else if (isSequentialThinking) {
          // For sequential thinking, show thought content
          const parsedArgs = safeParse(data.arguments, {});
          const argsSection = document.createElement("div");
          argsSection.className = "disclosure-arguments";

          const thinkingElement = renderSequentialThinkingArgs(parsedArgs);
          argsSection.appendChild(thinkingElement);

          contentDiv.appendChild(argsSection);

          // Show chevron since we have content
          if (chevron) chevron.classList.add("visible");
        } else if (!hasCustomResultRenderer) {
          // Regular tool without custom renderer: show JSON arguments
          const { html, isJson } = prettyPrintJson(data.arguments);

          const argsSection = document.createElement("div");
          argsSection.className = "disclosure-arguments";

          const argsLabel = document.createElement("div");
          argsLabel.className = "disclosure-section-label";
          argsLabel.textContent = "Arguments";
          argsSection.appendChild(argsLabel);

          const argsContent = document.createElement("pre");
          argsContent.className = `disclosure-section-content${isJson ? " shiki" : ""}`;
          if (isJson) {
            argsContent.innerHTML = html;
          } else {
            argsContent.textContent = html;
          }
          argsSection.appendChild(argsContent);

          contentDiv.appendChild(argsSection);
        }
        // Tools with custom result renderers skip args - info is in the rendered result
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
    // Summarization uses thought-like styling (no label, clean text)
    // Tools with custom args renderers skip result (their rendered args are the content)
    const hasCustomArgsRenderer = ["sequentialthinking", "generate_document", "wrapped_generate_document"].includes(
      card.rawName
    );

    if (data.result && contentDiv && !contentDiv.querySelector(".disclosure-result") && !hasCustomArgsRenderer) {
      const isSummarizationResult = card.rawName === "summarize_conversation";
      const isCodeInterpreterResult =
        card.rawName === "execute_python_code" || card.rawName === "wrapped_execute_python_code";

      if (isSummarizationResult) {
        // Summarization: Clean thought-like display (no label, just text)
        const summarySection = document.createElement("div");
        summarySection.className = "disclosure-result disclosure-reasoning";

        const summaryContent = document.createElement("div");
        summaryContent.className = "disclosure-reasoning-content";
        // Strip the metadata suffix [Tokens before: X, ...] from display
        const cleanResult = data.result.replace(/\n?\n?\[Tokens before:.*\]$/, "");
        summaryContent.textContent = cleanResult;
        summarySection.appendChild(summaryContent);

        contentDiv.appendChild(summarySection);

        // Show chevron for summarization (we skipped args, so need to show it here)
        if (chevron) chevron.classList.add("visible");
      } else if (isCodeInterpreterResult) {
        // Code interpreter: Special rendering with syntax highlighting, images, file downloads
        const parsedResult = safeParse(data.result, null);
        if (parsedResult && typeof parsedResult === "object") {
          const codeOutputElement = renderCodeInterpreterOutput(parsedResult);
          contentDiv.appendChild(codeOutputElement);
        } else {
          // Fallback to regular result display if parsing fails
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const resultLabel = document.createElement("div");
          resultLabel.className = "disclosure-section-label";
          resultLabel.textContent = "Result";
          resultSection.appendChild(resultLabel);

          const resultContent = document.createElement("pre");
          resultContent.className = "disclosure-section-content";
          resultContent.textContent = data.result;
          resultSection.appendChild(resultContent);

          contentDiv.appendChild(resultSection);
        }
      } else if (
        card.rawName === "tavily-search" ||
        card.rawName === "tavily_search" ||
        card.rawName === "tavilysearch"
      ) {
        // Web search: Special rendering with search results cards
        // Try JSON first, fall back to text parsing (Tavily MCP returns text format)
        const parsedResult = safeParse(data.result, null);
        const resultData = parsedResult || data.result; // Use original string if JSON fails
        // Get query from cached arguments
        const cachedArgs = safeParse(card.arguments || "{}", {});
        const query = cachedArgs.query || "";

        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const searchResultsElement = renderWebSearchResults(resultData, query);
        resultSection.appendChild(searchResultsElement);

        contentDiv.appendChild(resultSection);
      } else if (
        card.rawName === "fetch" ||
        card.rawName === "tavily-extract" ||
        card.rawName === "tavily_extract" ||
        card.rawName === "tavilyextract"
      ) {
        // Web content fetch/extract: Show URL with content preview
        const resultData = safeParse(data.result, null) || data.result;
        const cachedArgs = safeParse(card.arguments || "{}", {});
        const url = cachedArgs.url || cachedArgs.urls?.[0] || "";

        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const contentElement = renderWebContentResult(resultData, url, card.rawName);
        resultSection.appendChild(contentElement);

        contentDiv.appendChild(resultSection);
      } else if (card.rawName === "tavily-crawl" || card.rawName === "tavily_crawl" || card.rawName === "tavilycrawl") {
        // Crawl results: Show pages with collapsible content
        const resultData = safeParse(data.result, null) || data.result;

        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const contentElement = renderCrawlResults(resultData);
        resultSection.appendChild(contentElement);

        contentDiv.appendChild(resultSection);
      } else if (card.rawName === "tavily-map" || card.rawName === "tavily_map" || card.rawName === "tavilymap") {
        // Map results: Show grouped URL sitemap
        const resultData = safeParse(data.result, null) || data.result;

        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const contentElement = renderMapResults(resultData);
        resultSection.appendChild(contentElement);

        contentDiv.appendChild(resultSection);
      } else if (card.rawName === "read_file" || card.rawName === "wrapped_read_file") {
        // Read file: Show filename header with rendered content
        const parsedResult = safeParse(data.result, null);
        if (parsedResult?.content) {
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const contentElement = renderReadFileResult(parsedResult);
          resultSection.appendChild(contentElement);

          contentDiv.appendChild(resultSection);
        } else {
          // Fallback to regular display
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const resultLabel = document.createElement("div");
          resultLabel.className = "disclosure-section-label";
          resultLabel.textContent = "Result";
          resultSection.appendChild(resultLabel);

          const resultContent = document.createElement("pre");
          resultContent.className = "disclosure-section-content";
          resultContent.textContent = data.result;
          resultSection.appendChild(resultContent);

          contentDiv.appendChild(resultSection);
        }
      } else if (card.rawName === "edit_file" || card.rawName === "wrapped_edit_file") {
        // Edit file: Show git-style diff
        const parsedResult = safeParse(data.result, null);
        if (parsedResult?.diff) {
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const contentElement = renderEditFileResult(parsedResult);
          resultSection.appendChild(contentElement);

          contentDiv.appendChild(resultSection);
        } else {
          // Fallback to regular display
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const resultLabel = document.createElement("div");
          resultLabel.className = "disclosure-section-label";
          resultLabel.textContent = "Result";
          resultSection.appendChild(resultLabel);

          const resultContent = document.createElement("pre");
          resultContent.className = "disclosure-section-content";
          resultContent.textContent = data.result;
          resultSection.appendChild(resultContent);

          contentDiv.appendChild(resultSection);
        }
      } else if (card.rawName === "list_directory" || card.rawName === "wrapped_list_directory") {
        // List directory: Show file tree
        const parsedResult = safeParse(data.result, null);
        if (parsedResult?.items) {
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const contentElement = renderListDirectoryResult(parsedResult);
          resultSection.appendChild(contentElement);

          contentDiv.appendChild(resultSection);
        } else {
          // Fallback to regular display
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const resultLabel = document.createElement("div");
          resultLabel.className = "disclosure-section-label";
          resultLabel.textContent = "Result";
          resultSection.appendChild(resultLabel);

          const resultContent = document.createElement("pre");
          resultContent.className = "disclosure-section-content";
          resultContent.textContent = data.result;
          resultSection.appendChild(resultContent);

          contentDiv.appendChild(resultSection);
        }
      } else if (card.rawName === "search_files" || card.rawName === "wrapped_search_files") {
        // Search files: Show matching files
        const parsedResult = safeParse(data.result, null);
        if (parsedResult?.items) {
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const contentElement = renderSearchFilesResult(parsedResult);
          resultSection.appendChild(contentElement);

          contentDiv.appendChild(resultSection);
        } else {
          // Fallback to regular display
          const resultSection = document.createElement("div");
          resultSection.className = "disclosure-result";

          const resultLabel = document.createElement("div");
          resultLabel.className = "disclosure-section-label";
          resultLabel.textContent = "Result";
          resultSection.appendChild(resultLabel);

          const resultContent = document.createElement("pre");
          resultContent.className = "disclosure-section-content";
          resultContent.textContent = data.result;
          resultSection.appendChild(resultContent);

          contentDiv.appendChild(resultSection);
        }
      } else {
        // Regular tool: Show with "Result" label and JSON/text formatting
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const resultLabel = document.createElement("div");
        resultLabel.className = "disclosure-section-label";
        resultLabel.textContent = "Result";
        resultSection.appendChild(resultLabel);

        const resultContent = document.createElement("pre");
        // Try to pretty-print as JSON, fall back to plain text
        const { html, isJson } = prettyPrintJson(data.result);
        // Truncate very long results (check original length)
        const isTruncated = data.result.length > 4000;
        const displayContent = isTruncated ? data.result.substring(0, 4000) : data.result;

        if (isJson && !isTruncated) {
          resultContent.className = "disclosure-section-content shiki";
          resultContent.innerHTML = html;
        } else if (isJson && isTruncated) {
          // Re-prettify truncated content
          const truncatedResult = prettyPrintJson(displayContent);
          resultContent.className = "disclosure-section-content shiki";
          resultContent.innerHTML = `${truncatedResult.html}\n<span style="color:#78787e;font-style:italic">... (truncated)</span>`;
        } else {
          resultContent.className = "disclosure-section-content";
          resultContent.textContent = isTruncated ? `${displayContent}\n... (truncated)` : displayContent;
        }
        resultSection.appendChild(resultContent);

        contentDiv.appendChild(resultSection);
      }
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
 * Update function arguments during streaming (throttled with RAF batching)
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

  // Queue the update for batched processing
  pendingArgUpdates.set(callId, { isDone, card, argumentsBuffer });

  if (isDone) {
    // Flush immediately on completion
    flushArgUpdates();
  } else if (!argUpdateScheduled) {
    // Schedule batched update via RAF
    argUpdateScheduled = true;
    requestAnimationFrame(() => {
      flushArgUpdates();
      argUpdateScheduled = false;
    });
  }
}

/**
 * Flush all pending argument updates in a single batch
 * Reduces layout thrashing by batching DOM reads/writes
 */
function flushArgUpdates() {
  for (const [callId, { isDone, card, argumentsBuffer }] of pendingArgUpdates.entries()) {
    if (!card || !card.element) continue;

    const bufferedArgs = argumentsBuffer.get(callId) || "";

    // Cache element references on the card to avoid repeated querySelector
    if (!card._cachedElements) {
      card._cachedElements = {
        argsPreview: card.element.querySelector(".disclosure-args-preview"),
        chevron: card.element.querySelector(".disclosure-chevron"),
        contentDiv: card.element.querySelector(".disclosure-content"),
      };
    }

    const { argsPreview, chevron, contentDiv } = card._cachedElements;

    // Update header args preview with streaming content
    if (argsPreview) {
      const primaryArg = extractPrimaryArg(bufferedArgs, card.rawName || card.name);
      argsPreview.textContent = primaryArg || "";

      // Fade in args and chevron when we have extractable content
      if (primaryArg && !argsPreview.classList.contains("visible")) {
        argsPreview.classList.add("visible");
        if (chevron) chevron.classList.add("visible");
      }
    }

    // Update expanded content if exists
    if (contentDiv) {
      // Cache argsSection reference
      if (!card._cachedElements.argsSection) {
        card._cachedElements.argsSection = contentDiv.querySelector(".disclosure-arguments");
      }

      let argsSection = card._cachedElements.argsSection;

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
        card._cachedElements.argsSection = argsSection;
        card._cachedElements.argsContent = argsContent;
      }

      // Cache argsContent reference
      if (!card._cachedElements.argsContent) {
        card._cachedElements.argsContent = argsSection.querySelector(".disclosure-section-content");
      }

      const argsContent = card._cachedElements.argsContent;
      if (argsContent) {
        if (isDone) {
          argsContent.classList.remove("streaming");
          const parsedArgs = safeParse(bufferedArgs, bufferedArgs);
          argsContent.textContent = typeof parsedArgs === "string" ? parsedArgs : JSON.stringify(parsedArgs, null, 2);
          argumentsBuffer.delete(callId);
          // Clear cached elements on completion
          delete card._cachedElements;
        } else {
          argsContent.textContent = `${bufferedArgs}...`;
        }
      }
    }
  }

  pendingArgUpdates.clear();
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
 * @param {boolean} [toolData.interrupted=false] - Whether the call was interrupted by user
 * @returns {HTMLElement} The created card element
 */
export function createCompletedToolCard(chatContainer, toolData) {
  const { call_id, name, arguments: args, result, success = true, interrupted = false } = toolData;

  // Summarization cards have special styling (like Thought cards)
  const isSummarization = name === "summarize_conversation";

  // Create disclosure card (collapsed by default)
  const cardDiv = document.createElement("div");
  cardDiv.className = "function-disclosure";
  cardDiv.id = `function-${call_id}`;
  cardDiv.dataset.expanded = "false";
  // Interrupted takes priority over error for correct strikethrough styling
  cardDiv.dataset.status = interrupted ? "interrupted" : success ? "completed" : "error";
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
  // Skip args display for summarization (cleaner card like Thought)
  const primaryArg = isSummarization ? "" : extractPrimaryArg(args, name);
  argsSpan.className = `disclosure-args-preview${primaryArg ? " visible" : ""}`;
  argsSpan.textContent = primaryArg;

  const chevronSpan = document.createElement("span");
  // Show chevron if there's content to expand (args or result)
  // For summarization, always show chevron if there's a result
  chevronSpan.className = `disclosure-chevron${primaryArg || result ? " visible" : ""}`;
  chevronSpan.innerHTML = CHEVRON_DOWN;

  headerDiv.appendChild(iconSpan);
  headerDiv.appendChild(toolNameSpan);
  headerDiv.appendChild(argsSpan);
  headerDiv.appendChild(chevronSpan);
  cardDiv.appendChild(headerDiv);

  // Expandable content container (hidden by default)
  const contentDiv = document.createElement("div");
  contentDiv.className = "disclosure-content";

  // Add arguments section (skip for summarization - cleaner card like Thought)
  // Tools with custom result renderers skip args - info is in the rendered result
  const hasCustomResultRenderer = [
    "read_file",
    "wrapped_read_file",
    "edit_file",
    "wrapped_edit_file",
    "list_directory",
    "wrapped_list_directory",
    "search_files",
    "wrapped_search_files",
    "tavily-search",
    "tavily_search",
    "tavilysearch",
    "fetch",
    "tavily-extract",
    "tavily_extract",
    "tavilyextract",
    "tavily-crawl",
    "tavily_crawl",
    "tavilycrawl",
    "tavily-map",
    "tavily_map",
    "tavilymap",
  ].includes(name);

  if (args && !isSummarization && !hasCustomResultRenderer) {
    const isCodeInterpreter = name === "execute_python_code" || name === "wrapped_execute_python_code";
    const isGenerateDocument = name === "generate_document" || name === "wrapped_generate_document";
    const isSequentialThinking = name === "sequentialthinking";

    // For code interpreter, show code with syntax highlighting
    if (isCodeInterpreter) {
      const parsedArgs = safeParse(args, {});
      const code = parsedArgs.code || "";

      if (code) {
        const codeSection = document.createElement("div");
        codeSection.className = "disclosure-arguments code-input-section";

        const codePre = document.createElement("pre");
        codePre.className = "code-input-display";

        // Apply Python syntax highlighting
        const highlighted = highlightCode(code, "python");
        const codeElement = document.createElement("code");
        codeElement.className = "shiki language-python";
        codeElement.innerHTML = highlighted;
        codePre.appendChild(codeElement);

        codeSection.appendChild(codePre);
        contentDiv.appendChild(codeSection);
      }
    } else if (isGenerateDocument) {
      // For generate_document, show pretty formatted file preview
      const parsedArgs = safeParse(args, {});
      const argsSection = document.createElement("div");
      argsSection.className = "disclosure-arguments";

      const argsElement = renderGenerateDocumentArgs(parsedArgs);
      argsSection.appendChild(argsElement);

      contentDiv.appendChild(argsSection);
    } else if (isSequentialThinking) {
      // For sequential thinking, show step progress with thought content
      const parsedArgs = safeParse(args, {});
      const argsSection = document.createElement("div");
      argsSection.className = "disclosure-arguments";

      const thinkingElement = renderSequentialThinkingArgs(parsedArgs);
      argsSection.appendChild(thinkingElement);

      contentDiv.appendChild(argsSection);
    } else {
      // Regular tool: show JSON arguments
      const { html, isJson } = prettyPrintJson(args);

      const argsSection = document.createElement("div");
      argsSection.className = "disclosure-arguments";

      const argsLabel = document.createElement("div");
      argsLabel.className = "disclosure-section-label";
      argsLabel.textContent = "Arguments";
      argsSection.appendChild(argsLabel);

      const argsContent = document.createElement("pre");
      argsContent.className = `disclosure-section-content${isJson ? " shiki" : ""}`;
      if (isJson) {
        argsContent.innerHTML = html;
      } else {
        argsContent.textContent = html;
      }
      argsSection.appendChild(argsContent);

      contentDiv.appendChild(argsSection);
    }
  }

  // Add result section
  // Tools with custom args renderers skip result (their rendered args are the content)
  const hasCustomArgsRenderer = ["sequentialthinking", "generate_document", "wrapped_generate_document"].includes(name);

  if (result && !hasCustomArgsRenderer) {
    const isCodeInterpreterResult = name === "execute_python_code" || name === "wrapped_execute_python_code";

    if (isSummarization) {
      // Summarization: Clean thought-like display (no label, just text)
      const summarySection = document.createElement("div");
      summarySection.className = "disclosure-result disclosure-reasoning";

      const summaryContent = document.createElement("div");
      summaryContent.className = "disclosure-reasoning-content";
      // Strip the metadata suffix [Tokens before: X, ...] from display
      const cleanResult = result.replace(/\n?\n?\[Tokens before:.*\]$/, "");
      summaryContent.textContent = cleanResult;
      summarySection.appendChild(summaryContent);

      contentDiv.appendChild(summarySection);
    } else if (isCodeInterpreterResult && success) {
      // Code interpreter: Special rendering with syntax highlighting, images, file downloads
      const parsedResult = safeParse(result, null);
      if (parsedResult && typeof parsedResult === "object") {
        const codeOutputElement = renderCodeInterpreterOutput(parsedResult);
        contentDiv.appendChild(codeOutputElement);
      } else {
        // Fallback to regular result display if parsing fails
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const resultLabel = document.createElement("div");
        resultLabel.className = "disclosure-section-label";
        resultLabel.textContent = "Result";
        resultSection.appendChild(resultLabel);

        const resultContent = document.createElement("pre");
        resultContent.className = "disclosure-section-content";
        resultContent.textContent = result;
        resultSection.appendChild(resultContent);

        contentDiv.appendChild(resultSection);
      }
    } else if ((name === "tavily-search" || name === "tavily_search" || name === "tavilysearch") && success) {
      // Web search: Special rendering with search results cards
      // Try JSON first, fall back to text parsing (Tavily MCP returns text format)
      const parsedResult = safeParse(result, null);
      const resultData = parsedResult || result; // Use original string if JSON fails
      const parsedArgs = safeParse(args, {});
      const query = parsedArgs.query || "";

      const resultSection = document.createElement("div");
      resultSection.className = "disclosure-result";

      const searchResultsElement = renderWebSearchResults(resultData, query);
      resultSection.appendChild(searchResultsElement);

      contentDiv.appendChild(resultSection);
    } else if (
      (name === "fetch" || name === "tavily-extract" || name === "tavily_extract" || name === "tavilyextract") &&
      success
    ) {
      // Web content fetch/extract: Show URL with content preview
      const parsedResult = safeParse(result, null);
      const resultData = parsedResult || result;
      const parsedArgs = safeParse(args, {});
      const url = parsedArgs.url || parsedArgs.urls?.[0] || "";

      const resultSection = document.createElement("div");
      resultSection.className = "disclosure-result";

      const contentElement = renderWebContentResult(resultData, url, name);
      resultSection.appendChild(contentElement);

      contentDiv.appendChild(resultSection);
    } else if ((name === "tavily-crawl" || name === "tavily_crawl" || name === "tavilycrawl") && success) {
      // Crawl results: Show pages with collapsible content
      const parsedResult = safeParse(result, null);
      const resultData = parsedResult || result;

      const resultSection = document.createElement("div");
      resultSection.className = "disclosure-result";

      const contentElement = renderCrawlResults(resultData);
      resultSection.appendChild(contentElement);

      contentDiv.appendChild(resultSection);
    } else if ((name === "tavily-map" || name === "tavily_map" || name === "tavilymap") && success) {
      // Map results: Show grouped URL sitemap
      const parsedResult = safeParse(result, null);
      const resultData = parsedResult || result;

      const resultSection = document.createElement("div");
      resultSection.className = "disclosure-result";

      const contentElement = renderMapResults(resultData);
      resultSection.appendChild(contentElement);

      contentDiv.appendChild(resultSection);
    } else if ((name === "read_file" || name === "wrapped_read_file") && success) {
      // Read file: Show filename header with rendered content
      const parsedResult = safeParse(result, null);
      if (parsedResult?.content) {
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const contentElement = renderReadFileResult(parsedResult);
        resultSection.appendChild(contentElement);

        contentDiv.appendChild(resultSection);
      } else {
        // Fallback to regular display if parsing fails
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const resultLabel = document.createElement("div");
        resultLabel.className = "disclosure-section-label";
        resultLabel.textContent = "Result";
        resultSection.appendChild(resultLabel);

        const resultContent = document.createElement("pre");
        resultContent.className = "disclosure-section-content";
        resultContent.textContent = result;
        resultSection.appendChild(resultContent);

        contentDiv.appendChild(resultSection);
      }
    } else if ((name === "edit_file" || name === "wrapped_edit_file") && success) {
      // Edit file: Show git-style diff
      const parsedResult = safeParse(result, null);
      if (parsedResult?.diff) {
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const contentElement = renderEditFileResult(parsedResult);
        resultSection.appendChild(contentElement);

        contentDiv.appendChild(resultSection);
      } else {
        // Fallback to regular display if parsing fails
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const resultLabel = document.createElement("div");
        resultLabel.className = "disclosure-section-label";
        resultLabel.textContent = "Result";
        resultSection.appendChild(resultLabel);

        const resultContent = document.createElement("pre");
        resultContent.className = "disclosure-section-content";
        resultContent.textContent = result;
        resultSection.appendChild(resultContent);

        contentDiv.appendChild(resultSection);
      }
    } else if ((name === "list_directory" || name === "wrapped_list_directory") && success) {
      // List directory: Show file tree
      const parsedResult = safeParse(result, null);
      if (parsedResult?.items) {
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const contentElement = renderListDirectoryResult(parsedResult);
        resultSection.appendChild(contentElement);

        contentDiv.appendChild(resultSection);
      } else {
        // Fallback to regular display
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const resultLabel = document.createElement("div");
        resultLabel.className = "disclosure-section-label";
        resultLabel.textContent = "Result";
        resultSection.appendChild(resultLabel);

        const resultContent = document.createElement("pre");
        resultContent.className = "disclosure-section-content";
        resultContent.textContent = result;
        resultSection.appendChild(resultContent);

        contentDiv.appendChild(resultSection);
      }
    } else if ((name === "search_files" || name === "wrapped_search_files") && success) {
      // Search files: Show matching files
      const parsedResult = safeParse(result, null);
      if (parsedResult?.items) {
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const contentElement = renderSearchFilesResult(parsedResult);
        resultSection.appendChild(contentElement);

        contentDiv.appendChild(resultSection);
      } else {
        // Fallback to regular display
        const resultSection = document.createElement("div");
        resultSection.className = "disclosure-result";

        const resultLabel = document.createElement("div");
        resultLabel.className = "disclosure-section-label";
        resultLabel.textContent = "Result";
        resultSection.appendChild(resultLabel);

        const resultContent = document.createElement("pre");
        resultContent.className = "disclosure-section-content";
        resultContent.textContent = result;
        resultSection.appendChild(resultContent);

        contentDiv.appendChild(resultSection);
      }
    } else {
      // Regular tool: Show with "Result" label and JSON/text formatting
      // Interrupted tools use "Result" styling (not error) - they didn't fail, just got cancelled
      const isError = !success && !interrupted;
      const resultSection = document.createElement("div");
      resultSection.className = isError ? "disclosure-error" : "disclosure-result";

      const resultLabel = document.createElement("div");
      resultLabel.className = "disclosure-section-label";
      resultLabel.textContent = isError ? "Error" : "Result";
      resultSection.appendChild(resultLabel);

      const resultContent = document.createElement("pre");
      const { html, isJson } = prettyPrintJson(result);
      const isTruncated = result.length > 4000;
      const displayContent = isTruncated ? result.substring(0, 4000) : result;

      if (isJson && !isTruncated) {
        resultContent.className = `${isError ? "disclosure-section-content error-text" : "disclosure-section-content"} shiki`;
        resultContent.innerHTML = html;
      } else if (isJson && isTruncated) {
        const truncatedResult = prettyPrintJson(displayContent);
        resultContent.className = `${isError ? "disclosure-section-content error-text" : "disclosure-section-content"} shiki`;
        resultContent.innerHTML = `${truncatedResult.html}\n<span style="color: #78787e; font-style: italic;">... (truncated)</span>`;
      } else {
        resultContent.className = isError ? "disclosure-section-content error-text" : "disclosure-section-content";
        resultContent.textContent = isTruncated ? `${displayContent}\n... (truncated)` : displayContent;
      }
      resultSection.appendChild(resultContent);

      contentDiv.appendChild(resultSection);
    }
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
