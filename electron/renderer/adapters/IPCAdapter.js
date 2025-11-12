/**
 * IPCAdapter - Abstraction layer for Electron IPC operations
 *
 * This adapter provides a testable interface for Electron IPC communications,
 * allowing us to mock IPC calls in unit tests without requiring Electron runtime.
 *
 * @interface IIPCAdapter
 */

/**
 * Real Electron IPC implementation of the adapter
 * Used in production Electron renderer process with window.electronAPI exposed by preload script
 */
export class IPCAdapter {
  /**
   * Create IPC adapter
   * @param {object} [api=window.electronAPI] - Electron API object (injected via preload)
   */
  constructor(api = globalThis.window?.electronAPI) {
    if (!api) {
      console.warn("IPCAdapter: No window.electronAPI found - IPC calls will fail");
    }
    this.api = api;
    this.appState = null; // Will be injected after AppState is created
    this.commandQueue = []; // Queue for commands when Python is busy
  }

  /**
   * Inject AppState reference for command queuing
   * @param {object} appState - AppState instance for tracking Python status
   */
  setAppState(appState) {
    this.appState = appState;
  }

  /**
   * Send message to Python backend
   * @param {string} content - Message content to send
   * @returns {Promise<void>}
   */
  async sendMessage(content) {
    if (!this.api?.sendUserInput) {
      throw new Error("IPC API not available: sendUserInput");
    }
    return this.api.sendUserInput(content);
  }

  /**
   * Stop current message streaming/generation
   * @returns {Promise<void>}
   */
  async stopGeneration() {
    if (!this.api?.restartBot) {
      console.warn("IPC API not available: restartBot (stopGeneration)");
      return Promise.resolve();
    }
    return this.api.restartBot();
  }

  /**
   * Restart the Python bot process
   * @returns {Promise<void>}
   */
  async restartBot() {
    if (!this.api?.restartBot) {
      console.warn("IPC API not available: restartBot");
      return Promise.resolve();
    }
    return this.api.restartBot();
  }

  /**
   * Open URL in system default browser
   * @param {string} url - URL to open
   * @returns {Promise<any>} Response from backend
   */
  async openExternalUrl(url) {
    if (!this.api?.openExternalUrl) {
      console.warn("IPC API not available: openExternalUrl");
      return Promise.resolve({ success: false, error: "Not implemented" });
    }
    return this.api.openExternalUrl(url);
  }

  /**
   * Get system username
   * @returns {Promise<string>} Username
   */
  async getUsername() {
    if (!this.api?.getUsername) {
      console.warn("IPC API not available: getUsername");
      return Promise.resolve("User");
    }
    return this.api.getUsername();
  }

  /**
   * Send session command to backend (with smart queuing)
   * @param {string} command - Command name (create, switch, delete, etc.)
   * @param {object} [data] - Optional command data
   * @returns {Promise<any>} Response from backend
   */
  async sendSessionCommand(command, data = {}) {
    // Check if we should queue the command
    if (this.appState && this.appState.python?.status !== "idle") {
      // Python is busy - queue the command
      return new Promise((resolve, reject) => {
        this.commandQueue.push({ command, data, resolve, reject });

        // Show toast notification
        const status = this.appState.python.status;
        const action = status === "busy_streaming" ? "generating response" : "summarizing history";
        this._showToast(`Command queued: Python ${action}`, "info");

        console.log(`⏳ Queued session command: ${command} (Python ${status})`);
      });
    }

    // Python is idle - execute immediately
    return this._executeSessionCommand(command, data);
  }

  /**
   * Execute session command immediately (internal)
   * @private
   * @param {string} command - Command name
   * @param {object} data - Command data
   * @returns {Promise<any>} Response from backend
   */
  async _executeSessionCommand(command, data) {
    if (!this.api?.sessionCommand) {
      throw new Error("IPC API not available: sessionCommand");
    }
    return this.api.sessionCommand(command, data);
  }

  /**
   * Process queued commands (call when Python becomes idle)
   */
  async processQueue() {
    if (this.commandQueue.length === 0) return;

    console.log(`📦 Processing ${this.commandQueue.length} queued command(s)`);

    // Process all queued commands
    while (this.commandQueue.length > 0) {
      const { command, data, resolve, reject } = this.commandQueue.shift();

      try {
        const result = await this._executeSessionCommand(command, data);
        resolve(result);
        console.log(`✅ Processed queued command: ${command}`);
      } catch (error) {
        console.error(`❌ Failed to process queued command: ${command}`, error);
        reject(error);
      }
    }
  }

  /**
   * Show toast notification (internal)
   * @private
   * @param {string} message - Toast message
   * @param {string} type - Toast type (info, success, error)
   */
  _showToast(message, type) {
    // Dynamically import toast utility to avoid circular dependencies
    import("../utils/toast.js")
      .then((module) => {
        module.showToast(message, type);
      })
      .catch((err) => {
        console.warn("Failed to show toast:", err);
      });
  }

