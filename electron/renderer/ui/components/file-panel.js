/**
 * FilePanel - UI component for file management
 * Wraps existing DOM structure and integrates with file-manager.js
 */

import { ComponentLifecycle } from "../../core/component-lifecycle.js";
import { globalLifecycleManager } from "../../core/lifecycle-manager.js";
import { loadFilesIntoState, renderFileList } from "../../managers/file-manager.js";

export class FilePanel {
  /**
   * @param {HTMLElement} panelElement - Existing files panel element (#files-panel)
   * @param {HTMLElement} toggleButton - Panel toggle button (#open-files-btn)
   * @param {HTMLElement} filesContainer - Files list container (#files-container)
   * @param {HTMLElement} refreshButton - Refresh button (#refresh-files-btn)
   * @param {HTMLElement} sourcesTab - Input tab button (#tab-sources)
   * @param {HTMLElement} outputTab - Output tab button (#tab-output)
   * @param {Object} options - Optional configuration
   * @param {Object} options.appState - AppState instance for reactive state management
   */
  constructor(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab, options = {}) {
    if (!panelElement || !filesContainer) {
      throw new Error("FilePanel requires panel and container elements");
    }

    this.panel = panelElement;
    this.toggleButton = toggleButton;
    this.filesContainer = filesContainer;
    this.refreshButton = refreshButton;
    this.sourcesTab = sourcesTab;
    this.outputTab = outputTab;
    this.currentSessionId = null;

    // NEW Phase 1: Track current subdirectory for Output tab navigation
    // Relative path from output/ root (e.g., "", "code", "code/subfolder")
    this.currentOutputPath = "";

    // AppState integration (optional)
    this.appState = options.appState || null;

    if (!this._lifecycle) {
      ComponentLifecycle.mount(this, "FilePanel", globalLifecycleManager);
    }

    this.setupEventListeners();
    this.setupStateSubscriptions();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    const addDOMListener = (element, event, handler, options) => {
      if (!element) return;
      element.addEventListener(event, handler, options);
      // Register DOM listener cleanup with lifecycle manager
      globalLifecycleManager.addUnsubscriber(this, () => element.removeEventListener(event, handler, options));
    };

    // Toggle panel collapse/expand
    if (this.toggleButton) {
      addDOMListener(this.toggleButton, "click", () => this.toggle());
    }

    // Refresh files
    if (this.refreshButton) {
      addDOMListener(this.refreshButton, "click", async () => {
        try {
          await this.refresh();
        } catch (error) {
          console.error("FilePanel refresh failed", error);
        }
      });
    }

    // Tab switching
    const tabs = [this.sourcesTab, this.outputTab].filter(Boolean);
    for (const tab of tabs) {
      addDOMListener(tab, "click", () => this.switchTab(tab));
    }
  }

  /**
   * Setup AppState subscriptions
   * @private
   */
  setupStateSubscriptions() {
    if (!this.appState) return;

    // Subscribe to current session changes for auto-refresh
    const unsubscribeSession = this.appState.subscribe("session.current", (sessionId) => {
      this.setSession(sessionId);
    });

    globalLifecycleManager.addUnsubscriber(this, unsubscribeSession);

    // Subscribe to output file list changes
    const unsubscribeOutput = this.appState.subscribe("files.outputList", (files) => {
      if (this.getActiveTab()?.dataset.directory === "output") {
        renderFileList(files, this.filesContainer, {
          directory: this.getFullOutputPath(),
          isOutput: true,
          currentPath: this.currentOutputPath,
          onFolderClick: (name) => this.navigateToFolder(name),
          onBreadcrumbClick: (index) => this.navigateToBreadcrumb(index),
          onDelete: () => this.refresh(),
        });
      }
    });

    globalLifecycleManager.addUnsubscriber(this, unsubscribeOutput);

    // Subscribe to sources file list changes
    const unsubscribeSources = this.appState.subscribe("files.sourcesList", (files) => {
      if (this.getActiveTab()?.dataset.directory === "sources") {
        renderFileList(files, this.filesContainer, {
          directory: `data/files/${this.currentSessionId}/sources`,
          isOutput: false,
          headerText: "Input",
          onDelete: () => this.refresh(),
        });
      }
    });

    globalLifecycleManager.addUnsubscriber(this, unsubscribeSources);
  }

