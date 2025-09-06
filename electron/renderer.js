// Renderer process JavaScript
// DOM element references (immutable)
const elements = {
  chatContainer: document.getElementById("chat-container"),
  userInput: document.getElementById("user-input"),
  sendBtn: document.getElementById("send-btn"),
  restartBtn: document.getElementById("restart-btn"),
  statusIndicator: document.getElementById("status-indicator"),
  statusText: document.getElementById("status-text"),
  typingIndicator: document.getElementById("typing-indicator"),
  toolsContainer: document.getElementById("tools-container"),
  toolsPanel: document.getElementById("tools-panel"),
  toggleToolsBtn: document.getElementById("toggle-tools-btn"),
  themeToggle: document.getElementById("theme-toggle"),
  themeIcon: document.getElementById("theme-icon"),
  themeText: document.getElementById("theme-text"),
};

// Bounded Map class for memory management (define before use)
const _MAX_FUNCTION_CALLS = 50;
const _MAX_FUNCTION_BUFFERS = 20;

class BoundedMap extends Map {
  constructor(maxSize = 100) {
    super();
    this.maxSize = maxSize;
  }

  set(key, value) {
    // If at max size, delete oldest entry (FIFO)
    if (this.size >= this.maxSize) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey);
    }
    return super.set(key, value);
  }
}

// Centralized State Management
class AppState {
  constructor() {
    // Connection state machine
    this.connection = {
      status: "CONNECTED", // CONNECTED | DISCONNECTED | RECONNECTING | ERROR
      isInitial: true,
      hasShownWelcome: false,
    };

    // Message state
    this.message = {
      currentAssistant: null,
      assistantBuffer: "",
      isTyping: false,
    };

    // Function call tracking
    this.functions = {
      activeCalls: new BoundedMap(50),
      argumentsBuffer: new BoundedMap(20),
      activeTimers: new Set(),
    };

    // UI state
    this.ui = {
      theme: localStorage.getItem("theme") || "light",
      toolsPanelCollapsed: false,
    };

    // State change listeners
    this.listeners = new Map();
  }

  // State change notification
  setState(path, value) {
    const keys = path.split(".");
    let target = this;

    // Navigate to the nested property
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }

    const oldValue = target[keys[keys.length - 1]];
    target[keys[keys.length - 1]] = value;

    // Notify listeners
    this.notifyListeners(path, value, oldValue);
  }

  // Get nested state value
  getState(path) {
    const keys = path.split(".");
    let value = this;

    for (const key of keys) {
      value = value[key];
      if (value === undefined) return undefined;
    }

    return value;
  }

  // Subscribe to state changes
  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(path);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  // Notify listeners of state change
  notifyListeners(path, newValue, oldValue) {
    const callbacks = this.listeners.get(path);
    if (callbacks) {
      callbacks.forEach((callback) => {
        callback(newValue, oldValue, path);
      });
    }

    // Also notify wildcard listeners
    const wildcardCallbacks = this.listeners.get("*");
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach((callback) => {
        callback({ path, newValue, oldValue });
      });
    }
  }

  // Connection state machine transitions
  setConnectionStatus(status) {
    const validTransitions = {
      CONNECTED: ["DISCONNECTED", "ERROR"],
      DISCONNECTED: ["CONNECTED", "RECONNECTING"],
      RECONNECTING: ["CONNECTED", "DISCONNECTED", "ERROR"],
      ERROR: ["RECONNECTING", "DISCONNECTED"],
    };

    const currentStatus = this.connection.status;

    // Skip if already in the desired state
    if (currentStatus === status) {
      return;
    }

    // Validate transition
    if (validTransitions[currentStatus]?.includes(status)) {
      this.setState("connection.status", status);
      this.handleConnectionChange(status);
    } else {
      console.warn(`Invalid state transition: ${currentStatus} -> ${status}`);
    }
  }

  // Handle connection state changes
  handleConnectionChange(status) {
    switch (status) {
      case "CONNECTED":
        elements.statusIndicator.classList.remove("disconnected");
        elements.statusText.textContent = "Connected";
        elements.userInput.disabled = false;
        elements.elements.sendBtn.disabled = false;
        break;

      case "DISCONNECTED":
      case "ERROR":
        elements.statusIndicator.classList.add("disconnected");
        elements.statusText.textContent = status === "ERROR" ? "Error" : "Disconnected";
        elements.userInput.disabled = true;
        elements.elements.sendBtn.disabled = true;
        break;

      case "RECONNECTING":
        elements.statusIndicator.classList.add("disconnected");
        elements.statusText.textContent = "Reconnecting...";
        elements.userInput.disabled = true;
        elements.elements.sendBtn.disabled = true;
        break;
    }
  }
}

