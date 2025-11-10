/**
 * MockStorageAdapter - Mock implementation for testing
 *
 * Provides a testable mock of browser storage (localStorage/sessionStorage)
 * that doesn't require a browser environment. Tracks all operations for verification.
 */

export class MockStorageAdapter {
  constructor() {
    this.localStorage = new MockStorage();
    this.sessionStorage = new MockStorage();
    this.callLog = [];
  }

  // ======================
  // Helper Methods
  // ======================

  /**
   * Log a method call for test verification
   * @private
   */
  _logCall(method, args) {
    this.callLog.push({ method, args, timestamp: Date.now() });
  }

  /**
   * Get all logged calls
   * @returns {Array} Call log
   */
  getCallLog() {
    return [...this.callLog];
  }

  /**
   * Get calls for specific method
   * @param {string} method - Method name
   * @returns {Array} Filtered call log
   */
  getCallsFor(method) {
    return this.callLog.filter((call) => call.method === method);
  }

  /**
   * Clear call log
   */
  clearCallLog() {
    this.callLog = [];
  }

  /**
   * Reset all mock state
   */
  reset() {
    this.localStorage.clear();
    this.sessionStorage.clear();
    this.callLog = [];
  }

  // ======================
  // LocalStorage Operations
  // ======================

  setLocal(key, value) {
    this._logCall("setLocal", [key, value]);
    this.localStorage.setItem(key, value);
  }

  getLocal(key) {
    this._logCall("getLocal", [key]);
    return this.localStorage.getItem(key);
  }

  removeLocal(key) {
    this._logCall("removeLocal", [key]);
    this.localStorage.removeItem(key);
  }

  clearLocal() {
    this._logCall("clearLocal", []);
    this.localStorage.clear();
  }

  getLocalLength() {
    this._logCall("getLocalLength", []);
    return this.localStorage.length;
  }

  getLocalKey(index) {
    this._logCall("getLocalKey", [index]);
    return this.localStorage.key(index);
  }

  // ======================
  // SessionStorage Operations
  // ======================

  setSession(key, value) {
    this._logCall("setSession", [key, value]);
    this.sessionStorage.setItem(key, value);
  }

  getSession(key) {
    this._logCall("getSession", [key]);
    return this.sessionStorage.getItem(key);
  }

  removeSession(key) {
    this._logCall("removeSession", [key]);
    this.sessionStorage.removeItem(key);
  }

  clearSession() {
    this._logCall("clearSession", []);
    this.sessionStorage.clear();
  }

  getSessionLength() {
    this._logCall("getSessionLength", []);
    return this.sessionStorage.length;
  }

  getSessionKey(index) {
    this._logCall("getSessionKey", [index]);
    return this.sessionStorage.key(index);
  }

  // ======================
  // JSON Helper Methods
  // ======================

  setLocalJSON(key, value) {
    this._logCall("setLocalJSON", [key, value]);
    this.setLocal(key, JSON.stringify(value));
  }

  getLocalJSON(key, defaultValue = null) {
    this._logCall("getLocalJSON", [key, defaultValue]);
    try {
      const value = this.getLocal(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (_error) {
      return defaultValue;
    }
  }

  setSessionJSON(key, value) {
    this._logCall("setSessionJSON", [key, value]);
    this.setSession(key, JSON.stringify(value));
  }

  getSessionJSON(key, defaultValue = null) {
    this._logCall("getSessionJSON", [key, defaultValue]);
    try {
      const value = this.getSession(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (_error) {
      return defaultValue;
    }
  }

  // ======================
  // Availability Checks
  // ======================

  isLocalStorageAvailable() {
    this._logCall("isLocalStorageAvailable", []);
    return true; // Mock is always available
  }

  isSessionStorageAvailable() {
    this._logCall("isSessionStorageAvailable", []);
    return true; // Mock is always available
  }

  isAvailable() {
    this._logCall("isAvailable", []);
    return true;
  }

  // ======================
  // Test Helpers
  // ======================

  /**
   * Get raw localStorage data (for test assertions)
   * @returns {Map} Raw storage data
   */
  getRawLocalStorage() {
    return new Map(this.localStorage.data);
  }

  /**
   * Get raw sessionStorage data (for test assertions)
   * @returns {Map} Raw storage data
   */
  getRawSessionStorage() {
    return new Map(this.sessionStorage.data);
  }

  /**
   * Seed localStorage with initial data (for test setup)
   * @param {Object} data - Key-value pairs to seed
   */
  seedLocalStorage(data) {
    Object.entries(data).forEach(([key, value]) => {
      this.localStorage.setItem(key, value);
    });
  }

  /**
   * Seed sessionStorage with initial data (for test setup)
   * @param {Object} data - Key-value pairs to seed
   */
  seedSessionStorage(data) {
    Object.entries(data).forEach(([key, value]) => {
      this.sessionStorage.setItem(key, value);
    });
  }
}

/**
 * MockStorage - Simple mock of Storage API
 * @private
 */
class MockStorage {
  constructor() {
    this.data = new Map();
  }

  get length() {
    return this.data.size;
  }

  setItem(key, value) {
    this.data.set(key, String(value));
  }

  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  removeItem(key) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }

  key(index) {
    const keys = Array.from(this.data.keys());
    return index >= 0 && index < keys.length ? keys[index] : null;
  }
}