  /**
   * Toggle panel visibility
   */
  async toggle() {
    const wasCollapsed = this.panel.classList.contains("collapsed");
    this.panel.classList.toggle("collapsed");

    // Auto-refresh when opening
    if (wasCollapsed && this.currentSessionId) {
      try {
        await this.refresh();
      } catch (error) {
        console.error("FilePanel refresh failed", error);
      }
    }
  }

  /**
   * Show panel
   */
  show() {
    this.panel.classList.remove("collapsed");
  }

  /**
   * Hide panel
   */
  hide() {
    this.panel.classList.add("collapsed");
  }

  /**
   * Check if panel is visible
   *
   * @returns {boolean} True if visible
   */
  isVisible() {
    return !this.panel.classList.contains("collapsed");
  }

  /**
   * Switch tab (sources/output)
   * MODIFIED Phase 1: Reset currentOutputPath when switching tabs
   *
   * @param {HTMLElement} tab - Tab element to activate
   */
  async switchTab(tab) {
    const tabs = [this.sourcesTab, this.outputTab].filter(Boolean);
    const dirType = tab.dataset.directory;

    // Update active tab styling
    for (const t of tabs) {
      t.classList.remove("active");
    }
    tab.classList.add("active");

    // Only load files if there's an active session
    if (!this.currentSessionId) {
      return;
    }

    // Phase 1: Reset output path when switching to any tab
    this.currentOutputPath = "";

    // Determine full directory path
    let directory;
    if (dirType === "sources") {
      directory = `data/files/${this.currentSessionId}/sources`;
    } else if (dirType === "output") {
      directory = `data/files/${this.currentSessionId}/output`;
    }

    // Load files into AppState (rendering happens via subscription)
    const listType = dirType === "output" ? "output" : "sources";
    try {
      await loadFilesIntoState(this.appState, directory, listType);
    } catch (error) {
      console.error("Failed to load files for tab switch", error);
    }
  }

  /**
   * Set current session and update file paths
   *
   * @param {string|null} sessionId - Session ID (null to clear)
   */
  async setSession(sessionId) {
    this.currentSessionId = sessionId;

    // Refresh current tab with new session context
    if (sessionId) {
      const activeTab = this.getActiveTab();
      if (activeTab) {
        await this.switchTab(activeTab);
      }
    }
  }

  /**
   * Get currently active tab
   * @private
   *
   * @returns {HTMLElement|null} Active tab element
   */
  getActiveTab() {
    return [this.sourcesTab, this.outputTab].find((tab) => tab?.classList.contains("active")) || this.sourcesTab;
  }

  /**
   * Phase 1: Navigate into a folder (Output tab only)
   * Updates currentOutputPath and reloads files for the new directory
   *
   * @param {string} folderName - Name of folder to enter
   */
  async navigateToFolder(folderName) {
    if (!folderName) return;

    // Append folder to current path
    this.currentOutputPath = this.currentOutputPath ? `${this.currentOutputPath}/${folderName}` : folderName;

    // Reload files for new path
    await this.refresh();
  }

  /**
   * Phase 1: Navigate up one level in the folder hierarchy
   * Goes from "code/python" to "code", or from "code" to "" (root)
   */
  async navigateUp() {
    if (!this.currentOutputPath) return; // Already at root

    const segments = this.currentOutputPath.split("/").filter(Boolean);
    // Remove last segment
    segments.pop();
    this.currentOutputPath = segments.join("/");

    await this.refresh();
  }

  /**
   * Phase 1: Navigate to a specific breadcrumb segment
   * Index 0 = root, index 1 = first folder, etc.
   *
   * @param {number} index - Breadcrumb segment index (0 = root)
   */
  async navigateToBreadcrumb(index) {
    if (index === 0) {
      // Navigate to root
      this.currentOutputPath = "";
    } else {
      // Reconstruct path up to segment
      const segments = this.currentOutputPath.split("/").filter(Boolean);
      this.currentOutputPath = segments.slice(0, index).join("/");
    }

    await this.refresh();
  }

  /**
   * Phase 1: Get full path for current output directory
   * Combines session ID, output directory, and current subdirectory path
   *
   * @returns {string} Full path including session ID and subdirectory
   */
  getFullOutputPath() {
    if (!this.currentSessionId) {
      return "";
    }
    const basePath = `data/files/${this.currentSessionId}/output`;
    return this.currentOutputPath ? `${basePath}/${this.currentOutputPath}` : basePath;
  }

