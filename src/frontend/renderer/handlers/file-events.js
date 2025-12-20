/**
 * File Event Handlers
 * Handles file-related events and coordinates between UI and services
 */

/**
 * Setup file event handlers
 *
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.filePanel - File panel component
 * @param {Object} dependencies.fileService - File service
 * @param {Object} dependencies.ipcAdapter - IPC adapter
 * @returns {Object} Event handler cleanup function
 */
export function setupFileEventHandlers({ filePanel, ipcAdapter }) {
  const handlers = [];

  // Handle file upload
  const handleFileUploaded = (data) => {
    const { file } = data;
    filePanel.addFile(file);
  };

  handlers.push(ipcAdapter.on("file-uploaded", handleFileUploaded));

  // Handle file upload progress
  const handleFileUploadProgress = (data) => {
    const { fileId } = data;
    filePanel.updateFile(fileId, "uploading");
  };

  handlers.push(ipcAdapter.on("file-upload-progress", handleFileUploadProgress));

  // Handle file upload complete
  const handleFileUploadComplete = (data) => {
    const { fileId } = data;
    filePanel.updateFile(fileId, "loaded");
  };

  handlers.push(ipcAdapter.on("file-upload-complete", handleFileUploadComplete));

  // Handle file upload error
  const handleFileUploadError = (data) => {
    const { fileId, error } = data;
    filePanel.updateFile(fileId, "error");
    console.error("File upload error:", error);
  };

  handlers.push(ipcAdapter.on("file-upload-error", handleFileUploadError));

  // Handle file removed
  const handleFileRemoved = (data) => {
    const { fileId } = data;
    filePanel.removeFile(fileId);
  };

  handlers.push(ipcAdapter.on("file-removed", handleFileRemoved));

  // Handle files loaded (on session switch)
  const handleFilesLoaded = (data) => {
    const { files } = data;
    filePanel.setFiles(files || []);
  };

  handlers.push(ipcAdapter.on("files-loaded", handleFilesLoaded));

  // Return cleanup function
  return {
    cleanup: () => {
      for (const unsubscribe of handlers) {
        unsubscribe();
      }
    },
  };
}

/**
 * Handle file drop event
 *
 * @param {DragEvent} event - Drop event
 * @param {Object} fileService - File service
 * @param {Object} filePanel - File panel component
 */
export async function handleFileDrop(event, fileService, filePanel) {
  event.preventDefault();
  event.stopPropagation();

  const files = Array.from(event.dataTransfer?.files || []);

  if (files.length === 0) return;

  try {
    for (const file of files) {
      // Add to UI with pending status
      const fileData = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
        path: file.path || file.name,
        status: "uploading",
      };

      filePanel.addFile(fileData);

      // Upload file
      await fileService.uploadFile(file, fileData.id);
    }
  } catch (error) {
    console.error("Failed to upload files:", error);
  }
}

/**
 * Handle drag over event
 *
 * @param {DragEvent} event - Drag over event
 */
export function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
}

/**
 * Handle drag enter event
 *
 * @param {DragEvent} event - Drag enter event
 * @param {HTMLElement} dropZoneOverlay - Drop zone overlay element
 * @param {Object} domAdapter - DOM adapter
 */
export function handleDragEnter(event, dropZoneOverlay, domAdapter) {
  event.preventDefault();
  event.stopPropagation();

  if (dropZoneOverlay) {
    domAdapter.addClass(dropZoneOverlay, "active");
  }
}

/**
 * Handle drag leave event
 *
 * @param {DragEvent} event - Drag leave event
 * @param {HTMLElement} dropZoneOverlay - Drop zone overlay element
 * @param {Object} domAdapter - DOM adapter
 */
export function handleDragLeave(event, dropZoneOverlay, domAdapter) {
  event.preventDefault();
  event.stopPropagation();

  // Only hide if leaving the drop zone entirely
  if (event.target === dropZoneOverlay) {
    domAdapter.removeClass(dropZoneOverlay, "active");
  }
}
