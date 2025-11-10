/**
 * FileListRenderer - Pure functions for rendering file lists
 * NO DEPENDENCIES on services or global state
 *
 * Input: File data
 * Output: DOM elements via DOMAdapter
 */

// File icon mapping
const FILE_ICON_MAP = {
  // Documents
  pdf: "📄",
  doc: "📝",
  docx: "📝",
  txt: "📃",
  md: "📋",
  // Code
  js: "📜",
  jsx: "📜",
  ts: "📜",
  tsx: "📜",
  py: "🐍",
  java: "☕",
  cpp: "⚙️",
  c: "⚙️",
  h: "⚙️",
  css: "🎨",
  html: "🌐",
  json: "📊",
  xml: "📊",
  yaml: "📊",
  yml: "📊",
  // Images
  jpg: "🖼️",
  jpeg: "🖼️",
  png: "🖼️",
  gif: "🖼️",
  svg: "🖼️",
  webp: "🖼️",
  // Archives
  zip: "📦",
  tar: "📦",
  gz: "📦",
  rar: "📦",
  "7z": "📦",
  // Spreadsheets
  xls: "📊",
  xlsx: "📊",
  csv: "📊",
  // Default
  default: "📁",
};

/**
 * Get file icon emoji
 *
 * @param {string} extOrFilename - File extension (with or without dot) or full filename
 * @returns {string} Icon emoji
 */
export function getFileIcon(extOrFilename) {
  if (!extOrFilename) return FILE_ICON_MAP.default;

  // Handle both '.js' and 'js' formats, and full filenames like 'test.js'
  let ext = extOrFilename.toLowerCase();

  // If it has a dot, extract the extension
  if (ext.includes(".")) {
    ext = ext.split(".").pop();
  }

  // Remove leading dot if present
  ext = ext.replace(/^\./, "");

  return FILE_ICON_MAP[ext] || FILE_ICON_MAP.default;
}

/**
 * Format file size for display
 *
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
  // Handle undefined, null, or negative values
  if (bytes === undefined || bytes === null || bytes < 0) {
    return "--";
  }

  if (typeof bytes !== "number") {
    return "--";
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
 * Render a single file list item
 *
 * @param {Object} fileData - File data
 * @param {string} fileData.name - File name
 * @param {number} fileData.size - File size in bytes
 * @param {string} fileData.path - Full file path
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} File list item element
 */
export function renderFileItem(fileData, domAdapter) {
  const itemDiv = domAdapter.createElement("div");
  domAdapter.addClass(itemDiv, "file-item");
  domAdapter.setAttribute(itemDiv, "data-file-id", fileData.id || fileData.name);
  domAdapter.setAttribute(itemDiv, "data-file-name", fileData.name);
  domAdapter.setAttribute(itemDiv, "data-file-path", fileData.path || fileData.name);

  // Add status class if provided
  if (fileData.status) {
    domAdapter.addClass(itemDiv, fileData.status);
  }

  // Icon
  const iconDiv = domAdapter.createElement("div");
  domAdapter.addClass(iconDiv, "file-icon");
  domAdapter.setTextContent(iconDiv, getFileIcon(fileData.name));

  // Info container
  const infoDiv = domAdapter.createElement("div");
  domAdapter.addClass(infoDiv, "file-info");

  // File name
  const nameDiv = domAdapter.createElement("div");
  domAdapter.addClass(nameDiv, "file-name");
  domAdapter.setTextContent(nameDiv, fileData.name);
  domAdapter.setAttribute(nameDiv, "title", fileData.name); // Tooltip for long names

  // File size
  const sizeDiv = domAdapter.createElement("div");
  domAdapter.addClass(sizeDiv, "file-size");
  domAdapter.setTextContent(sizeDiv, formatFileSize(fileData.size));

  domAdapter.appendChild(infoDiv, nameDiv);
  domAdapter.appendChild(infoDiv, sizeDiv);

  // Actions container
  const actionsDiv = domAdapter.createElement("div");
  domAdapter.addClass(actionsDiv, "file-actions");

  // Open button
  const openBtn = domAdapter.createElement("button");
  domAdapter.addClass(openBtn, "file-action-button", "open-button");
  domAdapter.setAttribute(openBtn, "aria-label", "Open file");
  domAdapter.setAttribute(openBtn, "data-action", "open");
  domAdapter.setAttribute(openBtn, "data-file-path", fileData.path || fileData.name);
  domAdapter.setTextContent(openBtn, "📂");

  // Remove/Delete button
  const removeBtn = domAdapter.createElement("button");
  domAdapter.addClass(removeBtn, "file-action-button", "remove-file-btn");
  domAdapter.setAttribute(removeBtn, "aria-label", "Remove file");
  domAdapter.setAttribute(removeBtn, "data-action", "remove");
  domAdapter.setAttribute(removeBtn, "data-file-id", fileData.id || fileData.name);
  domAdapter.setTextContent(removeBtn, "🗑️");

  domAdapter.appendChild(actionsDiv, openBtn);
  domAdapter.appendChild(actionsDiv, removeBtn);

  // Assemble item
  domAdapter.appendChild(itemDiv, iconDiv);
  domAdapter.appendChild(itemDiv, infoDiv);
  domAdapter.appendChild(itemDiv, actionsDiv);

  return itemDiv;
}

