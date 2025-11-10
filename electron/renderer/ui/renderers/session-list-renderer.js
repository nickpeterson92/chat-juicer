/**
 * SessionListRenderer - Pure functions for rendering session lists
 * NO DEPENDENCIES on services or global state
 *
 * Input: Session data objects
 * Output: DOM elements via DOMAdapter
 */

import { formatTimestamp } from "../../viewmodels/session-viewmodel.js";

/**
 * Render a single session list item
 *
 * @param {Object} session - Session data object
 * @param {string} session.id - Session ID
 * @param {string} session.title - Session title
 * @param {string} session.created_at - ISO timestamp
 * @param {boolean} isActive - Whether this session is active
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Session list item element
 */
export function renderSessionItem(session, isActive, domAdapter) {
  const itemDiv = domAdapter.createElement("div");
  domAdapter.addClass(itemDiv, "session-item");
  domAdapter.setAttribute(itemDiv, "data-session-id", session.id);

  if (isActive) {
    domAdapter.addClass(itemDiv, "active");
  }

  // Main content area (clickable to switch session)
  const contentDiv = domAdapter.createElement("div");
  domAdapter.addClass(contentDiv, "session-content");

  // Title
  const titleDiv = domAdapter.createElement("div");
  domAdapter.addClass(titleDiv, "session-title");
  domAdapter.setTextContent(titleDiv, session.title || "Untitled Session");
  domAdapter.setAttribute(titleDiv, "title", session.title || "Untitled Session");

  // Timestamp
  const timestampDiv = domAdapter.createElement("div");
  domAdapter.addClass(timestampDiv, "session-timestamp");
  domAdapter.setTextContent(timestampDiv, formatTimestamp(session.created_at));

  domAdapter.appendChild(contentDiv, titleDiv);
  domAdapter.appendChild(contentDiv, timestampDiv);

  // Actions container (visible on hover)
  const actionsDiv = domAdapter.createElement("div");
  domAdapter.addClass(actionsDiv, "session-actions");

  // Summarize button
  const summarizeBtn = domAdapter.createElement("button");
  domAdapter.addClass(summarizeBtn, "session-action-btn", "summarize-btn");
  domAdapter.setAttribute(summarizeBtn, "aria-label", "Summarize session");
  domAdapter.setAttribute(summarizeBtn, "data-action", "summarize");
  domAdapter.setAttribute(summarizeBtn, "data-session-id", session.id);
  domAdapter.setAttribute(summarizeBtn, "title", "Summarize");
  // SVG icon for summarize
  const summarizeSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
  </svg>`;
  summarizeBtn.innerHTML = summarizeSVG;

  // Rename button
  const renameBtn = domAdapter.createElement("button");
  domAdapter.addClass(renameBtn, "session-action-btn", "rename-btn");
  domAdapter.setAttribute(renameBtn, "aria-label", "Rename session");
  domAdapter.setAttribute(renameBtn, "data-action", "rename");
  domAdapter.setAttribute(renameBtn, "data-session-id", session.id);
  domAdapter.setAttribute(renameBtn, "title", "Rename");
  // SVG icon for rename
  const renameSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>`;
  renameBtn.innerHTML = renameSVG;

  // Delete button
  const deleteBtn = domAdapter.createElement("button");
  domAdapter.addClass(deleteBtn, "session-action-btn", "delete-btn");
  domAdapter.setAttribute(deleteBtn, "aria-label", "Delete session");
  domAdapter.setAttribute(deleteBtn, "data-action", "delete");
  domAdapter.setAttribute(deleteBtn, "data-session-id", session.id);
  domAdapter.setAttribute(deleteBtn, "title", "Delete");
  // SVG icon for delete
  const deleteSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`;
  deleteBtn.innerHTML = deleteSVG;

  domAdapter.appendChild(actionsDiv, summarizeBtn);
  domAdapter.appendChild(actionsDiv, renameBtn);
  domAdapter.appendChild(actionsDiv, deleteBtn);

  // Assemble item
  domAdapter.appendChild(itemDiv, contentDiv);
  domAdapter.appendChild(itemDiv, actionsDiv);

  return itemDiv;
}

/**
 * Render session list
 *
 * @param {Array<Object>} sessions - Array of session objects
 * @param {string|null} activeSessionId - ID of currently active session
 * @param {Object} domAdapter - DOM adapter
 * @returns {DocumentFragment} Fragment containing all session items
 */
export function renderSessionList(sessions, activeSessionId, domAdapter) {
  if (!domAdapter || !domAdapter.getDocument) {
    // Handle null adapter case in tests
    return null;
  }

  const fragment = domAdapter.getDocument().createDocumentFragment();

  for (const session of sessions) {
    const isActive = session.id === activeSessionId;
    const itemElement = renderSessionItem(session, isActive, domAdapter);
    fragment.appendChild(itemElement);
  }

  return fragment;
}

/**
 * Render session list with grouping by time period
 *
 * @param {Object} groupedSessions - Sessions grouped by period (today, yesterday, thisWeek, older)
 * @param {Object} domAdapter - DOM adapter
 * @returns {DocumentFragment} Fragment with grouped sessions
 */
export function renderGroupedSessionList(groupedSessions, domAdapter) {
  const fragment = domAdapter.getDocument().createDocumentFragment();

  const groups = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "thisWeek", label: "This Week" },
    { key: "older", label: "Older" },
  ];

  for (const { key, label } of groups) {
    const sessions = groupedSessions[key];

    if (!sessions || sessions.length === 0) {
      continue;
    }

    // Group header
    const headerDiv = domAdapter.createElement("div");
    domAdapter.addClass(headerDiv, "session-group-header");
    domAdapter.setTextContent(headerDiv, label);
    fragment.appendChild(headerDiv);

    // Group items
    for (const session of sessions) {
      const itemElement = renderSessionItem(session, domAdapter);
      fragment.appendChild(itemElement);
    }
  }

  return fragment;
}

/**
 * Render empty state for session list
 *
 * @param {string} message - Empty state message
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Empty state element
 */
export function renderEmptySessionList(message, domAdapter) {
  const emptyDiv = domAdapter.createElement("div");
  domAdapter.addClass(emptyDiv, "session-list-empty");

  const iconDiv = domAdapter.createElement("div");
  domAdapter.addClass(iconDiv, "empty-icon");
  iconDiv.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  `;

  const messageDiv = domAdapter.createElement("div");
  domAdapter.addClass(messageDiv, "empty-message");
  domAdapter.setTextContent(messageDiv, message || "No sessions yet");

  domAdapter.appendChild(emptyDiv, iconDiv);
  domAdapter.appendChild(emptyDiv, messageDiv);

  return emptyDiv;
}

