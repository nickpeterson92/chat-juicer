/**
 * Wishgate Renderer - Main Entry Point
 * Modular architecture with ES6 modules
 */

// Import CSS for Vite bundling
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";

import {
  BYTES_PER_KILOBYTE,
  CONNECTION_RESET_DELAY,
  DELETE_SESSION_CONFIRM_MESSAGE,
  JSON_DELIMITER,
  MESSAGE_BATCH_DELAY,
  MESSAGE_BATCH_SIZE,
  MSG_BOT_DISCONNECTED,
  MSG_BOT_RESTARTED,
  MSG_BOT_RESTARTING,
  MSG_BOT_SESSION_ENDED,
  MSG_DELETE_FILE_CONFIRM,
  MSG_DELETE_SESSION_CONFIRM,
  MSG_FILE_DELETE_ERROR,
  MSG_FILE_DELETE_FAILED,
  MSG_FILE_DELETED,
  MSG_FILE_UPLOAD_FAILED,
  MSG_FILE_UPLOAD_PARTIAL,
  MSG_FILE_UPLOADED,
  MSG_FILES_ERROR,
  MSG_FILES_LOAD_FAILED,
  MSG_LOADING_FILES,
  MSG_NO_FILE_SELECTED,
  MSG_NO_FILES,
  MSG_NO_FILES_DROPPED,
  MSG_NO_SESSION_SELECTED,
  MSG_NO_SESSIONS,
  MSG_SESSION_DELETE_FAILED,
  MSG_SESSION_DELETED,
  MSG_SUMMARIZE_CURRENT_ONLY,
  MSG_SUMMARIZE_ERROR,
  MSG_UPLOADING_FILE,
  OLD_CARD_THRESHOLD,
  SIDEBAR_COLLAPSE_DELAY,
  SIZE_PRECISION_MULTIPLIER,
  UPLOAD_PROGRESS_HIDE_DELAY,
} from "./config/constants.js";
import { AppState } from "./core/state.js";
import { processMessage } from "./handlers/message-handlers.js";
// Manager imports
import { elements, initializeElements } from "./managers/dom-manager.js";
import { activeFilesDirectory, loadFiles, setActiveFilesDirectory } from "./managers/file-manager.js";
import { initializeTheme, toggleTheme } from "./managers/theme-manager.js";
import { showChatView, showWelcomeView } from "./managers/view-manager.js";
import {
  clearCurrentSession,
  deleteSession,
  loadSessions,
  renameSession,
  sessionState,
  summarizeCurrentSession,
  switchSession,
} from "./services/session-service.js";
import { addMessage, clearChat, clearMessageCache } from "./ui/chat-ui.js";
import { clearFunctionCards } from "./ui/function-card-ui.js";
import { getSuggestionPrompt, hideWelcomePage, showWelcomePage } from "./ui/welcome-page.js";
import { clearParseCache } from "./utils/json-cache.js";
// Module imports
import { showToast } from "./utils/toast.js";

// ====================
// DOM Element Management (via dom-manager)
// ====================

// Initialize immediately since renderer.js loads at end of body
initializeElements();

// ====================
// State Management
// ====================

const appState = new AppState();

// ====================
// Connection Status UI Handler
// ====================

function updateConnectionUI(status) {
  switch (status) {
    case "CONNECTED":
      if (elements.statusIndicator) elements.statusIndicator.classList.remove("disconnected");
      if (elements.statusText) elements.statusText.textContent = "Connected";
      if (elements.userInput) elements.userInput.disabled = false;
      if (elements.sendBtn) elements.sendBtn.disabled = false;
      break;

    case "DISCONNECTED":
    case "ERROR":
      if (elements.statusIndicator) elements.statusIndicator.classList.add("disconnected");
      if (elements.statusText) elements.statusText.textContent = status === "ERROR" ? "Error" : "Disconnected";
      if (elements.userInput) elements.userInput.disabled = true;
      if (elements.sendBtn) elements.sendBtn.disabled = true;
      break;

    case "RECONNECTING":
      if (elements.statusIndicator) elements.statusIndicator.classList.add("disconnected");
      if (elements.statusText) elements.statusText.textContent = "Reconnecting...";
      if (elements.userInput) elements.userInput.disabled = true;
      if (elements.sendBtn) elements.sendBtn.disabled = true;
      break;
  }
}

