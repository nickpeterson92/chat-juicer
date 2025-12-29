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
  MSG_LOADING_FILES,
  MSG_NO_FILE_SELECTED,
  MSG_NO_FILES,
} from "../config/constants.js";
import { getFileBadgeInfo } from "../utils/file-icon-colors.js";
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
    useThumbnailGrid = false, // Explicit grid mode flag
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

  // Empty state handling
  if (!files || files.length === 0) {
    if (isWelcomePage) {
      // For welcome page, animate closed without removing content immediately to prevent visual snap
      updateWelcomeFileVisibility(container, false);
      return;
    }

    // For other views, clear and show empty state
    container.innerHTML = "";
    // Re-add header if needed (removed by clear)
    if (isOutput && onBreadcrumbClick) {
      renderBreadcrumb(currentPath, container, onBreadcrumbClick);
    } else if (headerText) {
      renderStaticHeader(headerText, container);
    }
    renderEmptyState(container, { directory, isOutput, isWelcomePage });
    return;
  }

  // Not empty - clear and render
  container.innerHTML = "";

  // Re-add headers after clear
  if (isOutput && onBreadcrumbClick) {
    renderBreadcrumb(currentPath, container, onBreadcrumbClick);
  } else if (headerText) {
    renderStaticHeader(headerText, container);
  }

  // Use thumbnail grid mode for welcome page OR when explicitly enabled
  if (isWelcomePage || useThumbnailGrid) {
    renderThumbnailGrid(files, container, { directory, onDelete, onFolderClick, isOutput });
    return;
  }

  // Render files and folders as list (default mode)
  const fragment = document.createDocumentFragment();
  files.forEach((file) => {
    let fileItem;

    if (file.type === "folder" && onFolderClick) {
      // Phase 2: Render as clickable folder
      fileItem = createFolderItem(file, onFolderClick);
    } else {
      // Render as regular file
      fileItem = createFileItem(file, directory, container, onDelete);
    }

    fragment.appendChild(fileItem);
  });

  container.appendChild(fragment);
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

  // Download button
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "file-download-btn";
  downloadBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  </svg>`;
  downloadBtn.title = "Download file";
  downloadBtn.onclick = async (e) => {
    e.stopPropagation();
    try {
      const result = await window.electronAPI.downloadFile(directory, file.name);
      if (result.success && result.downloadUrl) {
        // Create invisible anchor to trigger download without opening new window
        const a = document.createElement("a");
        a.href = result.downloadUrl;
        a.download = file.name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        showToast(`Failed to download: ${result.error}`, "error", 4000);
      }
    } catch (error) {
      showToast(`Error downloading file: ${error.message}`, "error", 4000);
    }
  };

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
  fileItem.appendChild(downloadBtn);
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
async function handleDeleteFile(filename, directory = "sources", _container = null, onDelete = null) {
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

/**
 * Render files as a thumbnail grid (for welcome page and file panel)
 * @param {Array<Object>} files - Array of file objects
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} options - Render options
 * @param {string} options.directory - Directory path for file operations
 * @param {Function} options.onDelete - Callback when file is deleted
 * @param {Function} options.onFolderClick - Callback when folder is clicked (for navigation)
 * @param {boolean} options.isOutput - Whether this is the output directory
 */
function renderThumbnailGrid(files, container, options = {}) {
  const { directory, onDelete, onFolderClick, isOutput = false } = options;

  // Add thumbnail mode class to container
  container.classList.add("thumbnail-mode");

  // Create grid container
  const grid = document.createElement("div");
  grid.className = "thumbnail-grid";

  // Create thumbnail cards for each file/folder
  files.forEach((file) => {
    let card;
    if (file.type === "folder") {
      // Create folder tile
      card = createFolderTile(file, onFolderClick);
    } else {
      // Create file thumbnail
      card = createThumbnailCard(file, directory, onDelete, isOutput, container);
    }
    grid.appendChild(card);
  });

  container.appendChild(grid);

  // Update visibility for welcome page animation
  updateWelcomeFileVisibility(container, files.length > 0);
}

/**
 * Create a folder tile element
 * @param {Object} folder - Folder object with name, file_count properties
 * @param {Function} onClick - Callback when folder is clicked
 * @returns {HTMLElement}
 */
function createFolderTile(folder, onClick) {
  const card = document.createElement("div");
  card.className = "thumbnail-card thumbnail-folder";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", `Open ${folder.name} folder, ${folder.file_count || 0} items`);
  card.title = `${folder.name} (${folder.file_count || 0} items)`;

  // Folder name at top
  const folderName = document.createElement("div");
  folderName.className = "thumbnail-filename";
  folderName.textContent = folder.name;

  // Folder icon (centered)
  const iconWrapper = document.createElement("div");
  iconWrapper.className = "thumbnail-icon-wrapper";
  iconWrapper.innerHTML = getFolderIcon();

  // Item count badge at bottom
  const badge = document.createElement("div");
  badge.className = "thumbnail-badge badge-folder";
  badge.textContent = `${folder.file_count || 0} items`;

  // Click handler
  const handleClick = () => {
    if (onClick) {
      onClick(folder.name);
    }
  };

  card.onclick = handleClick;
  card.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  card.appendChild(folderName);
  card.appendChild(iconWrapper);
  card.appendChild(badge);

  return card;
}

/**
 * Render pending (buffered) files as a thumbnail grid
 * These files exist in memory before session is created
 * @param {Array<Object>} pendingFiles - Array of {file, previewUrl, name, size, type}
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} appState - AppState for managing pending files
 */
export function renderPendingFilesGrid(pendingFiles, container, appState) {
  // Check empty state before clearing
  if (!pendingFiles || pendingFiles.length === 0) {
    // If it's the welcome page container, preserve content for closing animation
    if (isWelcomeFileContainer(container)) {
      updateWelcomeFileVisibility(container, false);
      return;
    }
    container.innerHTML = "";
    // Maybe render empty state here? Or just leave empty.
    return;
  }

  // Not empty - clear and render
  container.innerHTML = "";
  container.classList.add("thumbnail-mode");

  // Create grid container
  const grid = document.createElement("div");
  grid.className = "thumbnail-grid";

  // Create thumbnail cards for each pending file
  pendingFiles.forEach((pendingFile, index) => {
    const card = createPendingFileCard(pendingFile, index, appState);
    grid.appendChild(card);
  });

  container.appendChild(grid);

  // Update visibility for welcome page animation
  updateWelcomeFileVisibility(container, true);
}

// WeakMap to store close timeouts per section element (avoids expando properties on DOM)
const drawerCloseTimeouts = new WeakMap();

// Transition duration must match CSS .welcome-files-drawer transition
const DRAWER_TRANSITION_MS = 300;

/**
 * Check if a container is the welcome page file container
 * @param {HTMLElement} container
 * @returns {boolean}
 */
function isWelcomeFileContainer(container) {
  return container.id === "welcome-files-container" || container.classList.contains("welcome-files-list");
}

/**
 * Helper to manage visibility/animation of welcome page files section
 * @param {HTMLElement} container - The file list container
 * @param {boolean} hasFiles - Whether there are files to show
 */
function updateWelcomeFileVisibility(container, hasFiles) {
  // Only apply to welcome page file container
  if (!isWelcomeFileContainer(container)) return;

  const section = document.getElementById("welcome-files-drawer");
  if (!section) return;

  // Sibling Architecture: Find the Wrapper Card
  const cardWrapper = section.closest(".welcome-input-card") || document.querySelector(".welcome-input-card");
  if (!cardWrapper) return;

  // Sibling Architecture Logic:
  // Just toggle the state on the parent card.
  // CSS handles the rest (Drawer expands, Input tightens).
  if (hasFiles) {
    const existingTimeout = drawerCloseTimeouts.get(section);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      drawerCloseTimeouts.delete(section);
    }

    // Single-Fire Optimization
    if (cardWrapper.classList.contains("has-files")) {
      return;
    }

    // Trigger Expansion
    requestAnimationFrame(() => {
      cardWrapper.classList.add("has-files");
    });
  } else {
    // CLOSING sequence
    cardWrapper.classList.remove("has-files");

    // Cleanup content after transition completes
    const cleanup = () => {
      if (!cardWrapper.classList.contains("has-files")) {
        container.innerHTML = "";
      }
      drawerCloseTimeouts.delete(section);
    };

    const existingTimeout = drawerCloseTimeouts.get(section);
    if (existingTimeout) clearTimeout(existingTimeout);
    drawerCloseTimeouts.set(section, setTimeout(cleanup, DRAWER_TRANSITION_MS));
  }
}

/**
 * Shared helper to create the base structure of a file card
 * ensuring consistent styling between pending and persisted files.
 * @param {string} name - File name
 * @param {number} size - File size in bytes
 * @param {Function} onDelete - Delete handler (for source files)
 * @param {Function} onDownload - Optional download handler (for persisted files)
 * @param {Function} onPreview - Optional preview handler (for output files)
 * @param {boolean} isOutput - Whether this is an output file (shows preview instead of delete)
 */
function createCardStructure(name, size, onDelete, onDownload = null, onPreview = null, isOutput = false) {
  const ext = name.split(".").pop()?.toLowerCase() || "";

  const card = document.createElement("div");
  card.className = "thumbnail-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.title = `${name} (${formatFileSize(size)})`;

  // Filename at top
  const filename = document.createElement("div");
  filename.className = "thumbnail-filename";
  filename.textContent = name;

  // Extension badge at bottom
  const badgeInfo = getFileBadgeInfo(ext);
  const badge = document.createElement("div");
  badge.className = `thumbnail-badge ${badgeInfo.class}`;
  badge.textContent = badgeInfo.label;

  // Download button (only for persisted files)
  let downloadBtn = null;
  if (onDownload) {
    downloadBtn = document.createElement("button");
    downloadBtn.className = "thumbnail-download-btn";
    downloadBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>`;
    downloadBtn.title = "Download file";
    downloadBtn.onclick = (e) => {
      e.stopPropagation();
      onDownload(e);
    };
  }

  // Preview button for output files OR Delete button for source files
  let previewBtn = null;
  let deleteBtn = null;

  if (isOutput && onPreview) {
    // Output files: Preview button (eye icon)
    previewBtn = document.createElement("button");
    previewBtn.className = "thumbnail-preview-btn";
    previewBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`;
    previewBtn.title = "Preview file";
    previewBtn.onclick = (e) => {
      e.stopPropagation();
      onPreview(e);
    };
  } else if (onDelete) {
    // Source files: Delete button
    deleteBtn = document.createElement("button");
    deleteBtn.className = "thumbnail-delete-btn";
    deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`;
    deleteBtn.title = "Remove file";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      onDelete(e);
    };
  }

  card.appendChild(filename);
  card.appendChild(badge);
  if (downloadBtn) card.appendChild(downloadBtn);
  if (previewBtn) card.appendChild(previewBtn);
  if (deleteBtn) card.appendChild(deleteBtn);

  return { card, badge, deleteBtn, downloadBtn, previewBtn, ext };
}

