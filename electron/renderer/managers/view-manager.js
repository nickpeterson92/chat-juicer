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
 */
export async function showWelcomeView(elements, appState) {
  if (!elements.welcomePageContainer) return;

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

  // Attach welcome page event listeners after DOM is ready
  setTimeout(() => {
    attachWelcomePageListeners(elements, appState);
  }, 0);
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

  // Focus chat input
  if (elements.userInput) {
    elements.userInput.focus();
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
 */
function attachWelcomePageListeners(elements, appState) {
  const welcomeInput = document.getElementById("welcome-input");
  const welcomeSendBtn = document.getElementById("welcome-send-btn");
  const suggestionPills = document.querySelectorAll(".suggestion-pill");
  const welcomeContainer = elements.welcomePageContainer;

  // Import loadFiles from file-manager (will be available after refactor)
  // For now, we'll keep the import dynamic to avoid circular dependencies

  // File drag-and-drop handlers for welcome page
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

    const dropHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // handleFileDropWithSession will be available from index.js
      const { handleFileDropWithSession } = await import("../index.js");
      handleFileDropWithSession(e, true);
    };
    welcomeContainer.addEventListener("drop", dropHandler);
    welcomePageListeners.push({ element: welcomeContainer, event: "drop", handler: dropHandler });
  }

  // Load files into welcome page container
  const welcomeFilesContainer = document.getElementById("welcome-files-container");
  if (welcomeFilesContainer) {
    // Dynamic import to avoid circular dependency
    import("./file-manager.js").then(({ loadFiles }) => {
      loadFiles("sources", welcomeFilesContainer);
    });
  }

  // Handle welcome files refresh button
  const welcomeFilesRefreshBtn = document.getElementById("welcome-files-refresh");
  if (welcomeFilesRefreshBtn) {
    const refreshHandler = () => {
      const container = document.getElementById("welcome-files-container");
      if (container) {
        import("./file-manager.js").then(({ loadFiles }) => {
          loadFiles("sources", container);
        });
      }
    };
    welcomeFilesRefreshBtn.addEventListener("click", refreshHandler);
    welcomePageListeners.push({ element: welcomeFilesRefreshBtn, event: "click", handler: refreshHandler });
  }

  // Handle welcome input send
  const sendWelcomeMessage = () => {
    if (!welcomeInput) return;

    const message = welcomeInput.value.trim();
    if (!message || appState.connection.status !== "CONNECTED") return;

    // Transition to chat view
    showChatView(elements, appState);

    // Add user message to chat
    addMessage(elements.chatContainer, message, "user");

    // Reset assistant message state
    appState.setState("message.currentAssistant", null);
    appState.setState("message.assistantBuffer", "");

    // Send to main process
    window.electronAPI.sendUserInput(message);

    // Session list will be updated automatically via session-created event
  };

  // Send button click
  if (welcomeSendBtn) {
    welcomeSendBtn.addEventListener("click", sendWelcomeMessage);
    welcomePageListeners.push({ element: welcomeSendBtn, event: "click", handler: sendWelcomeMessage });
  }

  // Enter key to send
  if (welcomeInput) {
    const keypressHandler = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendWelcomeMessage();
      }
    };
    welcomeInput.addEventListener("keypress", keypressHandler);
    welcomePageListeners.push({ element: welcomeInput, event: "keypress", handler: keypressHandler });
  }

  // Suggestion pill clicks
  suggestionPills.forEach((pill) => {
    const clickHandler = () => {
      const category = pill.dataset.category;
      const prompt = getSuggestionPrompt(category);

      if (prompt && welcomeInput) {
        welcomeInput.value = prompt;
        welcomeInput.focus();

        // Auto-resize textarea
        welcomeInput.style.height = "auto";
        welcomeInput.style.height = `${Math.min(welcomeInput.scrollHeight, 200)}px`;
      }
    };
    pill.addEventListener("click", clickHandler);
    welcomePageListeners.push({ element: pill, event: "click", handler: clickHandler });
  });
}