// Subscribe to connection status changes
appState.subscribe("connection.status", (newStatus) => {
  updateConnectionUI(newStatus);
});

// ====================
// Event Listener Management (AbortController Pattern)
// ====================

const eventAbortController = new AbortController();

/**
 * Add an event listener with AbortController for automatic cleanup
 * @param {HTMLElement} element - Target element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler function
 * @param {Object} options - Additional options (merged with signal)
 */
function addManagedEventListener(element, event, handler, options = {}) {
  if (element?.addEventListener) {
    element.addEventListener(event, handler, {
      ...options,
      signal: eventAbortController.signal,
    });
  }
}

// ====================
// User Input Handling
// ====================

function sendMessage() {
  if (!elements.userInput || !elements.sendBtn) {
    window.electronAPI.log("error", "Elements not initialized properly");
    return;
  }

  const message = elements.userInput.value.trim();
  if (!message || appState.connection.status !== "CONNECTED") return;

  // Add user message to chat
  addMessage(elements.chatContainer, message, "user");

  // Clear input
  elements.userInput.value = "";

  // Reset assistant message state
  appState.setState("message.currentAssistant", null);
  appState.setState("message.assistantBuffer", "");

  // Send to main process
  window.electronAPI.sendUserInput(message);
}

// ====================
// View Management (via view-manager)
// ====================

// View management functions moved to managers/view-manager.js
// showWelcomeView() and showChatView() are now imported

// ====================
// Bot Output Processing
// ====================

let jsonBuffer = "";

const messageBatch = {
  buffer: [],
  timeout: null,
  maxBatchSize: MESSAGE_BATCH_SIZE,
  maxDelay: MESSAGE_BATCH_DELAY,

  add(message) {
    this.buffer.push(message);

    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
    } else if (!this.timeout) {
      this.timeout = setTimeout(() => this.flush(), this.maxDelay);
    }
  },

  flush() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.buffer.length === 0) return;

    const messages = this.buffer.splice(0);
    requestAnimationFrame(() => {
      for (const msg of messages) {
        processMessage(msg, { appState, elements });
      }
    });
  },
};

window.electronAPI.onBotOutput((output) => {
  // Add output to buffer
  jsonBuffer += output;

  // Safety check: prevent unbounded buffer growth (10MB limit)
  const MAX_JSON_BUFFER = 10 * 1024 * 1024;
  if (jsonBuffer.length > MAX_JSON_BUFFER) {
    window.electronAPI.log("error", "JSON buffer overflow detected", {
      bufferSize: jsonBuffer.length,
      maxSize: MAX_JSON_BUFFER,
    });
    jsonBuffer = ""; // Reset buffer
    showToast("Error: Message too large. Connection reset", "error", 5000);
    return;
  }

  // Process all complete JSON messages in the buffer
  let startIndex = jsonBuffer.indexOf(JSON_DELIMITER);
  while (startIndex !== -1) {
    const endIndex = jsonBuffer.indexOf(JSON_DELIMITER, startIndex + JSON_DELIMITER.length);

    if (endIndex === -1) {
      // Incomplete JSON message, wait for more data
      break;
    }

    // Extract complete JSON message
    const jsonStr = jsonBuffer.substring(startIndex + JSON_DELIMITER.length, endIndex);

    // Remove processed message from buffer
    jsonBuffer = jsonBuffer.substring(endIndex + JSON_DELIMITER.length);

    // Update startIndex for next iteration
    startIndex = jsonBuffer.indexOf(JSON_DELIMITER);

    // Skip empty or whitespace-only content (can occur with consecutive delimiters)
    if (!jsonStr.trim()) {
      continue;
    }

    // Parse and handle the JSON message
    try {
      const message = JSON.parse(jsonStr);

      window.electronAPI.log("debug", "Processing message type", { type: message.type });

      if (message.type === "assistant_delta") {
        processMessage(message, { appState, elements });
      } else if (message.type === "assistant_end") {
        messageBatch.flush();
        processMessage(message, { appState, elements });
      } else {
        processMessage(message, { appState, elements });
      }
    } catch (e) {
      window.electronAPI.log("error", "Failed to parse JSON message", { error: e.message, json: jsonStr });
    }
  }

  // Process any non-JSON lines for legacy format handling
  const lines = output.split("\n");
  for (const line of lines) {
    if (!line.trim() || line.includes(JSON_DELIMITER)) continue;

    // Skip the initial connection message from Python bot
    if (
      appState.connection.isInitial &&
      (line.includes("Welcome to Wishgate!") ||
        line.includes("Connected to") ||
        line.includes("Using deployment:") ||
        line.includes("Using model:") ||
        line.includes("Type 'quit'") ||
        line.includes("====") ||
        line.includes("Enter your message"))
    ) {
      appState.setState("connection.isInitial", false);
      appState.setState("connection.hasShownWelcome", true);
      continue;
    }

    // Check for exit conditions
    if (line.includes("Goodbye!") || line.includes("An error occurred")) {
      setConnectionStatus(false);
      if (line.includes("Goodbye!")) {
        showToast(MSG_BOT_SESSION_ENDED, "warning", 4000);
      }
    }
  }
});

