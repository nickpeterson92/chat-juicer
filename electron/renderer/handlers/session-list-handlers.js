/**
 * Session List Event Handlers
 *
 * Centralized event delegation for session list interactions
 */

/**
 * Setup event handlers for session list using event delegation
 *
 * @param {Object} deps - Dependency container
 * @param {HTMLElement} deps.sessionListContainer - Sessions list container
 * @param {Object} deps.sessionService - Session service instance (SSOT)
 * @param {Function} deps.updateSessionsList - Function to refresh sessions list
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.appState - Application state
 * @param {Object} deps.ipcAdapter - IPC adapter for command queue processing
 */
export function setupSessionListHandlers({
  sessionListContainer,
  sessionService,
  updateSessionsList,
  elements,
  appState,
  ipcAdapter,
}) {
  const sessionsList = sessionListContainer;

  if (!sessionsList) {
    console.warn("setupSessionListHandlers called without a sessionListContainer");
    return;
  }

  // Click handler for session switching and actions
  sessionsList.addEventListener("click", async (e) => {
    const target = e.target;
    const sessionItem = target.closest(".session-item");

    if (!sessionItem) return;

    const sessionId = sessionItem.dataset.sessionId;
    if (!sessionId) return;

    // Handle action buttons
    const action = target.dataset?.action || target.closest("[data-action]")?.dataset?.action;

    if (action === "summarize") {
      await handleSummarize(sessionId, sessionService, appState, ipcAdapter);
      e.stopPropagation();
      return;
    }

    if (action === "rename") {
      await handleRename(sessionItem, sessionId, sessionService, updateSessionsList);
      e.stopPropagation();
      return;
    }

    if (action === "delete") {
      await handleDelete(sessionId, sessionService, updateSessionsList, elements, appState);
      e.stopPropagation();
      return;
    }

    // If clicking on rename input, don't switch session
    if (target.classList.contains("session-title-input")) {
      e.stopPropagation();
      return;
    }

    // Otherwise, switch to this session (only if different)
    if (sessionId !== sessionService.getCurrentSessionId()) {
      await handleSwitch(sessionId, sessionService, updateSessionsList, elements, appState);
    }
  });
}

/**
 * Handle session summarize
 */
async function handleSummarize(sessionId, sessionService, appState, ipcAdapter) {
  // Only summarize if this is the current session
  if (sessionId !== sessionService.getCurrentSessionId()) {
    alert("Please switch to this session first to summarize it.");
    return;
  }

  try {
    if (appState) {
      appState.setState("python.status", "busy_summarizing");
    }

    const result = await sessionService.summarizeSession(sessionId);

    if (appState) {
      appState.setState("python.status", "idle");
    }

    if (ipcAdapter && ipcAdapter.commandQueue.length > 0) {
      await ipcAdapter.processQueue();
    }

    if (!result.success) {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("[session] Summarize failed:", error.message);

    // Ensure status is reset even on error
    if (appState) {
      appState.setState("python.status", "idle");
    }

    // Process queue even on error
    if (ipcAdapter && ipcAdapter.commandQueue.length > 0) {
      await ipcAdapter.processQueue();
    }

    alert(`Error summarizing session: ${error.message}`);
  }
}

/**
 * Handle session rename
 */
async function handleRename(sessionItem, sessionId, sessionService, _updateSessionsList) {
  const titleDiv = sessionItem.querySelector(".session-title");
  if (!titleDiv) return;

  const currentTitle = titleDiv.textContent;

  // Create inline input for renaming
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentTitle;
  input.className = "session-title-input";
  input.style.cssText =
    "width: 100%; padding: 4px; font-size: 13px; border: 1px solid var(--color-border-focus); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary);";

  // Replace title with input
  titleDiv.style.display = "none";
  titleDiv.parentNode.insertBefore(input, titleDiv.nextSibling);
  input.focus();
  input.select();

  const saveRename = async () => {
    const newTitle = input.value.trim();

    // Remove input
    input.remove();
    titleDiv.style.display = "";

    if (!newTitle || newTitle === currentTitle) return;

    try {
      const result = await sessionService.renameSession(sessionId, newTitle);

      if (result.success) {
        titleDiv.textContent = newTitle;
      } else {
        console.error("[session] Rename failed:", result.error);
        alert(`Failed to rename session: ${result.error}`);
      }
    } catch (error) {
      console.error("[session] Rename error:", error.message);
      alert(`Error renaming session: ${error.message}`);
    }
  };

  input.addEventListener("blur", saveRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRename();
    } else if (e.key === "Escape") {
      input.remove();
      titleDiv.style.display = "";
    }
  });
}

/**
 * Handle session delete
 */
