/**
 * State management for Chat Juicer renderer
 */

import { MAX_FUNCTION_BUFFERS, MAX_FUNCTION_CALLS } from "../config/constants.js";

/**
 * Efficient Bounded Map class for memory management
 */
export class BoundedMap extends Map {
  constructor(maxSize = 100) {
    super();
    this.maxSize = maxSize;
    this.keyOrder = []; // Track insertion order efficiently
  }

  set(key, value) {
    // If key exists, just update value (no order change needed)
    if (this.has(key)) {
      return super.set(key, value);
    }

    // New key - check size limit
    if (this.size >= this.maxSize) {
      const oldestKey = this.keyOrder.shift();
      this.delete(oldestKey);
    }

    this.keyOrder.push(key);
    return super.set(key, value);
  }

  delete(key) {
    const index = this.keyOrder.indexOf(key);
    if (index > -1) {
      this.keyOrder.splice(index, 1);
    }
    return super.delete(key);
  }

  clear() {
    this.keyOrder = [];
    return super.clear();
  }
}

/**
 * Centralized State Management with pub/sub pattern
 */
export class AppState {
  constructor() {
    // Connection state machine
    this.connection = {
      status: "CONNECTED", // CONNECTED | DISCONNECTED | RECONNECTING | ERROR
      isInitial: true,
      hasShownWelcome: false,
    };

    // Message state
    this.message = {
      currentAssistant: null,
      assistantBuffer: "",
      isTyping: false,
    };

    // Function call tracking
    this.functions = {
      activeCalls: new BoundedMap(MAX_FUNCTION_CALLS),
      argumentsBuffer: new BoundedMap(MAX_FUNCTION_BUFFERS),
      activeTimers: new Set(),
    };

    // UI state
    this.ui = {
      theme: localStorage.getItem("theme") || "light",
      toolsPanelCollapsed: false,
    };

    // State change listeners
    this.listeners = new Map();
  }

  // Optimized state change - avoid deep path parsing for common cases
  setState(path, value) {
    // Fast path for common single-level updates
    if (!path.includes(".")) {
      const oldValue = this[path];
      this[path] = value;
      this.notifyListeners(path, value, oldValue);
      return;
    }

    // Handle nested paths only when necessary
    const keys = path.split(".");
    let target = this;

    // Navigate to the nested property
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }

    const lastKey = keys[keys.length - 1];
    const oldValue = target[lastKey];
    target[lastKey] = value;

    // Notify listeners
    this.notifyListeners(path, value, oldValue);
  }

  // Get nested state value
  getState(path) {
    const keys = path.split(".");
    let value = this;

    for (const key of keys) {
      value = value[key];
      if (value === undefined) return undefined;
    }

    return value;
  }

  // Subscribe to state changes
  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(path);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  // Notify listeners of state change
  notifyListeners(path, newValue, oldValue) {
    const callbacks = this.listeners.get(path);
    if (callbacks) {
      callbacks.forEach((callback) => {
        callback(newValue, oldValue, path);
      });
    }

    // Also notify wildcard listeners
    const wildcardCallbacks = this.listeners.get("*");
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach((callback) => {
        callback({ path, newValue, oldValue });
      });
    }
  }

  // Connection state machine transitions
  setConnectionStatus(status) {
    const validTransitions = {
      CONNECTED: ["DISCONNECTED", "ERROR"],
      DISCONNECTED: ["CONNECTED", "RECONNECTING"],
      RECONNECTING: ["CONNECTED", "DISCONNECTED", "ERROR"],
      ERROR: ["RECONNECTING", "DISCONNECTED"],
    };

    const currentStatus = this.connection.status;

    // Skip if already in the desired state
    if (currentStatus === status) {
      return;
    }

    // Validate transition
    if (validTransitions[currentStatus]?.includes(status)) {
      this.setState("connection.status", status);
      this.handleConnectionChange(status);
    } else {
      window.electronAPI.log("warn", `Invalid state transition: ${currentStatus} -> ${status}`);
    }
  }

  // Handle connection state changes
  handleConnectionChange(status) {
    // Note: This method updates DOM elements directly
    // In a future refactoring, this could be moved to a UI controller
    const elements = window._chatJuicerElements || {};

    switch (status) {
      case "CONNECTED":
        if (elements.statusIndicator) elements.statusIndicator.classList.remove("disconnected");
        if (elements.statusText) elements.statusText.textContent = "Connected";
        if (elements.userInput) elements.userInput.disabled = false;
        if (elements.sendBtn) elements.sendBtn.disabled = false;
        break;

      case "DISCONNECTED":
      case "ERROR":
        if (elements.statusIndicator) elements.statusIndicator.classList.add("disconnected");
        if (elements.statusText) elements.statusText.textContent = status === "ERROR" ? "Error" : "Disconnected";
        if (elements.userInput) elements.userInput.disabled = true;
        if (elements.sendBtn) elements.sendBtn.disabled = true;
        break;

      case "RECONNECTING":
        if (elements.statusIndicator) elements.statusIndicator.classList.add("disconnected");
        if (elements.statusText) elements.statusText.textContent = "Reconnecting...";
        if (elements.userInput) elements.userInput.disabled = true;
        if (elements.sendBtn) elements.sendBtn.disabled = true;
        break;
    }
  }
}
