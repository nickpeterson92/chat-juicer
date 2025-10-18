/**
 * Session management service
 * Handles all session CRUD operations with consistent error handling
 * Optimized with batch DOM updates for fast session switching
 */

import { addMessage, clearChat } from "../ui/chat-ui.js";
import { clearFunctionCards } from "../ui/function-card-ui.js";
import { clearParseCache } from "../utils/json-cache.js";
import { processMermaidDiagrams, renderMarkdown } from "../utils/markdown-renderer.js";
import { scheduleScroll } from "../utils/scroll-utils.js";

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
      // Don't auto-select session on boot - let user choose
      // sessionState.currentSessionId = response.current_session_id;
      sessionState.currentSessionId = null;
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
        clearFunctionCards(elements.chatContainer);
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
        clearFunctionCards(elements.chatContainer);
      }

      // Reset state
      appState.setState("message.currentAssistant", null);
      appState.setState("message.assistantBuffer", "");
      appState.functions.activeCalls.clear();
      appState.functions.argumentsBuffer.clear();

      // Display historical messages from Layer 2 (full_history)
      // Backend now only sends full_history to avoid pipe buffer overflow
      const messagesToDisplay = response.full_history || [];

      // OPTIMIZATION: Lazy rendering - show recent messages first, defer historical messages
      const INITIAL_RENDER_COUNT = 10; // First 10 messages visible immediately

      if (Array.isArray(messagesToDisplay) && messagesToDisplay.length > 0) {
        const fragment = document.createDocumentFragment();

        // Partition messages: historical (hidden) vs recent (visible)
        const recentMessages = messagesToDisplay.slice(-INITIAL_RENDER_COUNT);
        const historicalMessages = messagesToDisplay.slice(0, -INITIAL_RENDER_COUNT);

        // Helper function to create message element
        const createMessageElement = (msg) => {
          const role = msg.role || "assistant";
          let content = msg.content;

          // Handle complex content structures
          if (typeof content !== "string") {
            if (Array.isArray(content)) {
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
            const messageDiv = document.createElement("div");
            const baseClasses = "message mb-6 animate-slideIn [contain:layout_style]";
            const typeClasses = {
              user: "user text-left",
              assistant: "assistant",
            };
            messageDiv.className = `${baseClasses} ${typeClasses[role] || ""}`;
            const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            messageDiv.dataset.messageId = messageId;

            const contentDiv = document.createElement("div");
            if (role === "user") {
              contentDiv.className =
                "inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-user-gradient text-white";
            } else if (role === "assistant") {
              contentDiv.className =
                "message-content text-gray-800 dark:text-slate-100 max-w-full block py-4 px-0 leading-relaxed break-words whitespace-pre-wrap";
            }

            // Render markdown for assistant messages, plain text for user messages
            if (role === "assistant") {
              contentDiv.innerHTML = renderMarkdown(content, true);
            } else {
              contentDiv.textContent = content;
            }

            messageDiv.appendChild(contentDiv);
            return messageDiv;
          }
          return null;
        };

        // Add placeholder for historical messages if any
        let placeholder = null;
        if (historicalMessages.length > 0) {
          placeholder = document.createElement("div");
          placeholder.className =
            "historical-messages-placeholder text-center py-4 text-gray-500 dark:text-slate-400 text-sm";
          placeholder.textContent = `Loading ${historicalMessages.length} earlier messages...`;
          fragment.appendChild(placeholder);
        }

        // Render recent messages immediately
        for (const msg of recentMessages) {
          const messageDiv = createMessageElement(msg);
          if (messageDiv) fragment.appendChild(messageDiv);
        }

        // Single DOM append (fast)
        elements.chatContainer.appendChild(fragment);

        // Process Mermaid in recent messages immediately
        const recentAssistantMessages = elements.chatContainer.querySelectorAll(
          ".message.assistant:not([data-historical]) .message-content"
        );
        for (const contentDiv of recentAssistantMessages) {
          processMermaidDiagrams(contentDiv).catch((err) => console.error("Mermaid processing error:", err));
        }

        // Scroll to bottom for recent messages
        scheduleScroll(elements.chatContainer);

        // Lazy render historical messages in idle time
        if (historicalMessages.length > 0) {
          requestIdleCallback(
            () => {
              const historicalFragment = document.createDocumentFragment();

              for (const msg of historicalMessages) {
                const messageDiv = createMessageElement(msg);
                if (messageDiv) {
                  messageDiv.dataset.historical = "true";
                  historicalFragment.appendChild(messageDiv);
                }
              }

              // Replace placeholder
              if (placeholder && placeholder.parentNode) {
                placeholder.replaceWith(historicalFragment);
              }

              // Process Mermaid in historical messages
              const historicalAssistantMessages = elements.chatContainer.querySelectorAll(
                ".message.assistant[data-historical] .message-content"
              );

              for (const contentDiv of historicalAssistantMessages) {
                processMermaidDiagrams(contentDiv).catch((err) => console.error("Mermaid processing error:", err));
              }
            },
            { timeout: 1000 }
          ); // Allow up to 1s for idle rendering
        }
      }

      // Clear JSON parse cache on session switch (prevent stale data)
      clearParseCache();

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

/**
 * Clear current session for lazy initialization pattern
 *
 * Clears the backend session state without creating a new session immediately.
 * Used when clicking "New chat" - session will be created when user sends first message.
 *
 * @param {Object} api - Electron API
 * @returns {Promise<Object>} Result with success/error
 */
export async function clearCurrentSession(api) {
  try {
    const response = await api.sessionCommand("clear", {});

    if (response?.success) {
      sessionState.currentSessionId = null;
      window.electronAPI.log("info", "Session cleared for lazy initialization");
      return { success: true, data: response };
    } else if (response?.error) {
      window.electronAPI.log("error", "Clear session failed", { error: response.error });
      return { success: false, error: response.error };
    } else {
      return { success: false, error: "Unexpected response format" };
    }
  } catch (e) {
    window.electronAPI.log("error", "Failed to clear session", { error: e.message });
    return { success: false, error: e.message };
  }
}