// ====================
// Bot Lifecycle Handlers
// ====================

window.electronAPI.onBotError((error) => {
  window.electronAPI.log("error", "Bot error", { error });

  if (elements.aiThinking) {
    elements.aiThinking.classList.remove("active");
  }

  showToast(`Error: ${error}`, "error", 5000);
  setConnectionStatus(false);
});

window.electronAPI.onBotDisconnected(() => {
  if (elements.aiThinking) {
    elements.aiThinking.classList.remove("active");
  }

  setConnectionStatus(false);
  showToast(MSG_BOT_DISCONNECTED, "error", 5000);
});

window.electronAPI.onBotRestarted(() => {
  // Clear UI
  clearChat(elements.chatContainer);
  clearFunctionCards(elements.chatContainer);

  // Clear timers
  for (const timerId of appState.functions.activeTimers) {
    clearTimeout(timerId);
  }
  appState.functions.activeTimers.clear();

  // Clear state
  appState.functions.activeCalls.clear();
  appState.functions.argumentsBuffer.clear();
  appState.setState("connection.hasShownWelcome", false);
  appState.setState("message.currentAssistant", null);
  appState.setState("message.assistantBuffer", "");

  // PERFORMANCE: Clear caches to prevent memory leaks
  clearMessageCache();
  clearParseCache();

  showToast(MSG_BOT_RESTARTING, "info", 2000);

  setTimeout(() => {
    setConnectionStatus(true);
    showToast(MSG_BOT_RESTARTED, "success", 3000);
  }, CONNECTION_RESET_DELAY);
});

// ====================
// Connection Status
// ====================

function setConnectionStatus(connected) {
  if (connected) {
    appState.setConnectionStatus("CONNECTED");
  } else {
    appState.setConnectionStatus("DISCONNECTED");
  }
}

// ====================
// Source Files Management UI (via file-manager)
// ====================

// File management functions moved to managers/file-manager.js
// loadFiles(), getFileIcon(), formatFileSize() are now imported

// ====================
// Session Management UI
// ====================

/**
 * Collapse sidebar to give content more space
 * Reusable utility for new chat and session switching
 */
function collapseSidebar() {
  if (elements.sidebar) {
    elements.sidebar.classList.add("collapsed");
    window.electronAPI.log("debug", "Sidebar collapsed");
  }
}

