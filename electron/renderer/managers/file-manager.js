/**
 * File Manager
 * Manages file operations UI (listing, deleting, uploading)
 * Uses AppState for reactive file list management
 */

import {
  MSG_DELETE_FILE_CONFIRM,
  MSG_FILE_DELETE_ERROR,
  MSG_FILE_DELETE_FAILED,
  MSG_FILE_DELETED,
  MSG_FILES_ERROR,
  MSG_FILES_LOAD_FAILED,
  MSG_LOADING_FILES,
  MSG_NO_FILE_SELECTED,
  MSG_NO_FILES,
} from "../config/constants.js";
import { formatFileSize, getFileIcon } from "../utils/file-utils.js";
import { showToast } from "../utils/toast.js";

/**
 * Load files from a directory into AppState
 * @param {Object} appState - AppState instance
 * @param {string} directory - Directory to load files from
 * @param {'sources'|'output'} listType - Type of file list to update
 * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
 */
export async function loadFilesIntoState(appState, directory, listType = "sources") {
  if (!appState) {
    console.error("[FileManager] loadFilesIntoState: appState is required");
    return { success: false, error: "appState is required" };
  }

  // Set loading state
  appState.setState("files.isLoadingFiles", true);

  try {
    const result = await window.electronAPI.listDirectory(directory);

    if (!result.success) {
      // Clear the list on error
      const stateKey = listType === "output" ? "files.outputList" : "files.sourcesList";
      appState.setState(stateKey, []);
      appState.setState("files.isLoadingFiles", false);
      return { success: false, error: result.error };
    }

    const files = result.files || [];
    const stateKey = listType === "output" ? "files.outputList" : "files.sourcesList";
    appState.setState(stateKey, files);
    appState.setState("files.isLoadingFiles", false);

    return { success: true, files };
  } catch (error) {
    window.electronAPI?.log("error", "Failed to load files into state", { directory, error: error.message });
    appState.setState("files.isLoadingFiles", false);
    return { success: false, error: error.message };
  }
}

/**
 * Render a file list into a container element
 * Pure render function - no side effects on state
 * @param {Array<Object>} files - Array of file objects
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} options - Render options
 * @param {string} options.directory - Directory path for file operations
 * @param {boolean} options.isOutput - Whether this is output directory
 * @param {boolean} options.isWelcomePage - Whether rendering on welcome page
 * @param {boolean} options.isLoading - Show loading state
 * @param {string} options.error - Error message to display
 * @param {Function} options.onDelete - Callback when file is deleted
 */
export function renderFileList(files, container, options = {}) {
  if (!container) {
    console.error("[FileManager] renderFileList: container is required");
    return;
  }

  const {
    directory = "sources",
    isOutput = false,
    isWelcomePage = false,
    isLoading = false,
    error = null,
    onDelete = null,
  } = options;

  // Loading state
  if (isLoading) {
    container.innerHTML = `<div class="files-loading">${MSG_LOADING_FILES}</div>`;
    return;
  }

  // Error state
  if (error) {
    container.innerHTML = `<div class="files-error">${MSG_FILES_ERROR.replace("{error}", error)}</div>`;
    return;
  }

  // Empty state
  if (!files || files.length === 0) {
    renderEmptyState(container, { directory, isOutput, isWelcomePage });
    return;
  }

  // Clear and populate with file items
  container.innerHTML = "";

  files.forEach((file) => {
    const fileItem = createFileItem(file, directory, container, onDelete);
    container.appendChild(fileItem);
  });
}

/**
 * Render empty state for file list
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Options for empty state display
 */
function renderEmptyState(container, options = {}) {
  const { directory = "sources", isOutput = false, isWelcomePage = false } = options;
  const dirName = directory.includes("/output") ? "output/" : "sources/";
  const isChatPage = container.id === "files-container";

  if (isWelcomePage) {
    // Show drag-and-drop friendly empty state on welcome page
    container.innerHTML = `
      <div class="welcome-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-30 mb-3">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <p class="text-sm text-gray-500 dark:text-gray-400">Drag and drop files here</p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Files will be uploaded to this session</p>
      </div>
    `;
  } else if (isChatPage) {
    // Compact empty state for chat page file panel
    if (isOutput) {
      // Output directory - show generation message
      container.innerHTML = `
        <div class="files-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-20 mb-2 mx-auto">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"/>
          </svg>
          <p class="text-xs text-gray-400 dark:text-gray-500 text-center">No generated files yet</p>
          <p class="text-xs text-gray-500 dark:text-gray-600 text-center mt-1">Ask me to generate documents</p>
        </div>
      `;
    } else {
      // Sources directory - show upload message
      container.innerHTML = `
        <div class="files-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-20 mb-2 mx-auto">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <p class="text-xs text-gray-400 dark:text-gray-500 text-center">No source files found</p>
          <p class="text-xs text-gray-500 dark:text-gray-600 text-center mt-1">Drag files onto the canvas to upload</p>
        </div>
      `;
    }
  } else {
    // Fallback message for other containers
    container.innerHTML = `<div class="files-empty">${MSG_NO_FILES.replace("{directory}", dirName)}</div>`;
  }
}

/**
 * Create a file item element
 * @param {Object} file - File object with name, size properties
 * @param {string} directory - Directory path for operations
 * @param {HTMLElement} container - Parent container (for refresh after delete)
 * @param {Function} onDelete - Optional callback after delete
 * @returns {HTMLElement}
 */
