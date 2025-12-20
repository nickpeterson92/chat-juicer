/**
 * SessionListRenderer - Pure functions for rendering session lists
 * NO DEPENDENCIES on services or global state
 *
 * Input: Session data objects
 * Output: DOM elements via DOMAdapter
 */

import smokeAnimationData from "../../../ui/Smoke.json";
import { CRITICAL_COLORS } from "../../config/colors.js";
import { initLottieWithColor } from "../../utils/lottie-color.js";
import { formatTimestamp } from "../../viewmodels/session-viewmodel.js";

// Store Lottie animation instances by session ID for cleanup
const sessionLottieAnimations = new Map();

/**
 * Render a single session list item
 *
 * @param {Object} session - Session data object
 * @param {string} session.id - Session ID
 * @param {string} session.title - Session title
 * @param {string} session.created_at - ISO timestamp
 * @param {boolean} isActive - Whether this session is active
 * @param {Object} domAdapter - DOM adapter
 * @param {Object} streamManager - StreamManager instance (optional)
 * @returns {HTMLElement} Session list item element
 */
export function renderSessionItem(session, isActive, domAdapter, streamManager = null) {
  const itemDiv = domAdapter.createElement("div");
  domAdapter.addClass(itemDiv, "session-item");
  domAdapter.setAttribute(itemDiv, "data-session-id", session.id);
  if (session.pinned) {
    domAdapter.addClass(itemDiv, "session-pinned");
    domAdapter.setAttribute(itemDiv, "data-pinned", "true");
  }

  if (isActive) {
    domAdapter.addClass(itemDiv, "active");
  }

  // Add streaming indicator container (always present, visibility controlled by CSS)
  const streamingIndicator = domAdapter.createElement("div");
  domAdapter.addClass(streamingIndicator, "session-streaming-indicator");
  domAdapter.appendChild(itemDiv, streamingIndicator);

  // Add streaming class if session is streaming and init Lottie
  if (streamManager?.isStreaming(session.id)) {
    domAdapter.addClass(itemDiv, "session-streaming");
    // Initialize Lottie animation after DOM is ready
    requestAnimationFrame(() => {
      initSessionStreamingLottie(session.id, streamingIndicator);
    });
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

  // Pin/unpin button
  const pinBtn = domAdapter.createElement("button");
  domAdapter.addClass(pinBtn, "session-action-btn", "pin-btn");
  domAdapter.setAttribute(pinBtn, "aria-label", session.pinned ? "Unpin session" : "Pin session");
  domAdapter.setAttribute(pinBtn, "data-action", "pin");
  domAdapter.setAttribute(pinBtn, "data-session-id", session.id);
  domAdapter.setAttribute(pinBtn, "title", session.pinned ? "Unpin session" : "Pin session");
  domAdapter.setAttribute(pinBtn, "data-pinned", session.pinned ? "true" : "false");
  // Match sizing to other action icons (14px)
  const pinSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pin-icon lucide-pin"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>`;
  pinBtn.innerHTML = pinSVG;

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

  domAdapter.appendChild(actionsDiv, pinBtn);
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
 * @param {Object} streamManager - StreamManager instance (optional)
 * @returns {DocumentFragment} Fragment containing all session items
 */
export function renderSessionList(sessions, activeSessionId, domAdapter, streamManager = null) {
  if (!domAdapter || !domAdapter.getDocument) {
    // Handle null adapter case in tests
    return null;
  }

  const fragment = domAdapter.getDocument().createDocumentFragment();

  for (const session of sessions) {
    const isActive = session.id === activeSessionId;
    const itemElement = renderSessionItem(session, isActive, domAdapter, streamManager);
    fragment.appendChild(itemElement);
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

/**
 * Initialize Lottie animation for session streaming indicator
 * @param {string} sessionId - Session ID
 * @param {HTMLElement} container - Container element for the animation
 */
function initSessionStreamingLottie(sessionId, container) {
  // Clean up existing animation if any
  if (sessionLottieAnimations.has(sessionId)) {
    sessionLottieAnimations.get(sessionId).destroy();
    sessionLottieAnimations.delete(sessionId);
  }

  // Clear container
  container.innerHTML = "";

  // Initialize new animation with brand color
  const animation = initLottieWithColor(container, smokeAnimationData, CRITICAL_COLORS.BRAND_PRIMARY);
  if (animation) {
    sessionLottieAnimations.set(sessionId, animation);
  }
}

/**
 * Update streaming indicator for a specific session
 * Called when streaming starts or ends to update UI without full re-render
 *
 * @param {string} sessionId - Session ID to update
 * @param {boolean} isStreaming - Whether the session is streaming
 */
export function updateSessionStreamingIndicator(sessionId, isStreaming) {
  const sessionItem = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (!sessionItem) return;

  const indicator = sessionItem.querySelector(".session-streaming-indicator");
  if (!indicator) return;

  if (isStreaming) {
    sessionItem.classList.add("session-streaming");
    // Initialize Lottie animation
    initSessionStreamingLottie(sessionId, indicator);
  } else {
    sessionItem.classList.remove("session-streaming");
    // Clean up Lottie animation
    if (sessionLottieAnimations.has(sessionId)) {
      sessionLottieAnimations.get(sessionId).destroy();
      sessionLottieAnimations.delete(sessionId);
    }
    indicator.innerHTML = "";
  }
}

/**
 * Clean up Lottie animation for a session
 * Called when session item is removed from DOM
 *
 * @param {string} sessionId - Session ID to clean up
 */
export function cleanupSessionStreamingAnimation(sessionId) {
  if (sessionLottieAnimations.has(sessionId)) {
    sessionLottieAnimations.get(sessionId).destroy();
    sessionLottieAnimations.delete(sessionId);
  }
}
