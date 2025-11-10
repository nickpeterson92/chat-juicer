/**
 * Session Event Handlers
 * Handles session-related events and coordinates between UI and services
 */

import {
  findSessionElement,
  renderSessionItem,
  updateSessionActive,
  updateSessionTitle,
} from "../ui/renderers/session-list-renderer.js";

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
 * @returns {Object} Event handler cleanup function
 */
export function setupSessionEventHandlers({
  sessionListContainer,
  sessionService,
  chatContainer,
  filePanel,
  ipcAdapter,
  domAdapter,
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
      // Load session data
      const sessionData = await sessionService.switchSession(sessionId);

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

      // Load messages and files
      if (sessionData) {
        chatContainer.setMessages(sessionData.messages || []);
        filePanel.setFiles(sessionData.files || []);
      }
    } catch (error) {
      console.error("Failed to switch session:", error);
    }
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
