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