/**
 * Render load more button
 *
 * @param {number} loaded - Number of sessions loaded
 * @param {number} total - Total number of sessions
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Load more button element
 */
export function renderLoadMoreButton(loaded, total, domAdapter) {
  const btnDiv = domAdapter.createElement("div");
  domAdapter.addClass(btnDiv, "load-more-container");

  const button = domAdapter.createElement("button");
  domAdapter.addClass(button, "load-more-button");
  domAdapter.setAttribute(button, "data-action", "load-more");

  const text = `Load More (${loaded}/${total})`;
  domAdapter.setTextContent(button, text);

  domAdapter.appendChild(btnDiv, button);

  return btnDiv;
}

/**
 * Update session item to active state
 *
 * @param {HTMLElement} itemElement - Session item element
 * @param {Object} domAdapter - DOM adapter
 */
export function markSessionAsActive(itemElement, domAdapter) {
  domAdapter.addClass(itemElement, "active");
}

/**
 * Remove active state from session item
 *
 * @param {HTMLElement} itemElement - Session item element
 * @param {Object} domAdapter - DOM adapter
 */
export function unmarkSessionAsActive(itemElement, domAdapter) {
  domAdapter.removeClass(itemElement, "active");
}

/**
 * Show rename input for session
 *
 * @param {HTMLElement} itemElement - Session item element
 * @param {string} currentTitle - Current session title
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Input element (for focus)
 */
