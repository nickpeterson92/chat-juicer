/**
 * InputArea - UI component for message input
 * Wraps existing DOM elements and manages input behavior
 */

export class InputArea {
  /**
   * @param {HTMLElement} textarea - Existing textarea element (#user-input)
   * @param {HTMLElement} sendButton - Existing send button element (#send-btn)
   * @param {Function} onSendCallback - Callback for send action
   */
  constructor(textarea, sendButton, onSendCallback) {
    if (!textarea || !sendButton) {
      throw new Error("InputArea requires existing textarea and button elements");
    }
    this.textarea = textarea;
    this.sendButton = sendButton;
    this.onSendCallback = onSendCallback;
    this.isEnabled = true;
    this.setupEventListeners();
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

    // Auto-resize on input
    this.textarea.addEventListener("input", () => {
      this.adjustHeight();
    });
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
    }
  }

  /**
   * Clear input
   */
  clear() {
    this.setValue("");
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
}
