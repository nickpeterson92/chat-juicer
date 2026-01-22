/**
 * File drop and upload helpers.
 * Extracted from phase5-event-handlers.js to reduce nesting.
 */

import { getPreviewType, hasBinaryExtension, hasTextExtension } from "./content-preview.js";
import { readTextFileChunk } from "./file-utils.js";
import {
  completeFileUpload,
  finishUploadProgress,
  startUploadProgress,
  updateUploadProgress,
} from "./upload-progress.js";

const MAX_PENDING_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file

/**
 * Create preview data for a file.
 * @param {File} file - The file to create preview for
 * @returns {Promise<{previewUrl: string|null, previewContent: string|null, previewType: string|null}>}
 */
export async function createFilePreview(file) {
  let previewUrl = null;
  let previewContent = null;
  let previewType = null;

  if (file.type?.startsWith("image/")) {
    previewUrl = URL.createObjectURL(file);
    previewType = "image";
  } else if (file.type === "application/pdf") {
    previewType = "pdf";
  } else {
    const isBinaryFile = hasBinaryExtension(file.name);
    const isTextFile = !isBinaryFile && (file.type?.startsWith("text/") || hasTextExtension(file.name));

    if (isTextFile) {
      try {
        previewContent = await readTextFileChunk(file, 2048);
        previewType = getPreviewType(file.name);
      } catch (err) {
        console.warn("Failed to read local file for preview:", err);
      }
    }
  }

  return { previewUrl, previewContent, previewType };
}

/**
 * Create a pending file entry for deferred upload.
 * @param {File} file - The file object
 * @param {Object} preview - Preview data from createFilePreview
 * @returns {Object} Pending file entry
 */
export function createPendingFileEntry(file, preview) {
  return {
    file,
    previewUrl: preview.previewUrl,
    previewContent: preview.previewContent,
    previewType: preview.previewType,
    name: file.name,
    size: file.size,
    type: file.type,
  };
}

/**
 * Check if file exceeds size limit.
 * @param {File} file - File to check
 * @param {Function} showToast - Toast notification function
 * @returns {boolean} True if file is too large
 */
export function isFileTooLarge(file, showToast) {
  if (file.size > MAX_PENDING_FILE_SIZE) {
    showToast(`${file.name} exceeds 50MB limit`, "warning", 3000);
    return true;
  }
  return false;
}

/**
 * Upload files to a session with progress tracking.
 * @param {File[]} files - Files to upload
 * @param {Object} fileService - File service instance
 * @param {string} sessionId - Session ID
 * @param {Object} appState - App state instance
 * @param {Function} showToast - Toast notification function
 * @returns {Promise<{uploadedCount: number, failedCount: number}>}
 */
export async function uploadFilesToSession(files, fileService, sessionId, appState, showToast) {
  let uploadedCount = 0;
  let failedCount = 0;

  startUploadProgress(files.length);

  for (const file of files) {
    updateUploadProgress(file.name, 0);

    try {
      const result = await fileService.uploadFile(file, sessionId, (percent) =>
        updateUploadProgress(file.name, percent)
      );

      if (result.success) {
        uploadedCount++;
        completeFileUpload(file.name, true);

        // Add image files to pending attachments
        if (file.type?.startsWith("image/")) {
          const currentAttachments = appState.getState("message.pendingAttachments") || [];
          appState.setState("message.pendingAttachments", [
            ...currentAttachments,
            {
              type: "image_ref",
              filename: file.name,
              path: `input/${file.name}`,
              mimeType: file.type,
            },
          ]);
        }
      } else {
        failedCount++;
        completeFileUpload(file.name, false);
        console.error(`File upload failed: ${result.error}`);
        showToast(`Failed to upload ${file.name}`, "error", 3000);
      }
    } catch (error) {
      failedCount++;
      completeFileUpload(file.name, false);
      console.error("Error uploading file:", error);
      showToast(`Error uploading ${file.name}`, "error", 3000);
    }
  }

  finishUploadProgress(uploadedCount, failedCount);
  return { uploadedCount, failedCount };
}

/**
 * Show upload summary toast for multiple files.
 * @param {number} totalFiles - Total files attempted
 * @param {number} uploadedCount - Successfully uploaded count
 * @param {Function} showToast - Toast notification function
 */
export function showUploadSummary(totalFiles, uploadedCount, showToast) {
  if (totalFiles <= 1) return;

  if (uploadedCount === totalFiles) {
    showToast(`${uploadedCount} files uploaded successfully`, "success", 2000);
  } else if (uploadedCount > 0) {
    showToast(`${uploadedCount}/${totalFiles} files uploaded`, "warning", 3000);
  }
}
