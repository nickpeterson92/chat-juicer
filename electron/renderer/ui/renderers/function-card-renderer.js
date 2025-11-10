/**
 * FunctionCardRenderer - Pure functions for rendering function call cards
 * NO DEPENDENCIES on services or global state
 *
 * Input: Function call data
 * Output: DOM elements via DOMAdapter
 */

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

/**
 * Get SVG icon for a function
 *
 * @param {string} functionName - Function name
 * @returns {string} SVG icon HTML
 */
export function getFunctionIcon(functionName) {
  const normalizedName = functionName.toLowerCase().replace(/[_-]/g, "");

  for (const [key, icon] of Object.entries(FUNCTION_ICONS)) {
    if (normalizedName.includes(key.toLowerCase().replace(/[_-]/g, ""))) {
      return icon;
    }
  }

  return FUNCTION_ICONS.default;
}

/**
 * Render function call card
 *
 * @param {Object} callData - Function call data
 * @param {string} callData.id - Call ID
 * @param {string} callData.name - Function name
 * @param {string} callData.status - Call status
 * @param {Object|string} callData.args - Function arguments
 * @param {string} callData.result - Function result
 * @param {Object} domAdapter - DOM adapter
 * @param {boolean} collapsed - Whether card starts collapsed
 * @returns {HTMLElement} Function card element
 */
export function renderFunctionCard(callData, domAdapter, collapsed = true) {
  const cardDiv = domAdapter.createElement("div");
  domAdapter.addClass(cardDiv, "function-call-card", "executing");
  domAdapter.setAttribute(cardDiv, "id", `function-${callData.id}`);
  domAdapter.setAttribute(cardDiv, "data-expanded", collapsed ? "false" : "true");

  // Header
  const headerDiv = domAdapter.createElement("div");
  domAdapter.addClass(headerDiv, "function-header");

  // Icon
  const iconDiv = domAdapter.createElement("div");
  domAdapter.addClass(iconDiv, "function-icon");
  domAdapter.setInnerHTML(iconDiv, getFunctionIcon(callData.name));

  // Function name
  const nameDiv = domAdapter.createElement("div");
  domAdapter.addClass(nameDiv, "function-name");
  domAdapter.setTextContent(nameDiv, callData.name);

  // Parameters
  const paramsDiv = domAdapter.createElement("div");
  domAdapter.addClass(paramsDiv, "function-params");
  const paramsText = renderFunctionParams(callData.args);
  domAdapter.setTextContent(paramsDiv, paramsText);

  // Status
  const statusDiv = domAdapter.createElement("div");
  domAdapter.addClass(statusDiv, "function-status");
  domAdapter.setTextContent(statusDiv, callData.status || "preparing");

  // Expand button
  const expandBtn = domAdapter.createElement("button");
  domAdapter.addClass(expandBtn, "expand-button");
  domAdapter.setAttribute(expandBtn, "aria-label", "Toggle details");
  domAdapter.setInnerHTML(expandBtn, "▼");

  // Assemble header
  domAdapter.appendChild(headerDiv, iconDiv);
  domAdapter.appendChild(headerDiv, nameDiv);
  domAdapter.appendChild(headerDiv, paramsDiv);
  domAdapter.appendChild(headerDiv, statusDiv);
  domAdapter.appendChild(headerDiv, expandBtn);

  // Body (collapsible)
  const bodyDiv = domAdapter.createElement("div");
  domAdapter.addClass(bodyDiv, "function-body");

  // Arguments section
  const argsSection = renderArgumentsSection(callData.args, domAdapter);
  domAdapter.appendChild(bodyDiv, argsSection);

  // Result section (initially empty)
  const resultSection = domAdapter.createElement("div");
  domAdapter.addClass(resultSection, "function-result");
  if (callData.result) {
    const resultContent = renderResult(callData.result, domAdapter);
    domAdapter.appendChild(resultSection, resultContent);
  }
  domAdapter.appendChild(bodyDiv, resultSection);

  // Assemble card
  domAdapter.appendChild(cardDiv, headerDiv);
  domAdapter.appendChild(cardDiv, bodyDiv);

  return cardDiv;
}

/**
 * Render function parameters for display in header
 *
 * @param {Object|string} args - Function arguments
 * @returns {string} Formatted parameters string
 */
export function renderFunctionParams(args) {
  if (!args) return "()";

  try {
    const argsObj = typeof args === "string" ? JSON.parse(args) : args;
    const keys = Object.keys(argsObj);

    if (keys.length === 0) return "()";

    // Show first param value if simple
    if (keys.length === 1) {
      const value = argsObj[keys[0]];
      if (typeof value === "string" && value.length < 30) {
        return `(${keys[0]}: "${value}")`;
      }
    }

    // Multiple params - just show keys
    return `(${keys.join(", ")})`;
  } catch (_e) {
    return "(...)";
  }
}

/**
 * Render arguments section
 *
 * @param {Object|string} args - Function arguments
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Arguments section element
 */
