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
 *
 * @typedef {Object} ConnectionState
 * @property {('CONNECTED'|'DISCONNECTED'|'RECONNECTING'|'ERROR')} status - Connection status
 * @property {boolean} isInitial - Is this the initial connection
 * @property {boolean} hasShownWelcome - Has the welcome page been shown
 *
 * @typedef {Object} SessionState
 * @property {string|null} current - Current session ID
 * @property {Array<Object>} list - Loaded sessions
 * @property {boolean} isLoading - Loading state
 * @property {boolean} hasMore - Pagination state
 * @property {number} totalCount - Total session count
 *
 * @typedef {Object} MessageState
 * @property {string|null} currentAssistant - Current assistant message ID
 * @property {string} assistantBuffer - Buffer for streaming assistant messages
 * @property {boolean} isTyping - User typing indicator
 * @property {boolean} isStreaming - Assistant streaming indicator
 * @property {string|null} lastUser - Last user message
 * @property {string|null} lastAssistant - Last assistant message
 *
 * @typedef {Object} FunctionState
 * @property {BoundedMap} activeCalls - Active function calls
 * @property {BoundedMap} argumentsBuffer - Function arguments buffer
 * @property {Set} activeTimers - Active timers
 *
 * @typedef {Object} UIState
 * @property {string} theme - Current theme (light/dark)
 * @property {boolean} toolsPanelCollapsed - Tools panel collapsed state
 * @property {('welcome'|'chat')} currentView - Current view
 * @property {boolean} sidebarCollapsed - Sidebar collapsed state
 * @property {Object|null} cachedModelConfig - Cached model configuration
 * @property {Object|null} welcomeModelConfig - Welcome page model configuration
 * @property {boolean} isInitialized - Bootstrap complete flag
 *
 * @typedef {Object} PythonState
 * @property {('idle'|'busy_streaming'|'busy_summarizing')} status - Python backend status
 * @property {Array<Object>} commandQueue - Command queue
 *
 * @typedef {Object} FileState
 * @property {Array<Object>} uploaded - Uploaded files
 * @property {boolean} dragActive - Drag-and-drop active state
 * @property {boolean} isUploading - Upload in progress
 * @property {number|null} uploadProgress - Upload progress (0-100 or null)
 * @property {string|null} activeDirectory - Currently active directory path
 */
export class AppState {
  constructor() {
    // Connection state machine
    this.connection = {
      status: "CONNECTED", // CONNECTED | DISCONNECTED | RECONNECTING | ERROR
      isInitial: true,
      hasShownWelcome: false,
    };

    // Session state (single source of truth)
    this.session = {
      current: null, // Current session ID
      list: [], // Array of session objects
      isLoading: false, // Loading state
      hasMore: false, // Pagination state
      totalCount: 0, // Total session count
    };

    // Message state
    this.message = {
      currentAssistant: null,
      assistantBuffer: "",
      isTyping: false, // User typing indicator
      isStreaming: false, // Assistant streaming indicator
      lastUser: null, // Last user message
      lastAssistant: null, // Last assistant message
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
      sidebarCollapsed: false, // Sidebar collapsed state
      cachedModelConfig: null, // Cached model configuration
      welcomeModelConfig: null, // Welcome page model configuration
      isInitialized: false, // Bootstrap complete flag
    };

    // Python backend state (for command queuing)
    this.python = {
      status: "idle", // idle | busy_streaming | busy_summarizing
      commandQueue: [], // Queue for commands when Python is busy
    };

    // File upload state
    this.files = {
      uploaded: [], // Array of uploaded file objects
      dragActive: false, // Drag-and-drop active state
      isUploading: false, // Upload in progress
      uploadProgress: null, // Upload progress (0-100 or null)
      activeDirectory: null, // Currently active directory path
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
      window.electronAPI?.log("warn", `Invalid state transition: ${currentStatus} -> ${status}`);
    }
  }

