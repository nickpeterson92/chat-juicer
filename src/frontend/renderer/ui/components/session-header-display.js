/**
 * SessionHeaderDisplay - Session name display in chat header
 *
 * Shows current session name with dropdown menu (Pin, Rename, Delete)
 * Only visible when sidebar is collapsed.
 * Includes fly-in animation when sidebar opens/closes.
 */

// SVG icons
const PIN_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 17v5"/>
  <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
</svg>`;

const RENAME_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
</svg>`;

const DELETE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
</svg>`;

const CHECK_ICON = `<svg class="pin-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

/** @type {HTMLElement|null} */
let displayElement = null;
/** @type {HTMLElement|null} */
let nameElement = null;
/** @type {HTMLElement|null} */
let chevronButton = null;
/** @type {HTMLElement|null} */
let menuElement = null;
/** @type {Object|null} */
let currentSession = null;
/** @type {Function|null} */
let unsubscribe = null;
/** @type {Object|null} */
let deps = null;

/**
 * Initialize session header display
 * @param {Object} dependencies
 * @param {Object} dependencies.appState - Application state
 * @param {Object} dependencies.sessionService - Session service
 */
export function initSessionHeaderDisplay(dependencies) {
  deps = dependencies;

  displayElement = document.getElementById("header-session-display");
  nameElement = document.getElementById("header-session-name");
  chevronButton = document.getElementById("header-session-chevron");

  if (!displayElement || !nameElement || !chevronButton) {
    console.warn("[SessionHeaderDisplay] Required elements not found");
    return;
  }

  // Create dropdown menu
  createMenu();

  // Event listeners
  nameElement.addEventListener("click", handleNameClick);
  chevronButton.addEventListener("click", handleChevronClick);
  document.addEventListener("click", handleOutsideClick);

  // Subscribe to session changes
  if (deps.appState) {
    unsubscribe = deps.appState.subscribe("session.current", (sessionId) => {
      // session.current stores just the ID, get full session from service
      if (sessionId && deps.sessionService) {
        const session = deps.sessionService.getSession(sessionId);
        updateDisplay(session);
      } else {
        updateDisplay(null);
      }
    });

    // Initial update
    const currentSessionId = deps.appState.getState("session.current");
    if (currentSessionId && deps.sessionService) {
      const session = deps.sessionService.getSession(currentSessionId);
      updateDisplay(session);
    } else {
      // Hide on launch when no session
      updateDisplay(null);
    }
  }
}

/**
 * Create dropdown menu
 */
function createMenu() {
  menuElement = document.createElement("div");
  menuElement.className = "session-header-menu";
  menuElement.id = "session-header-menu";

  // Pin item - has icon, label, and checkmark (like MCP toggles)
  const pinItem = document.createElement("button");
  pinItem.className = "session-header-menu-item pin-item";
  pinItem.innerHTML = `${PIN_ICON}<span class="pin-label">Pin</span>${CHECK_ICON}`;
  pinItem.addEventListener("click", handlePin);

  // Rename item
  const renameItem = document.createElement("button");
  renameItem.className = "session-header-menu-item rename-item";
  renameItem.innerHTML = `${RENAME_ICON}<span>Rename</span>`;
  renameItem.addEventListener("click", handleRename);

  // Delete item
  const deleteItem = document.createElement("button");
  deleteItem.className = "session-header-menu-item delete-item";
  deleteItem.innerHTML = `${DELETE_ICON}<span>Delete</span>`;
  deleteItem.addEventListener("click", handleDelete);

  menuElement.appendChild(pinItem);
  menuElement.appendChild(renameItem);
  menuElement.appendChild(deleteItem);

  document.body.appendChild(menuElement);
}

/**
 * Update display with session data
 * @param {Object|null} session
 */
function updateDisplay(session) {
  currentSession = session;

  if (!displayElement || !nameElement || !chevronButton) return;

  if (session) {
    nameElement.textContent = session.title || "Untitled Session";
    nameElement.title = `Click to rename: ${session.title || "Untitled Session"}`;
    displayElement.classList.add("has-session"); // Show when session exists
  } else {
    nameElement.textContent = "";
    nameElement.title = "";
    displayElement.classList.remove("has-session"); // Hide on welcome page
  }

  // Update pin state in menu
  updatePinState();
}

/**
 * Update pin button state
 */
function updatePinState() {
  if (!menuElement || !currentSession) return;

  const pinItem = menuElement.querySelector(".pin-item");
  if (pinItem) {
    const isPinned = currentSession.pinned;
    pinItem.classList.toggle("pinned", isPinned);
    // Update label text only (keep icon and check)
    const label = pinItem.querySelector(".pin-label");
    if (label) {
      label.textContent = isPinned ? "Pinned" : "Pin";
    }
  }
}

/**
 * Handle click on session name - trigger inline rename
 */
function handleNameClick(e) {
  e.stopPropagation();
  closeMenu();
  startInlineRename();
}

/**
 * Handle chevron click - toggle menu
 */
function handleChevronClick(e) {
  e.stopPropagation();
  toggleMenu();
}

/**
 * Toggle dropdown menu visibility
 */
