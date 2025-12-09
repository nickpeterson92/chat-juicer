/**
 * ChatContainer - UI component for chat message display
 * Wraps existing DOM element and delegates to chat-ui.js and function-card-ui.js utilities
 */

import smokeAnimationData from "../../../../ui/Smoke.json";
import { CRITICAL_COLORS } from "../../config/colors.js";
import { ComponentLifecycle } from "../../core/component-lifecycle.js";
import { globalEventBus } from "../../core/event-bus.js";
import { globalLifecycleManager } from "../../core/lifecycle-manager.js";
import { getMessageQueueService } from "../../services/message-queue-service.js";
import { initLottieWithColor } from "../../utils/lottie-color.js";
import {
  addMessage,
  clearChat,
  completeStreamingMessage,
  createMessageElement,
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
    this._indicatorsHiddenForStream = false; // Track if indicators hidden for current stream

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
        // Hide main indicator if queued messages exist (mini version shows instead)
        this._toggleQueuedIndicators();
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

      // When first tokens arrive, hide mini thinking indicators (thinking phase over)
      // Only need to do this ONCE per stream, not on every buffer update
      if (buffer && !this._indicatorsHiddenForStream) {
        this._indicatorsHiddenForStream = true;
        this._toggleQueuedIndicators();
      }
    });
    globalLifecycleManager.addUnsubscriber(this, unsubscribeAssistantBuffer);

    // Subscribe to streaming state - manage streaming UI state and queued message indicators
    const unsubscribeIsStreaming = this.appState.subscribe("message.isStreaming", (isStreaming) => {
      if (!isStreaming && this.currentStreamingMessage) {
        // Streaming completed, finalize the message
        this.completeStreaming();
      }

      // Reset indicator flag when streaming starts (new stream) or ends
      if (isStreaming) {
        this._indicatorsHiddenForStream = false;
      }

      // Toggle mini thinking indicators on queued messages
      this._toggleQueuedIndicators();
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
   * Render queued messages in a separate container outside the scroll flow
   * This prevents "bouncing" during streaming as content grows
   * @param {Array<Object>} items - Queue items to render
   * @private
   */
  renderQueuedMessages(items) {
    // Use dedicated container outside scroll flow (prevents bouncing during streaming)
    const queuedContainer = document.getElementById("queued-messages-container");
    if (!queuedContainer) {
      return;
    }

    // Only render items with 'queued' status (not processing)
    const queuedItems = items.filter((item) => item.status === "queued");
    const queuedIds = new Set(queuedItems.map((item) => item.id));

    // Remove elements that are no longer in queue (except those animating out)
    const existingElements = queuedContainer.querySelectorAll("[data-queue-id]");
    for (const el of existingElements) {
      const id = el.dataset.queueId;
      if (!queuedIds.has(id) && !el.classList.contains("queue-cancel-animate")) {
        el.remove();
      }
    }

    // Get IDs of elements still in DOM (including animating ones)
    const existingIds = new Set(
      Array.from(queuedContainer.querySelectorAll("[data-queue-id]")).map((el) => el.dataset.queueId)
    );

    if (queuedItems.length === 0 && existingIds.size === 0) {
      // Hide container when empty and no animations in progress
      queuedContainer.classList.add("hidden");
      return;
    }

    // Show container and add any new queued messages
    queuedContainer.classList.remove("hidden");
    for (const item of queuedItems) {
      if (!existingIds.has(item.id)) {
        const queuedElement = this._createQueuedMessageElement(item);
        queuedContainer.appendChild(queuedElement);
      }
    }

    // Hide main indicator now that queued messages exist (show mini instead)
    this._toggleQueuedIndicators();

    // Scroll chat to bottom to show context (only when not streaming)
    const isStreaming = this.appState?.getState("message.isStreaming");
    if (!isStreaming) {
      this.scrollToBottom();
    }
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
      "queued-message-card relative p-4 rounded-xl mr-auto max-w-[70%] border-2 border-dashed border-[var(--color-border-secondary)] bg-[var(--color-surface-1)]/80 backdrop-blur-sm";

    // Header row with badge and actions
    const header = document.createElement("div");
    header.className = "flex items-center justify-between mb-2";

    // Badge container with mini processing indicator
    const badgeContainer = document.createElement("div");
    badgeContainer.className = "flex items-center gap-1.5";

    // Queued badge
    const badge = document.createElement("span");
    badge.className =
      "queued-badge text-xs font-medium px-2 py-0.5 rounded bg-[var(--color-surface-active)] text-[var(--color-text-secondary)]";
    badge.textContent = "Queued";

    // Mini processing indicator (shows when streaming)
    // Note: Visibility and Lottie initialization handled by _toggleQueuedIndicators()
    const miniIndicator = document.createElement("span");
    miniIndicator.className = "queued-mini-indicator";
    miniIndicator.style.cssText = "display: none; width: 20px; height: 20px; vertical-align: middle;";

    badgeContainer.appendChild(badge);
    badgeContainer.appendChild(miniIndicator);

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
    header.appendChild(badgeContainer);
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

    // Find the element in the queued messages container
    const queuedContainer = document.getElementById("queued-messages-container");
    const wrapper = queuedContainer?.querySelector(`[data-queue-id="${id}"]`);
    if (wrapper) {
      // Add the slide-out animation class
      wrapper.classList.add("queue-cancel-animate");

      // Wait for animation to complete before removing from queue and DOM
      wrapper.addEventListener(
        "animationend",
        () => {
          // Remove from state (will trigger re-render but element is already removed)
          queueService.remove(id);
          // Remove DOM element after animation
          wrapper.remove();
          // Hide container if now empty
          if (queuedContainer && queuedContainer.children.length === 0) {
            queuedContainer.classList.add("hidden");
          }
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
   * Handles: string, JSON string, array [{type: "text", text: "..."}], object {text: "..."}
   * @private
   */
  _extractTextContent(content) {
    if (typeof content === "string") {
      // Check if string is JSON that needs parsing (matches main branch logic)
      if (content.startsWith("[") || content.startsWith("{")) {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            // SDK format: [{type: "text", text: "..."}, {type: "output_text", text: "..."}]
            return parsed
              .filter((part) => part && (part.type === "text" || part.type === "output_text"))
              .map((part) => part.text)
              .join("\n");
          } else if (parsed.text) {
            return parsed.text;
          }
          // Parsed but no text field - fall through to return original
        } catch (_e) {
          // Not valid JSON, use as-is
        }
      }
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

    const sortedMessages = this._sortMessagesIfPossible(messages);

    // Track completed tool calls by call_id for pairing detected+completed
    const toolCallCompleted = new Map();
    for (const msg of sortedMessages) {
      if (msg.role === "tool_call" && msg.call_id && msg.status === "completed") {
        toolCallCompleted.set(msg.call_id, msg);
      }
    }

    // Second pass: render messages in order
    // Create a document fragment for efficient DOM insertion
    const fragment = document.createDocumentFragment();
    for (const msg of sortedMessages) {
      const { role, content, partial } = msg;
      const textContent = this._extractTextContent(content);
      let element = null;

      if (role === "user" && textContent) {
        element = createMessageElement(this.element, textContent, "user").messageDiv;
      } else if (role === "assistant" && textContent) {
        // Pass partial flag if present
        element = createMessageElement(this.element, textContent, "assistant", {
          partial: partial === true,
        }).messageDiv;
      } else if (role === "system" && textContent) {
        element = createMessageElement(this.element, textContent, "system").messageDiv;
      } else if (role === "tool_call") {
        if (msg.status === "detected" && msg.call_id) {
          const completed = toolCallCompleted.get(msg.call_id);
          if (completed) {
            const merged = { ...completed, arguments: completed.arguments || msg.arguments };
            element = this._createToolCardElement(merged);
            toolCallCompleted.delete(msg.call_id);
          }
        } else if (msg.status === "completed") {
          // If we didn't render via detected, render now
          if (!msg.call_id || !toolCallCompleted.has(msg.call_id)) {
            element = this._createToolCardElement(msg);
          } else {
            toolCallCompleted.delete(msg.call_id);
          }
        }
      }

      if (element) {
        fragment.appendChild(element);
      }
      // Skip tool_call with status="detected" - we'll render when we see "completed"
    }

    // Append all messages at once
    this.element.appendChild(fragment);

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

    const sortedMessages = this._sortMessagesIfPossible(messages);

    // Store current scroll position to maintain user's view
    const scrollHeightBefore = this.element.scrollHeight;
    const scrollTopBefore = this.element.scrollTop;

    // Track completed tool calls by call_id for pairing detected+completed
    const toolCallCompleted = new Map();
    for (const msg of sortedMessages) {
      if (msg.role === "tool_call" && msg.call_id && msg.status === "completed") {
        toolCallCompleted.set(msg.call_id, msg);
      }
    }

    // Create a document fragment for efficient DOM insertion
    const fragment = document.createDocumentFragment();

    // Second pass: render messages into fragment (in order - oldest first)
    for (const msg of sortedMessages) {
      const { role, content, partial } = msg;
      const textContent = this._extractTextContent(content);

      let messageElement = null;

      if (role === "user" && textContent) {
        messageElement = createMessageElement(this.element, textContent, "user", { partial: false }).messageDiv;
      } else if (role === "assistant" && textContent) {
        messageElement = createMessageElement(this.element, textContent, "assistant", {
          partial: partial === true,
        }).messageDiv;
      } else if (role === "system" && textContent) {
        messageElement = createMessageElement(this.element, textContent, "system", { partial: false }).messageDiv;
      } else if (role === "tool_call") {
        if (msg.status === "detected" && msg.call_id) {
          const completed = toolCallCompleted.get(msg.call_id);
          if (completed) {
            const merged = { ...completed, arguments: completed.arguments || msg.arguments };
            messageElement = this._createToolCardElement(merged);
            toolCallCompleted.delete(msg.call_id);
          }
        } else if (msg.status === "completed") {
          if (!msg.call_id || !toolCallCompleted.has(msg.call_id)) {
            messageElement = this._createToolCardElement(msg);
          } else {
            toolCallCompleted.delete(msg.call_id);
          }
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
   * Best-effort sort by created_at if present on all messages.
   * Falls back to original order if timestamps are missing or mixed types.
   * @param {Array<Object>} messages
   * @returns {Array<Object>}
   */
  _sortMessagesIfPossible(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return messages;
    const allHaveTs = messages.every((m) => m && m.created_at !== undefined && m.created_at !== null);
    if (!allHaveTs) return messages;

    const coerce = (v) => {
      if (typeof v === "number") return v;
      const parsed = Date.parse(v);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const withTs = messages.map((m, idx) => ({ m, t: coerce(m.created_at), idx }));
    if (withTs.some((x) => x.t === null)) return messages;

    return withTs
      .sort((a, b) => {
        if (a.t === b.t) return a.idx - b.idx;
        return a.t - b.t;
      })
      .map((x) => x.m);
  }

  /**
   * Toggle mini thinking indicators on queued messages
   * Shows indicators only when in "thinking" phase (smoke visible, no tokens yet)
   * IMPORTANT: When queued messages exist, hide main indicator and show mini version only
   * @private
   */
  _toggleQueuedIndicators() {
    const queuedContainer = document.getElementById("queued-messages-container");
    const mainIndicator = document.querySelector("#chat-container .loading-lamp");

    // Check if thinking indicator should be visible:
    // 1. Main smoke indicator exists in DOM
    // 2. No tokens have started streaming yet (buffer empty = still "thinking")
    const hasTokensStarted = !!this.appState?.getState("message.assistantBuffer");
    const isThinkingPhase = !hasTokensStarted && !!mainIndicator;

    // Check if we have queued messages
    const hasQueuedMessages =
      queuedContainer && !queuedContainer.classList.contains("hidden") && queuedContainer.children.length > 0;

    // Hide main indicator when queued messages exist (show mini version instead)
    // Use visibility:hidden (not display:none) to preserve layout spacing
    if (mainIndicator) {
      if (hasQueuedMessages && isThinkingPhase) {
        mainIndicator.style.visibility = "hidden";
      } else {
        mainIndicator.style.visibility = "visible";
      }
    }

    if (!queuedContainer) return;

    const indicators = queuedContainer.querySelectorAll(".queued-mini-indicator");
    for (const indicator of indicators) {
      if (isThinkingPhase && hasQueuedMessages) {
        indicator.style.display = "inline-block";
        // Initialize Lottie if empty (first time showing)
        if (!indicator.hasChildNodes() && !indicator.textContent) {
          requestAnimationFrame(() => {
            try {
              const brandColor = CRITICAL_COLORS.BRAND_PRIMARY;
              const animation = initLottieWithColor(indicator, smokeAnimationData, brandColor);
              if (animation) {
                indicator._lottieAnimation = animation;
              } else {
                indicator.textContent = "●";
                indicator.style.color = CRITICAL_COLORS.BRAND_PRIMARY;
              }
            } catch (_error) {
              indicator.textContent = "●";
              indicator.style.color = CRITICAL_COLORS.BRAND_PRIMARY;
            }
          });
        }
      } else {
        indicator.style.display = "none";
        // Clean up Lottie animation when hiding
        if (indicator._lottieAnimation) {
          try {
            indicator._lottieAnimation.destroy();
            indicator._lottieAnimation = null;
          } catch (e) {
            console.error("Error destroying queued indicator Lottie:", e);
          }
          indicator.innerHTML = ""; // Clear content
          indicator.textContent = "";
        }
      }
    }
  }

  /**
   * Scroll to bottom of chat container
   * Used by subscription to auto-scroll on new messages
   */
  scrollToBottom() {
    if (this.element) {
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
