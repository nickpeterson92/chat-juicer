/**
 * ConnectionStatus - UI component for displaying connection status
 * Self-contained component that manages its own DOM
 */

export class ConnectionStatus {
  /**
   * @param {Object} domAdapter - DOM adapter for rendering
   */
  constructor(domAdapter) {
    this.dom = domAdapter;
    this.element = null;
    this.isConnected = true;
    this.lastError = null;
  }

  /**
   * Render the connection status component
   *
   * @returns {HTMLElement} The rendered element
   */
  render() {
    const container = this.dom.createElement("div");
    this.dom.addClass(container, "connection-status");
    this.dom.addClass(container, "connected");

    // Status indicator (dot)
    const indicator = this.dom.createElement("div");
    this.dom.addClass(indicator, "status-indicator");
    this.dom.appendChild(container, indicator);

    // Status text
    const text = this.dom.createElement("span");
    this.dom.addClass(text, "status-text");
    this.dom.setTextContent(text, "Connected");
    this.dom.appendChild(container, text);

    this.element = container;
    return container;
  }

  /**
   * Set connected state
   */
  setConnected() {
    this.isConnected = true;
    this.lastError = null;

    if (!this.element) return;

    this.dom.removeClass(this.element, "disconnected");
    this.dom.removeClass(this.element, "reconnecting");
    this.dom.addClass(this.element, "connected");

    const statusText = this.dom.querySelector(this.element, ".status-text");
    if (statusText) {
      this.dom.setTextContent(statusText, "Connected");
    }
  }

  /**
   * Set disconnected state
   *
   * @param {string|null} error - Optional error message
   */
  setDisconnected(error = null) {
    this.isConnected = false;
    this.lastError = error;

    if (!this.element) return;

    this.dom.removeClass(this.element, "connected");
    this.dom.removeClass(this.element, "reconnecting");
    this.dom.addClass(this.element, "disconnected");

    const statusText = this.dom.querySelector(this.element, ".status-text");
    if (statusText) {
      this.dom.setTextContent(statusText, "Disconnected");
    }
  }

  /**
   * Set reconnecting state
   */
  setReconnecting() {
    this.isConnected = false;

    if (!this.element) return;

    this.dom.removeClass(this.element, "connected");
    this.dom.removeClass(this.element, "disconnected");
    this.dom.addClass(this.element, "reconnecting");

    const statusText = this.dom.querySelector(this.element, ".status-text");
    if (statusText) {
      this.dom.setTextContent(statusText, "Reconnecting...");
    }
  }

  /**
   * Get current state
   *
   * @returns {{isConnected: boolean, lastError: string|null}} Current state
   */
  getState() {
    return {
      isConnected: this.isConnected,
      lastError: this.lastError,
    };
  }

  /**
   * Show the component
   */
  show() {
    if (this.element) {
      this.dom.setStyle(this.element, "display", "flex");
    }
  }

  /**
   * Hide the component
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
    }
  }
}
