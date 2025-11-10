/**
 * Session management service
 * Handles all session CRUD operations with consistent error handling
 * Optimized with batch DOM updates for fast session switching
 */

import {
  IDLE_RENDER_TIMEOUT,
  INITIAL_RENDER_COUNT,
  PAGINATION_CHUNK_SIZE,
  PAGINATION_MAX_RETRIES,
  PAGINATION_RETRY_DELAY_BASE,
  PAGINATION_THROTTLE_DELAY,
} from "../config/constants.js";
import { clearChat } from "../ui/chat-ui.js";
import { clearFunctionCards } from "../ui/function-card-ui.js";
import { clearParseCache } from "../utils/json-cache.js";
import { initializeCodeCopyButtons, processMermaidDiagrams, renderMarkdown } from "../utils/markdown-renderer.js";
import { scheduleScroll } from "../utils/scroll-utils.js";
import { showToast } from "../utils/toast.js";

// ============================================================================
// NEW: Class-based SessionService with Dependency Injection
// ============================================================================

/**
 * SessionService class - Pure business logic for session management
 * NO DEPENDENCIES on DOM - uses adapters for infrastructure
 *
 * Handles:
 * - Session CRUD operations
 * - Session state management
 * - Session history loading with pagination
 * - Session validation
 */
export class SessionService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.ipcAdapter - IPC adapter for backend communication
   * @param {Object} dependencies.storageAdapter - Storage adapter for state persistence
   */
  constructor({ ipcAdapter, storageAdapter }) {
    this.ipc = ipcAdapter;
    this.storage = storageAdapter;

    // Session state
    this.currentSessionId = null;
    this.sessions = [];
    this.totalSessions = 0;
    this.hasMoreSessions = false;
    this.isLoadingSessions = false;
  }

  /**
   * Load sessions from backend
   *
   * @param {number} offset - Pagination offset (default: 0)
   * @param {number} limit - Results per page (default: 50)
   * @returns {Promise<Object>} Result with sessions array
   */
  async loadSessions(offset = 0, limit = 50) {
    if (this.isLoadingSessions) {
      return { success: false, error: "Already loading sessions", sessions: [] };
    }

    try {
      this.isLoadingSessions = true;

      const response = await this.ipc.sendSessionCommand("list", { offset, limit });

      if (response?.sessions) {
        // Append or replace sessions based on offset
        if (offset === 0) {
          this.sessions = response.sessions;
        } else {
          this.sessions.push(...response.sessions);
        }

        // Update pagination state
        this.totalSessions = response.total_count || response.sessions.length;
        this.hasMoreSessions = response.has_more || false;

        return { success: true, sessions: this.sessions, hasMore: this.hasMoreSessions };
      }

      return { success: false, error: "Invalid response format", sessions: [] };
    } catch (error) {
      return { success: false, error: error.message, sessions: [] };
    } finally {
      this.isLoadingSessions = false;
    }
  }

  /**
   * Load next page of sessions (pagination)
   *
   * @returns {Promise<Object>} Result with new sessions
   */
  async loadMoreSessions() {
    if (!this.hasMoreSessions || this.isLoadingSessions) {
      return { success: false, error: "No more sessions or already loading", sessions: [] };
    }

    const nextOffset = this.sessions.length;
    return this.loadSessions(nextOffset, 50);
  }

  /**
   * Create new session
   *
   * @param {Object} options - Session creation options
   * @param {string|null} options.title - Optional session title
   * @param {string[]|null} options.mcpConfig - Optional MCP server configuration
   * @param {string|null} options.model - Optional model deployment name
   * @param {string|null} options.reasoningEffort - Optional reasoning effort level
   * @returns {Promise<Object>} Result with session_id
   */
  async createSession(options = {}) {
    try {
      const data = {};
      if (options.title) data.title = options.title;
      if (options.mcpConfig) data.mcp_config = options.mcpConfig;
      if (options.model) data.model = options.model;
      if (options.reasoningEffort) data.reasoning_effort = options.reasoningEffort;

      const response = await this.ipc.sendSessionCommand("new", data);

      if (response?.session_id) {
        this.currentSessionId = response.session_id;
        return {
          success: true,
          sessionId: response.session_id,
          title: response.title || options.title || "Untitled Conversation",
        };
      }

      return { success: false, error: "Failed to create session" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Switch to different session
   *
   * @param {string} sessionId - Session ID to switch to
   * @returns {Promise<Object>} Result with session data and history
   */
  async switchSession(sessionId) {
    if (!sessionId) {
      return { success: false, error: "No session ID provided" };
    }

    if (sessionId === this.currentSessionId) {
      return { success: false, error: "Already on this session" };
    }

    try {
      const response = await this.ipc.sendSessionCommand("switch", { session_id: sessionId });

      if (response?.session) {
        this.currentSessionId = sessionId;

        return {
          success: true,
          session: response.session,
          fullHistory: response.full_history || [],
          hasMore: response.has_more || false,
          loadedCount: response.loaded_count || 0,
          messageCount: response.message_count || 0,
        };
      }

      return { success: false, error: "Invalid response format" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete session
   *
   * @param {string} sessionId - Session ID to delete
   * @returns {Promise<Object>} Result
   */
  async deleteSession(sessionId) {
    if (!sessionId) {
      return { success: false, error: "No session ID provided" };
    }

    try {
      const response = await this.ipc.sendSessionCommand("delete", { session_id: sessionId });

      if (response?.success) {
        // Remove from local cache
        this.sessions = this.sessions.filter((s) => s.session_id !== sessionId);

        // Clear current if deleting active session
        if (this.currentSessionId === sessionId) {
          this.currentSessionId = null;
        }

        return { success: true };
      } else if (response?.error) {
        return { success: false, error: response.error };
      } else {
        return { success: false, error: "Unexpected response format" };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Rename session
   *
   * @param {string} sessionId - Session ID to rename
   * @param {string} title - New title
   * @returns {Promise<Object>} Result
   */
  async renameSession(sessionId, title) {
    if (!sessionId) {
      return { success: false, error: "No session ID provided" };
    }

    if (!title || !title.trim()) {
      return { success: false, error: "Title cannot be empty" };
    }

    try {
      const response = await this.ipc.sendSessionCommand("rename", { session_id: sessionId, title: title.trim() });

      if (response?.success) {
        // Update local cache
        const session = this.sessions.find((s) => s.session_id === sessionId);
        if (session) {
          session.title = title.trim();
        }

        return { success: true, title: title.trim() };
      } else if (response?.error) {
        return { success: false, error: response.error };
      } else {
        return { success: false, error: "Unexpected response format" };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Summarize current session
   *
   * @returns {Promise<Object>} Result
   */
  async summarizeSession() {
    try {
      const response = await this.ipc.sendSessionCommand("summarize", {});

      if (response?.success) {
        return { success: true, message: response.message || "Session summarized successfully" };
      } else if (response?.error) {
        return { success: false, error: response.error };
      } else {
        return { success: false, error: "Unexpected response format" };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear current session (lazy initialization)
   *
   * @returns {Promise<Object>} Result
   */
  async clearCurrentSession() {
    try {
      const response = await this.ipc.sendSessionCommand("clear", {});

      if (response?.success) {
        this.currentSessionId = null;
        return { success: true };
      } else if (response?.error) {
        return { success: false, error: response.error };
      } else {
        return { success: false, error: "Unexpected response format" };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Load more messages for current session (pagination)
   *
   * @param {string} sessionId - Session ID
   * @param {number} offset - Message offset
   * @param {number} limit - Messages per page
   * @returns {Promise<Object>} Result with messages
   */
  async loadMoreMessages(sessionId, offset, limit = 100) {
    if (!sessionId) {
      return { success: false, error: "No session ID provided", messages: [] };
    }

    try {
      const response = await this.ipc.sendSessionCommand("load_more", { session_id: sessionId, offset, limit });

      if (response?.messages) {
        return { success: true, messages: response.messages };
      } else if (response?.error) {
        return { success: false, error: response.error, messages: [] };
      } else {
        return { success: false, error: "No messages returned", messages: [] };
      }
    } catch (error) {
      return { success: false, error: error.message, messages: [] };
    }
  }

  /**
   * Get current session ID
   *
   * @returns {string|null} Current session ID or null
   */
  getCurrentSessionId() {
    return this.currentSessionId;
  }

  /**
   * Get all loaded sessions
   *
   * @returns {Array<Object>} Sessions array
   */
  getSessions() {
    return [...this.sessions];
  }

  /**
   * Get session by ID
   *
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session object or null
   */
  getSession(sessionId) {
    return this.sessions.find((s) => s.session_id === sessionId) || null;
  }

  /**
   * Get pagination state
   *
   * @returns {Object} Pagination info
   */
  getPaginationState() {
    return {
      total: this.totalSessions,
      loaded: this.sessions.length,
      hasMore: this.hasMoreSessions,
      isLoading: this.isLoadingSessions,
    };
  }

  /**
   * Reset service state
   */
  reset() {
    this.currentSessionId = null;
    this.sessions = [];
    this.totalSessions = 0;
    this.hasMoreSessions = false;
    this.isLoadingSessions = false;
  }
}

// ============================================================================
// LEGACY: Functional exports (to be deprecated in Phase 3)
// ============================================================================

/**
 * Parse message content to extract displayable text
 * Handles various content structures from historical message data
 *
 * @param {string|Array|Object} content - Raw message content
 * @returns {string} Parsed content as string
 *
 * @example
 * // String content (most common)
 * parseMessageContent("Hello") // => "Hello"
 *
 * // Array of content parts
 * parseMessageContent([{text: "Hi"}, {text: "there"}]) // => "Hithere"
 *
 * // Complex object
 * parseMessageContent({data: "value"}) // => '{"data":"value"}'
 */
function parseMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.text) return item.text;
        if (item?.output) return item.output;
        return "";
      })
      .filter((text) => text);
    return textParts.join("");
  }

  // Fallback: stringify objects
  return JSON.stringify(content);
}

/**
 * Create a message DOM element for display in chat
 * Only creates elements for user/assistant messages with actual content
 *
 * @param {Object} msg - Message object from session history
 * @param {string} msg.role - Message role (user|assistant|system|...)
 * @param {string|Array|Object} msg.content - Message content
 * @returns {HTMLElement|null} Message div element or null if should not display
 *
 * @example
 * const msg = {role: "user", content: "Hello"};
 * const element = createMessageElement(msg);
 * chatContainer.appendChild(element);
 */
function createMessageElement(msg) {
  const role = msg.role || "assistant";
  const content = parseMessageContent(msg.content);

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
      // Note: Session history doesn't need Mermaid processing (done during pagination)
      // So we can safely initialize copy buttons immediately
      setTimeout(() => initializeCodeCopyButtons(contentDiv), 0);
    } else {
      contentDiv.textContent = content;
    }

    messageDiv.appendChild(contentDiv);
    return messageDiv;
  }
  return null;
}

/**
 * Session state (managed externally, passed to functions)
 */
export const sessionState = {
  currentSessionId: null,
  sessions: [],
  totalSessions: 0,
  hasMoreSessions: false,
  isLoadingSessions: false,
};

/**
 * Load sessions from backend
 * @param {Object} api - Electron API
 * @param {Function} onSuccess - Callback for successful load
 * @returns {Promise<Object>} Result with success/error
 */
export async function loadSessions(api, onSuccess, offset = 0, limit = 50) {
  try {
    sessionState.isLoadingSessions = true;

    const response = await api.sessionCommand("list", { offset, limit });

    if (response?.sessions) {
      // Append or replace sessions based on offset
      if (offset === 0) {
        sessionState.sessions = response.sessions;
      } else {
        sessionState.sessions.push(...response.sessions);
      }

      // Update pagination state
      sessionState.totalSessions = response.total_count || response.sessions.length;
      sessionState.hasMoreSessions = response.has_more || false;

      // Don't reset currentSessionId if it's already set (e.g., from session-created event)
      // This preserves the selection when reloading sessions list

      if (onSuccess) {
        onSuccess(sessionState);
      }

      return { success: true, data: response };
    }

    return { success: false, error: "Invalid response format" };
  } catch (e) {
    window.electronAPI.log("error", "Failed to load sessions", { error: e.message });
    return { success: false, error: e.message };
  } finally {
    sessionState.isLoadingSessions = false;
  }
}

/**
 * Load more sessions (pagination)
 * @param {Object} api - Electron API
 * @param {Function} onSuccess - Callback for successful load
 * @returns {Promise<Object>} Result with success/error
 */
export async function loadMoreSessions(api, onSuccess) {
  if (!sessionState.hasMoreSessions || sessionState.isLoadingSessions) {
    return { success: false, error: "No more sessions or already loading" };
  }

  const nextOffset = sessionState.sessions.length;
  return loadSessions(api, onSuccess, nextOffset, 50);
}

/**
 * Create a new session
 * @param {Object} api - Electron API
 * @param {Object} elements - DOM elements
 * @param {string} title - Optional session title
 * @param {string[]} mcpConfig - Optional MCP server configuration
 * @param {string} model - Optional model deployment name
 * @param {string} reasoningEffort - Optional reasoning effort level
 * @returns {Promise<Object>} Result with success/error
 */
export async function createNewSession(
  api,
  elements,
  title = null,
  mcpConfig = null,
  model = null,
  reasoningEffort = null
) {
  try {
    const data = {};
    if (title) data.title = title;
    if (mcpConfig) data.mcp_config = mcpConfig;
    if (model) data.model = model;
    if (reasoningEffort) data.reasoning_effort = reasoningEffort;

    const response = await api.sessionCommand("new", data);

    if (response?.session_id) {
      // Clear chat for new session
      if (elements.chatContainer) {
        clearChat(elements.chatContainer);
        clearFunctionCards(elements.chatContainer);
      }

      const sessionId = response.session_id;
      const sessionTitle = response.title || title || "Untitled Conversation";

      sessionState.currentSessionId = sessionId;

      // Update files panel to point at the new session directory
      // Notify listeners (e.g., sidebar) so they can refresh session lists
      window.dispatchEvent(
        new CustomEvent("session-created", {
          detail: {
            session_id: sessionId,
            title: sessionTitle,
            source: "client",
            from_file_upload: false,
          },
        })
      );

      showToast("New conversation started", "success", 2000);
      window.electronAPI.log("info", "Created new session", { session_id: sessionId });

      return { success: true, data: response };
    }

    return { success: false, error: "Failed to create session" };
  } catch (e) {
    window.electronAPI.log("error", "Failed to create session", { error: e.message });
    showToast("Failed to create new conversation", "error", 4000);
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
      // Backend now sends initial chunk to avoid pipe buffer overflow
      const messagesToDisplay = response.full_history || [];
      const hasMore = response.has_more || false;
      const loadedCount = response.loaded_count || messagesToDisplay.length;

      // OPTIMIZATION: Lazy rendering - show recent messages first, defer historical messages
      // First N messages visible immediately (defined in constants)

      // Initialize mermaid promises array (used for scroll timing)
      let mermaidPromises = [];

      if (Array.isArray(messagesToDisplay) && messagesToDisplay.length > 0) {
        const fragment = document.createDocumentFragment();

        // Partition messages: historical (hidden) vs recent (visible)
        const recentMessages = messagesToDisplay.slice(-INITIAL_RENDER_COUNT);
        const historicalMessages = messagesToDisplay.slice(0, -INITIAL_RENDER_COUNT);

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

        // Process all Mermaid diagrams (but don't scroll yet - wait for toast)
        mermaidPromises = Array.from(recentAssistantMessages).map((contentDiv) =>
          processMermaidDiagrams(contentDiv).catch((err) => console.error("Mermaid processing error:", err))
        );

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
              if (placeholder?.parentNode) {
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
            { timeout: IDLE_RENDER_TIMEOUT }
          ); // Allow timeout for idle rendering
        }
      }

      // Clear JSON parse cache on session switch (prevent stale data)
      clearParseCache();

      const messageCount = response.message_count || 0;

      // Show toast notification instead of system message
      showToast(`Switched to: ${response.session.title}`, "info", 2500);

      // Scroll to bottom AFTER all content (Mermaid rendering) is added
      Promise.all(mermaidPromises).finally(() => {
        scheduleScroll(elements.chatContainer);
      });

      // Load remaining messages in background if needed
      if (hasMore) {
        loadRemainingMessages(api, elements, sessionId, loadedCount, messageCount, createMessageElement).catch(
          (err) => {
            window.electronAPI.log("error", "Failed to load remaining messages", { error: err.message });
          }
        );
      }

      window.electronAPI.log("info", "Switched session", { session_id: sessionId });
      return { success: true, data: response };
    }

    return { success: false, error: "Invalid response format" };
  } catch (e) {
    window.electronAPI.log("error", "Failed to switch session", { error: e.message });
    showToast("Failed to switch conversation", "error", 4000);
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
export async function deleteSession(api, _elements, sessionId) {
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
      showToast(response.error, "error", 4000);
      return { success: false, error: response.error };
    } else {
      window.electronAPI.log("error", "Unexpected delete response", { response });
      showToast("Failed to delete conversation", "error", 4000);
      return { success: false, error: "Unexpected response format" };
    }
  } catch (e) {
    window.electronAPI.log("error", "Failed to delete session", { error: e.message });
    showToast("Failed to delete conversation", "error", 4000);
    return { success: false, error: e.message };
  }
}

/**
 * Manually trigger conversation summarization
 * @param {Object} api - Electron API
 * @param {Object} elements - DOM elements
 * @returns {Promise<Object>} Result with success/error
 */
export async function summarizeCurrentSession(api, _elements) {
  try {
    const response = await api.sessionCommand("summarize", {});

    if (response?.success) {
      showToast(response.message || "Conversation summarized successfully", "success", 3000);
      window.electronAPI.log("info", "Session summarized", response);
      return { success: true, data: response };
    } else if (response?.error) {
      showToast(response.error, "error", 4000);
      return { success: false, error: response.error };
    } else {
      return { success: false, error: "Unexpected response format" };
    }
  } catch (e) {
    window.electronAPI.log("error", "Failed to summarize session", { error: e.message });
    showToast("Failed to summarize conversation", "error", 4000);
    return { success: false, error: e.message };
  }
}

/**
 * Load remaining messages in background (pagination)
 * @param {Object} api - Electron API
 * @param {Object} elements - DOM elements
 * @param {string} sessionId - Session ID
 * @param {number} currentOffset - Current message count loaded
 * @param {number} totalCount - Total message count
 * @param {Function} createMessageElement - Message element creation function
 * @returns {Promise<void>}
 */
async function loadRemainingMessages(api, elements, sessionId, currentOffset, totalCount, createMessageElement) {
  const CHUNK_SIZE = PAGINATION_CHUNK_SIZE; // Match backend INITIAL_SESSION_CHUNK_SIZE
  let offset = currentOffset;

  window.electronAPI.log("info", "Starting background message loading", {
    session_id: sessionId,
    offset,
    totalCount,
  });

  while (offset < totalCount) {
    // CRITICAL: Check if user switched sessions during pagination to prevent race condition
    if (sessionState.currentSessionId !== sessionId) {
      window.electronAPI.log("info", "Session changed during pagination, canceling background load", {
        expected: sessionId,
        actual: sessionState.currentSessionId,
      });
      return; // Cancel pagination for old session
    }

    // Retry loop with exponential backoff for transient errors
    let retryCount = 0;
    let success = false;
    let messages = [];

    while (retryCount <= PAGINATION_MAX_RETRIES && !success) {
      try {
        const response = await api.sessionCommand("load_more", {
          session_id: sessionId,
          offset: offset,
          limit: CHUNK_SIZE,
        });

        // Check for permanent errors (don't retry)
        if (response?.error) {
          const isPermanentError =
            response.error.includes("not found") ||
            response.error.includes("invalid") ||
            response.error.includes("does not exist");

          if (isPermanentError) {
            window.electronAPI.log("error", `Permanent error loading messages at offset ${offset}`, {
              error: response.error,
            });
            return; // Stop pagination entirely for permanent errors
          }

          // Transient error - will retry
          throw new Error(response.error);
        }

        messages = response.messages || [];
        if (messages.length === 0) {
          window.electronAPI.log("warn", "No messages returned from load_more", { offset });
          return; // No more messages to load
        }

        success = true; // Success - exit retry loop
      } catch (error) {
        retryCount++;

        if (retryCount > PAGINATION_MAX_RETRIES) {
          // Max retries exceeded
          window.electronAPI.log("error", `Failed to load messages after ${PAGINATION_MAX_RETRIES} retries`, {
            offset,
            error: error.message,
          });
          return; // Stop pagination after max retries
        }

        // Calculate exponential backoff delay: base * (2 ^ retryCount)
        const retryDelay = PAGINATION_RETRY_DELAY_BASE * 2 ** (retryCount - 1);

        window.electronAPI.log("warn", `Retrying message load (attempt ${retryCount}/${PAGINATION_MAX_RETRIES})`, {
          offset,
          error: error.message,
          retryDelay,
        });

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    // If we got here without success, something went wrong
    if (!success) {
      return;
    }

    // Append messages to chat UI using document fragment for performance
    const fragment = document.createDocumentFragment();
    for (const msg of messages) {
      const messageDiv = createMessageElement(msg);
      if (messageDiv) {
        messageDiv.dataset.historical = "true";
        fragment.appendChild(messageDiv);
      }
    }

    // CRITICAL FIX: Insert paginated older messages AT THE BEGINNING of chat container
    // With ORDER BY DESC + offset, pagination loads OLDER messages (lower IDs)
    // These must go BEFORE all existing messages to maintain chronological order 1→2→3...→N
    const chatContainer = elements.chatContainer;
    const firstMessage = chatContainer.firstChild;

    if (firstMessage) {
      // Insert before the first message in the container (prepend)
      chatContainer.insertBefore(fragment, firstMessage);
    } else {
      // Container is empty (shouldn't happen but handle gracefully)
      chatContainer.appendChild(fragment);
    }

    // Process Mermaid diagrams in newly loaded messages
    const newAssistantMessages = Array.from(fragment.querySelectorAll(".message.assistant .message-content"));
    for (const contentDiv of newAssistantMessages) {
      processMermaidDiagrams(contentDiv).catch((err) =>
        console.error("Mermaid processing error in paginated load:", err)
      );
    }

    offset += messages.length;

    const progress = Math.round((offset / totalCount) * 100);
    window.electronAPI.log("info", `Loaded ${offset}/${totalCount} messages (${progress}%)`, {
      session_id: sessionId,
    });

    // Small delay to avoid overwhelming UI and allow user interaction
    await new Promise((resolve) => setTimeout(resolve, PAGINATION_THROTTLE_DELAY));
  }

  window.electronAPI.log("info", `Finished loading all messages for session ${sessionId}`, {
    total_loaded: offset,
    total_count: totalCount,
  });

  // Note: Toast notification already shows completion status during switchSession()
  // No need to update UI here since we use transient toast notifications
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

/**
 * Rename a session with a new title
 * @param {Object} api - Electron API
 * @param {string} sessionId - Session ID to rename
 * @param {string} title - New title for the session
 * @returns {Promise<Object>} Result with success/error
 */
export async function renameSession(api, sessionId, title) {
  if (!sessionId) {
    return { success: false, error: "No session ID provided" };
  }

  if (!title || !title.trim()) {
    return { success: false, error: "Title cannot be empty" };
  }

  try {
    const response = await api.sessionCommand("rename", { session_id: sessionId, title: title.trim() });

    if (response?.success) {
      showToast(`Renamed to: ${title}`, "success", 2500);
      window.electronAPI.log("info", "Renamed session", { session_id: sessionId, title });
      return { success: true, data: response };
    } else if (response?.error) {
      window.electronAPI.log("error", "Rename session failed", { error: response.error });
      showToast(response.error, "error", 4000);
      return { success: false, error: response.error };
    } else {
      window.electronAPI.log("error", "Unexpected rename response", { response });
      showToast("Failed to rename conversation", "error", 4000);
      return { success: false, error: "Unexpected response format" };
    }
  } catch (e) {
    window.electronAPI.log("error", "Failed to rename session", { error: e.message });
    showToast("Failed to rename conversation", "error", 4000);
    return { success: false, error: e.message };
  }
}