/**
 * Render file list
 *
 * @param {Array<Object>} files - Array of file data objects
 * @param {Object} domAdapter - DOM adapter
 * @returns {DocumentFragment} Fragment containing all file items
 */
export function renderFileList(files, domAdapter) {
  const fragment = domAdapter.getDocument().createDocumentFragment();

  for (const file of files) {
    const itemElement = renderFileItem(file, domAdapter);
    fragment.appendChild(itemElement);
  }

  return fragment;
}

/**
 * Render empty state for file list
 *
 * @param {string} message - Empty state message
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Empty state element
 */
export function renderEmptyFileList(message, domAdapter) {
  const emptyDiv = domAdapter.createElement("div");
  domAdapter.addClass(emptyDiv, "file-list-empty");

  const iconDiv = domAdapter.createElement("div");
  domAdapter.addClass(iconDiv, "empty-icon");
  domAdapter.setTextContent(iconDiv, "📂");

  const messageDiv = domAdapter.createElement("div");
  domAdapter.addClass(messageDiv, "empty-message");
  domAdapter.setTextContent(messageDiv, message || "No files in this directory");

  domAdapter.appendChild(emptyDiv, iconDiv);
  domAdapter.appendChild(emptyDiv, messageDiv);

  return emptyDiv;
}

/**
 * Render file upload progress
 *
 * @param {Object} progressData - Upload progress data
 * @param {string} progressData.filename - File being uploaded
 * @param {number} progressData.current - Current file index
 * @param {number} progressData.total - Total files
 * @param {number} progressData.percent - Upload percentage (0-100)
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Progress element
 */
export function renderFileUploadProgress(progressData, domAdapter) {
  const progressDiv = domAdapter.createElement("div");
  domAdapter.addClass(progressDiv, "file-upload-progress");

  // Progress text
  const textDiv = domAdapter.createElement("div");
  domAdapter.addClass(textDiv, "progress-text");
  const text = `Uploading ${progressData.filename} (${progressData.current}/${progressData.total})`;
  domAdapter.setTextContent(textDiv, text);

  // Progress bar container
  const barContainer = domAdapter.createElement("div");
  domAdapter.addClass(barContainer, "progress-bar-container");

  // Progress bar fill
  const barFill = domAdapter.createElement("div");
  domAdapter.addClass(barFill, "progress-bar-fill");
  domAdapter.setStyle(barFill, "width", `${progressData.percent}%`);

  domAdapter.appendChild(barContainer, barFill);

  // Percentage text
  const percentDiv = domAdapter.createElement("div");
  domAdapter.addClass(percentDiv, "progress-percent");
  domAdapter.setTextContent(percentDiv, `${Math.round(progressData.percent)}%`);

  // Assemble
  domAdapter.appendChild(progressDiv, textDiv);
  domAdapter.appendChild(progressDiv, barContainer);
  domAdapter.appendChild(progressDiv, percentDiv);

  return progressDiv;
}