/**
 * Create a thumbnail card for a pending (not yet uploaded) file
 * @param {Object} pendingFile - {file, previewUrl, name, size, type}
 * @param {number} index - Index in pending files array
 * @param {Object} appState - AppState for managing pending files
 * @returns {HTMLElement}
 */
function createPendingFileCard(pendingFile, index, appState) {
  const { name, size, type, previewUrl } = pendingFile;

  const handleDelete = () => {
    // Remove from pending files in AppState
    const currentPending = appState.getState("ui.pendingWelcomeFiles") || [];
    const newPending = currentPending.filter((_, i) => i !== index);

    // Revoke object URL to free memory
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    appState.setState("ui.pendingWelcomeFiles", newPending);
  };

  const { card, badge, ext } = createCardStructure(name, size, handleDelete);

  // Add preview based on file type
  if (type?.startsWith("image/") && previewUrl) {
    // Use existing preview URL for images
    const preview = document.createElement("div");
    preview.className = "thumbnail-preview";
    const img = document.createElement("img");
    img.src = previewUrl;
    img.alt = name;
    preview.appendChild(img);
    card.insertBefore(preview, badge);
  } else if (pendingFile.previewType === "pdf") {
    // PDF preview using File object
    import("../utils/pdf-thumbnail.js").then(({ generatePdfThumbnail }) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUrl = await generatePdfThumbnail(e.target.result);
          const preview = document.createElement("div");
          preview.className = "thumbnail-preview";
          const img = document.createElement("img");
          img.src = dataUrl;
          img.alt = name;
          preview.appendChild(img);
          card.insertBefore(preview, badge);

          // Remove icon fallback
          const existingIcon = card.querySelector(".thumbnail-icon-wrapper");
          if (existingIcon) existingIcon.remove();
        } catch (err) {
          console.warn("Failed to generate PDF thumbnail for pending file:", name, err);
        }
      };
      reader.onerror = (err) => console.warn("Failed to read PDF file for preview:", err);
      // Read file as ArrayBuffer for PDF.js
      reader.readAsArrayBuffer(pendingFile.file);
    });

    // Add temporary icon while rendering async
    const iconWrapper = document.createElement("div");
    iconWrapper.className = "thumbnail-icon-wrapper";
    iconWrapper.innerHTML = getFileIcon(name);
    card.insertBefore(iconWrapper, badge);
  } else if (pendingFile.previewContent) {
    // Render local preview (code/text/csv)
    // Dynamic import to avoid circular dependency
    import("../utils/content-preview.js").then(({ generateCodePreview, generateTextPreview, generateCsvPreview }) => {
      const previewType = pendingFile.previewType || "text";
      let html = "";

      try {
        if (previewType === "code") {
          html = generateCodePreview(pendingFile.previewContent, ext);
        } else if (previewType === "csv") {
          html = generateCsvPreview(pendingFile.previewContent);
        } else {
          html = generateTextPreview(pendingFile.previewContent, ext);
        }

        const preview = document.createElement("div");
        preview.className = "thumbnail-preview";
        preview.innerHTML = html;
        card.insertBefore(preview, badge);

        // Remove icon fallback if present (in case async load was slow)
        const existingIcon = card.querySelector(".thumbnail-icon-wrapper");
        if (existingIcon) existingIcon.remove();
      } catch (err) {
        console.warn("Failed to generate preview for pending file:", name, err);
      }
    });

    // Add temporary icon while rendering async (or if rendering fails)
    const iconWrapper = document.createElement("div");
    iconWrapper.className = "thumbnail-icon-wrapper";
    iconWrapper.innerHTML = getFileIcon(name);
    card.insertBefore(iconWrapper, badge);
  } else {
    // Show icon for non-images
    const iconWrapper = document.createElement("div");
    iconWrapper.className = "thumbnail-icon-wrapper";
    iconWrapper.innerHTML = getFileIcon(name);
    card.insertBefore(iconWrapper, badge);
  }

  return card;
}

