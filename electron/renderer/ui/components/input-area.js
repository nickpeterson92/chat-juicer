/**
 * InputArea - UI component for message input
 * Self-contained component that manages its own DOM
 */

export class InputArea {
  /**
   * @param {Function} onSendCallback - Callback for send action
   * @param {Object} domAdapter - DOM adapter for rendering
   */
  constructor(onSendCallback, domAdapter) {
    this.onSendCallback = onSendCallback;
    this.dom = domAdapter;
    this.element = null;
    this.textarea = null;
    this.sendButton = null;
    this.isEnabled = true;
  }

  /**
   * Render the input area component
   *
   * @returns {HTMLElement} The rendered element
   */
  render() {
    const container = this.dom.createElement("div");
    this.dom.addClass(container, "input-area");

    // Create textarea
    const textarea = this.dom.createElement("textarea");
    this.dom.setAttribute(textarea, "placeholder", "Type a message... (Enter to send, Shift+Enter for new line)");
    this.dom.setAttribute(textarea, "rows", "1");
    this.dom.addClass(textarea, "input-textarea");
    this.dom.appendChild(container, textarea);

    // Create send button
    const sendBtn = this.dom.createElement("button");
    this.dom.addClass(sendBtn, "send-button");
    this.dom.setTextContent(sendBtn, "Send");
    this.dom.appendChild(container, sendBtn);

    // Store references
    this.element = container;
    this.textarea = textarea;
    this.sendButton = sendBtn;

    // Setup event listeners
    this.setupEventListeners();

    return container;
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    if (!this.textarea || !this.sendButton) return;

    // Send button click
    this.dom.addEventListener(this.sendButton, "click", () => {
      this.handleSend();
    });

    // Enter key (Shift+Enter for new line)
    this.dom.addEventListener(this.textarea, "keydown", (e) => {
      this.handleKeyDown(e);
    });

    // Auto-resize on input
    this.dom.addEventListener(this.textarea, "input", () => {
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
    this.dom.setStyle(this.textarea, "height", "auto");

    // Get scroll height and apply constraints
    const scrollHeight = this.textarea.scrollHeight || 40;
    const minHeight = 40;
    const maxHeight = 200;
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));

    this.dom.setStyle(this.textarea, "height", `${newHeight}px`);
  }

  /**
   * Get current value
   *
   * @returns {string} Current input value
   */
  getValue() {
    return this.textarea ? this.dom.getValue(this.textarea) || "" : "";
  }

  /**
   * Set input value
   *
   * @param {string} value - New value
   */
  setValue(value) {
    if (this.textarea) {
      this.dom.setValue(this.textarea, value);
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
      this.dom.focus(this.textarea);
    }
  }

  /**
   * Enable input
   */
  enable() {
    this.isEnabled = true;

    if (this.textarea) {
      this.dom.removeAttribute(this.textarea, "disabled");
    }

    if (this.sendButton) {
      this.dom.removeAttribute(this.sendButton, "disabled");
    }
  }

  /**
   * Disable input
   */
  disable() {
    this.isEnabled = false;

    if (this.textarea) {
      this.dom.setAttribute(this.textarea, "disabled", "true");
    }

    if (this.sendButton) {
      this.dom.setAttribute(this.sendButton, "disabled", "true");
    }
  }

  /**
   * Set placeholder text
   *
   * @param {string} text - Placeholder text
   */
  setPlaceholder(text) {
    if (this.textarea) {
      this.dom.setAttribute(this.textarea, "placeholder", text);
    }
  }

  /**
   * Destroy the component and remove from DOM
   */
  destroy() {
    if (this.element) {
      this.dom.remove(this.element);
      this.element = null;
      this.textarea = null;
      this.sendButton = null;
    }
  }
}
