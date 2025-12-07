/**
 * ChatContainer - UI component for chat message display
 * Wraps existing DOM element and delegates to chat-ui.js and function-card-ui.js utilities
 */

import { ComponentLifecycle } from "../../core/component-lifecycle.js";
import { globalLifecycleManager } from "../../core/lifecycle-manager.js";
import { renderMarkdown } from "../../utils/markdown-renderer.js";
import {
  addMessage,
  clearChat,
  completeStreamingMessage,
  createStreamingAssistantMessage,
  updateAssistantMessage,
} from "../chat-ui.js";
import { clearFunctionCards, createCompletedToolCard } from "../function-card-ui.js";
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

    if (!this._lifecycle) {
      ComponentLifecycle.mount(this, "ChatContainer", globalLifecycleManager);
    }

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
    globalLifecycleManager.addUnsubscriber(this, unsubscribeCurrentAssistant);

    // Subscribe to streaming buffer updates - update message content
    const unsubscribeAssistantBuffer = this.appState.subscribe("message.assistantBuffer", (buffer) => {
      const current = this.appState.getState("message.currentAssistant");
      if (current && buffer !== undefined) {
        // Update the streaming message with new content
        this.updateStreamingMessage(buffer);
      }
    });
    globalLifecycleManager.addUnsubscriber(this, unsubscribeAssistantBuffer);

    // Subscribe to streaming state - manage streaming UI state
    const unsubscribeIsStreaming = this.appState.subscribe("message.isStreaming", (isStreaming) => {
      if (!isStreaming && this.currentStreamingMessage) {
        // Streaming completed, finalize the message
        this.completeStreaming();
      }
    });
    globalLifecycleManager.addUnsubscriber(this, unsubscribeIsStreaming);
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
   * Extract text content from various SDK message formats
   * Handles: string, array [{type: "text", text: "..."}], object {text: "..."}
   * @private
   */
  _extractTextContent(content) {
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      // SDK format: [{type: "text", text: "..."}, {type: "output_text", text: "..."}]
      return content
        .filter((part) => part && (part.type === "text" || part.type === "output_text"))
        .map((part) => part.text)
        .join("\n");
    }

    if (typeof content === "object" && content?.text) {
      return content.text;
    }

    return "";
  }

  /**
   * Set messages from session history (used on session load/switch)
   * Clears existing content and renders messages including completed tool cards
   *
   * @param {Array<Object>} messages - Array of message objects with role and content
   */
  setMessages(messages) {
    // Clear existing content
    this.clear();

    if (!messages || !Array.isArray(messages)) {
      return;
    }

    // Track tool calls by call_id for pairing detected+completed
    const toolCallMap = new Map();

    // First pass: collect all tool calls
    for (const msg of messages) {
      if (msg.role === "tool_call" && msg.call_id) {
        const existing = toolCallMap.get(msg.call_id) || {};
        toolCallMap.set(msg.call_id, {
          ...existing,
          ...msg,
          // Keep both arguments (from detected) and result (from completed)
          arguments: msg.arguments || existing.arguments,
          result: msg.result || existing.result,
          status: msg.status === "completed" ? "completed" : existing.status || "detected",
          success: msg.success !== undefined ? msg.success : existing.success,
        });
      }
    }

    // Second pass: render messages in order
    for (const msg of messages) {
      const { role, content } = msg;
      const textContent = this._extractTextContent(content);

      if (role === "user" && textContent) {
        addMessage(this.element, textContent, "user");
      } else if (role === "assistant" && textContent) {
        addMessage(this.element, textContent, "assistant");
      } else if (role === "system" && textContent) {
        addMessage(this.element, textContent, "system");
      } else if (role === "tool_call" && msg.status === "completed") {
        // Render completed tool cards (only for "completed" status, not "detected")
        const toolData = toolCallMap.get(msg.call_id);
        if (toolData) {
          createCompletedToolCard(this.element, toolData);
        }
      }
      // Skip tool_call with status="detected" - we'll render when we see "completed"
    }

    // Scroll to bottom after loading
    this.scrollToBottom();
  }

  /**
   * Prepend messages to the beginning of chat (for loading older messages)
   * Used when loading remaining messages after initial session load
   *
   * @param {Array<Object>} messages - Array of older messages to prepend (in chronological order)
   */
  prependMessages(messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return;
    }

    // Store current scroll position to maintain user's view
    const scrollHeightBefore = this.element.scrollHeight;
    const scrollTopBefore = this.element.scrollTop;

    // Track tool calls by call_id for pairing detected+completed
    const toolCallMap = new Map();

    // First pass: collect all tool calls
    for (const msg of messages) {
      if (msg.role === "tool_call" && msg.call_id) {
        const existing = toolCallMap.get(msg.call_id) || {};
        toolCallMap.set(msg.call_id, {
          ...existing,
          ...msg,
          arguments: msg.arguments || existing.arguments,
          result: msg.result || existing.result,
          status: msg.status === "completed" ? "completed" : existing.status || "detected",
          success: msg.success !== undefined ? msg.success : existing.success,
        });
      }
    }

    // Create a document fragment for efficient DOM insertion
    const fragment = document.createDocumentFragment();

    // Second pass: render messages into fragment (in order - oldest first)
    for (const msg of messages) {
      const { role, content } = msg;
      const textContent = this._extractTextContent(content);

      let messageElement = null;

      if (role === "user" && textContent) {
        messageElement = this._createMessageElement(textContent, "user");
      } else if (role === "assistant" && textContent) {
        messageElement = this._createMessageElement(textContent, "assistant");
      } else if (role === "system" && textContent) {
        messageElement = this._createMessageElement(textContent, "system");
      } else if (role === "tool_call" && msg.status === "completed") {
        const toolData = toolCallMap.get(msg.call_id);
        if (toolData) {
          messageElement = this._createToolCardElement(toolData);
        }
      }

      if (messageElement) {
        fragment.appendChild(messageElement);
      }
    }

    // Insert all prepended messages at the beginning
    if (this.element.firstChild) {
      this.element.insertBefore(fragment, this.element.firstChild);
    } else {
      this.element.appendChild(fragment);
    }

    // Restore scroll position so user doesn't get jumped
    // New content was added above, so adjust scroll to maintain view
    const scrollHeightAfter = this.element.scrollHeight;
    const heightAdded = scrollHeightAfter - scrollHeightBefore;
    this.element.scrollTop = scrollTopBefore + heightAdded;
  }

  /**
   * Create a message element without appending to container
   * Uses same structure and styling as addMessage in chat-ui.js
   * @private
   */
  _createMessageElement(content, role) {
    const messageDiv = document.createElement("div");
    // Match exact classes from addMessage in chat-ui.js
    const baseClasses = "message mb-6 animate-slideIn [contain:layout_style]";
    const typeClasses = {
      user: "user text-left",
      assistant: "assistant",
      system: "system",
      error: "error",
    };
    messageDiv.className = `${baseClasses} ${typeClasses[role] || ""}`;

    const contentDiv = document.createElement("div");

    // Match exact styling from addMessage
    if (role === "user") {
      contentDiv.className =
        "message-content inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-user-gradient text-[var(--color-text-user)]";
      contentDiv.textContent = content;
    } else if (role === "assistant") {
      contentDiv.className =
        "message-content prose prose-invert max-w-none break-words whitespace-pre-wrap leading-snug text-[var(--color-text-assistant)]";
      contentDiv.innerHTML = renderMarkdown(content, true);
    } else if (role === "system") {
      contentDiv.className =
        "inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-amber-50 text-amber-900 text-sm italic";
      contentDiv.textContent = content;
    } else {
      contentDiv.className = "message-content";
      contentDiv.textContent = content;
    }

    messageDiv.appendChild(contentDiv);
    return messageDiv;
  }

  /**
   * Create a tool card element without appending to container
   * @private
   */
  _createToolCardElement(toolData) {
    // Create wrapper to capture the created element
    const wrapper = document.createElement("div");
    createCompletedToolCard(wrapper, toolData);
    return wrapper.firstChild;
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
    // Clear current streaming reference
    this.currentStreamingMessage = null;

    if (this._lifecycle) {
      ComponentLifecycle.unmount(this, globalLifecycleManager);
    }
  }
}

/**
 * NOTE: Function cards and thinking indicators are managed separately
 * by message-handlers-v2.js using function-card-ui.js utilities.
 *
 * The thinking indicator is built into createStreamingAssistantMessage()
 * and removed automatically by completeStreamingMessage().
 */