// Initialize state
const appState = new AppState();

// Track all event listeners for cleanup
const eventListeners = [];

// Helper to add event listeners that can be cleaned up
function addManagedEventListener(element, event, handler, options) {
  if (element?.addEventListener) {
    element.addEventListener(event, handler, options);
    eventListeners.push({ element, event, handler, options });
  }
}

// Function to add message to chat
function addMessage(content, type = "assistant") {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.textContent = content;

  messageDiv.appendChild(contentDiv);
  elements.chatContainer.appendChild(messageDiv);

  // Auto-scroll to bottom
  elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;

  return contentDiv;
}

// Function to update current assistant message (for streaming)
function updateAssistantMessage(content) {
  if (!appState.message.currentAssistant) {
    appState.setState("message.currentAssistant", addMessage("", "assistant"));
  }
  appState.message.currentAssistant.textContent = content;
  elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// Function to create or update function call card
function createFunctionCallCard(callId, functionName, status = "preparing") {
  console.log("Creating function card:", callId, functionName, status);

  // Handle case where callId might not be provided initially
  if (!callId) {
    callId = `temp-${Date.now()}`;
  }
  let card = appState.functions.activeCalls.get(callId);

  if (!card) {
    // Create new card
    const cardDiv = document.createElement("div");
    cardDiv.className = "function-call-card executing function-executing-pulse";
    cardDiv.id = `function-${callId}`;

    const headerDiv = document.createElement("div");
    headerDiv.className = "function-header";

    const iconDiv = document.createElement("div");
    iconDiv.className = "function-icon";
    iconDiv.innerHTML = "🔧";

    const nameDiv = document.createElement("div");
    nameDiv.className = "function-name";
    nameDiv.textContent = functionName;

    const statusDiv = document.createElement("div");
    statusDiv.className = "function-status";
    statusDiv.textContent = status;

    headerDiv.appendChild(iconDiv);
    headerDiv.appendChild(nameDiv);
    headerDiv.appendChild(statusDiv);
    cardDiv.appendChild(headerDiv);

    elements.toolsContainer.appendChild(cardDiv);
    elements.toolsContainer.scrollTop = elements.toolsContainer.scrollHeight;

    card = { element: cardDiv, name: functionName, timestamp: Date.now() };
    appState.functions.activeCalls.set(callId, card);
  }

  return card;
}

// Function to update function call status
function updateFunctionCallStatus(callId, status, data = {}) {
  const card = appState.functions.activeCalls.get(callId);
  if (!card) return;

  const statusDiv = card.element.querySelector(".function-status");
  if (statusDiv) {
    statusDiv.textContent = status;
  }

  // Update card styling based on status
  if (status === "executing") {
    card.element.className = "function-call-card executing function-executing-pulse";
  } else if (status === "completed") {
    card.element.className = "function-call-card success";
    card.element.classList.remove("function-executing-pulse");
  } else if (status === "error") {
    card.element.className = "function-call-card error";
    card.element.classList.remove("function-executing-pulse");
  }

  // Add arguments if provided
  if (data.arguments && !card.element.querySelector(".function-arguments")) {
    const argsDiv = document.createElement("div");
    argsDiv.className = "function-arguments";
    try {
      const parsedArgs = JSON.parse(data.arguments);
      argsDiv.textContent = JSON.stringify(parsedArgs, null, 2);
    } catch {
      argsDiv.textContent = data.arguments;
    }
    card.element.appendChild(argsDiv);
  }

  // Add result if provided
  if (data.result && !card.element.querySelector(".function-result")) {
    const resultDiv = document.createElement("div");
    resultDiv.className = "function-result";
    resultDiv.textContent = data.result;
    card.element.appendChild(resultDiv);
  }

  // Add error if provided
  if (data.error && !card.element.querySelector(".function-result")) {
    const resultDiv = document.createElement("div");
    resultDiv.className = "function-result";
    resultDiv.textContent = `Error: ${data.error}`;
    card.element.appendChild(resultDiv);
  }
}

// Function to handle streaming function arguments
function updateFunctionArguments(callId, delta, isDone = false) {
  const card = appState.functions.activeCalls.get(callId);
  if (!card) return;

  // Initialize buffer for this call if needed
  if (!appState.functions.argumentsBuffer.has(callId)) {
    appState.functions.argumentsBuffer.set(callId, "");
  }

  if (delta) {
    appState.functions.argumentsBuffer.set(callId, appState.functions.argumentsBuffer.get(callId) + delta);
  }

  let argsDiv = card.element.querySelector(".function-arguments");
  if (!argsDiv) {
    argsDiv = document.createElement("div");
    argsDiv.className = "function-arguments streaming";
    card.element.appendChild(argsDiv);
  }

  if (isDone) {
    argsDiv.classList.remove("streaming");
    try {
      const parsedArgs = JSON.parse(appState.functions.argumentsBuffer.get(callId));
      argsDiv.textContent = JSON.stringify(parsedArgs, null, 2);
    } catch {
      argsDiv.textContent = appState.functions.argumentsBuffer.get(callId);
    }
    appState.functions.argumentsBuffer.delete(callId);
  } else {
    // Show partial arguments while streaming
    argsDiv.textContent = `${appState.functions.argumentsBuffer.get(callId)}...`;
  }
}

// Function to set connection status (now uses state machine)
function setConnectionStatus(connected) {
  if (connected) {
    appState.setConnectionStatus("CONNECTED");
  } else {
    appState.setConnectionStatus("DISCONNECTED");
  }
}

// Send message function
function sendMessage() {
  const message = elements.userInput.value.trim();

  if (!message || appState.connection.status !== "CONNECTED") return;

  // Add user message to chat
  addMessage(message, "user");

  // Clear input
  elements.userInput.value = "";

  // Show typing indicator
  elements.typingIndicator.parentElement.style.display = "block";
  elements.typingIndicator.classList.add("active");
  appState.setState("message.isTyping", true);

  // Reset assistant message state
  appState.setState("message.currentAssistant", null);
  appState.setState("message.assistantBuffer", "");

  // Send to main process
  window.electronAPI.sendUserInput(message);
}

// Handle bot output (streaming response with JSON protocol)
window.electronAPI.onBotOutput((output) => {
  console.log("Raw output received:", output);
  // Parse the output to handle different scenarios
  const lines = output.split("\n");

  for (const line of lines) {
    // Skip the initial connection message from Python bot (legacy format)
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
      continue; // Skip all initial bot output
    }

    // Check for JSON messages
    const jsonMatch = line.match(/__JSON__(.+?)__JSON__/);
    if (jsonMatch) {
      try {
        const message = JSON.parse(jsonMatch[1]);

        switch (message.type) {
          case "assistant_start": {
            // Hide typing indicator and start new message
            elements.typingIndicator.classList.remove("active");
            elements.typingIndicator.parentElement.style.display = "none";
            appState.setState("message.isTyping", false);
            const newMessage = addMessage("", "assistant");
            appState.setState("message.currentAssistant", newMessage);
            appState.setState("message.assistantBuffer", "");
            break;
          }

          case "assistant_delta":
            // Add content to buffer exactly as received
            if (appState.message.currentAssistant) {
              const newBuffer = appState.message.assistantBuffer + message.content;
              appState.setState("message.assistantBuffer", newBuffer);
              updateAssistantMessage(newBuffer);
            }
            break;

          case "assistant_end":
            // Message complete, reset for next message
            appState.setState("message.currentAssistant", null);
            break;

          case "function_detected": {
            // Function call detected - show card immediately
            console.log("Function detected:", message);
            const _card = createFunctionCallCard(message.call_id, message.name, "preparing...");
            if (message.arguments) {
              updateFunctionCallStatus(message.call_id, "ready", {
                arguments: message.arguments,
              });
            }
            break;
          }

          case "function_executing":
            // Function is being executed
            console.log("Function executing:", message);
            updateFunctionCallStatus(message.call_id, "executing...", {
              arguments: message.arguments,
            });
            break;

          case "function_completed": {
            // Function execution complete
            console.log("Function completed:", message);
            if (message.success) {
              updateFunctionCallStatus(message.call_id, "completed", {
                result: "Success",
              });
            } else {
              updateFunctionCallStatus(message.call_id, "error", {
                error: message.error,
              });
            }
            // Clean up after a delay
            const timerId = setTimeout(() => {
              appState.functions.activeCalls.delete(message.call_id);
              appState.functions.activeTimers.delete(timerId);
            }, 30000); // Keep cards visible for 30 seconds
            appState.functions.activeTimers.add(timerId);
            break;
          }

          case "rate_limit_hit":
            // Show rate limit notification
            console.log("Rate limit hit:", message);
            addMessage(
              `⏳ Rate limit reached. Waiting ${message.wait_time}s before retry (attempt ${message.retry_count})...`,
              "system"
            );
            break;

          case "rate_limit_failed":
            // Show rate limit failure
            console.error("Rate limit failed:", message);
            addMessage(`❌ ${message.message}. Please try again later.`, "error");
            break;

          case "function_call_added":
            // Legacy event - now handled by function_detected
            break;

          case "function_call_arguments_delta":
            // Streaming function arguments
            if (message.item_id || message.call_id) {
              const callId = message.call_id || message.item_id;
              updateFunctionArguments(callId, message.delta, false);
            }
            break;

          case "function_call_arguments_done":
            // Function arguments complete
            if (message.item_id || message.call_id) {
              const callId = message.call_id || message.item_id;
              updateFunctionArguments(callId, null, true);
            }
            break;

          case "function_call_ready":
            // Function is ready to execute
            updateFunctionCallStatus(message.call_id, "ready to execute");
            break;

          case "function_executed": {
            // Function execution complete
            if (message.success) {
              updateFunctionCallStatus(message.call_id, "completed", {
                result: message.result_preview || "Success",
              });
            } else {
              updateFunctionCallStatus(message.call_id, "error", {
                error: message.error,
              });
            }
            // Clean up after a delay
            const timerId2 = setTimeout(() => {
              appState.functions.activeCalls.delete(message.call_id);
              appState.functions.activeTimers.delete(timerId2);
            }, 30000); // Keep cards visible for 30 seconds
            appState.functions.activeTimers.add(timerId2);
            break;
          }
        }
      } catch (e) {
        console.error("Failed to parse JSON message:", e);
      }
    } else if (line.startsWith("You:")) {
    } else if (line.includes("Enter your message") || line.includes("Type 'exit'")) {
    }
  }

  // Check for exit conditions
  if (output.includes("Goodbye!") || output.includes("An error occurred")) {
    setConnectionStatus(false);
    if (output.includes("Goodbye!")) {
      addMessage('Chat session ended. Click "Restart Bot" to start a new session.', "system");
    }
  }
});

