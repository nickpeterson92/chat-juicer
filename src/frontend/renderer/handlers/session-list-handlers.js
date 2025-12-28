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
 * @param {Object} deps.streamManager - StreamManager instance for concurrent streams
 * @param {Function} deps.updateSessionsList - Function to refresh sessions list
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.appState - Application state
 * @param {Object} deps.ipcAdapter - IPC adapter for command queue processing
 */
export function setupSessionListHandlers({
  sessionListContainer,
  sessionService,
  streamManager,
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

    if (action === "pin") {
      const pinTarget = target.closest("[data-action='pin']") || target;
      const currentlyPinned = pinTarget.dataset?.pinned === "true";
      await handlePin(sessionId, !currentlyPinned, sessionService, updateSessionsList);
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
      await handleSwitch(sessionId, sessionService, streamManager, updateSessionsList, elements, appState);
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
    // Collapse sidebar so user can see the summarization in chat
    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.classList.contains("collapsed")) {
      sidebar.classList.add("collapsed");
    }

    // Send the command FIRST, then set status
    // (Setting status before would cause the command to queue itself)
    const resultPromise = sessionService.summarizeSession(sessionId);

    // Now set status to busy (command is already in flight)
    if (appState) {
      appState.setState("python.status", "busy_summarizing");
    }

    const result = await resultPromise;

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
 * Handle session pin/unpin
 */
async function handlePin(sessionId, shouldPin, sessionService, updateSessionsList) {
  try {
    const result = await sessionService.setSessionPinned(sessionId, shouldPin);
    if (!result.success) {
      console.error("[session] Pin toggle failed:", result.error);
      alert(`Failed to update pin: ${result.error}`);
      return;
    }

    // Refresh list to reflect new ordering
    updateSessionsList();
  } catch (error) {
    console.error("[session] Pin toggle error:", error.message);
    alert(`Error updating pin: ${error.message}`);
  }
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

    if (isDeletingCurrentSession) {
      // Suppress "Disconnected from backend" toast since we are intentionally closing the WebSocket
      appState.setState("ui.intentionalDisconnect", true);
    }

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
        appState.setState("ui.intentionalDisconnect", false);
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
async function handleSwitch(sessionId, sessionService, streamManager, updateSessionsList, elements, appState) {
  if (sessionId === sessionService.getCurrentSessionId()) {
    return;
  }

  try {
    const wasOnWelcomePage = document.body.classList.contains("view-welcome");

    const result = await sessionService.switchSession(sessionId, streamManager);

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

      // If coming from welcome, switch the view BEFORE heavy rendering to match session-to-session flow
      if (wasOnWelcomePage) {
        const { showChatView } = await import("../managers/view-manager.js");
        await showChatView(elements, appState);
      }

      // Clear current chat UI
      if (window.components?.chatContainer) {
        window.components.chatContainer.clear();
      }

      // Reset app state for the new session
      if (appState) {
        appState.setState("message.currentAssistant", null);
        appState.setState("message.assistantBuffer", "");
        // Reset streaming state - will be set correctly by reconstruction if target session is streaming
        appState.setState("message.isStreaming", false);
        appState.setState("python.status", "idle");
        appState.setState("ui.aiThinkingActive", false);
        appState.setState("ui.loadingLampVisible", false);
        if (appState.functions) {
          appState.functions.activeCalls?.clear();
          appState.functions.argumentsBuffer?.clear();
        }
      }

      // Render messages from backend (including tool cards from Layer 2)
      // Skip auto-scroll here - we handle it explicitly after pagination completes
      // This fixes the race condition on first welcome page load where scroll fires
      // before DOM is fully painted, causing incorrect position when prepending
      const messages = result.fullHistory || [];
      if (window.components?.chatContainer) {
        window.components.chatContainer.setMessages(messages, { skipAutoScroll: true });
      }

      // Refresh sidebar ordering immediately after switching sessions
      updateSessionsList();

      // Seed token usage for the loaded session so the indicator is accurate immediately
      if (appState) {
        const existingUsage = appState.getState("session.tokenUsage") || {};
        const limit = typeof result.max_tokens === "number" ? result.max_tokens : (existingUsage.limit ?? 128000);
        const threshold =
          typeof result.trigger_tokens === "number"
            ? result.trigger_tokens
            : (existingUsage.threshold ?? Math.floor(limit * 0.8));
        const current = typeof result.tokens === "number" ? result.tokens : (existingUsage.current ?? 0);
        appState.setState("session.tokenUsage", { current, limit, threshold });
      }

      // Load remaining messages before stream reconstruction to preserve ordering
      if (result.hasMore && result.loadedCount > 0) {
        console.log("[session] Loading remaining messages in background...", {
          loadedCount: result.loadedCount,
          messageCount: result.messageCount,
        });
        await loadRemainingMessages(sessionId, result.loadedCount, result.messageCount, sessionService);
      }

      // AFTER history is loaded, reconstruct streaming state if session is actively streaming
      // This must happen AFTER clear() and setMessages() to avoid being wiped
      const isStreaming = streamManager?.isStreaming(sessionId);
      const hasBuffer = streamManager?.getBuffer(sessionId)?.length > 0;

      // Check for race condition: Stale history but we have buffered content
      // If backend run finished during switch, history might be stale (missing last message)
      // but StreamManager has the full content buffered.
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const historyIsStale = hasBuffer && (!lastMessage || lastMessage.role !== "assistant");

      if (isStreaming || historyIsStale) {
        console.log("[session] Reconstructing stream state (streaming or stale history)", {
          isStreaming,
          historyIsStale,
          hasBuffer,
        });
        sessionService.reconstructStreamState(sessionId, streamManager);
      }

      // Update FilePanel
      if (window.components?.filePanel) {
        window.components.filePanel.setSession(sessionId);
      }

      // Scroll to bottom after loading
      // Use setTimeout instead of RAF - ensures batched rendering and view transitions complete
      // before scrolling. RAF timing can fire before async renders finish.
      if (messages.length > 0 && window.components?.chatContainer) {
        const { scheduleScroll } = await import("../utils/scroll-utils.js");
        setTimeout(() => {
          scheduleScroll(window.components.chatContainer.getElement(), { force: true });
        }, 50);
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
 * Load remaining messages in background and prepend to chat
 * Called after initial session load when hasMore=true
 *
 * The initial session load fetches the NEWEST messages (DESC order, then reversed).
 * This function loads the OLDER messages that weren't included in the initial load.
 * The messages API uses ASC order, so offset=0 gets the oldest messages first.
 *
 * @param {string} sessionId - Session ID to load messages for
 * @param {number} loadedCount - Number of messages already loaded (the newest ones)
 * @param {number} totalCount - Total messages in session
 * @param {Object} sessionService - Session service instance
 */
async function loadRemainingMessages(sessionId, loadedCount, totalCount, sessionService) {
  // Calculate how many older messages we need to load
  const remainingCount = totalCount - loadedCount;
  if (remainingCount <= 0) {
    console.log(`[session] No remaining messages to load`);
    return;
  }

  const chunkSize = 100; // Match backend MAX_MESSAGES_PER_CHUNK
  let offset = 0; // Start from the oldest messages (ASC order)
  let loaded = 0;

  console.log(
    `[session] loadRemainingMessages starting: need ${remainingCount} older messages, totalCount=${totalCount}, loadedCount=${loadedCount}`
  );

  while (loaded < remainingCount) {
    try {
      const limit = Math.min(chunkSize, remainingCount - loaded);
      console.log(`[session] Loading chunk at offset=${offset}, limit=${limit}`);
      const result = await sessionService.loadMoreMessages(sessionId, offset, limit);
      console.log(`[session] loadMoreMessages result:`, {
        success: result.success,
        messageCount: result.messages?.length,
      });

      if (result.success && result.messages?.length > 0) {
        // Prepend older messages to the beginning of chat
        if (window.components?.chatContainer) {
          window.components.chatContainer.prependMessages(result.messages);
        }
        offset += result.messages.length;
        loaded += result.messages.length;
        console.log(`[session] Prepended ${result.messages.length} messages, loaded ${loaded}/${remainingCount}`);
      } else {
        // No more messages or error - stop loading
        console.log(`[session] Stopping: success=${result.success}, error=${result.error}`);
        break;
      }
    } catch (error) {
      console.error("[session] Failed to load more messages:", error);
      break;
    }
  }
  console.log(`[session] loadRemainingMessages complete: loaded ${loaded} older messages`);

  // Force scroll to bottom after all prepends complete
  // This is critical for first welcome page load where timing issues can cause
  // the scroll position to be in the middle of the conversation
  if (loaded > 0 && window.components?.chatContainer) {
    const container = window.components.chatContainer.getElement();
    // Use direct DOM manipulation for immediate scroll (bypass smart scroll logic)
    container.scrollTop = container.scrollHeight;
    console.log(
      `[session] Forced scroll to bottom after prepends: scrollTop=${container.scrollTop}, scrollHeight=${container.scrollHeight}`
    );
  }
}
