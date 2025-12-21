/**
 * File Icon Color Mapping Utility
 * Maps file extensions to semantic CSS variable references for theme-aware icons
 */

/**
 * File type color mapping
 * Maps file extensions to semantic CSS variable references
 */
const FILE_TYPE_COLORS = {
  // Documents - Status colors
  pdf: "var(--color-status-error)",
  doc: "var(--color-status-info)",
  docx: "var(--color-status-info)",
  odt: "var(--color-status-info)",
  xls: "var(--color-status-success)",
  xlsx: "var(--color-status-success)",
  csv: "var(--color-status-success)",
  ods: "var(--color-status-success)",
  ppt: "var(--color-status-warning)",
  pptx: "var(--color-status-warning)",
  odp: "var(--color-status-warning)",

  // Images - Purple
  jpg: "var(--color-file-image)",
  jpeg: "var(--color-file-image)",
  png: "var(--color-file-image)",
  gif: "var(--color-file-image)",
  bmp: "var(--color-file-image)",
  svg: "var(--color-file-image)",
  webp: "var(--color-file-image)",
  ico: "var(--color-file-image)",

  // Code files - Yellow
  js: "var(--color-file-code)",
  jsx: "var(--color-file-code)",
  ts: "var(--color-file-code)",
  tsx: "var(--color-file-code)",
  py: "var(--color-file-code)",
  java: "var(--color-file-code)",
  c: "var(--color-file-code)",
  cpp: "var(--color-file-code)",
  cs: "var(--color-file-code)",
  go: "var(--color-file-code)",
  rb: "var(--color-file-code)",
  php: "var(--color-file-code)",
  swift: "var(--color-file-code)",
  kt: "var(--color-file-code)",
  rs: "var(--color-file-code)",

  // Markup/data - Text secondary
  html: "var(--color-text-secondary)",
  xml: "var(--color-text-secondary)",
  json: "var(--color-text-secondary)",
  yaml: "var(--color-text-secondary)",
  yml: "var(--color-text-secondary)",
  toml: "var(--color-text-secondary)",
  ini: "var(--color-text-secondary)",
  md: "var(--color-text-secondary)",
  txt: "var(--color-text-secondary)",

  // Archives - Brown
  zip: "var(--color-file-archive)",
  rar: "var(--color-file-archive)",
  "7z": "var(--color-file-archive)",
  tar: "var(--color-file-archive)",
  gz: "var(--color-file-archive)",
  bz2: "var(--color-file-archive)",

  // Video - Status error (red)
  mp4: "var(--color-status-error)",
  avi: "var(--color-status-error)",
  mov: "var(--color-status-error)",
  mkv: "var(--color-status-error)",
  webm: "var(--color-status-error)",
  flv: "var(--color-status-error)",

  // Audio - Pink
  mp3: "var(--color-file-audio)",
  wav: "var(--color-file-audio)",
  flac: "var(--color-file-audio)",
  aac: "var(--color-file-audio)",
  ogg: "var(--color-file-audio)",
  m4a: "var(--color-file-audio)",
};

/**
 * Get CSS variable reference for file extension
 * @param {string} extension - File extension (without dot)
 * @returns {string} CSS variable reference (e.g., "var(--color-file-image)")
 */
export function getFileIconColor(extension) {
  const ext = extension?.toLowerCase() || "";
  return FILE_TYPE_COLORS[ext] || "var(--color-text-secondary)";
}

/**
 * Resolve CSS variable to computed color value
 * @param {string} cssVariable - CSS variable reference (e.g., "var(--color-file-image)")
 * @returns {string} Computed color value (e.g., "#a855f7")
 */
export function resolveFileIconColor(cssVariable) {
  // Extract variable name from var() syntax
  const variableName = cssVariable.match(/var\((--[^)]+)\)/)?.[1];
  if (!variableName) {
    return cssVariable; // Return as-is if not a CSS variable
  }

  // Get computed value from document root
  const computedValue = getComputedStyle(document.documentElement).getPropertyValue(variableName);
  return computedValue.trim() || cssVariable;
}

/**
 * File badge category mapping
 * Maps file extensions to badge CSS class and display label
 */