function toggleMenu() {
  if (!menuElement || !chevronButton) return;

  const isOpen = menuElement.classList.contains("visible");

  if (isOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

/**
 * Open dropdown menu
 */
function openMenu() {
  if (!menuElement || !chevronButton) return;

  // Position menu below chevron
  const rect = chevronButton.getBoundingClientRect();
  menuElement.style.top = `${rect.bottom + 4}px`;
  menuElement.style.left = `${rect.left}px`;

  menuElement.classList.add("visible");
  chevronButton.classList.add("open");
}

/**
 * Close dropdown menu
 */
function closeMenu() {
  if (!menuElement || !chevronButton) return;

  menuElement.classList.remove("visible");
  chevronButton.classList.remove("open");
}

/**
 * Handle clicks outside menu
 */
function handleOutsideClick(e) {
  if (!menuElement) return;

  const isMenuClick = menuElement.contains(e.target);
  const isChevronClick = chevronButton?.contains(e.target);

  if (!isMenuClick && !isChevronClick) {
    closeMenu();
  }
}

/**
 * Handle pin action
 */
async function handlePin(e) {
  e.stopPropagation();
  closeMenu();

  if (!currentSession || !deps?.sessionService) return;

  const shouldPin = !currentSession.pinned;

  try {
    const result = await deps.sessionService.setSessionPinned(currentSession.session_id, shouldPin);
    if (result.success) {
      // Update local state
      currentSession = { ...currentSession, pinned: shouldPin };
      updatePinState();

      // Refresh sessions list
      const { globalEventBus } = await import("../../core/event-bus.js");
      globalEventBus.emit("sessions:refresh");
    }
  } catch (error) {
    console.error("[SessionHeaderDisplay] Pin failed:", error);
  }
}

/**
 * Handle rename action from menu
 */
function handleRename(e) {
  e.stopPropagation();
  closeMenu();
  startInlineRename();
}

/**
 * Start inline rename
 */
function startInlineRename() {
  if (!nameElement || !currentSession) return;

  const currentTitle = currentSession.title || "Untitled Session";

  // Create input
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentTitle;
  input.className = "header-session-rename-input";

  // Hide name, show input
  nameElement.style.display = "none";
  nameElement.parentNode?.insertBefore(input, nameElement.nextSibling);

  input.focus();
  input.select();

  const saveRename = async () => {
    const newTitle = input.value.trim();
    input.remove();
    nameElement.style.display = "";

    if (!newTitle || newTitle === currentTitle) return;

    if (deps?.sessionService) {
      try {
        const result = await deps.sessionService.renameSession(currentSession.session_id, newTitle);
        if (result.success) {
          // Update display
          currentSession = { ...currentSession, title: newTitle };
          updateDisplay(currentSession);

          // Refresh sessions list
          const { globalEventBus } = await import("../../core/event-bus.js");
          globalEventBus.emit("sessions:refresh");
        }
      } catch (error) {
        console.error("[SessionHeaderDisplay] Rename failed:", error);
      }
    }
  };

  input.addEventListener("blur", saveRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRename();
    } else if (e.key === "Escape") {
      input.remove();
      nameElement.style.display = "";
    }
  });
}

/**
 * Handle delete action
 */
async function handleDelete(e) {
  e.stopPropagation();
  closeMenu();

  if (!currentSession || !deps?.sessionService) return;

  const confirmDelete = confirm(`Delete session "${currentSession.title || "Untitled Session"}"?`);
  if (!confirmDelete) return;

  try {
    // Suppress "Disconnected from backend" toast since we are intentionally closing the WebSocket
    if (deps.appState) {
      deps.appState.setState("ui.intentionalDisconnect", true);
    }

    const result = await deps.sessionService.deleteSession(currentSession.session_id);
    if (result.success) {
      // Clear display
      updateDisplay(null);

      // Emit event for view transition
      const { globalEventBus } = await import("../../core/event-bus.js");
      globalEventBus.emit("session:deleted", { sessionId: currentSession.session_id });
      globalEventBus.emit("sessions:refresh");

      if (deps.appState) {
        deps.appState.setState("ui.intentionalDisconnect", false);
      }
    }
  } catch (error) {
    console.error("[SessionHeaderDisplay] Delete failed:", error);
    alert(`Failed to delete session: ${error.message}`);
  }
}

/**
 * Update session header display externally
 * @param {Object|null} session
 */
export function updateSessionHeaderDisplay(session) {
  updateDisplay(session);
}

/**
 * Destroy session header display
 */
export function destroySessionHeaderDisplay() {
  // Cleanup listeners
  if (nameElement) {
    nameElement.removeEventListener("click", handleNameClick);
  }
  if (chevronButton) {
    chevronButton.removeEventListener("click", handleChevronClick);
  }
  document.removeEventListener("click", handleOutsideClick);

  // Remove menu
  if (menuElement) {
    menuElement.remove();
    menuElement = null;
  }

  // Unsubscribe from state
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  // Clear references
  displayElement = null;
  nameElement = null;
  chevronButton = null;
  currentSession = null;
  deps = null;
}
