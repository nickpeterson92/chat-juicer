/**
 * FilePanel - UI component for file management
 * Wraps existing DOM structure and integrates with file-manager.js
 */

import { loadFiles, setActiveFilesDirectory } from "../../managers/file-manager.js";

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

    // Update active directory and load files
    console.log(`📂 Switching to ${tab.dataset.directory} tab, directory: ${directory}`);
    setActiveFilesDirectory(directory);
    loadFiles(directory, this.filesContainer);
  }

  /**
   * Set current session and update file paths
   *
   * @param {string|null} sessionId - Session ID (null to clear)
   */
  setSession(sessionId) {
    this.currentSessionId = sessionId;

    // Refresh current tab with new session context
    if (sessionId) {
      const activeTab = this.getActiveTab();
      if (activeTab) {
        this.switchTab(activeTab);
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
   * Refresh files in current directory
   */
  refresh() {
    if (!this.currentSessionId) return;

    const activeTab = this.getActiveTab();
    const dirType = activeTab?.dataset.directory || "sources";
    const directory = `data/files/${this.currentSessionId}/${dirType}`;

    console.log(`🔄 Refreshing files panel (${dirType} tab)`);
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
   * Clear files list
   */
  clear() {
    if (this.filesContainer) {
      this.filesContainer.innerHTML = "";
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
   *
   * @returns {string|null} Current session ID
   */
  getCurrentSession() {
    return this.currentSessionId;
  }
}
