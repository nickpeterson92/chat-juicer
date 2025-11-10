/**
 * FilePanel - UI component for file management
 * Self-contained component that manages file list display and interactions
 */

import { findFileElement, renderFileList, updateFileStatus } from "../renderers/file-list-renderer.js";

export class FilePanel {
  /**
   * @param {Object} fileService - File service for file operations
   * @param {Object} domAdapter - DOM adapter for rendering
   */
  constructor(fileService, domAdapter) {
    this.fileService = fileService;
    this.dom = domAdapter;
    this.element = null;
    this.fileListContainer = null;
    this.files = [];
    this.isVisible = true;
  }

  /**
   * Render the file panel component
   *
   * @returns {HTMLElement} The rendered element
   */
  render() {
    const container = this.dom.createElement("div");
    this.dom.addClass(container, "file-panel");

    // Header with title and toggle
    const header = this.dom.createElement("div");
    this.dom.addClass(header, "file-panel-header");

    const title = this.dom.createElement("h3");
    this.dom.setTextContent(title, "Session Files");
    this.dom.appendChild(header, title);

    const toggleBtn = this.dom.createElement("button");
    this.dom.addClass(toggleBtn, "file-panel-toggle");
    this.dom.setTextContent(toggleBtn, "▼");
    this.dom.setAttribute(toggleBtn, "aria-label", "Toggle file panel");
    this.dom.appendChild(header, toggleBtn);

    this.dom.appendChild(container, header);

    // File list container
    const listContainer = this.dom.createElement("div");
    this.dom.addClass(listContainer, "file-list-container");
    this.dom.appendChild(container, listContainer);

    // Upload button
    const uploadBtn = this.dom.createElement("button");
    this.dom.addClass(uploadBtn, "file-upload-button");
    this.dom.setTextContent(uploadBtn, "+ Upload Files");
    this.dom.appendChild(container, uploadBtn);

    // Store references
    this.element = container;
    this.fileListContainer = listContainer;

    // Setup event listeners
    this.setupEventListeners(toggleBtn, uploadBtn);

    return container;
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners(toggleBtn, uploadBtn) {
    if (toggleBtn) {
      this.dom.addEventListener(toggleBtn, "click", () => {
        this.toggleVisibility();
      });
    }

    if (uploadBtn) {
      this.dom.addEventListener(uploadBtn, "click", async () => {
        await this.handleUpload();
      });
    }

    // File item actions (using event delegation)
    if (this.fileListContainer) {
      this.dom.addEventListener(this.fileListContainer, "click", (event) => {
        const target = event.target;
        const action = this.dom.getAttribute(target, "data-action");
        const fileId = this.dom.getAttribute(target, "data-file-id");

        if (action === "remove" && fileId) {
          this.handleRemoveFile(fileId);
        } else if (action === "open" && fileId) {
          this.handleOpenFile(fileId);
        }
      });
    }
  }

  /**
   * Set file list
   *
   * @param {Array<Object>} files - Array of file objects
   */
  setFiles(files) {
    this.files = files || [];
    this.renderFileList();
  }

  /**
   * Add file to list
   *
   * @param {Object} file - File object
   */
  addFile(file) {
    this.files.push(file);
    this.renderFileList();
  }

  /**
   * Remove file from list
   *
   * @param {string} fileId - File ID
   */
  removeFile(fileId) {
    this.files = this.files.filter((f) => f.id !== fileId);
    this.renderFileList();
  }

  /**
   * Update file status
   *
   * @param {string} fileId - File ID
   * @param {string} status - New status
   */
  updateFile(fileId, status) {
    const file = this.files.find((f) => f.id === fileId);
    if (file) {
      file.status = status;

      // Update DOM element directly for better performance
      const fileElement = findFileElement(this.fileListContainer, fileId, this.dom);
      if (fileElement) {
        updateFileStatus(fileElement, status, this.dom);
      }
    }
  }

  /**
   * Render file list
   * @private
   */
  renderFileList() {
    if (!this.fileListContainer) return;

    // Clear existing content
    this.dom.setInnerHTML(this.fileListContainer, "");

    if (this.files.length === 0) {
      // Show empty state
      const emptyDiv = this.dom.createElement("div");
      this.dom.addClass(emptyDiv, "file-list-empty");
      this.dom.setTextContent(emptyDiv, "No files uploaded");
      this.dom.appendChild(this.fileListContainer, emptyDiv);
    } else {
      // Render file list
      const fragment = renderFileList(this.files, this.dom);
      this.dom.appendChild(this.fileListContainer, fragment);
    }
  }

  /**
   * Handle file upload
   * @private
   */
  async handleUpload() {
    try {
      const files = await this.fileService.selectFiles();
      if (files && files.length > 0) {
        for (const file of files) {
          this.addFile(file);
        }
      }
    } catch (error) {
      console.error("Failed to upload files:", error);
    }
  }

  /**
   * Handle file removal
   * @private
   */
  async handleRemoveFile(fileId) {
    try {
      await this.fileService.removeFile(fileId);
      this.removeFile(fileId);
    } catch (error) {
      console.error("Failed to remove file:", error);
    }
  }

  /**
   * Handle file open
   * @private
   */
  async handleOpenFile(fileId) {
    try {
      await this.fileService.openFile(fileId);
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  }

  /**
   * Toggle panel visibility
   */
  toggleVisibility() {
    this.isVisible = !this.isVisible;

    if (this.fileListContainer) {
      this.dom.setStyle(this.fileListContainer, "display", this.isVisible ? "block" : "none");
    }

    // Update toggle button
    const toggleBtn = this.dom.querySelector(this.element, ".file-panel-toggle");
    if (toggleBtn) {
      this.dom.setTextContent(toggleBtn, this.isVisible ? "▼" : "▶");
    }
  }

  /**
   * Show the panel
   */
  show() {
    if (this.element) {
      this.dom.setStyle(this.element, "display", "block");
    }
  }

  /**
   * Hide the panel
   */
  hide() {
    if (this.element) {
      this.dom.setStyle(this.element, "display", "none");
    }
  }

  /**
   * Clear all files
   */
  clear() {
    this.files = [];
    this.renderFileList();
  }

  /**
   * Get current files
   *
   * @returns {Array<Object>} Current file list
   */
  getFiles() {
    return [...this.files];
  }

  /**
   * Destroy the component and remove from DOM
   */
  destroy() {
    if (this.element) {
      this.dom.remove(this.element);
      this.element = null;
      this.fileListContainer = null;
      this.files = [];
    }
  }
}
