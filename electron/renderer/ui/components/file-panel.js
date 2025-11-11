/**
 * FilePanel - UI component for file management
 * Wraps existing DOM structure and integrates with file-manager.js
 */

import { loadFiles } from "../../managers/file-manager.js";

export class FilePanel {
  /**
   * @param {HTMLElement} panelElement - Existing files panel element (#files-panel)
   * @param {HTMLElement} toggleButton - Panel toggle button (#open-files-btn)
   * @param {HTMLElement} filesContainer - Files list container (#files-container)
   * @param {HTMLElement} refreshButton - Refresh button (#refresh-files-btn)
   * @param {HTMLElement} sourcesTab - Sources tab button (#tab-sources)
   * @param {HTMLElement} outputTab - Output tab button (#tab-output)
   */
  constructor(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab) {
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

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    // Toggle panel collapse/expand
    if (this.toggleButton) {
      this.toggleButton.addEventListener("click", () => {
        this.toggle();
      });
    }

    // Refresh files
    if (this.refreshButton) {
      this.refreshButton.addEventListener("click", () => {
        this.refresh();
      });
    }

    // Tab switching
    const tabs = [this.sourcesTab, this.outputTab].filter(Boolean);
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        this.switchTab(tab);
      });
    }
  }

  /**
   * Toggle panel visibility
   */
  toggle() {
    const wasCollapsed = this.panel.classList.contains("collapsed");
    this.panel.classList.toggle("collapsed");

    // Auto-refresh when opening
    if (wasCollapsed && this.currentSessionId) {
      this.refresh();
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
   *
   * @param {HTMLElement} tab - Tab element to activate
   */
  switchTab(tab) {
    const tabs = [this.sourcesTab, this.outputTab].filter(Boolean);
    let directory = tab.dataset.directory;

    // Update active tab styling
    for (const t of tabs) {
      t.classList.remove("active");
    }
    tab.classList.add("active");

    // Only load files if there's an active session
    if (!this.currentSessionId) {
      console.log(`📂 Tab switched to ${tab.dataset.directory} (no session, not loading files)`);
      return;
    }

    // Use session-specific directories
    if (directory === "sources") {
      directory = `data/files/${this.currentSessionId}/sources`;
    } else if (directory === "output") {
      directory = `data/files/${this.currentSessionId}/output`;
    }

    // Load files from directory
    console.log(`📂 Switching to ${tab.dataset.directory} tab, directory: ${directory}`);
    loadFiles(directory, this.filesContainer);
  }

  /**
   * Set current session and update file paths
   *
   * @param {string|null} sessionId - Session ID (null to clear)
   */
  setSession(sessionId) {
    console.log("📌 FilePanel.setSession() called:", sessionId);
    this.currentSessionId = sessionId;

    // Refresh current tab with new session context
    if (sessionId) {
      const activeTab = this.getActiveTab();
      console.log("📌 FilePanel active tab:", activeTab?.dataset.directory);
      if (activeTab) {
        this.switchTab(activeTab);
      }
    } else {
      console.log("📌 FilePanel session cleared");
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
   * Refresh files in current directory
   */
  refresh() {
    if (!this.currentSessionId) {
      console.warn("⚠️ FilePanel.refresh() called but no currentSessionId set");
      return;
    }

    const activeTab = this.getActiveTab();
    const dirType = activeTab?.dataset.directory || "sources";
    const directory = `data/files/${this.currentSessionId}/${dirType}`;

    console.log(`🔄 Refreshing files panel (${dirType} tab)`, {
      sessionId: this.currentSessionId,
      directory,
      containerId: this.filesContainer?.id,
    });
    loadFiles(directory, this.filesContainer);
  }

  /**
   * Load files for current session
   */
  loadSessionFiles() {
    if (!this.currentSessionId) return;

    const activeTab = this.getActiveTab();
    const dirType = activeTab?.dataset.directory || "sources";
    const directory = `data/files/${this.currentSessionId}/${dirType}`;

    loadFiles(directory, this.filesContainer);
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

    // Force garbage collection by removing all event listeners
    const clonedContainer = this.filesContainer.cloneNode(false);
    if (this.filesContainer.parentNode) {
      this.filesContainer.parentNode.replaceChild(clonedContainer, this.filesContainer);
      this.filesContainer = clonedContainer;
    }

    console.log("✅ FilePanel: All file handles closed");
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
  addFile(fileData) {
    // For now, just refresh the file list
    // This will trigger a backend call to get the updated file list
    console.log("📄 File added, refreshing file panel:", fileData);
    this.refresh();
  }

  /**
   * Update file status (e.g., uploading, loaded, error)
   * @param {string} fileId - File ID
   * @param {string} status - New status
   */
  updateFile(fileId, status) {
    console.log(`📄 File ${fileId} status updated to: ${status}`);
    // If upload is complete, refresh the list
    if (status === "loaded") {
      this.refresh();
    }
  }

  /**
   * Remove a file from the list
   * @param {string} fileId - File ID to remove
   */
  removeFile(fileId) {
    console.log("📄 File removed, refreshing file panel:", fileId);
    this.refresh();
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
   *
   * @returns {string|null} Current session ID
   */
  getCurrentSession() {
    return this.currentSessionId;
  }
}
