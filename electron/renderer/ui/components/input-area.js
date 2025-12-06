/**
 * InputArea - UI component for message input
 * Wraps existing DOM elements and manages input behavior
 */

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
    this.unsubscribers = [];

    this.setupEventListeners();
    this.setupStateSubscriptions();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    // Send button click
    this.sendButton.addEventListener("click", () => {
      this.handleSend();
    });

    // Enter key (Shift+Enter for new line)
    this.textarea.addEventListener("keydown", (e) => {
      this.handleKeyDown(e);
    });

    // Auto-resize on input + update send button state
    this.textarea.addEventListener("input", () => {
      this.adjustHeight();
      this.updateSendButtonState();
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

    // Subscribe to message streaming state to auto enable/disable input
    const unsubscribeStreaming = this.appState.subscribe("message.isStreaming", (isStreaming) => {
      if (isStreaming) {
        this.disable();
      } else {
        this.enable();
      }
    });

    this.unsubscribers.push(unsubscribeStreaming);
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
   * Handle send action
   */
  handleSend() {
    if (!this.isEnabled) return;

    const message = this.getValue().trim();
    if (!message) return;

    if (this.onSendCallback) {
      this.onSendCallback(message);
    }

    this.clear();
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
    // Clean up AppState subscriptions
    if (this.unsubscribers) {
      this.unsubscribers.forEach((unsub) => {
        unsub();
      });
      this.unsubscribers = [];
    }

    // Clean up model selector
    if (this.modelSelector && typeof this.modelSelector.destroy === "function") {
      this.modelSelector.destroy();
    }
  }
}