/**
 * Create a thumbnail card element for a file
 * @param {Object} file - File object with name, size properties
 * @param {string} directory - Directory path for operations
 * @param {Function} onDelete - Optional callback after delete
 * @param {boolean} isOutput - Whether this is an output file (shows preview instead of delete)
 * @param {HTMLElement} gridContainer - Container element for expanded preview
 * @returns {HTMLElement}
 */
function createThumbnailCard(file, directory, onDelete = null, isOutput = false, gridContainer = null) {
  const handleDelete = (_e) => {
    handleDeleteFile(file.name, directory, null, onDelete);
  };

  const handleDownload = async (_e) => {
    try {
      const result = await window.electronAPI.downloadFile(directory, file.name);
      if (result.success && result.downloadUrl) {
        // Create invisible anchor to trigger download without opening new window
        const a = document.createElement("a");
        a.href = result.downloadUrl;
        a.download = file.name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        showToast(`Failed to download: ${result.error}`, "error", 4000);
      }
    } catch (error) {
      showToast(`Error downloading file: ${error.message}`, "error", 4000);
    }
  };

  const handlePreview = async (_e) => {
    // Create expanded preview overlay
    showExpandedPreview(file, directory, gridContainer);
  };

  const { card, ext } = createCardStructure(
    file.name,
    file.size || 0,
    handleDelete,
    handleDownload,
    handlePreview,
    isOutput
  );
  card.setAttribute("aria-label", `Open ${file.name}`);

  // Click handler to open file
  card.onclick = async () => {
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

  // Keyboard handler
  card.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      card.onclick();
    }
  };

  // Determine what type of preview this file needs
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"];
  const codeExtensions = [
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "java",
    "c",
    "cpp",
    "cs",
    "go",
    "rb",
    "php",
    "swift",
    "kt",
    "rs",
    "sh",
    "bash",
    "sql",
    "r",
    "scala",
    "dart",
    "lua",
  ];
  const textExtensions = ["txt", "md", "html", "xml", "json", "yaml", "yml", "toml", "ini", "log"];
  const isPdf = ext === "pdf";
  const isCsv = ext === "csv";
  const isCode = codeExtensions.includes(ext);
  const isText = textExtensions.includes(ext);
  const isImage = imageExtensions.includes(ext);
  const needsPreview = isImage || isPdf || isCode || isText || isCsv;

  if (needsPreview) {
    // Add loading skeleton (will be replaced when preview loads)
    const skeleton = document.createElement("div");
    skeleton.className = "thumbnail-skeleton";
    card.appendChild(skeleton);

    // Store preview type info on the card for lazy loading
    card.dataset.previewType = isImage ? "image" : isPdf ? "pdf" : isCode ? "code" : isCsv ? "csv" : "text";
    card.dataset.directory = directory;
    card.dataset.filename = file.name;
    card.dataset.ext = ext;

    // Use IntersectionObserver for lazy loading
    observeForLazyLoad(card, skeleton);
  } else {
    // Fallback: show icon immediately (no lazy loading needed)
    const iconWrapper = document.createElement("div");
    iconWrapper.className = "thumbnail-icon-wrapper";
    iconWrapper.innerHTML = getFileIcon(file.name);
    card.appendChild(iconWrapper);
  }

  return card;
}

