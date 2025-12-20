/**
 * ConnectionStatus - UI component for displaying connection status
 * Self-contained component that manages its own DOM
 */

import { ComponentLifecycle } from "../../core/component-lifecycle.js";
import { globalLifecycleManager } from "../../core/lifecycle-manager.js";
import { getMessageQueueService } from "../../services/message-queue-service.js";

export class ConnectionStatus {
  /**
   * @param {Object} domAdapter - DOM adapter for rendering
   * @param {Object} options - Optional configuration
   * @param {Object} options.appState - AppState instance for reactive state management
   */
  constructor(domAdapter, options = {}) {
    this.dom = domAdapter;
    this.element = null;
    this.isConnected = true;
    this.lastError = null;

    // AppState integration (optional)
    this.appState = options.appState || null;

    if (!this._lifecycle) {
      ComponentLifecycle.mount(this, "ConnectionStatus", globalLifecycleManager);
    }
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
    this.setupStateSubscriptions();
    return container;
  }

  /**
   * Setup AppState subscriptions
   * @private
   */
  setupStateSubscriptions() {
    if (!this.appState || !this.element) return;

    // Subscribe to connection status changes
    const unsubscribeConnection = this.appState.subscribe("connection.status", (status) => {
      switch (status) {
        case "CONNECTED":
          this.setConnected();
          break;
        case "DISCONNECTED":
          this.setDisconnected();
          break;
        case "RECONNECTING":
          this.setReconnecting();
          break;
        case "ERROR":
          this.setDisconnected("Connection error");
          break;
        default:
        // Note: Unknown connection status (should not happen in normal operation)
        // Using comment instead of console.warn as per project logging standards
      }
    });

    globalLifecycleManager.addUnsubscriber(this, unsubscribeConnection);
  }

  /**
   * Set connected state
   * @param {boolean} wasDisconnected - Whether this is a reconnection (not initial connection)
   */
  setConnected(wasDisconnected = false) {
    const wasConnected = this.isConnected;
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

    // On reconnect (was disconnected, now connected), resume queue processing (Section 7.F of queue spec)
    if (wasDisconnected || !wasConnected) {
      const messageQueueService = getMessageQueueService();
      if (messageQueueService?.hasItems()) {
        // Delay to allow system to stabilize after reconnect
        setTimeout(() => {
          messageQueueService.process();
        }, 200);
      }
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
    // Remove DOM element
    if (this.element) {
      this.dom.remove(this.element);
      this.element = null;
    }

    if (this._lifecycle) {
      ComponentLifecycle.unmount(this, globalLifecycleManager);
    }
  }
}
