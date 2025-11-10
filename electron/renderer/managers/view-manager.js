/**
 * View Manager
 * Manages view state and transitions between welcome and chat views
 */

import { addMessage } from "../ui/chat-ui.js";
import { getSuggestionPrompt, hideWelcomePage, showWelcomePage } from "../ui/welcome-page.js";

/**
 * Track welcome page event listeners for cleanup
 * @type {Array<{element: HTMLElement, event: string, handler: Function, controller?: AbortController}>}
 */
const welcomePageListeners = [];

/**
 * Show the welcome view
 * @param {Object} elements - DOM elements from dom-manager
 * @param {Object} appState - Application state
 * @param {Object} services - Service instances (sessionService, etc.)
 */
export async function showWelcomeView(elements, appState, services = {}) {
  console.log("🚀 showWelcomeView called");
  if (!elements.welcomePageContainer) {
    console.error("❌ welcomePageContainer not found!");
    return;
  }

  // Update state FIRST before rendering
  appState.setState("ui.currentView", "welcome");

  // Get system username
  let userName = "User"; // Fallback
  try {
    userName = await window.electronAPI.getUsername();
  } catch (error) {
    window.electronAPI.log("error", "Failed to get username", { error: error.message });
  }

  // Show welcome page
  showWelcomePage(elements.welcomePageContainer, userName);

  // Add CSS class to container for view switching
  document.body.classList.add("view-welcome");
  document.body.classList.remove("view-chat");

  // Load configuration metadata from backend
  try {
    const metadata = await window.electronAPI.sessionCommand("config_metadata", {});
    if (metadata?.models) {
      // Import and initialize model config UI
      const { initializeModelConfig } = await import("../ui/welcome-page.js");
      initializeModelConfig(metadata.models, metadata.reasoning_levels || []);
      window.electronAPI.log("info", "Model configuration initialized", {
        models: metadata.models.length,
        reasoning_levels: metadata.reasoning_levels?.length || 0,
      });
    }
  } catch (error) {
    window.electronAPI.log("error", "Failed to load config metadata", { error: error.message });
    // Continue with defaults - config UI will use default options
  }

  // Clean up any existing welcome page listeners before attaching new ones
  console.log("🧹 Cleaning up old listeners");
  detachWelcomePageListeners();

  // Attach welcome page event listeners after DOM is ready
  console.log("⏰ Scheduling listener attachment with setTimeout");
  setTimeout(() => {
    console.log("⏰ setTimeout fired, calling attachWelcomePageListeners");
    attachWelcomePageListeners(elements, appState, services);

    // Auto-refresh welcome page file list if there's an active session
    // This prevents showing stale/deleted files
    const sessionState = window.app?.sessionState;
    if (sessionState?.currentSessionId) {
      const welcomeFilesContainer = document.getElementById("welcome-files-container");
      if (welcomeFilesContainer) {
        import("../managers/file-manager.js").then(({ loadFiles }) => {
          const directory = `data/files/${sessionState.currentSessionId}/sources`;
          console.log("🔄 Auto-refreshing welcome page files");
          loadFiles(directory, welcomeFilesContainer);

          // Show the files section
          const welcomeFilesSection = document.getElementById("welcome-files-section");
          if (welcomeFilesSection && welcomeFilesContainer.children.length > 0) {
            welcomeFilesSection.style.display = "block";
          }
        });
      }
    }
  }, 0);

  console.log("✅ showWelcomeView complete");
}

/**
 * Show the chat view
 * @param {Object} elements - DOM elements from dom-manager
 * @param {Object} appState - Application state
 */
export function showChatView(elements, appState) {
  if (!elements.welcomePageContainer) return;

  // Hide welcome page
  hideWelcomePage(elements.welcomePageContainer);

  // Clean up welcome page listeners to prevent memory leaks
  detachWelcomePageListeners();

  // Update state
  appState.setState("ui.currentView", "chat");

  // Update CSS classes
  document.body.classList.remove("view-welcome");
  document.body.classList.add("view-chat");

  // Focus chat input (Phase 7: use InputArea component if available)
  if (window.components?.inputArea) {
    window.components.inputArea.focus();
  } else if (elements.userInput) {
    // Fallback to direct manipulation if component not available
    elements.userInput.focus();

    // Initialize textarea height properly (for textarea elements)
    if (elements.userInput.tagName === "TEXTAREA") {
      // Use requestAnimationFrame to ensure the view transition is complete
      requestAnimationFrame(() => {
        elements.userInput.style.height = "auto";
        const maxHeight = 200;
        const newHeight = Math.min(elements.userInput.scrollHeight, maxHeight);
        elements.userInput.style.height = `${newHeight}px`;
        elements.userInput.style.overflowY = elements.userInput.scrollHeight > maxHeight ? "auto" : "hidden";
      });
    }
  }
}