const FILE_BADGE_CATEGORIES = {
  // Images
  jpg: { class: "badge-image", label: "JPG" },
  jpeg: { class: "badge-image", label: "JPEG" },
  png: { class: "badge-image", label: "PNG" },
  gif: { class: "badge-image", label: "GIF" },
  bmp: { class: "badge-image", label: "BMP" },
  svg: { class: "badge-image", label: "SVG" },
  webp: { class: "badge-image", label: "WEBP" },
  ico: { class: "badge-image", label: "ICO" },

  // PDF
  pdf: { class: "badge-pdf", label: "PDF" },

  // Documents
  doc: { class: "badge-document", label: "DOC" },
  docx: { class: "badge-document", label: "DOCX" },
  odt: { class: "badge-document", label: "ODT" },
  rtf: { class: "badge-document", label: "RTF" },

  // Spreadsheets
  xls: { class: "badge-spreadsheet", label: "XLS" },
  xlsx: { class: "badge-spreadsheet", label: "XLSX" },
  csv: { class: "badge-spreadsheet", label: "CSV" },
  ods: { class: "badge-spreadsheet", label: "ODS" },

  // Presentations
  ppt: { class: "badge-presentation", label: "PPT" },
  pptx: { class: "badge-presentation", label: "PPTX" },
  odp: { class: "badge-presentation", label: "ODP" },

  // Code
  js: { class: "badge-code", label: "JS" },
  jsx: { class: "badge-code", label: "JSX" },
  ts: { class: "badge-code", label: "TS" },
  tsx: { class: "badge-code", label: "TSX" },
  py: { class: "badge-code", label: "PY" },
  java: { class: "badge-code", label: "JAVA" },
  c: { class: "badge-code", label: "C" },
  cpp: { class: "badge-code", label: "C++" },
  cs: { class: "badge-code", label: "C#" },
  go: { class: "badge-code", label: "GO" },
  rb: { class: "badge-code", label: "RB" },
  php: { class: "badge-code", label: "PHP" },
  swift: { class: "badge-code", label: "SWIFT" },
  kt: { class: "badge-code", label: "KT" },
  rs: { class: "badge-code", label: "RS" },
  sh: { class: "badge-code", label: "SH" },
  bash: { class: "badge-code", label: "BASH" },

  // Data/Markup
  html: { class: "badge-data", label: "HTML" },
  xml: { class: "badge-data", label: "XML" },
  json: { class: "badge-data", label: "JSON" },
  yaml: { class: "badge-data", label: "YAML" },
  yml: { class: "badge-data", label: "YML" },
  toml: { class: "badge-data", label: "TOML" },
  ini: { class: "badge-data", label: "INI" },
  md: { class: "badge-data", label: "MD" },
  txt: { class: "badge-data", label: "TXT" },

  // Archives
  zip: { class: "badge-archive", label: "ZIP" },
  rar: { class: "badge-archive", label: "RAR" },
  "7z": { class: "badge-archive", label: "7Z" },
  tar: { class: "badge-archive", label: "TAR" },
  gz: { class: "badge-archive", label: "GZ" },
  bz2: { class: "badge-archive", label: "BZ2" },

  // Video
  mp4: { class: "badge-video", label: "MP4" },
  avi: { class: "badge-video", label: "AVI" },
  mov: { class: "badge-video", label: "MOV" },
  mkv: { class: "badge-video", label: "MKV" },
  webm: { class: "badge-video", label: "WEBM" },
  flv: { class: "badge-video", label: "FLV" },

  // Audio
  mp3: { class: "badge-audio", label: "MP3" },
  wav: { class: "badge-audio", label: "WAV" },
  flac: { class: "badge-audio", label: "FLAC" },
  aac: { class: "badge-audio", label: "AAC" },
  ogg: { class: "badge-audio", label: "OGG" },
  m4a: { class: "badge-audio", label: "M4A" },
};

/**
 * Get badge info for file extension
 * @param {string} extension - File extension (without dot)
 * @returns {{ class: string, label: string }} Badge CSS class and display label
 */
export function getFileBadgeInfo(extension) {
  const ext = extension?.toLowerCase() || "";
  return FILE_BADGE_CATEGORIES[ext] || { class: "badge-data", label: ext.toUpperCase() || "FILE" };
}