function updateSessionsList() {
  if (!elements.sessionsList) return;

  elements.sessionsList.innerHTML = "";

  if (sessionState.sessions.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "sessions-loading";
    emptyMsg.textContent = MSG_NO_SESSIONS;
    elements.sessionsList.appendChild(emptyMsg);
    return;
  }

  sessionState.sessions.forEach((session) => {
    const sessionItem = document.createElement("div");
    sessionItem.className = "session-item";
    sessionItem.dataset.sessionId = session.session_id;

    if (session.session_id === sessionState.currentSessionId) {
      sessionItem.classList.add("active");
    }

    // Session title
    const sessionTitle = document.createElement("div");
    sessionTitle.className = "session-title";
    sessionTitle.textContent = session.title || "Untitled Conversation";
    sessionItem.appendChild(sessionTitle);

    // Session actions (summarize, delete)
    const sessionActions = document.createElement("div");
    sessionActions.className = "session-actions";

    // Summarize button
    const summarizeBtn = document.createElement("button");
    summarizeBtn.className = "session-action-btn";
    summarizeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
    </svg>`;
    summarizeBtn.title = "Summarize session";
    summarizeBtn.onclick = (e) => {
      e.stopPropagation();
      handleSummarizeSession(session.session_id);
    };
    sessionActions.appendChild(summarizeBtn);

    // Rename button
    const renameBtn = document.createElement("button");
    renameBtn.className = "session-action-btn";
    renameBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>`;
    renameBtn.title = "Rename session";
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      handleRenameSession(session.session_id, session.title);
    };
    sessionActions.appendChild(renameBtn);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "session-action-btn";
    deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`;
    deleteBtn.title = "Delete session";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      handleDeleteSession(session.session_id);
    };
    sessionActions.appendChild(deleteBtn);

    sessionItem.appendChild(sessionActions);

    // Click handler for switching sessions
    sessionItem.onclick = () => {
      if (session.session_id !== sessionState.currentSessionId) {
        handleSwitchSession(session.session_id);
      }
    };

    elements.sessionsList.appendChild(sessionItem);
  });

  // Add "Load More" button if there are more sessions
  if (sessionState.hasMoreSessions) {
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.className = "load-more-sessions-btn";
    loadMoreBtn.textContent = sessionState.isLoadingSessions
      ? "Loading..."
      : `Load More (${sessionState.sessions.length}/${sessionState.totalSessions})`;
    loadMoreBtn.disabled = sessionState.isLoadingSessions;

    loadMoreBtn.onclick = async () => {
      const { loadMoreSessions } = await import("./services/session-service.js");
      await loadMoreSessions(window.electronAPI, updateSessionsList);
    };

    elements.sessionsList.appendChild(loadMoreBtn);
  }
}

async function handleCreateNewSession() {
  // Clear current session in backend (lazy initialization pattern)
  await clearCurrentSession(window.electronAPI);

  // Show welcome page (defers session creation until first message)
  showWelcomeView(elements, appState);

  // Collapse sidebar to give welcome screen more space
  collapseSidebar();

  // Clear chat for fresh start
  clearChat(elements.chatContainer);
  clearFunctionCards(elements.chatContainer);

  // Update sessions list
  await loadSessions(window.electronAPI, updateSessionsList);
}

async function handleSwitchSession(sessionId) {
  const result = await switchSession(window.electronAPI, elements, appState, sessionId);
  if (result.success) {
    // Switch to chat view when loading existing session
    showChatView(elements, appState);

    // Collapse sidebar to give chat more space
    collapseSidebar();

    // Session list already updated by switchSession
    updateSessionsList();

    // Scroll to bottom after sidebar collapse and all messages are rendered
    setTimeout(() => {
      if (elements.chatContainer) {
        elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
      }
    }, SIDEBAR_COLLAPSE_DELAY);
  }
}

async function handleDeleteSession(sessionIdToDelete) {
  if (!sessionIdToDelete) {
    showToast(MSG_NO_SESSION_SELECTED, "error", 3000);
    return;
  }

  const sessionToDelete = sessionState.sessions.find((s) => s.session_id === sessionIdToDelete);
  const title = sessionToDelete?.title || "this conversation";

  if (
    !confirm(MSG_DELETE_SESSION_CONFIRM.replace("{title}", title).replace("{message}", DELETE_SESSION_CONFIRM_MESSAGE))
  ) {
    return;
  }

  // Delete the session (backend handles current session gracefully)
  let result;
  try {
    result = await deleteSession(window.electronAPI, elements, sessionIdToDelete);
  } catch (error) {
    window.electronAPI.log("error", "Failed to delete session", { error: error.message });
    showToast(MSG_SESSION_DELETE_FAILED, "error", 4000);
    return;
  }

  if (result.success) {
    // Check if there will be any sessions left after deletion
    const remainingSessions = sessionState.sessions.filter((s) => s.session_id !== sessionIdToDelete);

    if (remainingSessions.length === 0) {
      // Last chat deleted - fresh start with everything collapsed
      window.electronAPI.log("info", "Last session deleted - triggering fresh start");

      // Clear current session in backend
      await clearCurrentSession(window.electronAPI);

      // Show welcome page
      showWelcomeView(elements, appState);

      // Collapse sidebar for fresh start
      collapseSidebar();

      // Collapse files panel too for complete fresh start
      if (elements.filesPanel && !elements.filesPanel.classList.contains("collapsed")) {
        elements.filesPanel.classList.add("collapsed");
        const wrapper = document.getElementById("files-toggle-wrapper");
        const icon = document.getElementById("toggle-files-icon");
        if (wrapper) {
          wrapper.classList.add("panel-collapsed");
        }
        if (elements.toggleFilesBtn) {
          elements.toggleFilesBtn.title = "Show source files";
          if (icon) {
            icon.style.transform = "rotate(0deg)"; // Point left when collapsed
          }
        }
      }

      // Clear chat for fresh start
      clearChat(elements.chatContainer);
      clearFunctionCards(elements.chatContainer);
    } else if (sessionIdToDelete === sessionState.currentSessionId) {
      // We deleted the current session, but there are others - switch to one
      window.electronAPI.log("info", "Switching to another session after deleting current", {
        to: remainingSessions[0].session_id,
      });
      await handleSwitchSession(remainingSessions[0].session_id);
    }

    await loadSessions(window.electronAPI, updateSessionsList);
    showToast(MSG_SESSION_DELETED.replace("{title}", title), "success", 3000);
  }
}

async function handleSummarizeSession(sessionId) {
  if (!sessionId) {
    showToast(MSG_NO_SESSION_SELECTED, "error", 3000);
    return;
  }

  // If summarizing a different session, switch to it first
  if (sessionId !== sessionState.currentSessionId) {
    showToast(MSG_SUMMARIZE_CURRENT_ONLY, "warning", 3000);
    return;
  }

  try {
    await summarizeCurrentSession(window.electronAPI, elements);
    // Result messages are already handled by the service function
  } catch (error) {
    window.electronAPI.log("error", "Unexpected error during summarization", { error: error.message });
    showToast(MSG_SUMMARIZE_ERROR, "error", 4000);
  }
}

async function handleRenameSession(sessionId, currentTitle) {
  if (!sessionId) {
    showToast(MSG_NO_SESSION_SELECTED, "error", 3000);
    return;
  }

  // Find the session item in the DOM
  const sessionItem = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
  if (!sessionItem) return;

  const titleElement = sessionItem.querySelector(".session-title");
  if (!titleElement) return;

  // Store original title for cancel
  const originalTitle = titleElement.textContent;

  // Create an input element
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentTitle;
  input.className = "session-title-edit";
  input.style.cssText = `
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-input-focus);
    border-radius: 0.25rem;
    background-color: var(--color-input-bg);
    color: var(--color-text-primary);
    font-size: 0.875rem;
    outline: none;
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
  `;

  // Replace title with input
  titleElement.style.display = "none";
  titleElement.parentNode.insertBefore(input, titleElement);

  // Focus and select all text
  input.focus();
  input.select();

  // Handler to save the new title
  const saveRename = async () => {
    const newTitle = input.value.trim();

    // Remove input and restore title display
    input.remove();
    titleElement.style.display = "";

    // If title unchanged or empty, just cancel
    if (!newTitle || newTitle === originalTitle) {
      return;
    }

    try {
      const result = await renameSession(window.electronAPI, sessionId, newTitle);
      if (result.success) {
        // Update sessions list
        await loadSessions(window.electronAPI, updateSessionsList);
      }
      // Result messages (toasts) are already handled by the service function
    } catch (error) {
      window.electronAPI.log("error", "Unexpected error during rename", { error: error.message });
      showToast("Failed to rename conversation", "error", 4000);
    }
  };

  // Handler to cancel editing
  const cancelRename = () => {
    input.remove();
    titleElement.style.display = "";
  };

  // Save on Enter, cancel on Escape
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  });

  // Save when clicking outside
  input.addEventListener("blur", () => {
    // Small delay to allow click events to fire
    setTimeout(saveRename, 100);
  });
}

// ====================
// Theme Management (via theme-manager)
// ====================

// Theme management functions moved to managers/theme-manager.js
// initializeTheme() and toggleTheme() are now imported

// ====================
// Event Listeners
// ====================

function initializeEventListeners() {
  // Send message
  if (elements.sendBtn) {
    addManagedEventListener(elements.sendBtn, "click", sendMessage);
  }

  // Enter key to send
  if (elements.userInput) {
    addManagedEventListener(elements.userInput, "keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Restart button
  if (elements.restartBtn) {
    addManagedEventListener(elements.restartBtn, "click", () => {
      window.electronAPI.restartBot();
    });
  }

  // Toggle files panel
  if (elements.toggleFilesBtn) {
    addManagedEventListener(elements.toggleFilesBtn, "click", () => {
      const wrapper = document.getElementById("files-toggle-wrapper");
      const icon = document.getElementById("toggle-files-icon");

      elements.filesPanel.classList.toggle("collapsed");
      if (wrapper) {
        wrapper.classList.toggle("panel-collapsed");
      }

      // Rotate icon: collapsed (panel hidden) = point left, open (panel visible) = point right
      if (icon) {
        if (elements.filesPanel.classList.contains("collapsed")) {
          icon.style.transform = "rotate(0deg)"; // Point left (◀) when collapsed
          elements.toggleFilesBtn.title = "Show source files";
        } else {
          icon.style.transform = "rotate(180deg)"; // Point right (▶) when open
          elements.toggleFilesBtn.title = "Hide source files";
        }
      }
    });
  }

  // Refresh files button
  if (elements.refreshFilesBtn) {
    addManagedEventListener(elements.refreshFilesBtn, "click", () => loadFiles(activeFilesDirectory));
  }

  // File tabs switching
  const sourcesTab = document.getElementById("tab-sources");
  const outputTab = document.getElementById("tab-output");
  const filesTabs = [sourcesTab, outputTab].filter(Boolean);

  for (const tab of filesTabs) {
    addManagedEventListener(tab, "click", () => {
      const directory = tab.dataset.directory;

      // Update active tab styling
      for (const t of filesTabs) {
        t.classList.remove("active");
      }
      tab.classList.add("active");

      // Update active directory and load files
      setActiveFilesDirectory(directory);
      loadFiles(directory);
    });
  }

  // Theme toggle
  if (elements.themeToggle) {
    addManagedEventListener(elements.themeToggle, "click", () => toggleTheme(elements));
  }

  // Sidebar toggle (unified toggle button)
  if (elements.sidebarToggle) {
    addManagedEventListener(elements.sidebarToggle, "click", () => {
      if (elements.sidebar) {
        elements.sidebar.classList.toggle("collapsed");
      }
    });
  }

  // Sidebar close button (also acts as toggle)
  if (elements.sidebarCloseBtn) {
    addManagedEventListener(elements.sidebarCloseBtn, "click", () => {
      if (elements.sidebar) {
        elements.sidebar.classList.toggle("collapsed");
      }
    });
  }

  // Session management
  if (elements.newSessionBtn) {
    addManagedEventListener(elements.newSessionBtn, "click", handleCreateNewSession);
  }
}

initializeEventListeners();

// ====================
// Session Creation Handler
// ====================

// Session creation event handler (stored for cleanup)
const handleSessionCreated = (e) => {
  window.electronAPI.log("info", "Handling session-created event", {
    session_id: e.detail.session_id,
    title: e.detail.title,
  });

  // Reload sessions list to show newly created session
  loadSessions(window.electronAPI, updateSessionsList);
};

// Listen for session creation events from backend
window.addEventListener("session-created", handleSessionCreated, {
  signal: eventAbortController.signal,
});

// Session update event handler (title generation, renames, etc.)
const handleSessionUpdated = (e) => {
  window.electronAPI.log("info", "Handling session-updated event", {
    session_id: e.detail.session_id,
    title: e.detail.title,
  });

  // Session state already updated by message handler - just refresh the UI
  updateSessionsList();
};

// Listen for session update events from backend
window.addEventListener("session-updated", handleSessionUpdated, {
  signal: eventAbortController.signal,
});

// ====================
// File Upload Handlers
// ====================

// Prevent default drag behavior on document
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  document.addEventListener(
    eventName,
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { signal: eventAbortController.signal }
  );
});

// Show drop zone when dragging files over chat panel
if (elements.chatPanel) {
  elements.chatPanel.addEventListener(
    "dragenter",
    (e) => {
      if (e.dataTransfer?.types.includes("Files")) {
        if (elements.fileDropZone) {
          elements.fileDropZone.classList.add("active");
        }
      }
    },
    { signal: eventAbortController.signal }
  );
}

// Hide drop zone when dragging leaves the drop zone itself
if (elements.fileDropZone) {
  elements.fileDropZone.addEventListener(
    "dragleave",
    (e) => {
      if (e.target === elements.fileDropZone) {
        elements.fileDropZone.classList.remove("active");
      }
    },
    { signal: eventAbortController.signal }
  );
}

/**
 * Handle file drop upload
 * @param {DragEvent} e - Drop event
 */
async function handleFileDrop(e) {
  // Hide drop zone
  if (elements.fileDropZone) {
    elements.fileDropZone.classList.remove("active");
  }

  const files = Array.from(e.dataTransfer.files);

  if (files.length === 0) {
    showToast(MSG_NO_FILES_DROPPED, "error", 3000);
    return;
  }

  // Show progress bar
  if (elements.uploadProgress) {
    elements.uploadProgress.classList.add("active");
  }

  let completed = 0;
  const results = [];

  for (const file of files) {
    try {
      // Update progress immediately when starting this file
      const currentFileIndex = completed + 1;
      const startPercentage = (completed / files.length) * 100;

      if (elements.progressText) {
        elements.progressText.textContent = MSG_UPLOADING_FILE.replace("{filename}", file.name)
          .replace("{current}", currentFileIndex)
          .replace("{total}", files.length);
      }

      if (elements.progressBar) {
        elements.progressBar.style.width = `${startPercentage}%`;
      }

      window.electronAPI.log("info", "Processing file upload", {
        filename: file.name,
        size: file.size,
        type: file.type,
      });

      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      const result = await window.electronAPI.uploadFile({
        filename: file.name,
        data: Array.from(uint8Array),
        size: file.size,
        type: file.type,
      });

      completed++;

      // Update progress bar to completed percentage
      if (elements.progressBar) {
        const percentage = (completed / files.length) * 100;
        elements.progressBar.style.width = `${percentage}%`;
      }

      results.push({ file: file.name, result });

      if (result.success) {
        window.electronAPI.log("info", "File uploaded successfully", {
          filename: file.name,
          path: result.file_path,
        });
      } else {
        window.electronAPI.log("error", "File upload failed", {
          filename: file.name,
          error: result.error,
        });
      }
    } catch (error) {
      completed++;

      // Update progress bar to completed percentage even on error
      if (elements.progressBar) {
        const percentage = (completed / files.length) * 100;
        elements.progressBar.style.width = `${percentage}%`;
      }

      window.electronAPI.log("error", "File upload error", {
        filename: file.name,
        error: error.message,
      });
      results.push({ file: file.name, result: { success: false, error: error.message } });
    }
  }

  // Hide progress bar after a short delay
  setTimeout(() => {
    if (elements.uploadProgress) {
      elements.uploadProgress.classList.remove("active");
    }
    // Reset progress bar
    if (elements.progressBar) {
      elements.progressBar.style.width = "0%";
    }
  }, UPLOAD_PROGRESS_HIDE_DELAY);

  // Show summary message
  const successCount = results.filter((r) => r.result.success).length;
  const failCount = results.length - successCount;

  if (failCount === 0) {
    showToast(MSG_FILE_UPLOADED.replace("{count}", successCount), "success", 3000);
  } else if (successCount === 0) {
    showToast(MSG_FILE_UPLOAD_FAILED.replace("{count}", failCount), "error", 4000);
  } else {
    showToast(
      MSG_FILE_UPLOAD_PARTIAL.replace("{success}", successCount).replace("{failed}", failCount),
      "warning",
      4000
    );
  }

  // Refresh the files panel after upload (only if on sources tab)
  if (activeFilesDirectory === "sources") {
    loadFiles("sources");
  }

  // Also refresh welcome page files container if on welcome page
  if (appState.ui.currentView === "welcome") {
    const welcomeFilesContainer = document.getElementById("welcome-files-container");
    if (welcomeFilesContainer) {
      loadFiles("sources", welcomeFilesContainer);
    }
  }
}

/**
 * Handle file drop upload with optional session creation
 * @param {DragEvent} e - Drop event
 * @param {boolean} fromWelcome - Whether upload is from welcome page
 */
async function handleFileDropWithSession(e, fromWelcome = false) {
  // Note: fromWelcome parameter kept for backwards compatibility but no longer
  // triggers auto-session creation. Session will be created on first user message.

  // Use existing upload handler
  await handleFileDrop(e);
}

// Attach drop handler to both chat panel and drop zone
if (elements.chatPanel) {
  elements.chatPanel.addEventListener("drop", (e) => handleFileDropWithSession(e, false), {
    signal: eventAbortController.signal,
  });
}

if (elements.fileDropZone) {
  elements.fileDropZone.addEventListener("drop", (e) => handleFileDropWithSession(e, false), {
    signal: eventAbortController.signal,
  });
}

// ====================
// Window Load Handler
// ====================

window.addEventListener("load", () => {
  if (Object.keys(elements).length === 0) {
    initializeElements();
    initializeEventListeners();
  }

  if (elements.userInput) {
    elements.userInput.disabled = false;
  }
  if (elements.sendBtn) {
    elements.sendBtn.disabled = false;
  }

  setConnectionStatus(true);
  initializeTheme(elements);
  loadSessions(window.electronAPI, updateSessionsList);
  loadFiles(activeFilesDirectory);

  // Show welcome page on startup
  showWelcomeView(elements, appState);
});

// ====================
// Cleanup
// ====================

function cleanup() {
  window.electronAPI.log("info", "Cleaning up renderer resources");

  // Clear timers
  appState.functions.activeTimers.forEach((timerId) => {
    clearTimeout(timerId);
    clearInterval(timerId);
  });
  appState.functions.activeTimers.clear();

  // Clear data structures
  appState.functions.activeCalls.clear();
  appState.functions.argumentsBuffer.clear();

  // Reset state
  appState.setState("message.currentAssistant", null);
  appState.setState("message.assistantBuffer", "");
  appState.setState("message.isTyping", false);
  appState.setState("connection.isInitial", true);

  // Clear DOM using helper functions
  clearChat(elements.chatContainer);
  clearFunctionCards(elements.chatContainer);

  // Remove all event listeners via AbortController
  // This automatically cleans up all listeners registered with { signal: eventAbortController.signal }
  eventAbortController.abort();

  // Hide indicators
  if (elements.typingIndicator) {
    elements.typingIndicator.classList.remove("active");
    elements.typingIndicator.parentElement.style.display = "none";
  }

  if (elements.aiThinking) {
    elements.aiThinking.classList.remove("active");
  }

  window.electronAPI.log("info", "Cleanup complete");
}

window.addEventListener("beforeunload", cleanup);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const now = Date.now();
    appState.functions.activeCalls.forEach((card, callId) => {
      if (card.timestamp && now - card.timestamp > OLD_CARD_THRESHOLD) {
        appState.functions.activeCalls.delete(callId);
      }
    });
  }
});
