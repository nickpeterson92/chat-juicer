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
    const response = await this._executeMethod("invoke", [channel, data]);

    // If response is an Error, throw it
    if (response instanceof Error) {
      throw response;
    }

    return response;
  }

  async sendMessage(content) {
    return this._executeMethod("sendMessage", [content]);
  }

  async stopGeneration() {
    return this._executeMethod("stopGeneration", []);
  }

  async sendSessionCommand(command, data = {}) {
    return this._executeMethod("sendSessionCommand", [command, data]);
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
