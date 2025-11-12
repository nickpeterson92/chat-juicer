/**
 * State management for Chat Juicer renderer
 */

import { MAX_FUNCTION_BUFFERS, MAX_FUNCTION_CALLS } from "../config/constants.js";

/**
 * Efficient Bounded Map class for memory management
 * Uses Map-based insertion order tracking for O(1) operations
 */
export class BoundedMap extends Map {
  constructor(maxSize = 100) {
    super();
    this.maxSize = maxSize;
    this.insertionOrder = new Map(); // Track order with timestamps - O(1) operations
    this.nextOrder = 0;
  }

  set(key, value) {
    // If key exists, just update value (no order change needed)
    if (this.has(key)) {
      return super.set(key, value);
    }

    // New key - check size limit and evict oldest if at capacity
    if (this.size >= this.maxSize) {
      let oldestKey = null;
      let oldestOrder = Infinity;

      // Find oldest key (O(n) but only when at capacity)
      for (const [k, order] of this.insertionOrder.entries()) {
        if (order < oldestOrder) {
          oldestOrder = order;
          oldestKey = k;
        }
      }

      if (oldestKey !== null) {
        this.delete(oldestKey);
      }
    }

    // Track insertion order with timestamp
    this.insertionOrder.set(key, this.nextOrder++);
    return super.set(key, value);
  }

  delete(key) {
    this.insertionOrder.delete(key); // O(1)
    return super.delete(key); // O(1)
  }

  clear() {
    this.insertionOrder.clear();
    this.nextOrder = 0;
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
      currentView: "welcome", // "welcome" | "chat"
    };

    // Python backend state (for command queuing)
    this.python = {
      status: "idle", // idle | busy_streaming | busy_summarizing
      commandQueue: [], // Queue for commands when Python is busy
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
    } else {
      window.electronAPI.log("warn", `Invalid state transition: ${currentStatus} -> ${status}`);
    }
  }
}