/**
 * Detach all welcome page event listeners
 */
function detachWelcomePageListeners() {
  welcomePageListeners.forEach(({ element, event, handler, controller }) => {
    if (controller) {
      controller.abort();
    } else {
      element?.removeEventListener(event, handler);
    }
  });
  welcomePageListeners.length = 0;
}

/**
 * Attach event listeners to welcome page elements
 * @param {Object} elements - DOM elements from dom-manager
 * @param {Object} appState - Application state
 * @param {Object} services - Service instances (sessionService, etc.)
 */
function attachWelcomePageListeners(elements, appState, services = {}) {
  console.log("🎯 attachWelcomePageListeners called");
  const welcomeInput = document.getElementById("welcome-input");
  const welcomeSendBtn = document.getElementById("welcome-send-btn");
  const suggestionPills = document.querySelectorAll(".suggestion-pill");
  const welcomeContainer = elements.welcomePageContainer;

  console.log("🎯 Welcome elements:", {
    hasInput: !!welcomeInput,
    hasSendBtn: !!welcomeSendBtn,
    pillCount: suggestionPills.length,
    hasContainer: !!welcomeContainer,
  });

  // Import loadFiles from file-manager (will be available after refactor)
  // For now, we'll keep the import dynamic to avoid circular dependencies

  // NOTE: File drag-and-drop handlers are managed globally in bootstrap.js
  // to prevent duplicate listeners. We only handle visual feedback here.
  if (welcomeContainer) {
    const dragenterHandler = (e) => {
      if (e.dataTransfer?.types.includes("Files")) {
        if (elements.fileDropZone) {
          elements.fileDropZone.classList.add("active");
        }
      }
    };
    welcomeContainer.addEventListener("dragenter", dragenterHandler);
    welcomePageListeners.push({ element: welcomeContainer, event: "dragenter", handler: dragenterHandler });

    const dragoverHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    welcomeContainer.addEventListener("dragover", dragoverHandler);
    welcomePageListeners.push({ element: welcomeContainer, event: "dragover", handler: dragoverHandler });

    const dragleaveHandler = (e) => {
      // Only hide if leaving the welcome container entirely
      if (e.target === welcomeContainer) {
        if (elements.fileDropZone) {
          elements.fileDropZone.classList.remove("active");
        }
      }
    };
    welcomeContainer.addEventListener("dragleave", dragleaveHandler);
    welcomePageListeners.push({ element: welcomeContainer, event: "dragleave", handler: dragleaveHandler });

    // DROP handler is managed in bootstrap.js to prevent duplicates
  }

  // Handle welcome files refresh button
  const welcomeFilesRefreshBtn = document.getElementById("welcome-files-refresh");
  if (welcomeFilesRefreshBtn) {
    const refreshHandler = async () => {
      // Get current session ID to load session files
      const { sessionState } = await import("../services/session-service.js");
      const sessionId = sessionState.currentSessionId;

      if (sessionId) {
        // Load session-specific files
        const container = document.getElementById("welcome-files-container");
        if (container) {
          import("./file-manager.js").then(({ loadSessionFiles }) => {
            loadSessionFiles(sessionId, container);
          });
        }
      }
    };
    welcomeFilesRefreshBtn.addEventListener("click", refreshHandler);
    welcomePageListeners.push({ element: welcomeFilesRefreshBtn, event: "click", handler: refreshHandler });
  }

  // Handle welcome input send
  let isProcessing = false; // Guard against duplicate calls
  const sendWelcomeMessage = async () => {
    // Get fresh reference to input (don't rely on closure)
    const welcomeInputElement = document.getElementById("welcome-input");

    if (!welcomeInputElement || isProcessing) {
      console.log("sendWelcomeMessage blocked:", { hasInput: !!welcomeInputElement, isProcessing });
      return;
    }

    const message = welcomeInputElement.value.trim();
    if (!message) {
      console.log("sendWelcomeMessage: empty message");
      return;
    }

    if (appState.connection.status !== "CONNECTED") {
      console.log("sendWelcomeMessage: not connected");
      return;
    }

    isProcessing = true; // Set guard
    console.log("sendWelcomeMessage: processing message:", message.substring(0, 50));

    try {
      // Get MCP config from checkboxes
      const { getMcpConfig, getModelConfig } = await import("../ui/welcome-page.js");
      const mcpConfig = getMcpConfig();
      const modelConfig = getModelConfig();

      // Create new session only if one does not already exist (e.g., created by file upload)
      const { sessionState } = await import("../services/session-service.js");
      let sessionId = sessionState.currentSessionId;

      if (!sessionId) {
        // Use SessionService instance to create session
        if (!services.sessionService) {
          console.error("❌ SessionService not available");
          window.electronAPI.log("error", "SessionService not available in view-manager");
          isProcessing = false;
          return;
        }

        const result = await services.sessionService.createSession({
          title: null,
          mcpConfig,
          model: modelConfig.model,
          reasoningEffort: modelConfig.reasoning_effort,
        });

        if (!result.success) {
          window.electronAPI.log("error", "Failed to create session from welcome page", { error: result.error });
          isProcessing = false; // Reset guard before returning
          return;
        }

        // SessionService returns { success, sessionId, title } (not wrapped in .data)
        sessionId = result.sessionId || null;

        window.electronAPI.log("info", "Session created with full configuration", {
          session_id: sessionId,
          mcp_config: mcpConfig,
          model: modelConfig.model,
          reasoning_effort: modelConfig.reasoning_effort,
        });

        // Update session state to mark this as the current session
        const { sessionState } = await import("../services/session-service.js");
        sessionState.currentSessionId = sessionId;

        // Dispatch session-created event to update the session list
        window.dispatchEvent(
          new CustomEvent("session-created", {
            detail: {
              session_id: sessionId,
              title: result.title || null,
              source: "welcome_page",
            },
          })
        );
      } else {
        window.electronAPI.log("info", "Reusing existing session for welcome message", {
          session_id: sessionId,
          created_by: "file_upload",
        });
      }

      // Clear the input
      welcomeInputElement.value = "";

      // Transition to chat view (either new or existing session)
      showChatView(elements, appState);

      // Collapse sidebar to give chat more space (matches behavior when switching sessions)
      if (elements.sidebar) {
        elements.sidebar.classList.add("collapsed");
        window.electronAPI.log("debug", "Sidebar collapsed after starting chat from welcome page");
      }

      // Add user message to chat (Phase 7: use ChatContainer component if available)
      if (window.components?.chatContainer) {
        window.components.chatContainer.addUserMessage(message);
      } else {
        addMessage(elements.chatContainer, message, "user");
      }

      // Reset assistant message state
      appState.setState("message.currentAssistant", null);
      appState.setState("message.assistantBuffer", "");

      // Send to main process
      window.electronAPI.sendUserInput(message);

      // Session list will be updated automatically via session-created event
    } catch (error) {
      console.error("Error in sendWelcomeMessage:", error);
      window.electronAPI.log("error", "Failed to send welcome message", { error: error.message });
    } finally {
      // Always reset guard, even if there's an error
      isProcessing = false;
    }
  };

  // Send button click
  if (welcomeSendBtn) {
    welcomeSendBtn.addEventListener("click", sendWelcomeMessage);
    welcomePageListeners.push({ element: welcomeSendBtn, event: "click", handler: sendWelcomeMessage });
  }

  // Enter key to send
  if (welcomeInput) {
    console.log("🎯 Attaching keydown listener to welcome input");
    const keydownHandler = (e) => {
      console.log("🎯 Keydown event:", e.key, "shiftKey:", e.shiftKey);
      if (e.key === "Enter" && !e.shiftKey) {
        console.log("🎯 Enter pressed! Preventing default and sending message");
        e.preventDefault();
        sendWelcomeMessage();
      }
    };
    welcomeInput.addEventListener("keydown", keydownHandler);
    welcomePageListeners.push({ element: welcomeInput, event: "keydown", handler: keydownHandler });
    console.log("✅ Keydown listener attached");
  } else {
    console.warn("⚠️ welcomeInput not found, cannot attach keydown listener");
  }

  // Suggestion pill clicks
  suggestionPills.forEach((pill) => {
    const clickHandler = () => {
      const category = pill.dataset.category;
      const prompt = getSuggestionPrompt(category);

      if (prompt && welcomeInput) {
        welcomeInput.value = prompt;
        welcomeInput.focus();
        welcomeInput.dispatchEvent(new Event("input", { bubbles: true }));

        // Auto-resize textarea
        welcomeInput.style.height = "auto";
        welcomeInput.style.height = `${Math.min(welcomeInput.scrollHeight, 200)}px`;
      }
    };
    pill.addEventListener("click", clickHandler);
    welcomePageListeners.push({ element: pill, event: "click", handler: clickHandler });
  });
}