// Shared IntersectionObserver for lazy loading thumbnails
let thumbnailObserver = null;

/**
 * Get or create the shared IntersectionObserver for lazy loading
 * @returns {IntersectionObserver}
 */
function getThumbnailObserver() {
  if (!thumbnailObserver) {
    thumbnailObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const card = entry.target;
            const skeleton = card.querySelector(".thumbnail-skeleton");
            if (skeleton) {
              loadThumbnailForCard(card, skeleton);
            }
            // Stop observing once loaded
            thumbnailObserver.unobserve(card);
          }
        });
      },
      {
        rootMargin: "100px", // Start loading 100px before visible
        threshold: 0,
      }
    );
  }
  return thumbnailObserver;
}

/**
 * Add a card to the lazy loading observer
 * @param {HTMLElement} card - Thumbnail card element
 * @param {HTMLElement} skeleton - Skeleton element to replace
 */
function observeForLazyLoad(card, _skeleton) {
  const observer = getThumbnailObserver();
  observer.observe(card);
}

/**
 * Load the appropriate thumbnail for a card based on its data attributes
 * @param {HTMLElement} card - Thumbnail card element
 * @param {HTMLElement} skeleton - Skeleton element to replace
 */
function loadThumbnailForCard(card, skeleton) {
  const { previewType, directory, filename, ext } = card.dataset;

  switch (previewType) {
    case "image":
      loadImageThumbnail(card, skeleton, directory, filename);
      break;
    case "pdf":
      loadPdfThumbnail(card, skeleton, directory, filename);
      break;
    case "code":
    case "csv":
    case "text":
      loadContentPreview(card, skeleton, directory, filename, ext, previewType);
      break;
    default:
      fallbackToIcon(card, skeleton, filename);
  }
}

