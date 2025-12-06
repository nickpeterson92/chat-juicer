/**
 * FileService - Pure business logic for file operations
 * NO DEPENDENCIES on DOM - uses adapters for infrastructure
 *
 * Handles:
 * - File upload validation and processing
 * - File list management
 * - File metadata extraction
 * - Directory operations
 *
 * State Management:
 * - activeDirectory is stored in AppState (single source of truth)
 * - FileService reads/writes via appState.getState() and appState.setState()
 * - fileCache remains internal (it's a cache, not UI state)
 */

/**
 * FileService class
 * Manages file operations with dependency injection
 */
export class FileService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.ipcAdapter - IPC adapter for backend communication
   * @param {Object} dependencies.storageAdapter - Storage adapter for state persistence
   * @param {Object} dependencies.appState - Application state manager
   */
  constructor({ ipcAdapter, storageAdapter, appState }) {
    if (!appState) {
      throw new Error("FileService requires appState (state manager) in constructor");
    }
    if (!ipcAdapter) {
      throw new Error("FileService requires ipcAdapter in constructor");
    }
    if (!storageAdapter) {
      throw new Error("FileService requires storageAdapter in constructor");
    }

    this.ipc = ipcAdapter;
    this.storage = storageAdapter;
    this.appState = appState;

    // Internal cache (not UI state)
    this.fileCache = new Map();
  }

  /**
   * Validate file for upload
   * Checks file size, type, and name
   *
   * @param {File} file - File object to validate
   * @param {Object} options - Validation options
   * @param {number} options.maxSize - Max file size in bytes (default: 100MB)
   * @param {Array<string>} options.allowedExtensions - Allowed file extensions (default: all)
   * @returns {Object} Validation result
   */
  validateFile(file, options = {}) {
    const { maxSize = 100 * 1024 * 1024, allowedExtensions = null } = options;

    if (!file) {
      return { valid: false, error: "No file provided" };
    }

    if (!file.name) {
      return { valid: false, error: "File has no name" };
    }

    if (file.size === 0) {
      return { valid: false, error: "File is empty" };
    }

    if (file.size > maxSize) {
      const sizeMB = Math.round(file.size / (1024 * 1024));
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      return { valid: false, error: `File too large (${sizeMB}MB). Maximum: ${maxSizeMB}MB` };
    }

    if (allowedExtensions && Array.isArray(allowedExtensions)) {
      const ext = this.getFileExtension(file.name);
      if (!allowedExtensions.includes(ext.toLowerCase())) {
        return { valid: false, error: `File type not allowed. Allowed: ${allowedExtensions.join(", ")}` };
      }
    }

    return { valid: true, error: null };
  }

  /**
   * Get file extension from filename
   *
   * @param {string} filename - File name
   * @returns {string} File extension (without dot)
   */
  getFileExtension(filename) {
    if (!filename || typeof filename !== "string") {
      return "";
    }

    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1) {
      return "";
    }

    return filename.substring(lastDot + 1);
  }

  /**
   * Get file icon based on extension
   *
   * @param {string} filename - File name
   * @returns {string} Icon identifier (for UI mapping)
   */
  getFileIcon(filename) {
    const ext = this.getFileExtension(filename).toLowerCase();

    const iconMap = {
      // Documents
      pdf: "pdf",
      doc: "doc",
      docx: "doc",
      txt: "text",
      md: "markdown",
      // Code
      js: "code",
      jsx: "code",
      ts: "code",
      tsx: "code",
      py: "code",
      java: "code",
      cpp: "code",
      c: "code",
      h: "code",
      css: "code",
      html: "code",
      json: "code",
      xml: "code",
      yaml: "code",
      yml: "code",
      // Images
      jpg: "image",
      jpeg: "image",
      png: "image",
      gif: "image",
      svg: "image",
      webp: "image",
      // Archives
      zip: "archive",
      tar: "archive",
      gz: "archive",
      rar: "archive",
      "7z": "archive",
      // Spreadsheets
      xls: "spreadsheet",
      xlsx: "spreadsheet",
      csv: "spreadsheet",
      // Other
      default: "file",
    };

    return iconMap[ext] || iconMap.default;
  }

  /**
   * Format file size for display
   *
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size (e.g., "1.5 MB")
   */
  formatFileSize(bytes) {
    if (typeof bytes !== "number" || bytes < 0) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  /**
   * Upload file to backend
   *
   * @param {File} file - File to upload
   * @param {string} sessionId - Session ID
   * @param {Function} progressCallback - Optional progress callback (percent)
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(file, sessionId, _progressCallback = null) {
    const validation = this.validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    if (!sessionId) {
      return { success: false, error: "No session ID provided" };
    }

    try {
      // Read file as ArrayBuffer and convert to plain array for IPC serialization
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const dataArray = Array.from(uint8Array);

      // Use IPCAdapter's uploadFile method
      const filePath = `data/files/${sessionId}/sources/${file.name}`;
      const result = await this.ipc.uploadFile(filePath, dataArray, file.name, file.type || "application/octet-stream");

      if (result?.success) {
        return { success: true, data: result };
      }

      return { success: false, error: result?.error || "Upload failed" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Load files from directory
   *
   * @param {string} directory - Directory path
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Result with files array
   */
  async loadFiles(directory, sessionId) {
    if (!sessionId) {
      return { success: false, error: "No session ID provided", files: [] };
    }

    try {
      const result = await this.ipc.invoke("load-files", {
        directory,
        session_id: sessionId,
      });

      if (result?.files) {
        this.appState.setState("files.activeDirectory", directory);
        this.cacheFileList(directory, result.files);
        return { success: true, files: result.files };
      }

      return { success: false, error: "Invalid response format", files: [] };
    } catch (error) {
      return { success: false, error: error.message, files: [] };
    }
  }

  /**
   * Delete file from backend
   *
   * @param {string} filename - File name
   * @param {string} directory - Directory path
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(filename, directory, sessionId) {
    if (!filename) {
      return { success: false, error: "No filename provided" };
    }

    if (!sessionId) {
      return { success: false, error: "No session ID provided" };
    }

    try {
      // Use IPCAdapter's deleteFile method
      const result = await this.ipc.deleteFile(directory, filename);

      if (result?.success) {
        // Update cache
        this.removeCachedFile(directory, filename);
        return { success: true };
      }

      return { success: false, error: result?.error || "Delete failed" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Open file in system default application
   *
   * @param {string} filePath - Full file path
   * @returns {Promise<Object>} Result
   */
  async openFile(filePath) {
    if (!filePath) {
      return { success: false, error: "No file path provided" };
    }

    try {
      // Parse directory and filename from path
      const lastSlash = filePath.lastIndexOf("/");
      const directory = lastSlash > 0 ? filePath.substring(0, lastSlash) : "";
      const filename = lastSlash > 0 ? filePath.substring(lastSlash + 1) : filePath;

      // Use IPCAdapter's openFile method
      const result = await this.ipc.openFile(directory, filename);

      if (result?.success) {
        return { success: true };
      }

      return { success: false, error: result?.error || "Failed to open file" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cache file list for directory
   *
   * @param {string} directory - Directory path
   * @param {Array<Object>} files - File list
   */
  cacheFileList(directory, files) {
    this.fileCache.set(directory, {
      files,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached file list
   *
   * @param {string} directory - Directory path
   * @param {number} maxAge - Max cache age in ms (default: 30s)
   * @returns {Array<Object>|null} Cached files or null
   */
  getCachedFileList(directory, maxAge = 30000) {
    const cached = this.fileCache.get(directory);

    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age >= maxAge) {
      this.fileCache.delete(directory);
      return null;
    }

    return cached.files;
  }

  /**
   * Remove file from cache
   *
   * @param {string} directory - Directory path
   * @param {string} filename - File name
   */
  removeCachedFile(directory, filename) {
    const cached = this.fileCache.get(directory);
    if (!cached) {
      return;
    }

    cached.files = cached.files.filter((file) => file.name !== filename);
    this.fileCache.set(directory, cached);
  }

  /**
   * Clear file cache
   *
   * @param {string|null} directory - Directory to clear (or all if null)
   */
  clearFileCache(directory = null) {
    if (directory) {
      this.fileCache.delete(directory);
    } else {
      this.fileCache.clear();
    }
  }

  /**
   * Get active directory
   *
   * @returns {string|null} Active directory path
   */
  getActiveDirectory() {
    return this.appState.getState("files.activeDirectory");
  }

  /**
   * Set active directory
   *
   * @param {string} directory - Directory path
   */
  setActiveDirectory(directory) {
    this.appState.setState("files.activeDirectory", directory);
  }

  /**
   * Reset service state
   */
  reset() {
    this.appState.setState("files.activeDirectory", null);
    this.fileCache.clear();
  }
}