  /**
   * Phase 1: Get breadcrumb segments for current path
   * Returns array of path segments for breadcrumb rendering
   * Example: "code/python" -> ["code", "python"]
   *
   * @returns {string[]} Array of path segments (empty array if at root)
   */
  getBreadcrumbSegments() {
    if (!this.currentOutputPath) {
      return [];
    }
    return this.currentOutputPath.split("/").filter(Boolean);
  }

  /**
   * Refresh files in current directory
   * MODIFIED Phase 1: Use getFullOutputPath() for Output tab
   */
  async refresh() {
    if (!this.currentSessionId) return;

    const activeTab = this.getActiveTab();
    const dirType = activeTab?.dataset.directory || "sources";

    // Phase 1: Use getFullOutputPath() for output tab to support subdirectory navigation
    let directory;
    if (dirType === "output") {
      directory = this.getFullOutputPath();
    } else {
      directory = `data/files/${this.currentSessionId}/${dirType}`;
    }

    // Load files into AppState (rendering happens via subscription)
    const listType = dirType === "output" ? "output" : "sources";
    try {
      return await loadFilesIntoState(this.appState, directory, listType);
    } catch (error) {
      console.error("FilePanel refresh failed", error);
      throw error;
    }
  }

  /**
   * Load files for current session
   * Uses AppState pattern - files loaded into state, rendering via subscriptions
   */
  async loadSessionFiles() {
    if (!this.currentSessionId) return;

    const activeTab = this.getActiveTab();
    const dirType = activeTab?.dataset.directory || "sources";

    // Determine directory and list type
    let directory;
    const listType = dirType === "output" ? "output" : "sources";

    if (dirType === "output") {
      directory = this.getFullOutputPath();
    } else {
      directory = `data/files/${this.currentSessionId}/${dirType}`;
    }

    // Load files into AppState (rendering happens via subscription)
    try {
      await loadFilesIntoState(this.appState, directory, listType);
    } catch (error) {
      console.error("Failed to load session files", error);
    }
  }

  /**
   * Close all open file handles (critical before session deletion)
   * This prevents "Too many open files" errors when deleting sessions
   */
  closeAllHandles() {
    if (!this.filesContainer) return;

    // Clear any file preview elements that might hold references
    const previews = this.filesContainer.querySelectorAll("[data-file-handle]");
    previews.forEach((preview) => {
      // Remove DOM elements that might hold file handles
      preview.remove();
    });
  }

  /**
   * Clear files list
   */
  clear() {
    if (this.filesContainer) {
      this.filesContainer.innerHTML = "";
    }
  }

  /**
   * Add a file to the list (called when file is uploaded)
   * @param {Object} fileData - File data object
   */
  addFile(_fileData) {
    // Refresh the file list to show the new file
    this.refresh().catch((error) => {
      console.error("FilePanel refresh failed after addFile", error);
    });
  }

  /**
   * Update file status (e.g., uploading, loaded, error)
   * @param {string} fileId - File ID
   * @param {string} status - New status
   */
  async updateFile(_fileId, status) {
    // If upload is complete, refresh the list
    if (status === "loaded") {
      try {
        await this.refresh();
      } catch (error) {
        console.error("FilePanel refresh failed after updateFile", error);
      }
    }
  }

  /**
   * Remove a file from the list
   * @param {string} fileId - File ID to remove
   */
  async removeFile(_fileId) {
    try {
      await this.refresh();
    } catch (error) {
      console.error("FilePanel refresh failed after removeFile", error);
    }
  }

  /**
   * Get panel element
   *
   * @returns {HTMLElement} The panel element
   */
  getPanel() {
    return this.panel;
  }

  /**
   * Get files container element
   *
   * @returns {HTMLElement} The files container element
   */
  getFilesContainer() {
    return this.filesContainer;
  }

  /**
   * Get current session ID
   * Reads from AppState if available, falls back to internal state
   *
   * @returns {string|null} Current session ID
   */
  getCurrentSession() {
    if (this.appState) {
      return this.appState.getState("session.current");
    }
    return this.currentSessionId;
  }

  /**
   * Destroy component and clean up subscriptions
   */
  destroy() {
    // Close all file handles first
    this.closeAllHandles();

    // Optionally unmount if not handled by global unmount
    if (this._lifecycle) {
      ComponentLifecycle.unmount(this, globalLifecycleManager);
    }
  }
}
