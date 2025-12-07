/**
 * InputArea - UI component for message input
 * Wraps existing DOM elements and manages input behavior
 */

import { ComponentLifecycle } from "../../core/component-lifecycle.js";
import { globalLifecycleManager } from "../../core/lifecycle-manager.js";
import { ModelSelector } from "./model-selector.js";

export class InputArea {
  /**
   * @param {HTMLElement} textarea - Existing textarea element (#user-input)
   * @param {HTMLElement} sendButton - Existing send button element (#send-btn)
   * @param {Function} onSendCallback - Callback for send action
   * @param {Object} options - Optional configuration
   * @param {HTMLElement} options.modelSelectorContainer - Container for model selector
   * @param {Object} options.ipcAdapter - IPC adapter for backend communication
   * @param {Object} options.sessionService - Session service for getting current session
   * @param {Function} options.getModelConfig - Function to get current model config
   * @param {Object} options.appState - AppState instance for reactive state management
   */
  constructor(textarea, sendButton, onSendCallback, options = {}) {
    if (!textarea || !sendButton) {
      throw new Error("InputArea requires existing textarea and button elements");
    }
    this.textarea = textarea;
    this.sendButton = sendButton;
    this.onSendCallback = onSendCallback;
    this.isEnabled = true;

    // Model selector optional dependencies
    this.modelSelectorContainer = options.modelSelectorContainer;
    this.ipcAdapter = options.ipcAdapter;
    this.sessionService = options.sessionService;
    this.modelSelector = null; // Will be initialized if dependencies provided

    // AppState integration (optional)
    this.appState = options.appState || null;

    // Queue badge element (created lazily)
    this.queueBadge = null;

    if (!this._lifecycle) {
      ComponentLifecycle.mount(this, "InputArea", globalLifecycleManager);
    }

    this.setupEventListeners();
    this.setupStateSubscriptions();
    this.setupStreamingStateListener();
    this.setupEscapeKeyListener();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    const addDOMListener = (element, event, handler, options) => {
      if (!element) return;
      element.addEventListener(event, handler, options);
      globalLifecycleManager.addUnsubscriber(this, () => element.removeEventListener(event, handler, options));
    };

    // Send button click
    addDOMListener(this.sendButton, "click", () => this.handleSend());

    // Enter key (Shift+Enter for new line)
    addDOMListener(this.textarea, "keydown", (e) => this.handleKeyDown(e));

    // Auto-resize on input + update send button state
    addDOMListener(this.textarea, "input", () => {
      this.adjustHeight();
      this.updateSendButtonState();
      // Also update streaming button state (stop vs send based on input content)
      const isStreaming = this.appState?.getState("message.isStreaming");
      if (isStreaming) {
        this.updateButtonForStreamingState(isStreaming);
      }
    });

    // Initial state
    this.updateSendButtonState();
  }

  /**
   * Setup AppState subscriptions
   * @private
   */
  setupStateSubscriptions() {
    if (!this.appState) return;

    // NOTE: Message queuing feature (2025-12-07) - input is ALWAYS enabled
    // Messages sent while agent is busy are queued and processed when idle
    // No longer disabling input during streaming

    // Subscribe to queue state for badge updates on send button
    const unsubscribeQueue = this.appState.subscribe("queue.items", (items) => {
      const queueCount = items?.length || 0;
      this.updateQueueBadge(queueCount);
    });

    globalLifecycleManager.addUnsubscriber(this, unsubscribeQueue);
  }

  /**
   * Setup streaming state listener for button transformation
   * @private
   */
  setupStreamingStateListener() {
    if (!this.appState) return;

    const unsubscribe = this.appState.subscribe("message.isStreaming", (isStreaming) => {
      this.updateButtonForStreamingState(isStreaming);
    });

    globalLifecycleManager.addUnsubscriber(this, unsubscribe);
  }

  /**
   * Update button appearance based on streaming state and input content
   * - Streaming + empty input: show Stop button (blue circle with stop icon)
   * - Streaming + text in input: show Send button (message will be queued)
   * - Not streaming: show Send button
   * @private
   */
  updateButtonForStreamingState(isStreaming) {
    if (!this.sendButton) return;

    const hasText = this.getValue().trim().length > 0;

    if (isStreaming && !hasText) {
      // Show stop button only when streaming with empty input
      // Keep .ready class for blue styling, add .streaming for stop icon
      this.sendButton.classList.add("streaming", "ready");
      this.sendButton.setAttribute("aria-label", "Stop response");
      this.sendButton.disabled = false; // Enable so user can click to stop
    } else {
      // Show send button (either not streaming, or has text to send)
      this.sendButton.classList.remove("streaming", "stopping");
      this.sendButton.setAttribute("aria-label", "Send message");
      // Re-enable button after interrupt completes
      this.sendButton.disabled = !hasText;
      // Update ready class based on text content
      if (hasText) {
        this.sendButton.classList.add("ready");
      } else {
        this.sendButton.classList.remove("ready");
      }
    }
  }

  /**
   * Setup ESC key listener for interrupt
   * @private
   */
  setupEscapeKeyListener() {
    const handleEscape = (e) => {
      if (e.key === "Escape" && this.appState?.getState("message.isStreaming")) {
        e.preventDefault();
        this.handleInterrupt();
      }
    };

    document.addEventListener("keydown", handleEscape);
    globalLifecycleManager.addUnsubscriber(this, () => {
      document.removeEventListener("keydown", handleEscape);
    });
  }

