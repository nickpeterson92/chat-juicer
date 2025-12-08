/**
 * File Manager
 * Manages file operations UI (listing, deleting, uploading)
 * Uses AppState for reactive file list management
 *
 * STATE MANAGEMENT ARCHITECTURE (AppState Pattern):
 * - Primary method: loadFilesIntoState() → AppState (lines 39-70)
 * - Pure render function: renderFileList() → DOM (lines 88-147)
 *
 * REACTIVE PATTERN:
 * 1. Load files into state: `await loadFilesIntoState(appState, directory, 'sources')`
 * 2. Subscribe to changes: `appState.subscribe('files.sourcesList', (files) => { renderFileList(files, container, options) })`
 * 3. Render is automatic when state changes
 *
 * LEGACY METHODS REMOVED:
 * - loadFiles() - DELETED, use loadFilesIntoState() + subscriptions
 * - loadSessionFiles() - DELETED, use loadFilesIntoState() + subscriptions
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
 * @param {string} options.currentPath - Current relative path (for breadcrumb, e.g., "code/python")
 * @param {Function} options.onFolderClick - Callback when folder is clicked
 * @param {Function} options.onBreadcrumbClick - Callback when breadcrumb segment is clicked
 * @param {string} options.headerText - Static header text (e.g., "Input") when not using breadcrumb
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
    // Phase 2: Explorer options for Output tab
    currentPath = "",
    onFolderClick = null,
    onBreadcrumbClick = null,
    // Static header for non-navigable tabs (e.g., Input)
    headerText = null,
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

  // Clear container
  container.innerHTML = "";

  // Phase 2: Render breadcrumb for Output tab with explorer mode
  if (isOutput && onBreadcrumbClick) {
    renderBreadcrumb(currentPath, container, onBreadcrumbClick);
  } else if (headerText) {
    // Render static header for non-navigable tabs (consistent with breadcrumb style)
    renderStaticHeader(headerText, container);
  }

  // Empty state
  if (!files || files.length === 0) {
    renderEmptyState(container, { directory, isOutput, isWelcomePage });
    return;
  }

  // Render files and folders
  files.forEach((file) => {
    let fileItem;

    if (file.type === "folder" && onFolderClick) {
      // Phase 2: Render as clickable folder
      fileItem = createFolderItem(file, onFolderClick);
    } else {
      // Render as regular file
      fileItem = createFileItem(file, directory, container, onDelete);
    }

    container.appendChild(fileItem);
  });
}

/**
 * Phase 2: Create a folder item element with navigation capability
 * @param {Object} folder - Folder FileInfo object
 * @param {Function} onClick - Callback when folder is clicked
 * @returns {HTMLElement}
 */
export function createFolderItem(folder, onClick) {
  const folderItem = document.createElement("div");
  folderItem.className = "file-item folder-item";
  folderItem.setAttribute("role", "button");
  folderItem.setAttribute("tabindex", "0");
  folderItem.setAttribute("aria-label", `Open ${folder.name} folder, ${folder.file_count || 0} items`);

  const folderIcon = document.createElement("span");
  folderIcon.className = "file-icon folder-icon";
  folderIcon.innerHTML = getFolderIcon();

  const folderName = document.createElement("span");
  folderName.className = "file-name folder-name";
  folderName.textContent = folder.name;
  folderName.title = folder.name;

  const itemCount = document.createElement("span");
  itemCount.className = "folder-count";
  itemCount.textContent = `${folder.file_count || 0} items`;

  // Click and keyboard handlers
  const handleOpen = () => onClick(folder.name);
  folderItem.onclick = handleOpen;
  folderItem.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  };

  folderItem.appendChild(folderIcon);
  folderItem.appendChild(folderName);
  folderItem.appendChild(itemCount);

  return folderItem;
}

/**
 * Phase 2: Get folder icon SVG
 * @returns {string} SVG markup for folder icon
 */
