/**
 * Session management service
 * Handles all session CRUD operations with consistent error handling
 */

import { addMessage, clearChat } from "../ui/chat-ui.js";
import { clearFunctionCards } from "../ui/function-card-ui.js";

/**
 * Session state (managed externally, passed to functions)
 */
export const sessionState = {
  currentSessionId: null,
  sessions: [],
};

/**
 * Load sessions from backend
 * @param {Object} api - Electron API
 * @param {Function} onSuccess - Callback for successful load
 * @returns {Promise<Object>} Result with success/error
 */
export async function loadSessions(api, onSuccess) {
  try {
    const response = await api.sessionCommand("list", {});
    if (response?.sessions) {
      sessionState.sessions = response.sessions;
      sessionState.currentSessionId = response.current_session_id;
      if (onSuccess) {
        onSuccess(sessionState);
      }
      return { success: true, data: response };
    }
    return { success: false, error: "Invalid response format" };
  } catch (e) {
    window.electronAPI.log("error", "Failed to load sessions", { error: e.message });
    return { success: false, error: e.message };
  }
}

/**
 * Create a new session
 * @param {Object} api - Electron API
 * @param {Object} elements - DOM elements
 * @param {string} title - Optional session title
 * @returns {Promise<Object>} Result with success/error
 */
export async function createNewSession(api, elements, title = null) {
  try {
    const response = await api.sessionCommand("new", title ? { title } : {});

    if (response?.session_id) {
      // Clear chat for new session
      if (elements.chatContainer) {
        clearChat(elements.chatContainer);
      }
      if (elements.toolsContainer) {
        clearFunctionCards(elements.toolsContainer);
      }

      addMessage(elements.chatContainer, "New conversation started.", "system");
      window.electronAPI.log("info", "Created new session", { session_id: response.session_id });

      return { success: true, data: response };
    }

    return { success: false, error: "Failed to create session" };
  } catch (e) {
    window.electronAPI.log("error", "Failed to create session", { error: e.message });
    addMessage(elements.chatContainer, "Failed to create new conversation.", "error");
    return { success: false, error: e.message };
  }
}

/**
 * Switch to a different session
 * @param {Object} api - Electron API
 * @param {Object} elements - DOM elements
 * @param {Object} appState - Application state
 * @param {string} sessionId - Session ID to switch to
 * @returns {Promise<Object>} Result with success/error
 */
export async function switchSession(api, elements, appState, sessionId) {
  if (!sessionId || sessionId === sessionState.currentSessionId) {
    return { success: false, error: "Invalid or same session ID" };
  }

  try {
    const response = await api.sessionCommand("switch", { session_id: sessionId });

    if (response?.session) {
      sessionState.currentSessionId = sessionId;

      // Clear current chat
      if (elements.chatContainer) {
        clearChat(elements.chatContainer);
      }
      if (elements.toolsContainer) {
        clearFunctionCards(elements.toolsContainer);
      }

      // Reset state
      appState.setState("message.currentAssistant", null);
      appState.setState("message.assistantBuffer", "");
      appState.functions.activeCalls.clear();
      appState.functions.argumentsBuffer.clear();

      // Display historical messages
      if (response.messages && Array.isArray(response.messages)) {
        for (const msg of response.messages) {
          const role = msg.role || "assistant";
          let content = msg.content;

          // Handle complex content structures
          if (typeof content !== "string") {
            if (Array.isArray(content)) {
              // Extract text from content array
              const textParts = content
                .map((item) => {
                  if (typeof item === "string") return item;
                  if (item?.text) return item.text;
                  if (item?.output) return item.output;
                  return "";
                })
                .filter((text) => text);
              content = textParts.join("\n");
            } else {
              content = JSON.stringify(content);
            }
          }

          // Only show user and assistant messages with actual content
          if ((role === "user" || role === "assistant") && content && content.trim()) {
            addMessage(elements.chatContainer, content, role);
          }
        }
      }

      const messageCount = response.message_count || 0;
      addMessage(
        elements.chatContainer,
        `Switched to conversation: ${response.session.title} (${messageCount} messages loaded)`,
        "system"
      );

      window.electronAPI.log("info", "Switched session", { session_id: sessionId });
      return { success: true, data: response };
    }

    return { success: false, error: "Invalid response format" };
  } catch (e) {
    window.electronAPI.log("error", "Failed to switch session", { error: e.message });
    addMessage(elements.chatContainer, "Failed to switch conversation.", "error");
    return { success: false, error: e.message };
  }
}

/**
 * Delete a session
 * @param {Object} api - Electron API
 * @param {Object} elements - DOM elements
 * @param {string} sessionId - Session ID to delete
 * @returns {Promise<Object>} Result with success/error
 */
export async function deleteSession(api, elements, sessionId) {
  if (!sessionId) {
    return { success: false, error: "No session ID provided" };
  }

  try {
    const response = await api.sessionCommand("delete", { session_id: sessionId });

    if (response?.success) {
      window.electronAPI.log("info", "Deleted session", { session_id: sessionId });
      return { success: true };
    } else if (response?.error) {
      window.electronAPI.log("error", "Delete session failed", { error: response.error });
      addMessage(elements.chatContainer, response.error, "error");
      return { success: false, error: response.error };
    } else {
      window.electronAPI.log("error", "Unexpected delete response", { response });
      addMessage(elements.chatContainer, "Failed to delete conversation.", "error");
      return { success: false, error: "Unexpected response format" };
    }
  } catch (e) {
    window.electronAPI.log("error", "Failed to delete session", { error: e.message });
    addMessage(elements.chatContainer, "Failed to delete conversation.", "error");
    return { success: false, error: e.message };
  }
}

/**
 * Manually trigger conversation summarization
 * @param {Object} api - Electron API
 * @param {Object} elements - DOM elements
 * @returns {Promise<Object>} Result with success/error
 */
export async function summarizeCurrentSession(api, elements) {
  try {
    const response = await api.sessionCommand("summarize", {});

    if (response?.success) {
      addMessage(elements.chatContainer, response.message || "Conversation summarized successfully", "system");
      window.electronAPI.log("info", "Session summarized", response);
      return { success: true, data: response };
    } else if (response?.error) {
      addMessage(elements.chatContainer, response.error, "error");
      return { success: false, error: response.error };
    } else {
      return { success: false, error: "Unexpected response format" };
    }
  } catch (e) {
    window.electronAPI.log("error", "Failed to summarize session", { error: e.message });
    addMessage(elements.chatContainer, "Failed to summarize conversation.", "error");
    return { success: false, error: e.message };
  }
}
