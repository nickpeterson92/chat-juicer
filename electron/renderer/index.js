/**
 * Chat Juicer Renderer - Main Entry Point
 * Modular architecture with ES6 modules
 */

// Import CSS for Vite bundling
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";

// Module imports
import {
  CONNECTION_RESET_DELAY,
  DELETE_SESSION_CONFIRM_MESSAGE,
  JSON_DELIMITER,
  MESSAGE_BATCH_DELAY,
  MESSAGE_BATCH_SIZE,
  OLD_CARD_THRESHOLD,
  UPLOAD_PROGRESS_HIDE_DELAY,
} from "./config/constants.js";
import { AppState } from "./core/state.js";
import { processMessage } from "./handlers/message-handlers.js";
import {
  createNewSession,
  deleteSession,
  loadSessions,
  sessionState,
  summarizeCurrentSession,
  switchSession,
} from "./services/session-service.js";
import { addMessage, clearChat, clearMessageCache } from "./ui/chat-ui.js";
import { clearFunctionCards } from "./ui/function-card-ui.js";
import { clearParseCache } from "./utils/json-cache.js";

// ====================
// DOM Element Management
// ====================

const elements = {};

function initializeElements() {
  elements.chatContainer = document.getElementById("chat-container");
  elements.userInput = document.getElementById("user-input");
  elements.sendBtn = document.getElementById("send-btn");
  elements.restartBtn = document.getElementById("restart-btn");
  elements.statusIndicator = document.getElementById("status-indicator");
  elements.statusText = document.getElementById("status-text");
  elements.typingIndicator = document.getElementById("typing-indicator");
  elements.aiThinking = document.getElementById("ai-thinking");
  elements.toolsContainer = document.getElementById("tools-container");
  elements.toolsPanel = document.getElementById("tools-panel");
  elements.toggleToolsBtn = document.getElementById("toggle-tools-btn");
  elements.themeToggle = document.getElementById("theme-toggle");
  elements.themeIcon = document.getElementById("theme-icon");
  elements.themeText = document.getElementById("theme-text");
  elements.sessionSelector = document.getElementById("session-selector");
  elements.newSessionBtn = document.getElementById("new-session-btn");
  elements.summarizeSessionBtn = document.getElementById("summarize-session-btn");
  elements.deleteSessionBtn = document.getElementById("delete-session-btn");
  elements.fileDropZone = document.getElementById("file-drop-zone");
  elements.chatPanel = document.querySelector(".chat-panel");
  elements.uploadProgress = document.getElementById("file-upload-progress");
  elements.progressBar = document.getElementById("progress-bar-fill");
  elements.progressText = document.getElementById("progress-text");
}

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
// Event Listener Management
// ====================

const eventListeners = [];