/**
 * Load image thumbnail asynchronously
 * @param {HTMLElement} card - Card element to update
 * @param {HTMLElement} skeleton - Skeleton element to remove on load
 * @param {string} directory - Directory path
 * @param {string} filename - File name
 */
async function loadImageThumbnail(card, skeleton, directory, filename) {
  try {
    const result = await window.electronAPI.getFileContent(directory, filename);

    if (result.success && result.data) {
      // Create image preview
      const preview = document.createElement("div");
      preview.className = "thumbnail-preview";

      const img = document.createElement("img");
      img.src = `data:${result.mimeType};base64,${result.data}`;
      img.alt = filename;
      img.loading = "lazy";

      preview.appendChild(img);

      // Remove skeleton and add image
      skeleton.remove();
      // Insert preview before the badge (so badge overlays)
      const badge = card.querySelector(".thumbnail-badge");
      card.insertBefore(preview, badge);
    } else {
      // On error, fall back to icon
      skeleton.remove();
      const iconWrapper = document.createElement("div");
      iconWrapper.className = "thumbnail-icon-wrapper";
      iconWrapper.innerHTML = getFileIcon(filename);
      const badge = card.querySelector(".thumbnail-badge");
      card.insertBefore(iconWrapper, badge);
    }
  } catch (_error) {
    // On error, fall back to icon
    skeleton.remove();
    const iconWrapper = document.createElement("div");
    iconWrapper.className = "thumbnail-icon-wrapper";
    iconWrapper.innerHTML = getFileIcon(filename);
    const badge = card.querySelector(".thumbnail-badge");
    card.insertBefore(iconWrapper, badge);
  }
}

