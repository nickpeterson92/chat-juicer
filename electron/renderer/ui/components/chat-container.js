/**
 * ChatContainer - UI component for chat message display
 * Wraps existing DOM element and delegates to chat-ui.js and function-card-ui.js utilities
 */

import {
  addMessage,
  clearChat,
  completeStreamingMessage,
  createStreamingAssistantMessage,
  updateAssistantMessage,
} from "../chat-ui.js";
import { clearFunctionCards } from "../function-card-ui.js";
export class ChatContainer {
  /**
   * @param {HTMLElement} element - Existing chat container element (#chat-container)
   * @param {Object} options - Optional configuration
   * @param {Object} options.appState - AppState instance for reactive state management
   */
  constructor(element, options = {}) {
    if (!element) {
      throw new Error("ChatContainer requires an existing DOM element");
    }
    this.element = element;
    this.currentStreamingMessage = null;

    // AppState integration (optional)
    this.appState = options.appState || null;
    this.unsubscribers = [];

    this.setupStateSubscriptions();
  }

  /**
   * Setup AppState subscriptions
   * @private
   */
  setupStateSubscriptions() {
    if (!this.appState) return;

    // Subscribe to new assistant messages - auto-scroll to bottom
    const unsubscribeCurrentAssistant = this.appState.subscribe("message.currentAssistant", (element) => {
      // Keep internal streaming reference in sync with AppState (even if created outside this component)
      this.currentStreamingMessage = element || null;

      if (element) {
        // New assistant message element created, scroll to show it
        this.scrollToBottom();
      }
    });
    this.unsubscribers.push(unsubscribeCurrentAssistant);

    // Subscribe to streaming buffer updates - update message content
    const unsubscribeAssistantBuffer = this.appState.subscribe("message.assistantBuffer", (buffer) => {
      const current = this.appState.getState("message.currentAssistant");
      if (current && buffer !== undefined) {
        // Update the streaming message with new content
        this.updateStreamingMessage(buffer);
      }
    });
    this.unsubscribers.push(unsubscribeAssistantBuffer);

    // Subscribe to streaming state - manage streaming UI state
    const unsubscribeIsStreaming = this.appState.subscribe("message.isStreaming", (isStreaming) => {
      if (!isStreaming && this.currentStreamingMessage) {
        // Streaming completed, finalize the message
        this.completeStreaming();
      }
    });
    this.unsubscribers.push(unsubscribeIsStreaming);
  }

  /**
   * Initialize the component (no-op since DOM already exists)
   * Kept for API compatibility
   */
  initialize() {
    // Element already exists in DOM, nothing to do
    return this.element;
  }

  /**
   * Add user message
   *
   * @param {string} content - Message content
   * @returns {HTMLElement} The rendered message element
   */
  addUserMessage(content) {
    return addMessage(this.element, content, "user");
  }

  /**
   * Add assistant message
   *
   * @param {string} content - Message content
   * @param {Object} options - Additional options (reserved for future use)
   * @returns {HTMLElement} The rendered message element
   */
  addAssistantMessage(content, options = {}) {
    return addMessage(this.element, content, "assistant", options);
  }

  /**
   * Create streaming assistant message (with thinking indicator)
   *
   * @returns {HTMLElement} The streaming message element
   */
  createStreamingMessage() {
    const contentElement = createStreamingAssistantMessage(this.element);
    this.currentStreamingMessage = contentElement;
    return contentElement;
  }

  /**
   * Update current streaming message
   *
   * @param {string} content - New content
   */
  updateStreamingMessage(content) {
    if (this.currentStreamingMessage) {
      updateAssistantMessage(this.element, this.currentStreamingMessage, content);
    }
  }

  /**
   * Complete streaming (removes thinking indicator, finalizes message)
   */
  completeStreaming() {
    if (this.currentStreamingMessage) {
      completeStreamingMessage(this.element);
      this.currentStreamingMessage = null;
    }
  }

  /**
   * Add system message
   *
   * @param {string} content - Message content
   * @returns {HTMLElement} The rendered message element
   */
  addSystemMessage(content) {
    return addMessage(this.element, content, "system");
  }

  /**
   * Add error message
   *
   * @param {string} content - Error message
   * @returns {HTMLElement} The rendered message element
   */
  addErrorMessage(content) {
    return addMessage(this.element, content, "error");
  }

  /**
   * Clear all messages and function cards
   */
  clear() {
    clearChat(this.element);
    clearFunctionCards(this.element);
    this.currentStreamingMessage = null;
  }

  /**
   * Scroll to bottom of chat container
   * Used by subscription to auto-scroll on new messages
   */
  scrollToBottom() {
    if (this.element) {
      // Smooth scroll to bottom
      this.element.scrollTo({
        top: this.element.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  /**
   * Get the underlying DOM element
   *
   * @returns {HTMLElement} The chat container element
   */
  getElement() {
    return this.element;
  }

  /**
   * Destroy component and clean up subscriptions
   */
  destroy() {
    // Clean up AppState subscriptions
    if (this.unsubscribers) {
      this.unsubscribers.forEach((unsub) => {
        unsub();
      });
      this.unsubscribers = [];
    }

    // Clear current streaming reference
    this.currentStreamingMessage = null;
  }
}

/**
 * NOTE: Function cards and thinking indicators are managed separately
 * by message-handlers-v2.js using function-card-ui.js utilities.
 *
 * The thinking indicator is built into createStreamingAssistantMessage()
 * and removed automatically by completeStreamingMessage().
 */