function addManagedEventListener(element, event, handler, options) {
  if (element?.addEventListener) {
    element.addEventListener(event, handler, options);
    eventListeners.push({ element, event, handler, options });
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
      (line.includes("Welcome to Chat Juicer!") ||
        line.includes("Connected to") ||
        line.includes("Using deployment:") ||
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
        addMessage(elements.chatContainer, 'Chat session ended. Click "Restart Bot" to start a new session.', "system");
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

  addMessage(elements.chatContainer, `Error: ${error}`, "error");
  setConnectionStatus(false);
});

window.electronAPI.onBotDisconnected(() => {
  if (elements.aiThinking) {
    elements.aiThinking.classList.remove("active");
  }

  setConnectionStatus(false);
  addMessage(elements.chatContainer, 'Bot disconnected. Click "Restart Bot" to reconnect.', "system");
});

window.electronAPI.onBotRestarted(() => {
  // Clear UI
  clearChat(elements.chatContainer);
  clearFunctionCards(elements.toolsContainer);

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

  addMessage(elements.chatContainer, "Bot is restarting...", "system");

  setTimeout(() => {
    setConnectionStatus(true);
    addMessage(elements.chatContainer, "Bot restarted successfully. Ready for new conversation.", "system");
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
// Session Management UI
// ====================

function updateSessionSelector() {
  if (!elements.sessionSelector) return;

  elements.sessionSelector.innerHTML = "";

  sessionState.sessions.forEach((session) => {
    const option = document.createElement("option");
    option.value = session.session_id;
    option.textContent = session.title || "Untitled Conversation";

    if (session.session_id === sessionState.currentSessionId) {
      option.selected = true;
    }

    elements.sessionSelector.appendChild(option);
  });
}

async function handleCreateNewSession() {
  const result = await createNewSession(window.electronAPI, elements);
  if (result.success) {
    await loadSessions(window.electronAPI, updateSessionSelector);
  }
}

async function handleSwitchSession(sessionId) {
  const result = await switchSession(window.electronAPI, elements, appState, sessionId);
  if (result.success) {
    // Session selector already updated by switchSession
  }
}

async function handleDeleteSession() {
  const sessionIdToDelete = elements.sessionSelector?.value;

  if (!sessionIdToDelete) {
    addMessage(elements.chatContainer, "No session selected.", "error");
    return;
  }

  const sessionToDelete = sessionState.sessions.find((s) => s.session_id === sessionIdToDelete);
  const title = sessionToDelete?.title || "this conversation";

  if (!confirm(`Delete ${title}?\n\n${DELETE_SESSION_CONFIRM_MESSAGE}`)) {
    return;
  }

  // Delete the session (backend handles current session gracefully)
  let result;
  try {
    result = await deleteSession(window.electronAPI, elements, sessionIdToDelete);
  } catch (error) {
    window.electronAPI.log("error", "Failed to delete session", { error: error.message });
    addMessage(elements.chatContainer, "Failed to delete session. Please try again.", "system");
    return;
  }

  if (result.success) {
    // If we deleted the current session, switch to another or create new
    if (sessionIdToDelete === sessionState.currentSessionId) {
      const otherSession = sessionState.sessions.find((s) => s.session_id !== sessionIdToDelete);

      if (otherSession) {
        window.electronAPI.log("info", "Switching to another session after deleting current", {
          to: otherSession.session_id,
        });
        await handleSwitchSession(otherSession.session_id);
      } else {
        window.electronAPI.log("info", "Creating new session after deleting last one");
        await handleCreateNewSession();
      }
    }

    await loadSessions(window.electronAPI, updateSessionSelector);
    addMessage(elements.chatContainer, `Deleted conversation: ${title}`, "system");
  }
}

async function handleSummarizeSession() {
  if (!elements.summarizeSessionBtn) return;

  // Disable button during operation
  elements.summarizeSessionBtn.disabled = true;

  try {
    await summarizeCurrentSession(window.electronAPI, elements);
    // Result messages are already handled by the service function
  } catch (error) {
    window.electronAPI.log("error", "Unexpected error during summarization", { error: error.message });
    addMessage(elements.chatContainer, "An unexpected error occurred.", "error");
  } finally {
    // Re-enable button after operation completes
    elements.summarizeSessionBtn.disabled = false;
  }
}

// ====================
// Theme Management
// ====================

function initializeTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";

  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    updateThemeToggle(true);
  } else {
    document.documentElement.removeAttribute("data-theme");
    updateThemeToggle(false);
  }
}

function updateThemeToggle(isDark) {
  if (elements.themeIcon && elements.themeText) {
    if (isDark) {
      elements.themeIcon.textContent = "☀️";
      elements.themeText.textContent = "Light";
    } else {
      elements.themeIcon.textContent = "🌙";
      elements.themeText.textContent = "Dark";
    }
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");

  if (currentTheme === "dark") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");
    updateThemeToggle(false);
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
    updateThemeToggle(true);
  }
}

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

  // Toggle tools panel
  if (elements.toggleToolsBtn) {
    addManagedEventListener(elements.toggleToolsBtn, "click", () => {
      const wrapper = document.getElementById("tools-toggle-wrapper");
      elements.toolsPanel.classList.toggle("collapsed");
      if (wrapper) {
        wrapper.classList.toggle("panel-collapsed");
      }
      elements.toggleToolsBtn.textContent = elements.toolsPanel.classList.contains("collapsed") ? "◀" : "▶";
      elements.toggleToolsBtn.title = elements.toolsPanel.classList.contains("collapsed")
        ? "Show function calls"
        : "Hide function calls";
    });
  }

  // Theme toggle
  if (elements.themeToggle) {
    addManagedEventListener(elements.themeToggle, "click", toggleTheme);
  }

  // Session management
  if (elements.sessionSelector) {
    addManagedEventListener(elements.sessionSelector, "change", (e) => {
      handleSwitchSession(e.target.value);
    });
  }

  if (elements.newSessionBtn) {
    addManagedEventListener(elements.newSessionBtn, "click", handleCreateNewSession);
  }

  if (elements.summarizeSessionBtn) {
    addManagedEventListener(elements.summarizeSessionBtn, "click", handleSummarizeSession);
  }

  if (elements.deleteSessionBtn) {
    addManagedEventListener(elements.deleteSessionBtn, "click", handleDeleteSession);
  }
}

initializeEventListeners();

// ====================
// File Upload Handlers
// ====================

// Prevent default drag behavior on document
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  document.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

// Show drop zone when dragging files over chat panel
if (elements.chatPanel) {
  elements.chatPanel.addEventListener("dragenter", (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      if (elements.fileDropZone) {
        elements.fileDropZone.classList.add("active");
      }
    }
  });
}

// Hide drop zone when dragging leaves the drop zone itself
if (elements.fileDropZone) {
  elements.fileDropZone.addEventListener("dragleave", (e) => {
    if (e.target === elements.fileDropZone) {
      elements.fileDropZone.classList.remove("active");
    }
  });
}

// Handle file drop
if (elements.chatPanel) {
  elements.chatPanel.addEventListener("drop", async (e) => {
    // Hide drop zone
    if (elements.fileDropZone) {
      elements.fileDropZone.classList.remove("active");
    }

    const files = Array.from(e.dataTransfer.files);

    if (files.length === 0) {
      addMessage(elements.chatContainer, "No files detected in drop.", "error");
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
          elements.progressText.textContent = `Uploading ${file.name} (${currentFileIndex}/${files.length})`;
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
      addMessage(elements.chatContainer, `Uploaded ${successCount} file(s) to sources/`, "system");
    } else if (successCount === 0) {
      addMessage(elements.chatContainer, `Failed to upload ${failCount} file(s)`, "error");
    } else {
      addMessage(elements.chatContainer, `Uploaded ${successCount} file(s), ${failCount} failed`, "system");
    }
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
    elements.userInput.focus();
  }
  if (elements.sendBtn) {
    elements.sendBtn.disabled = false;
  }

  setConnectionStatus(true);
  initializeTheme();
  loadSessions(window.electronAPI, updateSessionSelector);
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
  clearFunctionCards(elements.toolsContainer);

  // Remove event listeners
  eventListeners.forEach(({ element, event, handler, options }) => {
    if (element?.removeEventListener) {
      element.removeEventListener(event, handler, options);
    }
  });
  eventListeners.length = 0;

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
