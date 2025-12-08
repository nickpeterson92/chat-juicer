/**
 * Function call card UI components for inline tool execution visualization
 * Uses Claude Code-style disclosure pattern: "ToolName args..." expandable
 */

import hljs from "highlight.js";
import { FUNCTION_CARD_CLEANUP_DELAY } from "../config/constants.js";
import { safeParse } from "../utils/json-cache.js";

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

  // Apply syntax highlighting
  const highlighted = hljs.highlight(jsonString, { language: "json" });
  return { html: highlighted.value, isJson: true };
}

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
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>',
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
  const priorityKeys = ["path", "file_path", "filename", "url", "query", "pattern", "thought", "name", "command"];

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
        let value = String(parsed[key]);
        if (value.length > 60) {
          value = `${value.substring(0, 57)}...`;
        }
        return value;
      }
    }

    // Fallback: use first string value found
    for (const value of Object.values(parsed)) {
      if (typeof value === "string" && value.length > 0) {
        return value.length > 60 ? `${value.substring(0, 57)}...` : value;
      }
    }

    return "";
  }

  // Handle object args directly
  if (typeof args !== "object" || args === null) return String(args);

  for (const key of priorityKeys) {
    if (args[key]) {
      let value = String(args[key]);
      if (value.length > 60) {
        value = `${value.substring(0, 57)}...`;
      }
      return value;
    }
  }

  // Fallback: use first string value found
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.length > 0) {
      return value.length > 60 ? `${value.substring(0, 57)}...` : value;
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
 * Render code interpreter output with syntax highlighting, images, and file downloads
 * @param {Object} result - Parsed result from execute_python_code
 * @returns {HTMLElement} Rendered output element
 */
function renderCodeInterpreterOutput(result) {
  const container = document.createElement("div");
  container.className = "code-interpreter-output";

  // Show stdout if present
  if (result.stdout && result.stdout.trim()) {
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
  if (result.stderr && result.stderr.trim()) {
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
      if (file.type && file.type.startsWith("image/") && file.base64) {
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
    // Skip args display entirely for summarize_conversation (cleaner card like Thought)
    const isSummarization = card.rawName === "summarize_conversation";
    const isCodeInterpreter = card.rawName === "execute_python_code" || card.rawName === "wrapped_execute_python_code";

    if (data.arguments && !isSummarization) {
      const argsPreview = card.element.querySelector(".disclosure-args-preview");
      if (argsPreview && !isCodeInterpreter) {
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
        // For code interpreter, show code with syntax highlighting
        if (isCodeInterpreter) {
          const parsedArgs = safeParse(data.arguments, {});
          const code = parsedArgs.code || "";

          if (code) {
            const codeSection = document.createElement("div");
            codeSection.className = "disclosure-arguments code-input-section";

            const codeLabel = document.createElement("div");
            codeLabel.className = "disclosure-section-label";
            codeLabel.textContent = "Python Code";
            codeSection.appendChild(codeLabel);

            const codePre = document.createElement("pre");
            codePre.className = "code-input-display";

            // Apply Python syntax highlighting
            const highlighted = hljs.highlight(code, { language: "python" });
            const codeElement = document.createElement("code");
            codeElement.className = "hljs language-python";
            codeElement.innerHTML = highlighted.value;
            codePre.appendChild(codeElement);

            codeSection.appendChild(codePre);
            contentDiv.appendChild(codeSection);

            // Show chevron since we have code to display
            const chevron = card.element.querySelector(".disclosure-chevron");
            if (chevron) chevron.classList.add("visible");
          }
        } else {
          // Regular tool: show JSON arguments
          const { html, isJson } = prettyPrintJson(data.arguments);

          const argsSection = document.createElement("div");
          argsSection.className = "disclosure-arguments";

          const argsLabel = document.createElement("div");
          argsLabel.className = "disclosure-section-label";
          argsLabel.textContent = "Arguments";
          argsSection.appendChild(argsLabel);

          const argsContent = document.createElement("pre");
          argsContent.className = `disclosure-section-content${isJson ? " hljs" : ""}`;
          if (isJson) {
            argsContent.innerHTML = html;
          } else {
            argsContent.textContent = html;
          }
          argsSection.appendChild(argsContent);

          contentDiv.appendChild(argsSection);
        }
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
    if (data.result && contentDiv && !contentDiv.querySelector(".disclosure-result")) {
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
        const chevron = card.element.querySelector(".disclosure-chevron");
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
          resultContent.className = "disclosure-section-content hljs";
          resultContent.innerHTML = html;
        } else if (isJson && isTruncated) {
          // Re-prettify truncated content
          const truncatedResult = prettyPrintJson(displayContent);
          resultContent.className = "disclosure-section-content hljs";
          resultContent.innerHTML = `${truncatedResult.html}\n<span class="hljs-comment">... (truncated)</span>`;
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

  // Summarization cards have special styling (like Thought cards)
  const isSummarization = name === "summarize_conversation";

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
  if (args && !isSummarization) {
    const isCodeInterpreter = name === "execute_python_code" || name === "wrapped_execute_python_code";

    // For code interpreter, show code with syntax highlighting
    if (isCodeInterpreter) {
      const parsedArgs = safeParse(args, {});
      const code = parsedArgs.code || "";

      if (code) {
        const codeSection = document.createElement("div");
        codeSection.className = "disclosure-arguments code-input-section";

        const codeLabel = document.createElement("div");
        codeLabel.className = "disclosure-section-label";
        codeLabel.textContent = "Python Code";
        codeSection.appendChild(codeLabel);

        const codePre = document.createElement("pre");
        codePre.className = "code-input-display";

        // Apply Python syntax highlighting
        const highlighted = hljs.highlight(code, { language: "python" });
        const codeElement = document.createElement("code");
        codeElement.className = "hljs language-python";
        codeElement.innerHTML = highlighted.value;
        codePre.appendChild(codeElement);

        codeSection.appendChild(codePre);
        contentDiv.appendChild(codeSection);
      }
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
      argsContent.className = `disclosure-section-content${isJson ? " hljs" : ""}`;
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
  if (result) {
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
    } else {
      // Regular tool: Show with "Result" label and JSON/text formatting
      const resultSection = document.createElement("div");
      resultSection.className = success ? "disclosure-result" : "disclosure-error";

      const resultLabel = document.createElement("div");
      resultLabel.className = "disclosure-section-label";
      resultLabel.textContent = success ? "Result" : "Error";
      resultSection.appendChild(resultLabel);

      const resultContent = document.createElement("pre");
      const { html, isJson } = prettyPrintJson(result);
      const isTruncated = result.length > 4000;
      const displayContent = isTruncated ? result.substring(0, 4000) : result;

      if (isJson && !isTruncated) {
        resultContent.className = `${success ? "disclosure-section-content" : "disclosure-section-content error-text"} hljs`;
        resultContent.innerHTML = html;
      } else if (isJson && isTruncated) {
        const truncatedResult = prettyPrintJson(displayContent);
        resultContent.className = `${success ? "disclosure-section-content" : "disclosure-section-content error-text"} hljs`;
        resultContent.innerHTML = `${truncatedResult.html}\n<span class="hljs-comment">... (truncated)</span>`;
      } else {
        resultContent.className = success ? "disclosure-section-content" : "disclosure-section-content error-text";
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