/**
 * Update progress bar
 *
 * @param {HTMLElement} progressElement - Progress element
 * @param {number} percent - New percentage (0-100)
 * @param {Object} domAdapter - DOM adapter
 */
export function updateProgressBar(progressElement, percent, domAdapter) {
  const barFill = domAdapter.querySelector(progressElement, ".progress-bar-fill");
  const percentDiv = domAdapter.querySelector(progressElement, ".progress-percent");

  if (barFill) {
    domAdapter.setStyle(barFill, "width", `${percent}%`);
  }

  if (percentDiv) {
    domAdapter.setTextContent(percentDiv, `${Math.round(percent)}%`);
  }
}

/**
 * Render file drop zone overlay
 *
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Drop zone overlay element
 */
export function renderFileDropZone(domAdapter) {
  const overlayDiv = domAdapter.createElement("div");
  domAdapter.addClass(overlayDiv, "file-drop-overlay");

  const contentDiv = domAdapter.createElement("div");
  domAdapter.addClass(contentDiv, "drop-content");

  const iconDiv = domAdapter.createElement("div");
  domAdapter.addClass(iconDiv, "drop-icon");
  domAdapter.setTextContent(iconDiv, "📁");

  const textDiv = domAdapter.createElement("div");
  domAdapter.addClass(textDiv, "drop-text");
  domAdapter.setTextContent(textDiv, "Drop files here to upload");

  domAdapter.appendChild(contentDiv, iconDiv);
  domAdapter.appendChild(contentDiv, textDiv);
  domAdapter.appendChild(overlayDiv, contentDiv);

  return overlayDiv;
}

/**
 * Show drop zone
 *
 * @param {HTMLElement} dropZoneElement - Drop zone element
 * @param {Object} domAdapter - DOM adapter
 */
export function showDropZone(dropZoneElement, domAdapter) {
  domAdapter.addClass(dropZoneElement, "active");
}

/**
 * Hide drop zone
 *
 * @param {HTMLElement} dropZoneElement - Drop zone element
 * @param {Object} domAdapter - DOM adapter
 */
export function hideDropZone(dropZoneElement, domAdapter) {
  domAdapter.removeClass(dropZoneElement, "active");
}

/**
 * Get file path from element
 *
 * @param {HTMLElement} element - File item or child element
 * @param {Object} domAdapter - DOM adapter
 * @returns {string|null} File path
 */
export function getFilePathFromElement(element, domAdapter) {
  const fileItem = domAdapter.closest(element, ".file-item");
  return fileItem ? domAdapter.getAttribute(fileItem, "data-file-path") : null;
}

/**
 * Get file name from element
 *
 * @param {HTMLElement} element - File item or child element
 * @param {Object} domAdapter - DOM adapter
 * @returns {string|null} File name
 */
export function getFileNameFromElement(element, domAdapter) {
  const fileItem = domAdapter.closest(element, ".file-item");
  return fileItem ? domAdapter.getAttribute(fileItem, "data-file-name") : null;
}

/**
 * Update file item status
 *
 * @param {HTMLElement} fileElement - File item element
 * @param {string} status - New status (loaded, loading, error, etc.)
 * @param {Object} domAdapter - DOM adapter
 */
export function updateFileStatus(fileElement, status, domAdapter) {
  // Remove old status classes
  const statusClasses = ["loaded", "loading", "error", "uploading", "pending"];
  statusClasses.forEach((cls) => {
    domAdapter.removeClass(fileElement, cls);
  });

  // Add new status class
  domAdapter.addClass(fileElement, status);
}

/**
 * Remove file item from DOM
 *
 * @param {HTMLElement} fileElement - File item element
 * @param {Object} domAdapter - DOM adapter
 */
export function removeFileItem(fileElement, domAdapter) {
  domAdapter.remove(fileElement);
}

/**
 * Find file element by ID in container
 *
 * @param {HTMLElement} container - Container element
 * @param {string} fileId - File ID
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement|null} File element or null
 */
export function findFileElement(container, fileId, domAdapter) {
  return domAdapter.querySelector(container, `[data-file-id="${fileId}"]`);
}
