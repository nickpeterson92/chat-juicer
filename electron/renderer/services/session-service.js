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

/**
 * Session state (managed by SessionService, exported for compatibility)
 */
export const sessionState = {
  currentSessionId: null,
  sessions: [],
  totalSessions: 0,
  hasMoreSessions: false,
  isLoadingSessions: false,
};
