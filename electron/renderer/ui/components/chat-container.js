/**
 * ChatContainer - UI component for chat message display
 * Wraps existing DOM element and delegates to chat-ui.js and function-card-ui.js utilities
 */

import { ComponentLifecycle } from "../../core/component-lifecycle.js";
import { globalEventBus } from "../../core/event-bus.js";
import { globalLifecycleManager } from "../../core/lifecycle-manager.js";
import { getMessageQueueService } from "../../services/message-queue-service.js";
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

    // Subscribe to queue state - render queued messages
    const unsubscribeQueueItems = this.appState.subscribe("queue.items", (items) => {
      this.renderQueuedMessages(items || []);
    });
    globalLifecycleManager.addUnsubscriber(this, unsubscribeQueueItems);

    // Listen for queue processing events to show user messages when sent
    // Batch processing: data.items contains all queued messages being sent together
    const unsubscribeQueueProcessing = globalEventBus.on("queue:processing", ({ data }) => {
      // Use items array for batch support, fallback to single item for backwards compatibility
      const items = data?.items || (data?.item ? [data.item] : []);

      // Show ALL user messages in chat as they're being sent
      for (const item of items) {
        if (item?.text) {
          this.addUserMessage(item.text);
        }
      }
    });
    globalLifecycleManager.addUnsubscriber(this, unsubscribeQueueProcessing);
  }

  /**
   * Render queued messages in the chat container
   * @param {Array<Object>} items - Queue items to render
   * @private
   */
  renderQueuedMessages(items) {
    // Remove existing queued message elements
    const existingQueued = this.element.querySelectorAll(".queued-message");
    existingQueued.forEach((el) => {
      el.remove();
    });

    // Only render items with 'queued' status (not processing)
    const queuedItems = items.filter((item) => item.status === "queued");

    if (queuedItems.length === 0) {
      return;
    }

    // Render each queued message
    for (const item of queuedItems) {
      const queuedElement = this._createQueuedMessageElement(item);
      this.element.appendChild(queuedElement);
    }

    // Scroll to show queued messages
    this.scrollToBottom();
  }

  /**
   * Create a queued message element with edit/cancel buttons
   * @param {Object} item - Queue item
   * @returns {HTMLElement} The queued message element
   * @private
   */
  _createQueuedMessageElement(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "queued-message mb-4 animate-slideIn";
    wrapper.dataset.queueId = item.id;

    // Main card container - left-aligned like regular user messages
    const card = document.createElement("div");
    card.className =
      "queued-message-card relative p-4 rounded-xl mr-auto max-w-[70%] border-2 border-dashed border-[var(--color-border-secondary)] bg-[var(--color-surface-hover)] opacity-70";

    // Header row with badge and actions
    const header = document.createElement("div");
    header.className = "flex items-center justify-between mb-2";

    // Queued badge
    const badge = document.createElement("span");
    badge.className =
      "queued-badge text-xs font-medium px-2 py-0.5 rounded bg-[var(--color-surface-active)] text-[var(--color-text-secondary)]";
    badge.textContent = "Queued";

    // Action buttons container
    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2";

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className =
      "queue-edit-btn p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-primary)] transition-colors";
    editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      <path d="m15 5 4 4"/>
    </svg>`;
    editBtn.title = "Edit message";
    editBtn.addEventListener("click", () => this._handleEditQueuedMessage(item.id, wrapper));

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.className =
      "queue-cancel-btn p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-status-error)] transition-colors";
    cancelBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>`;
    cancelBtn.title = "Cancel message";
    cancelBtn.addEventListener("click", () => this._handleCancelQueuedMessage(item.id));

    actions.appendChild(editBtn);
    actions.appendChild(cancelBtn);
    header.appendChild(badge);
    header.appendChild(actions);

    // Message content
    const content = document.createElement("div");
    content.className =
      "queued-message-content text-sm text-[var(--color-text-primary)] whitespace-pre-wrap break-words";
    content.textContent = item.text;

    card.appendChild(header);
    card.appendChild(content);
    wrapper.appendChild(card);

    return wrapper;
  }

  /**
   * Handle edit button click for queued message
   * @param {string} id - Queue item ID
   * @param {HTMLElement} wrapper - The queued message wrapper element
   * @private
   */
  _handleEditQueuedMessage(id, wrapper) {
    const queueService = getMessageQueueService();
    if (!queueService) return;

    const items = queueService.getItems();
    const item = items.find((i) => i.id === id);
    if (!item || item.status !== "queued") return;

    const card = wrapper.querySelector(".queued-message-card");
    const contentEl = wrapper.querySelector(".queued-message-content");
    const actionsEl = wrapper.querySelector(".flex.items-center.gap-2");

    if (!card || !contentEl || !actionsEl) return;

    // Switch to edit mode
    card.classList.add("editing");
    card.style.borderStyle = "solid";
    card.style.borderColor = "var(--color-brand-primary)";
    card.style.opacity = "1";

    // Replace content with textarea
    const textarea = document.createElement("textarea");
    textarea.className =
      "w-full p-2 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-secondary)] text-sm text-[var(--color-text-primary)] resize-none focus:outline-none focus:border-[var(--color-brand-primary)]";
    textarea.value = item.text;
    textarea.rows = Math.min(5, item.text.split("\n").length + 1);
    contentEl.replaceWith(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Replace action buttons with Save/Cancel
    const saveBtn = document.createElement("button");
    saveBtn.className =
      "p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-status-success)] transition-colors";
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`;
    saveBtn.title = "Save changes";

    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.className =
      "p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-colors";
    cancelEditBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>`;
    cancelEditBtn.title = "Cancel edit";

    // Save handler
    const handleSave = () => {
      const newText = textarea.value.trim();
      if (newText && newText !== item.text) {
        queueService.edit(id, newText);
      } else {
        // No change or empty - just exit edit mode by re-rendering
        this.renderQueuedMessages(queueService.getItems());
      }
    };

    // Cancel edit handler (restore original)
    const handleCancelEdit = () => {
      this.renderQueuedMessages(queueService.getItems());
    };

    saveBtn.addEventListener("click", handleSave);
    cancelEditBtn.addEventListener("click", handleCancelEdit);

    // Enter to save, Escape to cancel
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    });

    // Clear and add new buttons
    actionsEl.innerHTML = "";
    actionsEl.appendChild(saveBtn);
    actionsEl.appendChild(cancelEditBtn);
  }

  /**
   * Handle cancel button click for queued message
   * Adds slide-out animation before removing from queue
   * @param {string} id - Queue item ID
   * @private
   */
  _handleCancelQueuedMessage(id) {
    const queueService = getMessageQueueService();
    if (!queueService) return;

    // Find the element and add cancel animation
    const wrapper = this.element.querySelector(`[data-queue-id="${id}"]`);
    if (wrapper) {
      // Add the slide-out animation class
      wrapper.classList.add("queue-cancel-animate");

      // Wait for animation to complete before removing from queue
      wrapper.addEventListener(
        "animationend",
        () => {
          queueService.remove(id);
        },
        { once: true }
      );
    } else {
      // Element not found, just remove directly
      queueService.remove(id);
    }
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
