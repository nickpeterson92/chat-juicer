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
   */
  constructor(element) {
    if (!element) {
      throw new Error("ChatContainer requires an existing DOM element");
    }
    this.element = element;
    this.currentStreamingMessage = null;
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
   * @returns {HTMLElement} The rendered message element
   */
  addAssistantMessage(content) {
    return addMessage(this.element, content, "assistant");
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
   * Get the underlying DOM element
   *
   * @returns {HTMLElement} The chat container element
   */
  getElement() {
    return this.element;
  }
}

/**
 * NOTE: Function cards and thinking indicators are managed separately
 * by message-handlers-v2.js using function-card-ui.js utilities.
 *
 * The thinking indicator is built into createStreamingAssistantMessage()
 * and removed automatically by completeStreamingMessage().
 */