export function showRenameInput(itemElement, currentTitle, domAdapter) {
  const titleDiv = domAdapter.querySelector(itemElement, ".session-title");

  if (!titleDiv) {
    return null;
  }

  // Hide original title
  domAdapter.setStyle(titleDiv, "display", "none");

  // Create input
  const input = domAdapter.createElement("input");
  domAdapter.addClass(input, "session-rename-input");
  domAdapter.setAttribute(input, "type", "text");
  domAdapter.setAttribute(input, "value", currentTitle);
  domAdapter.setAttribute(input, "data-original-title", currentTitle);

  // Insert input after title
  const contentDiv = domAdapter.querySelector(itemElement, ".session-content");
  domAdapter.insertBefore(contentDiv, input, titleDiv.nextSibling);

  return input;
}

/**
 * Hide rename input and restore title
 *
 * @param {HTMLElement} itemElement - Session item element
 * @param {Object} domAdapter - DOM adapter
 * @param {string|null} newTitle - New title (null to restore original)
 */
export function hideRenameInput(itemElement, domAdapter, newTitle = null) {
  const input = domAdapter.querySelector(itemElement, ".session-rename-input");
  const titleDiv = domAdapter.querySelector(itemElement, ".session-title");

  if (!input || !titleDiv) {
    return;
  }

  // Update title if provided
  if (newTitle?.trim()) {
    domAdapter.setTextContent(titleDiv, newTitle.trim());
  }

  // Show title, remove input
  domAdapter.setStyle(titleDiv, "display", "");
  domAdapter.removeElement(input);
}

/**
 * Get session ID from element
 *
 * @param {HTMLElement} element - Session item or child element
 * @param {Object} domAdapter - DOM adapter
 * @returns {string|null} Session ID
 */
export function getSessionIdFromElement(element, domAdapter) {
  const sessionItem = domAdapter.closest(element, ".session-item");
  return sessionItem ? domAdapter.getAttribute(sessionItem, "data-session-id") : null;
}

/**
 * Update session active state
 *
 * @param {HTMLElement} sessionElement - Session item element
 * @param {boolean} isActive - Whether session should be active
 * @param {Object} domAdapter - DOM adapter
 */
export function updateSessionActive(sessionElement, isActive, domAdapter) {
  if (isActive) {
    domAdapter.addClass(sessionElement, "active");
  } else {
    domAdapter.removeClass(sessionElement, "active");
  }
}

/**
 * Update session title
 *
 * @param {HTMLElement} sessionElement - Session item element
 * @param {string} newTitle - New title text
 * @param {Object} domAdapter - DOM adapter
 */
export function updateSessionTitle(sessionElement, newTitle, domAdapter) {
  const titleDiv = domAdapter.querySelector(sessionElement, ".session-title");
  if (titleDiv) {
    domAdapter.setTextContent(titleDiv, newTitle);
  }
}

/**
 * Remove session item from DOM
 *
 * @param {HTMLElement} sessionElement - Session item element
 * @param {Object} domAdapter - DOM adapter
 */
export function removeSessionItem(sessionElement, domAdapter) {
  domAdapter.remove(sessionElement);
}

/**
 * Find session element by ID in container
 *
 * @param {HTMLElement} container - Container element
 * @param {string} sessionId - Session ID
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement|null} Session element or null
 */
export function findSessionElement(container, sessionId, domAdapter) {
  return domAdapter.querySelector(container, `[data-session-id="${sessionId}"]`);
}