/**
 * Load PDF thumbnail asynchronously
 * @param {HTMLElement} card - Card element to update
 * @param {HTMLElement} skeleton - Skeleton element to remove on load
 * @param {string} directory - Directory path
 * @param {string} filename - File name
 */
async function loadPdfThumbnail(card, skeleton, directory, filename) {
  try {
    const result = await window.electronAPI.getFileContent(directory, filename);

    if (result.success && result.data) {
      // Dynamically import PDF thumbnail utility to avoid loading PDF.js for non-PDF files
      const { generatePdfThumbnail } = await import("../utils/pdf-thumbnail.js");
      const thumbnailDataUrl = await generatePdfThumbnail(result.data, 200);

      // Create image preview from PDF thumbnail
      const preview = document.createElement("div");
      preview.className = "thumbnail-preview";

      const img = document.createElement("img");
      img.src = thumbnailDataUrl;
      img.alt = `${filename} preview`;

      preview.appendChild(img);

      // Remove skeleton and add image
      skeleton.remove();
      const badge = card.querySelector(".thumbnail-badge");
      card.insertBefore(preview, badge);
    } else {
      // On error, fall back to icon
      fallbackToIcon(card, skeleton, filename);
    }
  } catch (_error) {
    // On error, fall back to icon
    fallbackToIcon(card, skeleton, filename);
  }
}

/**
 * Fallback to icon when thumbnail generation fails
 */
function fallbackToIcon(card, skeleton, filename) {
  skeleton.remove();
  const iconWrapper = document.createElement("div");
  iconWrapper.className = "thumbnail-icon-wrapper";
  iconWrapper.innerHTML = getFileIcon(filename);
  const badge = card.querySelector(".thumbnail-badge");
  card.insertBefore(iconWrapper, badge);
}

/**
 * Load content preview (code, text, or CSV) asynchronously
 * @param {HTMLElement} card - Card element to update
 * @param {HTMLElement} skeleton - Skeleton element to remove on load
 * @param {string} directory - Directory path
 * @param {string} filename - File name
 * @param {string} ext - File extension
 * @param {string} type - Preview type: "code", "text", or "csv"
 */
async function loadContentPreview(card, skeleton, directory, filename, ext, type) {
  try {
    const result = await window.electronAPI.getFileContent(directory, filename);

    if (result.success && result.data) {
      // Decode base64 to text
      const content = atob(result.data);

      // Dynamically import content preview utilities
      const { generateCodePreview, generateTextPreview, generateCsvPreview } = await import(
        "../utils/content-preview.js"
      );

      let previewHtml;
      if (type === "code") {
        previewHtml = generateCodePreview(content, ext);
      } else if (type === "csv") {
        previewHtml = generateCsvPreview(content);
      } else {
        previewHtml = generateTextPreview(content, ext);
      }

      // Create preview container
      const preview = document.createElement("div");
      preview.className = "thumbnail-content-preview";
      preview.innerHTML = previewHtml;

      // Remove skeleton and add preview
      skeleton.remove();
      const badge = card.querySelector(".thumbnail-badge");
      card.insertBefore(preview, badge);
    } else {
      fallbackToIcon(card, skeleton, filename);
    }
  } catch (_error) {
    fallbackToIcon(card, skeleton, filename);
  }
}

