/**
 * Session Event Handlers
 * Handles session-related events and coordinates between UI and services
 */

import { getMessageQueueService } from "../services/message-queue-service.js";
import {
  findSessionElement,
  renderSessionItem,
  updateSessionActive,
  updateSessionTitle,
} from "../ui/renderers/session-list-renderer.js";
import { updateChatModelSelector } from "../utils/chat-model-updater.js";

/**
 * Setup session event handlers
 *
 * @param {Object} dependencies - Required dependencies
 * @param {HTMLElement} dependencies.sessionListContainer - Session list DOM container
 * @param {Object} dependencies.sessionService - Session service
 * @param {Object} dependencies.chatContainer - Chat container component
 * @param {Object} dependencies.filePanel - File panel component
 * @param {Object} dependencies.ipcAdapter - IPC adapter
 * @param {Object} dependencies.domAdapter - DOM adapter
 * @param {Object} dependencies.appState - Application state manager
 * @param {Object} dependencies.streamManager - Stream manager for concurrent sessions
 * @returns {Object} Event handler cleanup function
 */
export function setupSessionEventHandlers({
  sessionListContainer,
  sessionService,
  chatContainer,
  filePanel,
  ipcAdapter,
  domAdapter,
  appState,
  streamManager,
}) {
  const handlers = [];
  let currentSessionId = null;

  // Handle session list click (delegation)
  const handleSessionListClick = async (event) => {
    const target = event.target;
    const action = domAdapter.getAttribute(target, "data-action");
    const sessionId = domAdapter.getAttribute(target, "data-session-id");

    if (!sessionId) {
      // Click on session item itself (switch session)
      const sessionItem = domAdapter.closest(target, ".session-item");
      const itemSessionId = domAdapter.getAttribute(sessionItem, "data-session-id");

      if (itemSessionId && itemSessionId !== currentSessionId) {
        await handleSessionSwitch(itemSessionId);
      }
      return;
    }

    // Handle specific actions
    switch (action) {
      case "rename":
        await handleSessionRename(sessionId);
        break;
      case "delete":
        await handleSessionDelete(sessionId);
        break;
      case "summarize":
        await handleSessionSummarize(sessionId);
        break;
    }
  };

  domAdapter.addEventListener(sessionListContainer, "click", handleSessionListClick);

  // Handle session switch
  const handleSessionSwitch = async (sessionId) => {
    try {
      // Clear message queue on session switch (queued messages belong to previous session)
      const messageQueueService = getMessageQueueService();
      if (messageQueueService) {
        messageQueueService.clear();
      }

      // Load session data (pass streamManager for concurrent session reconstruction)
      const sessionData = await sessionService.switchSession(sessionId, streamManager);

      // Only proceed with UI updates if switch was successful
      if (!sessionData?.success) {
        console.error("Session switch failed:", sessionData?.error || "Unknown error");
        return;
      }

      // Seed token usage so the indicator is accurate immediately after switch
      try {
        const existingUsage = appState.getState("session.tokenUsage") || {};
        const limit =
          typeof sessionData.max_tokens === "number" ? sessionData.max_tokens : (existingUsage.limit ?? 128000);
        const threshold =
          typeof sessionData.trigger_tokens === "number"
            ? sessionData.trigger_tokens
            : (existingUsage.threshold ?? Math.floor(limit * 0.8));
        const current = typeof sessionData.tokens === "number" ? sessionData.tokens : (existingUsage.current ?? 0);
        appState.setState("session.tokenUsage", { current, limit, threshold });
      } catch (seedError) {
        console.error("Failed to seed token usage on session switch:", seedError);
      }

      // Close sidebar after successful switch (UX: only close on success)
      // Update state - subscription will handle DOM manipulation
      appState.setState("ui.sidebarCollapsed", true);

      // NOTE: UI update handled by subscription in bootstrap/phases/phase5a-subscriptions.js
      // Subscription listens to ui.sidebarCollapsed and toggles sidebar.classList

      // Update active state in UI
      if (currentSessionId) {
        const oldSession = findSessionElement(sessionListContainer, currentSessionId, domAdapter);
        if (oldSession) {
          updateSessionActive(oldSession, false, domAdapter);
        }
      }

      const newSession = findSessionElement(sessionListContainer, sessionId, domAdapter);
      if (newSession) {
        updateSessionActive(newSession, true, domAdapter);
      }

      // Update current session
      currentSessionId = sessionId;

      // Update FilePanel component with new session context (Phase 7)
      if (filePanel?.setSession) {
        filePanel.setSession(sessionId);
        filePanel.loadSessionFiles();
      }

      // Update model selector with session's model configuration
      if (sessionData?.session) {
        updateChatModelSelector(sessionData.session);
      }

      // Load messages and files from Layer 2 (full_history)
      // Note: session-service converts snake_case to camelCase
      if (sessionData?.success) {
        // Debug: Log pagination info
        console.log("[session] Switch result:", {
          hasMore: sessionData.hasMore,
          loadedCount: sessionData.loadedCount,
          messageCount: sessionData.messageCount,
          fullHistoryLength: sessionData.fullHistory?.length,
        });

        chatContainer.setMessages(sessionData.fullHistory || [], { skipAutoScroll: true });
        // Legacy setFiles call (if filePanel doesn't have component API)
        if (filePanel?.setFiles) {
          filePanel.setFiles(sessionData.files || []);
        }

        // Load remaining messages in background if there are more
        if (sessionData.hasMore && sessionData.loadedCount > 0) {
          console.log("[session] Loading remaining messages in background...");
          loadRemainingMessages(
            sessionId,
            sessionData.loadedCount,
            sessionData.messageCount,
            sessionService,
            chatContainer
          );
        }

        // Reconstruct streaming state if session has active streaming (e.g., tool orchestration)
        // This must happen AFTER setMessages to avoid being cleared
        if (streamManager?.isStreaming(sessionId)) {
          sessionService.reconstructStreamState(sessionId, streamManager);
        }
      }
    } catch (error) {
      console.error("Failed to switch session:", error);
    }
  };

  /**
   * Load remaining messages in background and prepend to chat
   * Called after initial session load when has_more=true
   *
   * The initial session load fetches the NEWEST messages (DESC order, then reversed).
   * This function loads the OLDER messages that weren't included in the initial load.
   * The messages API uses ASC order, so offset=0 gets the oldest messages first.
   *
   * @param {string} sessionId - Session ID to load messages for
   * @param {number} loadedCount - Number of messages already loaded (the newest ones)
   * @param {number} totalCount - Total messages in session
   * @param {Object} sessionService - Session service instance
   * @param {Object} chatContainer - Chat container component
   */
  const loadRemainingMessages = async (sessionId, loadedCount, totalCount, sessionService, chatContainer) => {
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
          chatContainer.prependMessages(result.messages);
          offset += result.messages.length;
          loaded += result.messages.length;
          console.log(`[session] Prepended ${result.messages.length} messages, loaded ${loaded}/${remainingCount}`);
        } else {
          // No more messages or error - stop loading
          console.log(`[session] Stopping: success=${result.success}, error=${result.error}`);
          break;
        }
      } catch (error) {
        console.error("Failed to load more messages:", error);
        break;
      }
    }
    console.log(`[session] loadRemainingMessages complete: loaded ${loaded} older messages`);
  };

  // Handle session rename
  const handleSessionRename = async (sessionId) => {
    const newTitle = prompt("Enter new session name:");
    if (!newTitle || !newTitle.trim()) return;

    try {
      await sessionService.renameSession(sessionId, newTitle.trim());

      // Update UI
      const sessionElement = findSessionElement(sessionListContainer, sessionId, domAdapter);
      if (sessionElement) {
        updateSessionTitle(sessionElement, newTitle.trim(), domAdapter);
      }
    } catch (error) {
      console.error("Failed to rename session:", error);
      alert("Failed to rename session");
    }
  };

  // Handle session delete
  const handleSessionDelete = async (sessionId) => {
    const confirmed = confirm("Are you sure you want to delete this session? This cannot be undone.");
    if (!confirmed) return;

    try {
      await sessionService.deleteSession(sessionId);

      // Remove from UI
      const sessionElement = findSessionElement(sessionListContainer, sessionId, domAdapter);
      if (sessionElement) {
        domAdapter.remove(sessionElement);
      }

      // If deleting current session, clear chat and create new
      if (sessionId === currentSessionId) {
        chatContainer.clear();
        filePanel.clear();
        // Clear session context in FilePanel component (Phase 7)
        if (filePanel?.setSession) {
          filePanel.setSession(null);
        }
        await handleSessionCreate();
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
      alert("Failed to delete session");
    }
  };

  // Handle session summarize
  const handleSessionSummarize = async (sessionId) => {
    try {
      await sessionService.summarizeSession(sessionId);
      alert("Session summarization started");
    } catch (error) {
      console.error("Failed to summarize session:", error);
      alert("Failed to summarize session");
    }
  };

  // Handle session create
  const handleSessionCreate = async () => {
    try {
      const newSession = await sessionService.createSession();

      // Add to UI
      const sessionElement = renderSessionItem(newSession, true, domAdapter);
      domAdapter.insertBefore(sessionListContainer, sessionElement, sessionListContainer.firstChild);

      // Switch to new session
      await handleSessionSwitch(newSession.id);
    } catch (error) {
      console.error("Failed to create session:", error);
      alert("Failed to create session");
    }
  };

  // Listen for IPC events
  const handleSessionCreated = (data) => {
    const { session } = data;
    const sessionElement = renderSessionItem(session, false, domAdapter);
    domAdapter.insertBefore(sessionListContainer, sessionElement, sessionListContainer.firstChild);
  };

  handlers.push(ipcAdapter.on("session-created", handleSessionCreated));

  const handleSessionUpdated = (data) => {
    const { sessionId, updates } = data;
    const sessionElement = findSessionElement(sessionListContainer, sessionId, domAdapter);

    if (sessionElement && updates.title) {
      updateSessionTitle(sessionElement, updates.title, domAdapter);
    }
  };

  handlers.push(ipcAdapter.on("session-updated", handleSessionUpdated));

  const handleSessionDeleted = (data) => {
    const { sessionId } = data;
    const sessionElement = findSessionElement(sessionListContainer, sessionId, domAdapter);

    if (sessionElement) {
      domAdapter.remove(sessionElement);
    }
  };

  handlers.push(ipcAdapter.on("session-deleted", handleSessionDeleted));

  // Return cleanup function and current session getter
  return {
    cleanup: () => {
      for (const unsubscribe of handlers) {
        unsubscribe();
      }
    },
    getCurrentSessionId: () => currentSessionId,
    createSession: handleSessionCreate,
    switchSession: handleSessionSwitch,
  };
}

/**
 * Load sessions into UI
 *
 * @param {HTMLElement} sessionListContainer - Session list container
 * @param {Object} sessionService - Session service
 * @param {Object} domAdapter - DOM adapter
 */
export async function loadSessions(sessionListContainer, sessionService, domAdapter) {
  try {
    const sessions = await sessionService.loadSessions();

    // Clear existing
    domAdapter.setInnerHTML(sessionListContainer, "");

    // Render sessions
    const activeSessionId = await sessionService.getCurrentSessionId();

    for (const session of sessions) {
      const isActive = session.id === activeSessionId;
      const sessionElement = renderSessionItem(session, isActive, domAdapter);
      domAdapter.appendChild(sessionListContainer, sessionElement);
    }
  } catch (error) {
    console.error("Failed to load sessions:", error);
  }
}
