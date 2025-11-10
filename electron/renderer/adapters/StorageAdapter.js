/**
 * StorageAdapter - Abstraction layer for browser storage operations
 *
 * This adapter provides a testable interface for localStorage and sessionStorage,
 * allowing us to mock storage operations in unit tests without browser environment.
 *
 * @interface IStorageAdapter
 */

/**
 * Real browser storage implementation of the adapter
 * Used in production Electron renderer process
 */
export class StorageAdapter {
  /**
   * Create storage adapter
   * @param {Storage} [localStorage=window.localStorage] - localStorage object
   * @param {Storage} [sessionStorage=window.sessionStorage] - sessionStorage object
   */
  constructor(localStorage = globalThis.window?.localStorage, sessionStorage = globalThis.window?.sessionStorage) {
    if (!localStorage) {
      console.warn("StorageAdapter: No localStorage found");
    }
    if (!sessionStorage) {
      console.warn("StorageAdapter: No sessionStorage found");
    }
    this.localStorage = localStorage;
    this.sessionStorage = sessionStorage;
  }

  // ============================
  // LocalStorage Operations
  // ============================

  /**
   * Set item in localStorage
   * @param {string} key - Storage key
   * @param {string} value - Value to store (must be string)
   */
  setLocal(key, value) {
    if (!this.localStorage) {
      throw new Error("localStorage not available");
    }
    this.localStorage.setItem(key, value);
  }

  /**
   * Get item from localStorage
   * @param {string} key - Storage key
   * @returns {string | null} Stored value or null if not found
   */
  getLocal(key) {
    if (!this.localStorage) {
      throw new Error("localStorage not available");
    }
    return this.localStorage.getItem(key);
  }

  /**
   * Remove item from localStorage
   * @param {string} key - Storage key
   */
  removeLocal(key) {
    if (!this.localStorage) {
      throw new Error("localStorage not available");
    }
    this.localStorage.removeItem(key);
  }

  /**
   * Clear all items from localStorage
   */
  clearLocal() {
    if (!this.localStorage) {
      throw new Error("localStorage not available");
    }
    this.localStorage.clear();
  }

  /**
   * Get number of items in localStorage
   * @returns {number} Number of items
   */
  getLocalLength() {
    if (!this.localStorage) {
      throw new Error("localStorage not available");
    }
    return this.localStorage.length;
  }

  /**
   * Get key at index in localStorage
   * @param {number} index - Index
   * @returns {string | null} Key or null if index out of bounds
   */
  getLocalKey(index) {
    if (!this.localStorage) {
      throw new Error("localStorage not available");
    }
    return this.localStorage.key(index);
  }

  // ============================
  // SessionStorage Operations
  // ============================

  /**
   * Set item in sessionStorage
   * @param {string} key - Storage key
   * @param {string} value - Value to store (must be string)
   */
  setSession(key, value) {
    if (!this.sessionStorage) {
      throw new Error("sessionStorage not available");
    }
    this.sessionStorage.setItem(key, value);
  }

  /**
   * Get item from sessionStorage
   * @param {string} key - Storage key
   * @returns {string | null} Stored value or null if not found
   */
  getSession(key) {
    if (!this.sessionStorage) {
      throw new Error("sessionStorage not available");
    }
    return this.sessionStorage.getItem(key);
  }

  /**
   * Remove item from sessionStorage
   * @param {string} key - Storage key
   */
  removeSession(key) {
    if (!this.sessionStorage) {
      throw new Error("sessionStorage not available");
    }
    this.sessionStorage.removeItem(key);
  }

  /**
   * Clear all items from sessionStorage
   */
  clearSession() {
    if (!this.sessionStorage) {
      throw new Error("sessionStorage not available");
    }
    this.sessionStorage.clear();
  }

  /**
   * Get number of items in sessionStorage
   * @returns {number} Number of items
   */
  getSessionLength() {
    if (!this.sessionStorage) {
      throw new Error("sessionStorage not available");
    }
    return this.sessionStorage.length;
  }

  /**
   * Get key at index in sessionStorage
   * @param {number} index - Index
   * @returns {string | null} Key or null if index out of bounds
   */
  getSessionKey(index) {
    if (!this.sessionStorage) {
      throw new Error("sessionStorage not available");
    }
    return this.sessionStorage.key(index);
  }

  // ============================
  // JSON Helper Methods
  // ============================

  /**
   * Set JSON object in localStorage
   * @param {string} key - Storage key
   * @param {any} value - Value to store (will be JSON.stringify'd)
   */
  setLocalJSON(key, value) {
    this.setLocal(key, JSON.stringify(value));
  }

  /**
   * Get JSON object from localStorage
   * @param {string} key - Storage key
   * @param {any} [defaultValue=null] - Default value if not found or invalid JSON
   * @returns {any} Parsed JSON value or defaultValue
   */
  getLocalJSON(key, defaultValue = null) {
    try {
      const value = this.getLocal(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      console.error(`Error parsing JSON from localStorage key "${key}":`, error);
      return defaultValue;
    }
  }

  /**
   * Set JSON object in sessionStorage
   * @param {string} key - Storage key
   * @param {any} value - Value to store (will be JSON.stringify'd)
   */
  setSessionJSON(key, value) {
    this.setSession(key, JSON.stringify(value));
  }

  /**
   * Get JSON object from sessionStorage
   * @param {string} key - Storage key
   * @param {any} [defaultValue=null] - Default value if not found or invalid JSON
   * @returns {any} Parsed JSON value or defaultValue
   */
  getSessionJSON(key, defaultValue = null) {
    try {
      const value = this.getSession(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      console.error(`Error parsing JSON from sessionStorage key "${key}":`, error);
      return defaultValue;
    }
  }

  // ============================
  // Availability Checks
  // ============================

  /**
   * Check if localStorage is available
   * @returns {boolean} True if available
   */
  isLocalStorageAvailable() {
    return !!this.localStorage;
  }

  /**
   * Check if sessionStorage is available
   * @returns {boolean} True if available
   */
  isSessionStorageAvailable() {
    return !!this.sessionStorage;
  }

  /**
   * Check if any storage is available
   * @returns {boolean} True if either localStorage or sessionStorage is available
   */
  isAvailable() {
    return this.isLocalStorageAvailable() || this.isSessionStorageAvailable();
  }
}

// Export singleton instance for convenience
export const storageAdapter = new StorageAdapter();