/**
 * Show expanded file preview overlay
 * @param {Object} file - File object with name, size properties
 * @param {string} directory - Directory path
 * @param {HTMLElement} container - Container to attach overlay to
 */
async function showExpandedPreview(file, directory, container) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "file-preview-overlay";

  // Create header with filename and close button
  const header = document.createElement("div");
  header.className = "file-preview-header";

  const title = document.createElement("span");
  title.className = "file-preview-title";
  title.textContent = file.name;

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "file-preview-download";
  downloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  </svg>`;
  downloadBtn.title = "Download file";
  downloadBtn.onclick = async () => {
    try {
      const result = await window.electronAPI.downloadFile(directory, file.name);
      if (result.success && result.downloadUrl) {
        const a = document.createElement("a");
        a.href = result.downloadUrl;
        a.download = file.name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      showToast(`Download failed: ${err.message}`, "error", 4000);
    }
  };

  const closeBtn = document.createElement("button");
  closeBtn.className = "file-preview-close";
  closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;
  closeBtn.title = "Close preview";
  closeBtn.onclick = () => overlay.remove();

  header.appendChild(title);
  header.appendChild(downloadBtn);
  header.appendChild(closeBtn);

  // Create content area
  const content = document.createElement("div");
  content.className = "file-preview-content";
  content.innerHTML = '<div class="file-preview-loading">Loading...</div>';

  overlay.appendChild(header);
  overlay.appendChild(content);

  // Add to container (file panel area)
  const targetContainer = container?.closest(".file-panel-body") || container || document.body;
  targetContainer.appendChild(overlay);

  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);

  // Fetch and render content
  try {
    const result = await window.electronAPI.getFileContent(directory, file.name);

    if (!result.success) {
      content.innerHTML = `<div class="file-preview-error">Failed to load file: ${result.error}</div>`;
      return;
    }

    const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"];
    const codeExtensions = [
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "cs",
      "go",
      "rb",
      "php",
      "swift",
      "kt",
      "rs",
      "sh",
      "bash",
      "sql",
      "r",
      "scala",
      "dart",
      "lua",
    ];
    const textExtensions = ["txt", "md", "html", "xml", "json", "yaml", "yml", "toml", "ini", "log"];

    if (imageExtensions.includes(ext)) {
      // Image preview
      content.innerHTML = `<img class="file-preview-image" src="data:${result.mimeType};base64,${result.data}" alt="${file.name}" />`;
    } else if (ext === "pdf") {
      // PDF preview - show in iframe or use PDF.js
      const blob = new Blob([Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      content.innerHTML = `<embed class="file-preview-pdf" src="${url}" type="application/pdf" />`;
    } else if (codeExtensions.includes(ext) || textExtensions.includes(ext) || ext === "csv") {
      // Text/code preview with syntax highlighting
      const textContent = atob(result.data);
      const { generateCodePreview, generateTextPreview, generateCsvPreview } = await import(
        "../utils/content-preview.js"
      );

      let previewHtml;
      if (codeExtensions.includes(ext)) {
        previewHtml = generateCodePreview(textContent, ext);
      } else if (ext === "csv") {
        previewHtml = generateCsvPreview(textContent);
      } else {
        previewHtml = generateTextPreview(textContent, ext);
      }
      content.innerHTML = `<div class="file-preview-code">${previewHtml}</div>`;
    } else {
      content.innerHTML = '<div class="file-preview-error">Preview not available for this file type</div>';
    }
  } catch (error) {
    content.innerHTML = `<div class="file-preview-error">Error loading preview: ${error.message}</div>`;
  }
}