export function getFolderIcon() {
  const strokeColor = getComputedStyle(document.documentElement).getPropertyValue("--color-text-secondary").trim();

  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>`;
}

/**
 * Phase 2: Render breadcrumb navigation at top of container
 * @param {string} currentPath - Current relative path (e.g., "code/python")
 * @param {HTMLElement} container - Container to render breadcrumb into
 * @param {Function} onNavigate - Callback when breadcrumb segment clicked
 */
export function renderBreadcrumb(currentPath, container, onNavigate) {
  // Remove existing breadcrumb if present
  const existingBreadcrumb = container.querySelector(".breadcrumb-nav");
  if (existingBreadcrumb) {
    existingBreadcrumb.remove();
  }

  const breadcrumbContainer = document.createElement("div");
  breadcrumbContainer.className = "breadcrumb-nav";
  breadcrumbContainer.setAttribute("role", "navigation");
  breadcrumbContainer.setAttribute("aria-label", "File path");

  // Root segment (Output/)
  const isAtRoot = !currentPath;
  const rootSegment = createBreadcrumbSegment("Output", 0, onNavigate, isAtRoot);
  breadcrumbContainer.appendChild(rootSegment);

  // Path segments
  if (currentPath) {
    const segments = currentPath.split("/").filter(Boolean);
    segments.forEach((segment, index) => {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = "/";
      separator.setAttribute("aria-hidden", "true");

      const isLast = index === segments.length - 1;
      const segmentEl = createBreadcrumbSegment(segment, index + 1, onNavigate, isLast);

      breadcrumbContainer.appendChild(separator);
      breadcrumbContainer.appendChild(segmentEl);
    });
  }

  container.prepend(breadcrumbContainer);
}

/**
 * Phase 2: Create a single breadcrumb segment
 * @param {string} text - Display text
 * @param {number} index - Segment index (0 = root)
 * @param {Function} onNavigate - Click handler
 * @param {boolean} isActive - Whether this is the current segment
 * @returns {HTMLElement}
 */
function createBreadcrumbSegment(text, index, onNavigate, isActive = false) {
  const segment = document.createElement("button");
  segment.className = `breadcrumb-segment ${isActive ? "active" : ""}`;
  segment.textContent = text;
  segment.setAttribute("aria-current", isActive ? "location" : "false");

  if (!isActive) {
    segment.onclick = () => onNavigate(index);
  } else {
    // Active segment not clickable
    segment.disabled = true;
  }

  return segment;
}

/**
 * Render a static header (non-navigable) consistent with breadcrumb styling
 * Used for Input tab to match Output tab's visual appearance
 * @param {string} headerText - Header text to display (e.g., "Input")
 * @param {HTMLElement} container - Container to render header into
 */
function renderStaticHeader(headerText, container) {
  // Remove existing header if present
  const existingHeader = container.querySelector(".breadcrumb-nav");
  if (existingHeader) {
    existingHeader.remove();
  }

  const headerContainer = document.createElement("div");
  headerContainer.className = "breadcrumb-nav";
  headerContainer.setAttribute("role", "heading");
  headerContainer.setAttribute("aria-level", "2");

  const headerSegment = document.createElement("span");
  headerSegment.className = "breadcrumb-segment active";
  headerSegment.textContent = headerText;

  headerContainer.appendChild(headerSegment);
  container.prepend(headerContainer);
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
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-20 mb-2 mx-auto">
            <path d="M4.226 20.925A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.127"/>
            <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
            <path d="m5 11-3 3"/>
            <path d="m5 17-3-3h10"/>
          </svg>
          <p class="text-xs text-gray-400 dark:text-gray-500 text-center">No output files yet</p>
          <p class="text-xs text-gray-500 dark:text-gray-600 text-center mt-1">Ask me to generate documents</p>
        </div>
      `;
    } else {
      // Input directory - show upload message
      container.innerHTML = `
        <div class="files-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-20 mb-2 mx-auto">
            <path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/>
            <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
            <path d="M2 15h10"/>
            <path d="m9 18 3-3-3-3"/>
          </svg>
          <p class="text-xs text-gray-400 dark:text-gray-500 text-center">No input files found</p>
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
      } else {
        console.warn(
          "[FileManager] handleDeleteFile: No onDelete callback provided. File deleted but UI may not refresh."
        );
      }
    } else {
      // If file doesn't exist (ENOENT), just refresh the list without error
      if (result.error?.includes("ENOENT")) {
        console.log(`File ${filename} already deleted, refreshing list`);
        if (typeof onDelete === "function") {
          onDelete(filename, directory);
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
      }
    } else {
      showToast(MSG_FILE_DELETE_ERROR.replace("{filename}", filename), "error", 4000);
    }
  }
}
