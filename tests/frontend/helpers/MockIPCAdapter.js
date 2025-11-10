/**
 * MockIPCAdapter - Mock implementation for testing
 *
 * Provides a testable mock of Electron IPC operations that doesn't require Electron runtime.
 * Tracks method calls and allows simulation of backend responses for testing.
 */

export class MockIPCAdapter {
  constructor() {
    this.callLog = [];
    this.handlers = {
      pythonStdout: [],
      pythonStderr: [],
      pythonExit: [],
    };
    this.responses = new Map();
    this.shouldFail = new Map();
  }

  // ======================
  // Helper Methods
  // ======================

  /**
   * Log a method call for test verification
   * @private
   */
  _logCall(method, args) {
    this.callLog.push({
      method,
      args: args.map((arg) => {
        // Don't store ArrayBuffer in log (too large)
        if (arg instanceof ArrayBuffer) {
          return { type: "ArrayBuffer", byteLength: arg.byteLength };
        }
        return arg;
      }),
      timestamp: Date.now(),
    });
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
   * Get call data for specific channel (for testing services)
   * @param {string} channel - Channel name
   * @returns {Array} Array of data objects sent to that channel
   */
  getCalls(channel) {
    // Handle both IPC channels and high-level method names
    if (channel === "session-command") {
      // For session commands, return the data objects from sendSessionCommand calls
      return this.callLog
        .filter((call) => call.method === "sendSessionCommand")
        .map((call) => {
          // args are [command, data], return in format tests expect
          const [command, data] = call.args;
          return { command, data };
        });
    }

    if (channel === "user-input") {
      // For user input, return calls from sendMessage
      return this.callLog
        .filter((call) => call.method === "sendMessage")
        .map((call) => {
          // args are [content], return in format tests expect
          const [content] = call.args;
          return { content };
        });
    }

    // Default behavior for standard IPC channels
    return this.callLog
      .filter((call) => (call.method === "send" || call.method === "invoke") && call.args[0] === channel)
      .map((call) => call.args[1] || {});
  }

  /**
   * Clear call log
   */
  clearCallLog() {
    this.callLog = [];
  }

  /**
   * Set mock response for a method
   * @param {string} method - Method name
   * @param {any} response - Response to return
   */
  setResponse(method, response) {
    this.responses.set(method, response);
  }

  /**
   * Set method to fail with error
   * @param {string} method - Method name
   * @param {Error | string} error - Error to throw
   */
  setFailure(method, error) {
    this.shouldFail.set(method, error);
  }

  /**
   * Clear a specific failure
   * @param {string} method - Method name
   */
  clearFailure(method) {
    this.shouldFail.delete(method);
  }

  /**
   * Reset all mock state
   */
  reset() {
    this.callLog = [];
    this.handlers = {
      pythonStdout: [],
      pythonStderr: [],
      pythonExit: [],
    };
    this.responses.clear();
    this.shouldFail.clear();
  }

  /**
   * Execute method with failure check
   * @private
   */
  async _executeMethod(method, args) {
    this._logCall(method, args);

    if (this.shouldFail.has(method)) {
      const error = this.shouldFail.get(method);
      throw typeof error === "string" ? new Error(error) : error;
    }

    if (this.responses.has(method)) {
      const response = this.responses.get(method);
      return typeof response === "function" ? response(...args) : response;
    }

    return undefined;
  }

  // ======================
  // IPC Methods
  // ======================

  /**
   * Send message via IPC (fire-and-forget)
   * @param {string} channel - IPC channel
   * @param {any} data - Data to send
   */
  async send(channel, data) {
    return this._executeMethod("send", [channel, data]);
  }

  /**
   * Invoke IPC method with response
   * @param {string} channel - IPC channel
   * @param {any} data - Data to send
   * @returns {Promise<any>} Response from backend
   */
  async invoke(channel, data) {
    this._logCall("invoke", [channel, data]);

    if (this.shouldFail.has("invoke")) {
      const error = this.shouldFail.get("invoke");
      throw typeof error === "string" ? new Error(error) : error;
    }

    // Try channel-specific response first
    if (this.responses.has(channel)) {
      const response = this.responses.get(channel);
      const result = typeof response === "function" ? response(data) : response;

      // If response is an Error, throw it
      if (result instanceof Error) {
        throw result;
      }

      return result;
    }

    // Fall back to generic invoke response
    if (this.responses.has("invoke")) {
      const response = this.responses.get("invoke");
      const result = typeof response === "function" ? response(channel, data) : response;

      if (result instanceof Error) {
        throw result;
      }

      return result;
    }

    return undefined;
  }

  async sendMessage(content) {
    // Special handling: look up response by "user-input" first, then fall back to method name
    this._logCall("sendMessage", [content]);

    if (this.shouldFail.has("sendMessage")) {
      const error = this.shouldFail.get("sendMessage");
      throw typeof error === "string" ? new Error(error) : error;
    }

    // Try "user-input" response first (for backward compat with tests)
    if (this.responses.has("user-input")) {
      const response = this.responses.get("user-input");
      const result = typeof response === "function" ? response(content) : response;

      if (result instanceof Error) {
        throw result;
      }

      return result;
    }

    // Fall back to sendMessage response
    if (this.responses.has("sendMessage")) {
      const response = this.responses.get("sendMessage");
      const result = typeof response === "function" ? response(content) : response;

      if (result instanceof Error) {
        throw result;
      }

      return result;
    }

    return undefined;
  }

  async stopGeneration() {
    return this._executeMethod("stopGeneration", []);
  }

  async sendSessionCommand(command, data = {}) {
    // Special handling: look up response by command name first, then fall back to method name
    this._logCall("sendSessionCommand", [command, data]);

    if (this.shouldFail.has("sendSessionCommand")) {
      const error = this.shouldFail.get("sendSessionCommand");
      throw typeof error === "string" ? new Error(error) : error;
    }

    // Try command-specific response first (e.g., "session-command")
    if (this.responses.has("session-command")) {
      const response = this.responses.get("session-command");
      const result = typeof response === "function" ? response(command, data) : response;

      // If response is an Error, throw it
      if (result instanceof Error) {
        throw result;
      }

      return result;
    }

    // Fall back to sendSessionCommand response
    if (this.responses.has("sendSessionCommand")) {
      const response = this.responses.get("sendSessionCommand");
      const result = typeof response === "function" ? response(command, data) : response;

      if (result instanceof Error) {
        throw result;
      }

      return result;
    }

    return undefined;
  }

  async uploadFile(filePath, fileData, fileName, mimeType) {
    return this._executeMethod("uploadFile", [filePath, fileData, fileName, mimeType]);
  }

  async deleteFile(filePath) {
    return this._executeMethod("deleteFile", [filePath]);
  }

  async openFile(filePath) {
    return this._executeMethod("openFile", [filePath]);
  }

  async showFileInFolder(filePath) {
    return this._executeMethod("showFileInFolder", [filePath]);
  }

  async getVersion() {
    return this._executeMethod("getVersion", []) || "1.0.0-test";
  }

  async openFileDialog(options = {}) {
    return this._executeMethod("openFileDialog", [options]);
  }

  async saveFileDialog(options = {}) {
    return this._executeMethod("saveFileDialog", [options]);
  }

  // ======================
  // Event Handlers
  // ======================

  onPythonStdout(callback) {
    this._logCall("onPythonStdout", [callback]);
    this.handlers.pythonStdout.push(callback);
  }

  onPythonStderr(callback) {
    this._logCall("onPythonStderr", [callback]);
    this.handlers.pythonStderr.push(callback);
  }

  onPythonExit(callback) {
    this._logCall("onPythonExit", [callback]);
    this.handlers.pythonExit.push(callback);
  }

  // ======================
  // Test Simulation Methods
  // ======================

  /**
   * Simulate Python stdout message (for testing)
   * @param {string} content - Message content
   */
  simulatePythonStdout(content) {
    for (const handler of this.handlers.pythonStdout) {
      handler(content);
    }
  }

  /**
   * Simulate Python stderr message (for testing)
   * @param {string} content - Error message content
   */
  simulatePythonStderr(content) {
    for (const handler of this.handlers.pythonStderr) {
      handler(content);
    }
  }

  /**
   * Simulate Python process exit (for testing)
   * @param {number} code - Exit code
   */
  simulatePythonExit(code) {
    for (const handler of this.handlers.pythonExit) {
      handler(code);
    }
  }

  // ======================
  // Availability
  // ======================

  isAvailable() {
    return true; // Mock is always available
  }

  getRawAPI() {
    return {
      sendMessage: this.sendMessage.bind(this),
      stopGeneration: this.stopGeneration.bind(this),
      sendSessionCommand: this.sendSessionCommand.bind(this),
      uploadFile: this.uploadFile.bind(this),
      deleteFile: this.deleteFile.bind(this),
      openFile: this.openFile.bind(this),
      showFileInFolder: this.showFileInFolder.bind(this),
      getVersion: this.getVersion.bind(this),
      openFileDialog: this.openFileDialog.bind(this),
      saveFileDialog: this.saveFileDialog.bind(this),
      onPythonStdout: this.onPythonStdout.bind(this),
      onPythonStderr: this.onPythonStderr.bind(this),
      onPythonExit: this.onPythonExit.bind(this),
    };
  }
}