  /**
   * Validate that a state path exists in the schema
   *
   * @param {string} path - State path (e.g., "session.current" or "files.uploaded")
   * @returns {boolean} True if path is valid, false otherwise
   *
   * @example
   * appState.validatePath("session.current") // true
   * appState.validatePath("nonexistent.path") // false
   */
  validatePath(path) {
    // Handle invalid input
    if (!path || typeof path !== "string") {
      return false;
    }

    const keys = path.split(".");
    let target = this;

    // Navigate through the path
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      // Skip internal properties
      if (key === "listeners" || typeof target[key] === "function") {
        return false;
      }

      // Check if key exists
      if (!(key in target)) {
        return false;
      }

      // Move to next level if not at end
      if (i < keys.length - 1) {
        target = target[key];

        // Can only traverse objects
        if (!target || typeof target !== "object") {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get all valid state paths in the schema
   * Returns flat array of all accessible state paths
   *
   * @returns {string[]} Array of valid state paths
   *
   * @example
   * const paths = appState.getValidPaths();
   * // Returns: ["connection", "connection.status", "session", "session.current", ...]
   */
  getValidPaths() {
    const paths = [];
    const visited = new WeakSet();

    /**
     * Recursively collect paths from object
     * @param {Object} obj - Object to traverse
     * @param {string} prefix - Path prefix
     */
    const collectPaths = (obj, prefix = "") => {
      // Prevent infinite recursion
      if (visited.has(obj)) {
        return;
      }

      // Only mark non-primitive objects as visited
      if (obj && typeof obj === "object") {
        visited.add(obj);
      }

      for (const key in obj) {
        // Skip internal properties and methods
        if (key === "listeners" || typeof obj[key] === "function") {
          continue;
        }

        // Skip prototype properties
        if (!Object.hasOwn(obj, key)) {
          continue;
        }

        const fullPath = prefix ? `${prefix}.${key}` : key;
        paths.push(fullPath);

        const value = obj[key];

        // Recursively collect from nested objects (but not Maps, Sets, arrays in a special way)
        if (
          value &&
          typeof value === "object" &&
          !(value instanceof Map) &&
          !(value instanceof Set) &&
          !(value instanceof BoundedMap) &&
          !Array.isArray(value)
        ) {
          collectPaths(value, fullPath);
        }
      }
    };

    collectPaths(this);

    return paths;
  }

  /**
   * Create a debug snapshot of current state
   * Returns sanitized state for debugging (no internal properties)
   *
   * @returns {Object} Sanitized state snapshot
   *
   * @example
   * const snapshot = appState.debugSnapshot();
   * console.log(JSON.stringify(snapshot, null, 2));
   */
  debugSnapshot() {
    const snapshot = {};

    /**
     * Deep clone value, sanitizing special types
     * @param {*} value - Value to clone
     * @returns {*} Cloned value
     */
    const cloneValue = (value) => {
      // Handle null/undefined
      if (value === null || value === undefined) {
        return value;
      }

      // Handle primitives
      if (typeof value !== "object") {
        return value;
      }

      // Handle BoundedMap - convert to plain object
      if (value instanceof BoundedMap) {
        const obj = {};
        for (const [k, v] of value.entries()) {
          obj[k] = cloneValue(v);
        }
        return obj;
      }

      // Handle Set - convert to array with recursive cloning
      if (value instanceof Set) {
        return Array.from(value, cloneValue);
      }

      // Handle Array
      if (Array.isArray(value)) {
        return value.map(cloneValue);
      }

      // Handle plain objects
      const cloned = {};
      for (const key in value) {
        if (Object.hasOwn(value, key)) {
          cloned[key] = cloneValue(value[key]);
        }
      }
      return cloned;
    };

    // Copy all state namespaces except internal properties
    for (const key in this) {
      if (key === "listeners" || typeof this[key] === "function") {
        continue;
      }

      if (Object.hasOwn(this, key)) {
        snapshot[key] = cloneValue(this[key]);
      }
    }

    return snapshot;
  }
}
