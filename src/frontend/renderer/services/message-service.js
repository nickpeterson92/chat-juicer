/**
 * MessageService - Pure business logic for message operations
 * NO DEPENDENCIES on DOM - uses adapters for infrastructure
 *
 * Handles:
 * - Message processing and validation
 * - Streaming message assembly
 * - Message caching and batching
 * - Markdown rendering coordination
 */

import { createMessageViewModel, validateMessage } from "../viewmodels/message-viewmodel.js";

/**
 * MessageService class
 * Manages message operations with dependency injection
 */
export class MessageService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.ipcAdapter - IPC adapter for backend communication
   * @param {Object} dependencies.storageAdapter - Storage adapter for caching
   */
  constructor({ ipcAdapter, storageAdapter }) {
    this.ipc = ipcAdapter;
    this.storage = storageAdapter;

    // Message state
    this.currentAssistantMessage = null;
    this.assistantBuffer = "";
    this.messageCache = new Map(); // Cache for parsed markdown
  }

  /**
   * Send message(s) to backend
   *
   * @param {string|string[]} content - Single message string or array of message strings
   * @param {string|null} sessionId - Session ID for routing (CRITICAL for concurrent sessions)
   * @returns {Promise<Object>} Result with success/error
   */
  async sendMessage(content, sessionId = null) {
    // Normalize to array format
    const messages = Array.isArray(content) ? content : [content];

    // Validate all messages
    const validMessages = messages
      .filter((msg) => msg && typeof msg === "string")
      .map((msg) => msg.trim())
      .filter((msg) => msg.length > 0);

    if (validMessages.length === 0) {
      return { success: false, error: "Message content cannot be empty" };
    }

    try {
      // Use IPCAdapter's sendMessage method (which normalizes to array)
      // CRITICAL: Pass sessionId for proper routing in concurrent sessions
      await this.ipc.sendMessage(validMessages, sessionId);
      return { success: true, messageCount: validMessages.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Start new assistant message
   *
   * @returns {string} Message ID
   */
  startAssistantMessage() {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    this.currentAssistantMessage = messageId;
    this.assistantBuffer = "";
    return messageId;
  }

  /**
   * Append delta to current assistant message
   *
   * @param {string} delta - Content delta to append
   * @returns {Object} Result with full content
   */
  appendAssistantDelta(delta) {
    if (!this.currentAssistantMessage) {
      this.startAssistantMessage();
    }

    this.assistantBuffer += delta;

    return {
      messageId: this.currentAssistantMessage,
      content: this.assistantBuffer,
    };
  }

  /**
   * Finalize current assistant message
   *
   * @returns {Object|null} Finalized message data or null
   */
  finalizeAssistantMessage() {
    if (!this.currentAssistantMessage) {
      return null;
    }

    const message = {
      id: this.currentAssistantMessage,
      role: "assistant",
      content: this.assistantBuffer,
    };

    this.currentAssistantMessage = null;
    this.assistantBuffer = "";

    return message;
  }

  /**
   * Get current assistant message state
   *
   * @returns {Object|null} Current message state or null
   */
  getCurrentAssistantMessage() {
    if (!this.currentAssistantMessage) {
      return null;
    }

    return {
      id: this.currentAssistantMessage,
      content: this.assistantBuffer,
    };
  }

  /**
   * Clear current assistant message
   */
  clearCurrentAssistantMessage() {
    this.currentAssistantMessage = null;
    this.assistantBuffer = "";
  }

  /**
   * Create user message view model
   *
   * @param {string} content - Message content
   * @returns {Object} View model for user message
   */
  createUserMessage(content) {
    const message = {
      role: "user",
      content,
    };

    const validation = validateMessage(message);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return createMessageViewModel(message);
  }

  /**
   * Create assistant message view model
   *
   * @param {string} content - Message content
   * @returns {Object} View model for assistant message
   */
  createAssistantMessage(content) {
    const message = {
      role: "assistant",
      content,
    };

    const validation = validateMessage(message);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return createMessageViewModel(message);
  }

  /**
   * Create error message view model
   *
   * @param {string} content - Error content
   * @returns {Object} View model for error message
   */
  createErrorMessage(content) {
    const message = {
      role: "error",
      content,
    };

    return createMessageViewModel(message);
  }

  /**
   * Create system message view model
   *
   * @param {string} content - System message content
   * @returns {Object} View model for system message
   */
  createSystemMessage(content) {
    const message = {
      role: "system",
      content,
    };

    return createMessageViewModel(message);
  }

  /**
   * Batch process messages for display
   * Processes multiple messages efficiently
   *
   * @param {Array<Object>} messages - Array of message objects
   * @returns {Array<Object>} Array of view models
   */
  batchProcessMessages(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }

    return messages
      .map((msg) => {
        try {
          const validation = validateMessage(msg);
          if (!validation.valid) {
            return null;
          }
          return createMessageViewModel(msg);
        } catch (error) {
          console.error("Error processing message:", error);
          return null;
        }
      })
      .filter(Boolean);
  }

  /**
   * Cache rendered markdown for a message
   *
   * @param {string} messageId - Message ID
   * @param {string} renderedHtml - Rendered HTML
   */
  cacheRenderedMessage(messageId, renderedHtml) {
    this.messageCache.set(messageId, {
      html: renderedHtml,
      timestamp: Date.now(),
    });

    // Limit cache size to prevent memory issues
    if (this.messageCache.size > 100) {
      const oldestKey = this.messageCache.keys().next().value;
      this.messageCache.delete(oldestKey);
    }
  }

  /**
   * Get cached rendered message
   *
   * @param {string} messageId - Message ID
   * @returns {string|null} Cached HTML or null
   */
  getCachedRenderedMessage(messageId) {
    const cached = this.messageCache.get(messageId);
    return cached ? cached.html : null;
  }

  /**
   * Clear message cache
   */
  clearMessageCache() {
    this.messageCache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.messageCache.size,
      maxSize: 100,
    };
  }

  /**
   * Reset service state
   * Useful for session switches or cleanup
   */
  reset() {
    this.currentAssistantMessage = null;
    this.assistantBuffer = "";
    this.messageCache.clear();
  }
}
