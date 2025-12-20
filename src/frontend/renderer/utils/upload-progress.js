/**
 * Upload Progress Manager
 * Manages the file upload progress bar UI
 * Uses existing HTML elements: #file-upload-progress, #progress-bar-fill, #progress-text
 */

/**
 * UploadProgressManager - controls the upload progress bar visibility and state
 */
class UploadProgressManager {
  constructor() {
    this.container = null;
    this.progressBar = null;
    this.progressText = null;
    this.totalFiles = 0;
    this.completedFiles = 0;
    this.currentFileName = "";
    this.isVisible = false;
  }

  /**
   * Initialize by finding DOM elements
   * @returns {boolean} True if elements found
   */
  init() {
    this.container = document.getElementById("file-upload-progress");
    this.progressBar = document.getElementById("progress-bar-fill");
    this.progressText = document.getElementById("progress-text");

    return !!(this.container && this.progressBar && this.progressText);
  }

  /**
   * Show progress bar and start tracking uploads
   * @param {number} fileCount - Total number of files to upload
   */
  start(fileCount) {
    if (!this.container && !this.init()) {
      return;
    }

    this.totalFiles = fileCount;
    this.completedFiles = 0;
    this.currentFileName = "";

    // Reset and show
    this.progressBar.style.width = "0%";
    this.progressText.textContent = fileCount === 1 ? "Preparing upload..." : `Uploading 0 of ${fileCount} files...`;
    this.container.classList.add("active");
    this.isVisible = true;
  }

  /**
   * Update progress for current file
   * @param {string} fileName - Name of file being uploaded
   * @param {number} [percent] - Optional percent complete for current file (0-100)
   */
  updateCurrentFile(fileName, percent = null) {
    if (!this.isVisible) return;

    this.currentFileName = fileName;

    // Calculate overall progress
    const baseProgress = (this.completedFiles / this.totalFiles) * 100;
    const fileProgress = percent !== null ? percent / this.totalFiles : 0;
    const totalProgress = Math.min(baseProgress + fileProgress, 99); // Cap at 99% until complete

    this.progressBar.style.width = `${totalProgress}%`;

    // Show file name for single files, file count for multiple
    if (this.totalFiles === 1) {
      this.progressText.textContent = `Uploading ${fileName}`;
    } else {
      this.progressText.textContent = `Uploading ${this.completedFiles + 1} of ${this.totalFiles}: ${fileName}`;
    }
  }

  /**
   * Mark a file as completed
   * @param {string} fileName - Name of completed file
   * @param {boolean} success - Whether upload succeeded
   */
  completeFile(_fileName, _success = true) {
    if (!this.isVisible) return;

    this.completedFiles++;
    const progress = (this.completedFiles / this.totalFiles) * 100;
    this.progressBar.style.width = `${progress}%`;

    if (this.completedFiles < this.totalFiles) {
      if (this.totalFiles > 1) {
        this.progressText.textContent = `Uploaded ${this.completedFiles} of ${this.totalFiles} files...`;
      }
    }
  }

  /**
   * Complete all uploads and hide progress bar
   * @param {number} successCount - Number of successful uploads
   * @param {number} failCount - Number of failed uploads
   */
  finish(successCount, failCount = 0) {
    if (!this.isVisible) return;

    // Show 100% briefly before hiding
    this.progressBar.style.width = "100%";

    if (failCount > 0) {
      this.progressText.textContent = `Completed: ${successCount} uploaded, ${failCount} failed`;
    } else {
      this.progressText.textContent = successCount === 1 ? "Upload complete!" : `${successCount} files uploaded!`;
    }

    // Hide after brief delay
    setTimeout(() => {
      this.hide();
    }, 800);
  }

  /**
   * Hide the progress bar
   */
  hide() {
    if (this.container) {
      this.container.classList.remove("active");
    }
    this.isVisible = false;
    this.totalFiles = 0;
    this.completedFiles = 0;
    this.currentFileName = "";
  }

  /**
   * Check if progress bar is currently visible
   * @returns {boolean}
   */
  isActive() {
    return this.isVisible;
  }
}

// Singleton instance
const uploadProgress = new UploadProgressManager();

/**
 * Start showing upload progress
 * @param {number} fileCount - Number of files to upload
 */
export function startUploadProgress(fileCount) {
  uploadProgress.start(fileCount);
}

/**
 * Update progress for current file being uploaded
 * @param {string} fileName - Name of file
 * @param {number} [percent] - Optional percent (0-100)
 */
export function updateUploadProgress(fileName, percent = null) {
  uploadProgress.updateCurrentFile(fileName, percent);
}

/**
 * Mark a file upload as complete
 * @param {string} fileName - Name of completed file
 * @param {boolean} success - Whether it succeeded
 */
export function completeFileUpload(fileName, success = true) {
  uploadProgress.completeFile(fileName, success);
}

/**
 * Finish all uploads and hide progress bar
 * @param {number} successCount - Successful upload count
 * @param {number} failCount - Failed upload count
 */
export function finishUploadProgress(successCount, failCount = 0) {
  uploadProgress.finish(successCount, failCount);
}

/**
 * Immediately hide the progress bar
 */
export function hideUploadProgress() {
  uploadProgress.hide();
}
