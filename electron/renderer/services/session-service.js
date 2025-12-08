/**
 * Session management service
 * Handles all session CRUD operations with consistent error handling
 * Optimized with batch DOM updates for fast session switching
 */

// ============================================================================
// NEW: Class-based SessionService with Dependency Injection
// ============================================================================

/**
 * SessionService class - Pure business logic for session management
 * NO DEPENDENCIES on DOM - uses adapters for infrastructure
 *
 * Handles:
 * - Session CRUD operations
 * - Session state management (via AppState)
 * - Session history loading with pagination
 * - Session validation
 *
 * State Management:
 * - All session state is now stored in AppState (single source of truth)
 * - SessionService reads/writes state via appState.getState() and appState.setState()
 */
export class SessionService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.ipcAdapter - IPC adapter for backend communication
   * @param {Object} dependencies.storageAdapter - Storage adapter for state persistence
   * @param {Object} dependencies.appState - Application state manager
   */
  constructor({ ipcAdapter, storageAdapter, appState }) {
    if (!appState) {
      throw new Error("SessionService requires appState (state manager) in constructor");
    }
    if (!ipcAdapter) {
      throw new Error("SessionService requires ipcAdapter in constructor");
    }
    if (!storageAdapter) {
      throw new Error("SessionService requires storageAdapter in constructor");
    }

    this.ipc = ipcAdapter;
    this.storage = storageAdapter;
    this.appState = appState;
  }

  /**
   * Load sessions from backend
   *
   * @param {number} offset - Pagination offset (default: 0)
   * @param {number} limit - Results per page (default: 50)
   * @returns {Promise<Object>} Result with sessions array
   */
  async loadSessions(offset = 0, limit = 50) {
    if (this.appState.getState("session.isLoading")) {
      return { success: false, error: "Already loading sessions", sessions: [] };
    }

    this.appState.setState("session.isLoading", true);

    try {
      const response = await this.ipc.sendSessionCommand("list", { offset, limit });

      if (response?.sessions) {
        // Append or replace sessions based on offset
        const currentList = this.appState.getState("session.list");
        const newList = offset === 0 ? response.sessions : [...currentList, ...response.sessions];

        this.appState.setState("session.list", newList);
        this.appState.setState("session.totalCount", response.total_count || newList.length);
        this.appState.setState("session.hasMore", response.has_more || false);

        return { success: true, sessions: newList, hasMore: response.has_more || false };
      }

      return { success: false, error: "Invalid response format", sessions: [] };
    } catch (error) {
      return { success: false, error: error.message, sessions: [] };
    } finally {
      this.appState.setState("session.isLoading", false);
    }
  }

  /**
   * Load next page of sessions (pagination)
   *
   * @returns {Promise<Object>} Result with new sessions
   */
  async loadMoreSessions() {
    const hasMore = this.appState.getState("session.hasMore");
    const isLoading = this.appState.getState("session.isLoading");

    if (!hasMore || isLoading) {
      return { success: false, error: "No more sessions or already loading", sessions: [] };
    }

    const sessions = this.appState.getState("session.list");
    const nextOffset = sessions.length;
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
        this.appState.setState("session.current", response.session_id);

        return {
          success: true,
          sessionId: response.session_id,
          title: response.title || options.title || "Untitled Conversation",
        };
      }

      return { success: false, error: response?.error || "Failed to create session" };
    } catch (error) {
      console.error("Failed to create session:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Switch to different session
   *
   * @param {string} sessionId - Session ID to switch to
   * @param {Object} streamManager - StreamManager instance (optional)
   * @returns {Promise<Object>} Result with session data and history
   */
  async switchSession(sessionId, streamManager = null) {
    if (!sessionId) {
      return { success: false, error: "No session ID provided" };
    }

    const currentSessionId = this.appState.getState("session.current");
    if (sessionId === currentSessionId) {
      return { success: false, error: "Already on this session" };
    }

    // Check if switching away from completed stream - cleanup
    if (currentSessionId && streamManager && !streamManager.isStreaming(currentSessionId)) {
      streamManager.cleanupSession(currentSessionId);
    }

    try {
      const response = await this.ipc.sendSessionCommand("switch", { session_id: sessionId });

      if (response?.session) {
        this.appState.setState("session.current", sessionId);

        // If target session was streaming, reconstruct state
        if (streamManager && streamManager.isStreaming(sessionId)) {
          this.reconstructStreamState(sessionId, streamManager);
        }

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
   * Reconstruct streaming state when switching to a session that's streaming in background
   *
   * @param {string} sessionId - Session ID to reconstruct
   * @param {Object} streamManager - StreamManager instance
   */
  reconstructStreamState(sessionId, streamManager) {
    // Get buffered content
    const buffer = streamManager.getBuffer(sessionId);

    // Get buffered tools
    const tools = streamManager.getBufferedTools(sessionId);

    // TODO: Render buffered assistant content
    // This would require access to chat UI elements and rendering functions
    // For now, we just log that reconstruction would happen
    if (buffer) {
      window.electronAPI?.log("info", "Stream reconstruction needed", {
        sessionId,
        bufferLength: buffer.length,
        toolCount: tools.length,
      });
    }

    // TODO: Render buffered tool cards
    // This would iterate over tools and create/update tool cards
    // For now, we just track that tools need reconstruction
    if (tools.length > 0) {
      window.electronAPI?.log("info", "Tool cards need reconstruction", {
        sessionId,
        toolCount: tools.length,
      });
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
        // Remove from AppState session list
        const sessions = this.appState.getState("session.list");
        const filteredSessions = sessions.filter((s) => s.session_id !== sessionId);
        this.appState.setState("session.list", filteredSessions);

        // Clear current if deleting active session
        const currentSessionId = this.appState.getState("session.current");
        if (currentSessionId === sessionId) {
          this.appState.setState("session.current", null);
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
        // Update session in AppState (immutably - create new objects)
        const sessions = this.appState.getState("session.list");
        const updatedSessions = sessions.map((s) => (s.session_id === sessionId ? { ...s, title: title.trim() } : s));
        this.appState.setState("session.list", updatedSessions);

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
        this.appState.setState("session.current", null);

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
   * Update session in AppState (for real-time updates from backend)
   * @param {Object} sessionData - Updated session data
   */
  updateSession(sessionData) {
    if (!sessionData?.session_id) return;

    const sessions = this.appState.getState("session.list");
    const index = sessions.findIndex((s) => s.session_id === sessionData.session_id);

    let updatedSessions;
    if (index >= 0) {
      // Update existing session
      updatedSessions = [...sessions];
      updatedSessions[index] = { ...sessions[index], ...sessionData };
    } else {
      // Add new session
      updatedSessions = [...sessions, sessionData];
    }

    // Sort by last_used to ensure most recently used sessions appear first
    const getLastUsedTimestamp = (session) => {
      const timestamp = session?.last_used ? new Date(session.last_used).getTime() : 0;
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    updatedSessions.sort((a, b) => getLastUsedTimestamp(b) - getLastUsedTimestamp(a));

    this.appState.setState("session.list", updatedSessions);
  }

  /**
   * Get current session ID
   *
   * @returns {string|null} Current session ID or null
   */
  getCurrentSessionId() {
    return this.appState.getState("session.current");
  }

  /**
   * Get all loaded sessions
   *
   * @returns {Array<Object>} Sessions array
   */
  getSessions() {
    const sessions = this.appState.getState("session.list");
    return [...sessions];
  }

  /**
   * Get session by ID
   *
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session object or null
   */
  getSession(sessionId) {
    const sessions = this.appState.getState("session.list");
    return sessions.find((s) => s.session_id === sessionId) || null;
  }

  /**
   * Get pagination state
   *
   * @returns {Object} Pagination info
   */
  getPaginationState() {
    const sessions = this.appState.getState("session.list");
    return {
      total: this.appState.getState("session.totalCount"),
      loaded: sessions.length,
      hasMore: this.appState.getState("session.hasMore"),
      isLoading: this.appState.getState("session.isLoading"),
    };
  }

  /**
   * Reset service state
   */
  reset() {
    this.appState.setState("session.current", null);
    this.appState.setState("session.list", []);
    this.appState.setState("session.totalCount", 0);
    this.appState.setState("session.hasMore", false);
    this.appState.setState("session.isLoading", false);
  }
}
