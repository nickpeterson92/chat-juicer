/**
 * File Manager
 * Manages file operations UI (listing, deleting, uploading)
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
 * Track active directory tab
 * For session-aware mode, this will be "data/files/{session_id}"
 */
export let activeFilesDirectory = "sources";

/**
 * Set the active files directory
 * @param {string} directory - Directory name
 */
export function setActiveFilesDirectory(directory) {
  activeFilesDirectory = directory;
}

/**
 * Load session-specific files
 * @param {string} sessionId - Session ID to load files for
 * @param {HTMLElement} container - Container element to render files into
 */
export async function loadSessionFiles(sessionId, container) {
  if (!container || !sessionId) return;

  const sessionDirectory = `data/files/${sessionId}/sources`;
  await loadFiles(sessionDirectory, container);
}

/**
 * Load files from a directory and display them
 * @param {string} directory - Directory to load files from
 * @param {HTMLElement} container - Container element to render files into (optional, defaults to elements.filesContainer)
 */
export async function loadFiles(directory = "sources", container = null) {
  // Dynamic import to avoid circular dependency with index.js
  const { elements } = await import("./dom-manager.js");

  // Use provided container or default to elements.filesContainer
  const targetContainer = container || elements.filesContainer;

  if (!targetContainer) return;

  targetContainer.innerHTML = `<div class="files-loading">${MSG_LOADING_FILES}</div>`;

  try {
    const result = await window.electronAPI.listDirectory(directory);

    if (!result.success) {
      targetContainer.innerHTML = `<div class="files-error">${MSG_FILES_ERROR.replace("{error}", result.error)}</div>`;
      return;
    }

    const files = result.files || [];

    if (files.length === 0) {
      // Display directory-specific empty message
      const dirName = directory.includes("/output") ? "output/" : "sources/";
      targetContainer.innerHTML = `<div class="files-empty">${MSG_NO_FILES.replace("{directory}", dirName)}</div>`;
      return;
    }

    // Clear and populate with file items
    targetContainer.innerHTML = "";

    files.forEach((file) => {
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
        handleDeleteFile(file.name, activeFilesDirectory);
      };

      // Click handler to open file
      fileItem.onclick = async () => {
        try {
          const result = await window.electronAPI.openFile(activeFilesDirectory, file.name);
          if (!result.success) {
            showToast(`Failed to open file: ${result.error}`, "error", 4000);
          }
        } catch (error) {
          window.electronAPI.log("error", "Failed to open file", { filename: file.name, error: error.message });
          showToast(`Error opening file: ${error.message}`, "error", 4000);
        }
      };

      fileItem.appendChild(fileIcon);
      fileItem.appendChild(fileName);
      fileItem.appendChild(fileSize);
      fileItem.appendChild(deleteBtn);

      targetContainer.appendChild(fileItem);
    });
  } catch (error) {
    window.electronAPI.log("error", "Failed to load source files", { error: error.message });
    targetContainer.innerHTML = `<div class="files-error">${MSG_FILES_LOAD_FAILED}</div>`;
  }
}

/**
 * Handle file deletion
 * @param {string} filename - Name of file to delete
 * @param {string} directory - Directory containing the file
 */
async function handleDeleteFile(filename, directory = "sources") {
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
      // Refresh the files list
      loadFiles(directory);
    } else {
      showToast(MSG_FILE_DELETE_FAILED.replace("{filename}", filename).replace("{error}", result.error), "error", 4000);
    }
  } catch (error) {
    window.electronAPI.log("error", "Failed to delete file", { filename, error: error.message });
    showToast(MSG_FILE_DELETE_ERROR.replace("{filename}", filename), "error", 4000);
  }
}