  /**
   * Update queue count badge on send button
   * @param {number} queueCount - Number of queued messages
   * @private
   */
  updateQueueBadge(queueCount) {
    if (!this.sendButton) return;

    if (queueCount > 0) {
      // Create badge if it doesn't exist
      if (!this.queueBadge) {
        this.queueBadge = document.createElement("span");
        this.queueBadge.className = "queue-count-badge";
        // Ensure send button has relative positioning for badge
        this.sendButton.style.position = "relative";
        this.sendButton.appendChild(this.queueBadge);
      }
      // Update badge text
      this.queueBadge.textContent = queueCount > 99 ? "99+" : String(queueCount);
    } else {
      // Remove badge when queue is empty
      if (this.queueBadge) {
        this.queueBadge.remove();
        this.queueBadge = null;
      }
    }
  }

  /**
   * Update send button state (.ready class) based on textarea content
   * @private
   */
  updateSendButtonState() {
    if (!this.sendButton) return;

    const hasValue = this.getValue().trim().length > 0;
    this.sendButton.disabled = !hasValue;

    if (hasValue) {
      this.sendButton.classList.add("ready");
    } else {
      this.sendButton.classList.remove("ready");
    }
  }

  /**
   * Handle send action - supports both message sending and interrupt
   * - If streaming AND input has text: send message (will be queued by backend)
   * - If streaming AND input is empty: interrupt the stream
   * - If not streaming: normal send
   */
  handleSend() {
    const message = this.getValue().trim();
    const isStreaming = this.appState?.getState("message.isStreaming");

    // If streaming with empty input, treat as interrupt (stop button behavior)
    if (isStreaming && !message) {
      this.handleInterrupt();
      return;
    }

    // If there's a message, send it (will be queued if streaming)
    if (!this.isEnabled) return;
    if (!message) return;

    if (this.onSendCallback) {
      this.onSendCallback(message);
    }

    this.clear();
  }

  /**
   * Handle interrupt request
   * @private
   */
  handleInterrupt() {
    if (!this.appState?.getState("message.isStreaming")) return;

    // Disable button to prevent spam
    this.sendButton.disabled = true;
    this.sendButton.classList.add("stopping");

    // Send interrupt signal to backend
    // Backend will send stream_interrupted and assistant_end messages
    window.electronAPI?.interruptStream?.();

    // Update state to track interrupt was requested
    this.appState.setState("stream.interrupted", true);
  }

  /**
   * Handle keydown events
   *
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.handleSend();
    }
  }

  /**
   * Adjust textarea height based on content
   */
  adjustHeight() {
    if (!this.textarea) return;

    // Reset height to recalculate
    this.textarea.style.height = "auto";

    // Get scroll height and apply constraints
    const scrollHeight = this.textarea.scrollHeight || 40;
    const minHeight = 40;
    const maxHeight = 200;
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));

    this.textarea.style.height = `${newHeight}px`;
  }

  /**
   * Get current value
   *
   * @returns {string} Current input value
   */
  getValue() {
    return this.textarea ? this.textarea.value || "" : "";
  }

  /**
   * Set input value
   *
   * @param {string} value - New value
   */
  setValue(value) {
    if (this.textarea) {
      this.textarea.value = value;
      this.adjustHeight();
      this.updateSendButtonState();
    }
  }

  /**
   * Clear input
   */
  clear() {
    this.setValue("");
    this.updateSendButtonState();
  }

  /**
   * Focus the textarea
   */
  focus() {
    if (this.textarea) {
      this.textarea.focus();
    }
  }

  /**
   * Enable input
   */
  enable() {
    this.isEnabled = true;

    if (this.textarea) {
      this.textarea.removeAttribute("disabled");
    }

    if (this.sendButton) {
      this.sendButton.removeAttribute("disabled");
    }
  }

  /**
   * Disable input
   */
  disable() {
    this.isEnabled = false;

    if (this.textarea) {
      this.textarea.setAttribute("disabled", "true");
    }

    if (this.sendButton) {
      this.sendButton.setAttribute("disabled", "true");
    }
  }

  /**
   * Set placeholder text
   *
   * @param {string} text - Placeholder text
   */
  setPlaceholder(text) {
    if (this.textarea) {
      this.textarea.setAttribute("placeholder", text);
    }
  }

  /**
   * Get textarea element
   *
   * @returns {HTMLElement} The textarea element
   */
  getTextarea() {
    return this.textarea;
  }

  /**
   * Get send button element
   *
   * @returns {HTMLElement} The send button element
   */
  getSendButton() {
    return this.sendButton;
  }

  /**
   * Initialize model selector (if dependencies provided)
   *
   * @param {Array} models - Available models from backend
   * @param {Array} reasoningLevels - Available reasoning levels from backend
   */
  async initializeModelSelector(models, reasoningLevels) {
    if (!this.modelSelectorContainer || !this.ipcAdapter || !this.sessionService) {
      console.warn("Model selector dependencies not provided, skipping initialization");
      return;
    }

    // Create ModelSelector component (chat page mode with auto-sync)
    this.modelSelector = new ModelSelector(this.modelSelectorContainer, {
      onChange: (model, reasoningEffort) => {
        console.log("Chat page model selection changed:", { model, reasoningEffort });
      },
      ipcAdapter: this.ipcAdapter,
      sessionService: this.sessionService, // Pass SessionService for getting current session ID
      autoSyncBackend: true, // Automatically sync to backend on change
    });

    await this.modelSelector.initialize(models, reasoningLevels);
    console.log("ModelSelector initialized on chat page");
  }

  /**
   * Destroy component and clean up subscriptions
   */
  destroy() {
    // Clean up model selector
    if (this.modelSelector && typeof this.modelSelector.destroy === "function") {
      this.modelSelector.destroy();
    }

    // Clean up queue badge
    if (this.queueBadge) {
      this.queueBadge.remove();
      this.queueBadge = null;
    }

    if (this._lifecycle) {
      ComponentLifecycle.unmount(this, globalLifecycleManager);
    }
  }
}