async function handleDelete(sessionId, sessionService, updateSessionsList, elements, appState) {
  // Get session title for confirmation
  const sessionItem = document.querySelector(`[data-session-id="${sessionId}"]`);
  const titleDiv = sessionItem?.querySelector(".session-title");
  const sessionTitle = titleDiv?.textContent || "Untitled Conversation";

  const confirmDelete = confirm(`Delete session "${sessionTitle}"?`);
  if (!confirmDelete) return;

  try {
    const wasOnWelcomePage = document.body.classList.contains("view-welcome");
    const isDeletingCurrentSession = sessionId === sessionService.getCurrentSessionId();

    const result = await sessionService.deleteSession(sessionId);

    if (result.success) {
      const sessions = await sessionService.loadSessions();
      if (sessions.success) {
        updateSessionsList(sessions.sessions || []);
      }

      if (isDeletingCurrentSession) {
        // Clear FilePanel FIRST to release file handles
        if (window.components?.filePanel) {
          window.components.filePanel.closeAllHandles();
          window.components.filePanel.setSession(null);
          window.components.filePanel.clear();
        }

        if (window.components?.chatContainer) {
          window.components.chatContainer.clear();
        }

        const { showWelcomeView } = await import("../managers/view-manager.js");
        await showWelcomeView(elements, appState);
      }

      // Close sidebar after delete (but keep open on welcome page for multi-session management)
      if (!wasOnWelcomePage) {
        const sidebar = document.getElementById("sidebar");
        if (sidebar && !sidebar.classList.contains("collapsed")) {
          sidebar.classList.add("collapsed");
        }
      }
    } else {
      console.error("[session] Delete failed:", result.error);
      alert(`Failed to delete session: ${result.error}`);
    }
  } catch (error) {
    console.error("[session] Delete error:", error.message);
    alert(`Error deleting session: ${error.message}`);
  }
}

/**
 * Handle session switch
 */
async function handleSwitch(sessionId, sessionService, updateSessionsList, elements, appState) {
  if (sessionId === sessionService.getCurrentSessionId()) {
    return;
  }

  try {
    const result = await sessionService.switchSession(sessionId);

    if (result.success) {
      // Close sidebar after successful switch
      const sidebar = document.getElementById("sidebar");
      if (sidebar && !sidebar.classList.contains("collapsed")) {
        sidebar.classList.add("collapsed");
      }

      // Update chat model selector
      if (result.session) {
        import("../utils/chat-model-updater.js").then(({ updateChatModelSelector }) => {
          updateChatModelSelector(result.session);
        });
      }

      // Clear current chat UI
      if (window.components?.chatContainer) {
        window.components.chatContainer.clear();
      }

      // Reset app state
      if (appState) {
        appState.setState("message.currentAssistant", null);
        appState.setState("message.assistantBuffer", "");
        if (appState.functions) {
          appState.functions.activeCalls?.clear();
          appState.functions.argumentsBuffer?.clear();
        }
      }

      // Render messages from backend
      const messages = result.fullHistory || [];
      if (messages.length > 0 && window.components?.chatContainer) {
        for (const msg of messages) {
          if (msg.role && msg.content) {
            const content = extractTextContent(msg.content);
            if (content && content.trim()) {
              if (msg.role === "user") {
                window.components.chatContainer.addUserMessage(content);
              } else if (msg.role === "assistant") {
                window.components.chatContainer.addAssistantMessage(content);
              }
            }
          }
        }
      }

      updateSessionsList();

      // Switch to chat view if on welcome page
      if (document.body.classList.contains("view-welcome")) {
        const { showChatView } = await import("../managers/view-manager.js");
        await showChatView(elements, appState);
      }

      // Update FilePanel
      if (window.components?.filePanel) {
        window.components.filePanel.setSession(sessionId);
      }

      // Scroll to bottom after loading
      if (messages.length > 0 && window.components?.chatContainer) {
        const { scheduleScroll } = await import("../utils/scroll-utils.js");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scheduleScroll(window.components.chatContainer.getElement(), { force: true });
          });
        });
      }
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("[session] Switch failed:", error.message);
    alert(`Failed to switch session: ${error.message}`);
  }
}

/**
 * Extract text content from various message formats
 */
function extractTextContent(content) {
  if (typeof content === "string") {
    // Try parsing as JSON if it looks like JSON
    if (content.startsWith("[") || content.startsWith("{")) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((part) => part && (part.type === "text" || part.type === "output_text"))
            .map((part) => part.text)
            .join("\n");
        } else if (parsed.text) {
          return parsed.text;
        }
      } catch (_e) {
        // Not valid JSON, use as-is
      }
    }
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part && (part.type === "text" || part.type === "output_text"))
      .map((part) => part.text)
      .join("\n");
  }

  if (typeof content === "object" && content.text) {
    return content.text;
  }

  return null;
}
