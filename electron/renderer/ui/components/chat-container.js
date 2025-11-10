/**
 * ChatContainer - UI component for chat message display
 * Self-contained component that manages message rendering and scrolling
 */

import { createMessageViewModel } from "../../viewmodels/message-viewmodel.js";
import {
  renderAssistantMessage,
  renderMessageBatch,
  renderUserMessage,
  updateMessageContent,
} from "../renderers/message-renderer.js";

export class ChatContainer {
  /**
   * @param {Object} domAdapter - DOM adapter for rendering
   */
  constructor(domAdapter) {
    this.dom = domAdapter;
    this.element = null;
    this.messagesContainer = null;
    this.messages = [];
    this.isAutoScrollEnabled = true;
    this.isAtBottom = true;
  }

  /**
   * Render the chat container component
   *
   * @returns {HTMLElement} The rendered element
   */
  render() {
    const container = this.dom.createElement("div");
    this.dom.addClass(container, "chat-container");

    // Messages area (scrollable)
    const messagesArea = this.dom.createElement("div");
    this.dom.addClass(messagesArea, "messages-area");
    this.dom.appendChild(container, messagesArea);

    // Scroll to bottom button (hidden by default)
    const scrollBtn = this.dom.createElement("button");
    this.dom.addClass(scrollBtn, "scroll-to-bottom");
    this.dom.setAttribute(scrollBtn, "aria-label", "Scroll to bottom");
    this.dom.setTextContent(scrollBtn, "↓");
    this.dom.setStyle(scrollBtn, "display", "none");
    this.dom.appendChild(container, scrollBtn);

    // Store references
    this.element = container;
    this.messagesContainer = messagesArea;

    // Setup event listeners
    this.setupEventListeners(scrollBtn);

    return container;
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners(scrollBtn) {
    if (scrollBtn) {
      this.dom.addEventListener(scrollBtn, "click", () => {
        this.scrollToBottom(true);
      });
    }

    // Track scroll position to show/hide scroll button
    if (this.messagesContainer) {
      this.dom.addEventListener(this.messagesContainer, "scroll", () => {
        this.handleScroll();
      });
    }
  }

  /**
   * Handle scroll event
   * @private
   */
  handleScroll() {
    if (!this.messagesContainer) return;

    const { scrollTop, scrollHeight, clientHeight } = this.messagesContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Consider "at bottom" if within 50px
    this.isAtBottom = distanceFromBottom < 50;

    // Show/hide scroll button
    const scrollBtn = this.dom.querySelector(this.element, ".scroll-to-bottom");
    if (scrollBtn) {
      this.dom.setStyle(scrollBtn, "display", this.isAtBottom ? "none" : "flex");
    }
  }

  /**
   * Add message to chat
   *
   * @param {Object} message - Message object
   */
  addMessage(message) {
    this.messages.push(message);
    this.renderNewMessage(message);
  }

  /**
   * Add user message
   *
   * @param {string} content - Message content
   * @returns {HTMLElement} The rendered message element
   */
  addUserMessage(content) {
    const message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    this.messages.push(message);
    const element = renderUserMessage(content, this.dom);

    if (this.messagesContainer) {
      this.dom.appendChild(this.messagesContainer, element);
      this.scrollToBottomIfEnabled();
    }

    return element;
  }

  /**
   * Add assistant message (or get existing for streaming)
   *
   * @param {string} content - Message content
   * @param {string|null} messageId - Optional message ID for updates
   * @returns {HTMLElement} The rendered message element
   */
  addAssistantMessage(content, messageId = null) {
    // If messageId provided, try to find and update existing message
    if (messageId) {
      const existingElement = this.findMessageElement(messageId);
      if (existingElement) {
        updateMessageContent(existingElement, content, this.dom);
        return existingElement;
      }
    }

    // Create new message
    const message = {
      id: messageId || `msg-${Date.now()}`,
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
    };

    this.messages.push(message);
    const element = renderAssistantMessage(content, this.dom);

    if (this.messagesContainer) {
      this.dom.appendChild(this.messagesContainer, element);
      this.scrollToBottomIfEnabled();
    }

    return element;
  }

  /**
   * Update message content (for streaming)
   *
   * @param {string} messageId - Message ID
   * @param {string} content - New content
   */
  updateMessage(messageId, content) {
    // Update in-memory message
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      message.content = content;
    }

    // Update DOM element
    const element = this.findMessageElement(messageId);
    if (element) {
      updateMessageContent(element, content, this.dom);
      this.scrollToBottomIfEnabled();
    }
  }