// Handle bot errors
window.electronAPI.onBotError((error) => {
  console.error("Bot error:", error);
  addMessage(`Error: ${error}`, "error");
  setConnectionStatus(false);
});

// Handle bot disconnection
window.electronAPI.onBotDisconnected(() => {
  setConnectionStatus(false);
  addMessage('Bot disconnected. Click "Restart Bot" to reconnect.', "system");
});

// Handle bot restart
window.electronAPI.onBotRestarted(() => {
  elements.chatContainer.innerHTML = "";
  appState.setState("connection.hasShownWelcome", false);
  appState.setState("message.currentAssistant", null);
  appState.setState("message.assistantBuffer", "");
  addMessage("Bot is restarting...", "system");

  // Reset connection status after a short delay to allow process to start
  setTimeout(() => {
    setConnectionStatus(true);
    addMessage("Bot restarted successfully. Ready for new conversation.", "system");
  }, 1000);
});

// Event listeners (using managed listeners for cleanup)
addManagedEventListener(elements.sendBtn, "click", sendMessage);

addManagedEventListener(elements.userInput, "keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

addManagedEventListener(elements.restartBtn, "click", () => {
  window.electronAPI.restartBot();
});

// Toggle tools panel handler
if (elements.toggleToolsBtn) {
  addManagedEventListener(elements.toggleToolsBtn, "click", () => {
    elements.toolsPanel.classList.toggle("collapsed");
    document.body.classList.toggle("tools-collapsed");
    // Update arrow direction: ◀ when collapsed (to expand), ▶ when open (to collapse)
    elements.toggleToolsBtn.textContent = elements.toolsPanel.classList.contains("collapsed") ? "◀" : "▶";
    elements.toggleToolsBtn.title = elements.toolsPanel.classList.contains("collapsed")
      ? "Show function calls"
      : "Hide function calls";
  });
}

// Focus input on load and ensure it's enabled
window.addEventListener("load", () => {
  // Ensure input is enabled from the start
  elements.userInput.disabled = false;
  elements.sendBtn.disabled = false;
  elements.userInput.focus();
  setConnectionStatus(true); // Start as connected

  // Initialize dark mode from localStorage
  initializeTheme();
});

// Dark mode functionality
function initializeTheme() {
  // Check localStorage for saved theme preference
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
    // Switch to light mode
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");
    updateThemeToggle(false);
  } else {
    // Switch to dark mode
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
    updateThemeToggle(true);
  }
}

