/**
 * File Utilities
 * Helper functions for file icon generation and size formatting
 */

import { BYTES_PER_KILOBYTE, SIZE_PRECISION_MULTIPLIER } from "../config/constants.js";

/**
 * Get file icon SVG based on file extension
 * @param {string} filename - The filename with extension
 * @returns {string} SVG markup for the file icon
 */
export function getFileIcon(filename) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  // Document formats - Red
  if (["pdf"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6M10 12h4M10 16h4"/>
    </svg>`;
  }

  // Word documents - Blue
  if (["doc", "docx", "odt"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6M16 13H8m8 4H8m8 4H8"/>
    </svg>`;
  }

  // Spreadsheets - Green
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6M8 13h8M8 17h8M12 9v12"/>
    </svg>`;
  }

  // Presentations - Orange
  if (["ppt", "pptx", "odp"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6M9 12h6v4H9z"/>
    </svg>`;
  }

  // Images - Purple
  if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "ico"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>`;
  }

  // Code files - Yellow
  if (
    ["js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "cs", "go", "rb", "php", "swift", "kt", "rs"].includes(ext)
  ) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6M10 12l-2 2 2 2m4-4l2 2-2 2"/>
    </svg>`;
  }

  // Markup/data - Gray
  if (["html", "xml", "json", "yaml", "yml", "toml", "ini", "md", "txt"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6M9 13h6m-6 4h6"/>
    </svg>`;
  }

  // Archives - Brown
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400e" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6M12 6v2m0 2v2m0 2v2"/>
    </svg>`;
  }

  // Video - Red/Pink
  if (["mp4", "avi", "mov", "mkv", "webm", "flv"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <path d="M10 9l5 3-5 3V9z"/>
    </svg>`;
  }

  // Audio - Pink
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>`;
  }

  // Default document icon - Slate
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6M16 13H8m8 4H8"/>
  </svg>`;
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB")
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_KILOBYTE));
  return (
    Math.round((bytes / BYTES_PER_KILOBYTE ** i) * SIZE_PRECISION_MULTIPLIER) / SIZE_PRECISION_MULTIPLIER +
    " " +
    sizes[i]
  );
}