  /**
   * Upload file to backend
   * @param {string} filePath - Path to file (not used, kept for API compatibility)
   * @param {Array} fileData - File data as plain array (for IPC serialization)
   * @param {string} fileName - Original file name
   * @param {string} mimeType - MIME type of file
   * @returns {Promise<any>} Response from backend
   */
  async uploadFile(_filePath, fileData, fileName, mimeType) {
    if (!this.api?.uploadFile) {
      throw new Error("IPC API not available: uploadFile");
    }
    // Backend expects: { filename, data, size, type }
    // data should be a plain array for IPC serialization
    return this.api.uploadFile({
      filename: fileName,
      data: fileData,
      size: fileData.length,
      type: mimeType,
    });
  }

  /**
   * Request file deletion from backend
   * @param {string} dirPath - Directory path
   * @param {string} filename - File name
   * @returns {Promise<any>} Response from backend
   */
  async deleteFile(dirPath, filename) {
    if (!this.api?.deleteFile) {
      throw new Error("IPC API not available: deleteFile");
    }
    return this.api.deleteFile(dirPath, filename);
  }

  /**
   * Open file in system default application
   * @param {string} dirPath - Directory path
   * @param {string} filename - File name
   * @returns {Promise<any>} Response from backend
   */
  async openFile(dirPath, filename) {
    if (!this.api?.openFile) {
      throw new Error("IPC API not available: openFile");
    }
    return this.api.openFile(dirPath, filename);
  }

  /**
   * Show file in system file manager (not implemented in electronAPI)
   * @param {string} filePath - Path to file to show
   * @returns {Promise<void>}
   */
  async showFileInFolder(filePath) {
    console.warn("showFileInFolder not implemented in electronAPI:", filePath);
    return Promise.resolve();
  }

  /**
   * Get app version from main process (not implemented in electronAPI)
   * @returns {Promise<string>} App version string
   */
  async getVersion() {
    console.warn("getVersion not implemented in electronAPI");
    return Promise.resolve("1.0.0");
  }

  /**
   * Register handler for Python stdout/bot output messages
   * @param {Function} callback - Handler function (content: any) => void
   */
  onPythonStdout(callback) {
    if (!this.api?.onBotOutput) {
      console.warn("IPC API not available: onBotOutput");
      return;
    }
    this.api.onBotOutput(callback);
  }

  /**
   * Register handler for Python stderr/bot error messages
   * @param {Function} callback - Handler function (error: string) => void
   */
  onPythonStderr(callback) {
    if (!this.api?.onBotError) {
      console.warn("IPC API not available: onBotError");
      return;
    }
    this.api.onBotError(callback);
  }

  /**
   * Register handler for Python process exit/bot disconnection
   * @param {Function} callback - Handler function () => void
   */
  onPythonExit(callback) {
    if (!this.api?.onBotDisconnected) {
      console.warn("IPC API not available: onBotDisconnected");
      return;
    }
    this.api.onBotDisconnected(callback);
  }

  /**
   * Open file picker dialog (not implemented in electronAPI)
   * @param {object} options - Dialog options
   * @param {string[]} [options.filters] - File type filters
   * @param {boolean} [options.multiple] - Allow multiple file selection
   * @returns {Promise<string[] | null>} Selected file paths or null if cancelled
   */
  async openFileDialog(_options = {}) {
    console.warn("openFileDialog not implemented in electronAPI");
    return Promise.resolve(null);
  }

  /**
   * Open save file dialog (not implemented in electronAPI)
   * @param {object} options - Dialog options
   * @param {string} [options.defaultPath] - Default file path
   * @param {string[]} [options.filters] - File type filters
   * @returns {Promise<string | null>} Selected file path or null if cancelled
   */
  async saveFileDialog(_options = {}) {
    console.warn("saveFileDialog not implemented in electronAPI");
    return Promise.resolve(null);
  }

  /**
   * Generic invoke method for IPC calls not yet wrapped
   * Fallback for service methods that haven't been migrated to specific methods yet
   * @param {string} channel - IPC channel
   * @param {any} data - Data to send
   * @returns {Promise<any>} Response from backend
   */
  async invoke(channel, data) {
    // Try to map to electronAPI method if it exists
    if (this.api?.[channel]) {
      return this.api[channel](data);
    }
    console.warn(`IPCAdapter.invoke(${channel}) - method not available in electronAPI`);
    throw new Error(`IPC method not available: ${channel}`);
  }

  /**
   * Send generic IPC message (for compatibility)
   * @param {string} channel - IPC channel
   * @param {any} [data] - Optional data to send
   * @returns {Promise<void>}
   */
  async send(channel, data) {
    console.debug(`IPC send: ${channel}`, data);
    // Most 'send' calls in bootstrap are for signaling, which electronAPI doesn't need
    return Promise.resolve();
  }

  /**
   * Log message to main process
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} message - Log message
   * @param {object} [data] - Optional log data
   */
  log(level, message, data) {
    if (!this.api?.log) {
      console.warn("IPC API not available: log");
      return;
    }
    this.api.log(level, message, data);
  }

  /**
   * Check if IPC API is available
   * @returns {boolean} True if API is available
   */
  isAvailable() {
    return !!this.api;
  }

  /**
   * Get raw API object (for advanced use cases)
   * @returns {object | null} Raw API object or null
   */
  getRawAPI() {
    return this.api;
  }
}

// Export singleton instance for convenience
export const ipcAdapter = new IPCAdapter();