// Add event listener for theme toggle button
if (elements.themeToggle) {
  addManagedEventListener(elements.themeToggle, "click", toggleTheme);
}

// Comprehensive cleanup function to prevent memory leaks
function cleanup() {
  console.log("Cleaning up renderer resources...");

  // 1. Clear all setTimeout/setInterval timers
  appState.functions.activeTimers.forEach((timerId) => {
    clearTimeout(timerId);
    clearInterval(timerId); // In case any intervals were added
  });
  appState.functions.activeTimers.clear();

  // 2. Clear all data structures
  appState.functions.activeCalls.clear();
  appState.functions.argumentsBuffer.clear();

  // 3. Reset all state
  appState.setState("message.currentAssistant", null);
  appState.setState("message.assistantBuffer", "");
  appState.setState("message.isTyping", false);
  appState.setState("connection.isInitial", true);

  // 4. Clear DOM references to prevent detached DOM trees
  const chatContainer = elements.chatContainer;
  if (chatContainer) {
    // Remove all child nodes to free memory
    while (chatContainer.firstChild) {
      chatContainer.removeChild(chatContainer.firstChild);
    }
  }

  const toolsContainer = elements.toolsContainer;
  if (toolsContainer) {
    while (toolsContainer.firstChild) {
      toolsContainer.removeChild(toolsContainer.firstChild);
    }
  }

  // 5. Remove all managed event listeners
  eventListeners.forEach(({ element, event, handler, options }) => {
    if (element?.removeEventListener) {
      element.removeEventListener(event, handler, options);
    }
  });
  eventListeners.length = 0;

  // 6. Cancel any pending animations
  if (elements.typingIndicator) {
    elements.typingIndicator.classList.remove("active");
    elements.typingIndicator.parentElement.style.display = "none";
  }

  // 7. Clear any pending state from localStorage if needed
  // (keeping theme preference though)

  // 8. Nullify any pending async operations
  if (window.pendingRequests) {
    window.pendingRequests.forEach((req) => {
      if (req?.abort) req.abort();
    });
  }

  console.log("Cleanup complete");
}

// Clean up on page unload
window.addEventListener("beforeunload", cleanup);

// Also clean up on visibility change (for mobile/tabs)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Clear old function cards when tab is hidden
    const now = Date.now();
    appState.functions.activeCalls.forEach((card, callId) => {
      // Remove cards older than 1 minute when tab is hidden
      if (card.timestamp && now - card.timestamp > 60000) {
        appState.functions.activeCalls.delete(callId);
      }
    });
  }
});