  /**
   * Find message element by ID
   * @private
   */
  findMessageElement(messageId) {
    if (!this.messagesContainer) return null;
    return this.dom.querySelector(this.messagesContainer, `[data-message-id="${messageId}"]`);
  }

  /**
   * Render new message
   * @private
   */
  renderNewMessage(message) {
    if (!this.messagesContainer) return;

    const viewModel = createMessageViewModel(message);
    const element =
      viewModel.role === "user"
        ? renderUserMessage(viewModel.content, this.dom)
        : renderAssistantMessage(viewModel.content, this.dom);

    this.dom.appendChild(this.messagesContainer, element);
    this.scrollToBottomIfEnabled();
  }

  /**
   * Set messages (replaces all)
   *
   * @param {Array<Object>} messages - Array of message objects
   */
  setMessages(messages) {
    this.messages = messages || [];
    this.renderAllMessages();
  }

  /**
   * Render all messages
   * @private
   */
  renderAllMessages() {
    if (!this.messagesContainer) return;

    // Clear existing
    this.dom.setInnerHTML(this.messagesContainer, "");

    if (this.messages.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Prepare view models
    const viewModels = this.messages.map(createMessageViewModel);

    // Render batch
    const fragment = renderMessageBatch(viewModels, this.dom);
    this.dom.appendChild(this.messagesContainer, fragment);

    // Scroll to bottom after render
    this.scrollToBottom(false);
  }

  /**
   * Render empty state
   * @private
   */
  renderEmptyState() {
    const emptyDiv = this.dom.createElement("div");
    this.dom.addClass(emptyDiv, "chat-empty-state");

    const icon = this.dom.createElement("div");
    this.dom.addClass(icon, "empty-icon");
    this.dom.setTextContent(icon, "💬");
    this.dom.appendChild(emptyDiv, icon);

    const text = this.dom.createElement("div");
    this.dom.addClass(text, "empty-text");
    this.dom.setTextContent(text, "Start a conversation");
    this.dom.appendChild(emptyDiv, text);

    this.dom.appendChild(this.messagesContainer, emptyDiv);
  }

  /**
   * Clear all messages
   */
  clear() {
    this.messages = [];
    this.renderAllMessages();
  }

  /**
   * Scroll to bottom
   *
   * @param {boolean} smooth - Use smooth scrolling
   */
  scrollToBottom(smooth = true) {
    if (!this.messagesContainer) return;

    const _scrollOptions = {
      top: this.messagesContainer.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    };

    // In real browser, would use: this.messagesContainer.scrollTo(scrollOptions)
    // For now, just set scrollTop directly
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    this.isAtBottom = true;
  }

  /**
   * Scroll to bottom if auto-scroll enabled and at bottom
   * @private
   */
  scrollToBottomIfEnabled() {
    if (this.isAutoScrollEnabled && this.isAtBottom) {
      this.scrollToBottom(false);
    }
  }

  /**
   * Enable auto-scroll
   */
  enableAutoScroll() {
    this.isAutoScrollEnabled = true;
  }

  /**
   * Disable auto-scroll
   */
  disableAutoScroll() {
    this.isAutoScrollEnabled = false;
  }

  /**
   * Get current messages
   *
   * @returns {Array<Object>} Current message list
   */
  getMessages() {
    return [...this.messages];
  }

  /**
   * Show the container
   */
  show() {
    if (this.element) {
      this.dom.setStyle(this.element, "display", "flex");
    }
  }

  /**
   * Hide the container
   */
  hide() {
    if (this.element) {
      this.dom.setStyle(this.element, "display", "none");
    }
  }

  /**
   * Destroy the component and remove from DOM
   */
  destroy() {
    if (this.element) {
      this.dom.remove(this.element);
      this.element = null;
      this.messagesContainer = null;
      this.messages = [];
    }
  }
}