function createFileItem(file, directory, container, onDelete = null) {
  const fileItem = document.createElement("div");
  fileItem.className = "file-item";

  const fileIcon = document.createElement("span");
  fileIcon.className = "file-icon";
  fileIcon.innerHTML = getFileIcon(file.name);

  const fileName = document.createElement("span");
  fileName.className = "file-name";
  fileName.textContent = file.name;
  fileName.title = file.name;

  const fileSize = document.createElement("span");
  fileSize.className = "file-size";
  fileSize.textContent = formatFileSize(file.size || 0);

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "file-delete-btn";
  deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`;
  deleteBtn.title = "Delete file";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    handleDeleteFile(file.name, directory, container, onDelete);
  };

  // Click handler to open file
  fileItem.onclick = async () => {
    try {
      const result = await window.electronAPI.openFile(directory, file.name);
      if (!result.success) {
        showToast(`Failed to open file: ${result.error}`, "error", 4000);
      }
    } catch (error) {
      window.electronAPI?.log("error", "Failed to open file", { filename: file.name, error: error.message });
      showToast(`Error opening file: ${error.message}`, "error", 4000);
    }
  };

  fileItem.appendChild(fileIcon);
  fileItem.appendChild(fileName);
  fileItem.appendChild(fileSize);
  fileItem.appendChild(deleteBtn);

  return fileItem;
}

/**
 * Handle file deletion
 * @param {string} filename - Name of file to delete
 * @param {string} directory - Directory containing the file
 * @param {HTMLElement} container - Container element to refresh after deletion
 * @param {Function} onDelete - Optional callback after successful delete
 */
async function handleDeleteFile(filename, directory = "sources", container = null, onDelete = null) {
  if (!filename) {
    showToast(MSG_NO_FILE_SELECTED, "error", 3000);
    return;
  }

  if (!confirm(MSG_DELETE_FILE_CONFIRM.replace("{filename}", filename))) {
    return;
  }

  try {
    const result = await window.electronAPI.deleteFile(directory, filename);

    if (result.success) {
      showToast(MSG_FILE_DELETED.replace("{filename}", filename), "success", 3000);
      // Call onDelete callback if provided (for AppState updates)
      if (typeof onDelete === "function") {
        onDelete(filename, directory);
      } else if (container) {
        // Fallback: refresh the files list with legacy method
        loadFiles(directory, container);
      }
    } else {
      // If file doesn't exist (ENOENT), just refresh the list without error
      if (result.error?.includes("ENOENT")) {
        console.log(`File ${filename} already deleted, refreshing list`);
        if (typeof onDelete === "function") {
          onDelete(filename, directory);
        } else if (container) {
          loadFiles(directory, container);
        }
      } else {
        showToast(
          MSG_FILE_DELETE_FAILED.replace("{filename}", filename).replace("{error}", result.error),
          "error",
          4000
        );
      }
    }
  } catch (error) {
    window.electronAPI?.log("error", "Failed to delete file", { filename, error: error.message });

    // If file doesn't exist, just refresh the list without error
    if (error.message?.includes("ENOENT")) {
      console.log(`File ${filename} already deleted, refreshing list`);
      if (typeof onDelete === "function") {
        onDelete(filename, directory);
      } else if (container) {
        loadFiles(directory, container);
      }
    } else {
      showToast(MSG_FILE_DELETE_ERROR.replace("{filename}", filename), "error", 4000);
    }
  }
}

// ============================================================================
// LEGACY FUNCTIONS (Backward Compatibility)
// These functions maintain the old API during migration
// ============================================================================

/**
 * Load session-specific files
 * @param {string} sessionId - Session ID to load files for
 * @param {HTMLElement} container - Container element to render files into
 * @deprecated Use loadFilesIntoState() with AppState subscriptions instead
 */
export async function loadSessionFiles(sessionId, container) {
  if (!container || !sessionId) return;

  const sessionDirectory = `data/files/${sessionId}/sources`;
  await loadFiles(sessionDirectory, container);
}

/**
 * Load files from a directory and display them
 * @param {string} directory - Directory to load files from
 * @param {HTMLElement} container - Container element to render files into
 * @deprecated Use loadFilesIntoState() + renderFileList() with AppState subscriptions instead
 */
export async function loadFiles(directory = "sources", container = null) {
  // Dynamic import to avoid circular dependency with index.js
  const { elements } = await import("./dom-manager.js");

  // Use provided container or default to elements.filesContainer
  const targetContainer = container || elements.filesContainer;

  if (!targetContainer) {
    console.error("[FileManager] loadFiles: No container element found", { directory, container, elements });
    return;
  }

  console.log("[FileManager] loadFiles called:", { directory, containerId: targetContainer.id });

  // Show loading state
  renderFileList([], targetContainer, { directory, isLoading: true });

  try {
    const result = await window.electronAPI.listDirectory(directory);

    if (!result.success) {
      renderFileList([], targetContainer, { directory, error: result.error });
      return;
    }

    const files = result.files || [];
    const isOutput = directory.includes("/output");
    const isWelcomePage = targetContainer.id === "welcome-files-container";

    renderFileList(files, targetContainer, {
      directory,
      isOutput,
      isWelcomePage,
    });
  } catch (error) {
    window.electronAPI?.log("error", "Failed to load source files", { error: error.message });
    renderFileList([], targetContainer, { directory, error: MSG_FILES_LOAD_FAILED });
  }
}