function renderArgumentsSection(args, domAdapter) {
  const section = domAdapter.createElement("div");
  domAdapter.addClass(section, "function-section");

  const label = domAdapter.createElement("div");
  domAdapter.addClass(label, "section-label");
  domAdapter.setTextContent(label, "Arguments:");

  const content = domAdapter.createElement("pre");
  domAdapter.addClass(content, "section-content");

  try {
    const argsObj = typeof args === "string" ? JSON.parse(args) : args;
    const formatted = JSON.stringify(argsObj, null, 2);
    domAdapter.setTextContent(content, formatted);
  } catch (_e) {
    domAdapter.setTextContent(content, typeof args === "string" ? args : JSON.stringify(args));
  }

  domAdapter.appendChild(section, label);
  domAdapter.appendChild(section, content);

  return section;
}

/**
 * Render result content
 *
 * @param {string|Object} result - Function result
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Result element
 */
function renderResult(result, domAdapter) {
  const section = domAdapter.createElement("div");
  domAdapter.addClass(section, "function-section");

  const label = domAdapter.createElement("div");
  domAdapter.addClass(label, "section-label");
  domAdapter.setTextContent(label, "Result:");

  const content = domAdapter.createElement("pre");
  domAdapter.addClass(content, "section-content");

  try {
    const resultObj = typeof result === "string" ? JSON.parse(result) : result;
    const formatted = JSON.stringify(resultObj, null, 2);
    domAdapter.setTextContent(content, formatted);
  } catch (_e) {
    domAdapter.setTextContent(content, typeof result === "string" ? result : JSON.stringify(result));
  }

  domAdapter.appendChild(section, label);
  domAdapter.appendChild(section, content);

  return section;
}

/**
 * Update card status
 *
 * @param {HTMLElement} cardElement - Card element
 * @param {string} status - New status
 * @param {Object} domAdapter - DOM adapter
 */
export function updateCardStatus(cardElement, status, domAdapter) {
  const statusDiv = domAdapter.querySelector(cardElement, ".function-status");
  if (statusDiv) {
    domAdapter.setTextContent(statusDiv, status);
  }

  // Update card class based on status
  domAdapter.removeClass(cardElement, "executing", "success", "error");

  if (status === "completed" || status === "success") {
    domAdapter.addClass(cardElement, "success");
  } else if (status === "error" || status === "failed") {
    domAdapter.addClass(cardElement, "error");
  } else {
    domAdapter.addClass(cardElement, "executing");
  }
}

/**
 * Update card result
 *
 * @param {HTMLElement} cardElement - Card element
 * @param {string|Object} result - Function result
 * @param {Object} domAdapter - DOM adapter
 */
export function updateCardResult(cardElement, result, domAdapter) {
  const resultSection = domAdapter.querySelector(cardElement, ".function-result");

  if (!resultSection) {
    return;
  }

  // Clear existing content
  domAdapter.setInnerHTML(resultSection, "");

  // Add new result
  const resultContent = renderResult(result, domAdapter);
  domAdapter.appendChild(resultSection, resultContent);
}

/**
 * Update card arguments (for streaming)
 *
 * @param {HTMLElement} cardElement - Card element
 * @param {Object|string} args - Updated arguments
 * @param {Object} domAdapter - DOM adapter
 */
export function updateCardArguments(cardElement, args, domAdapter) {
  // Update header params
  const paramsDiv = domAdapter.querySelector(cardElement, ".function-params");
  if (paramsDiv) {
    const paramsText = renderFunctionParams(args);
    domAdapter.setTextContent(paramsDiv, paramsText);
  }

  // Update body arguments
  const argsContent = domAdapter.querySelector(cardElement, ".function-section:first-child .section-content");
  if (argsContent) {
    try {
      const argsObj = typeof args === "string" ? JSON.parse(args) : args;
      const formatted = JSON.stringify(argsObj, null, 2);
      domAdapter.setTextContent(argsContent, formatted);
    } catch (_e) {
      domAdapter.setTextContent(argsContent, typeof args === "string" ? args : JSON.stringify(args));
    }
  }
}

/**
 * Toggle card expansion
 *
 * @param {HTMLElement} cardElement - Card element
 * @param {Object} domAdapter - DOM adapter
 * @returns {boolean} New expanded state
 */
export function toggleCardExpansion(cardElement, domAdapter) {
  const currentState = domAdapter.getAttribute(cardElement, "data-expanded") === "true";
  const newState = !currentState;

  domAdapter.setAttribute(cardElement, "data-expanded", newState ? "true" : "false");

  const expandBtn = domAdapter.querySelector(cardElement, ".expand-button");
  if (expandBtn) {
    domAdapter.setInnerHTML(expandBtn, newState ? "▲" : "▼");
  }

  return newState;
}

/**
 * Mark card as old (for cleanup styling)
 *
 * @param {HTMLElement} cardElement - Card element
 * @param {Object} domAdapter - DOM adapter
 */
export function markCardAsOld(cardElement, domAdapter) {
  domAdapter.addClass(cardElement, "old");
}
