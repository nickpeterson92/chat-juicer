/**
 * Content Preview Generator
 * Generates mini previews for code, text, and CSV files
 * Uses Shiki for syntax highlighting (same snazzy theme as chat)
 */

import { highlightCode } from "./markdown-renderer.js";

// Code file extensions that should get syntax highlighting
const CODE_EXTENSIONS = [
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

// Text/markup extensions for plain text preview
const TEXT_EXTENSIONS = ["txt", "md", "html", "xml", "json", "yaml", "yml", "toml", "ini", "log", "rtf"];

// Extension to Shiki language mapping
const EXT_TO_LANG = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  go: "go",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  rs: "rust",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  r: "r",
  scala: "scala",
  dart: "dart",
  lua: "lua",
  md: "markdown",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  xml: "html",
  css: "css",
};

// Maximum lines/chars to show in preview (increased for better visibility)
const MAX_PREVIEW_LINES = 15;
const MAX_CHARS_PER_LINE = 60;

/**
 * Check if a file extension is a code file
 * @param {string} ext - File extension (without dot)
 * @returns {boolean}
 */
export function isCodeFile(ext) {
  return CODE_EXTENSIONS.includes(ext?.toLowerCase());
}

/**
 * Check if a file extension is a text file
 * @param {string} ext - File extension (without dot)
 * @returns {boolean}
 */
export function isTextFile(ext) {
  return TEXT_EXTENSIONS.includes(ext?.toLowerCase());
}

/**
 * Check if a file extension is CSV
 * @param {string} ext - File extension (without dot)
 * @returns {boolean}
 */
export function isCsvFile(ext) {
  return ext?.toLowerCase() === "csv";
}

/**
 * Generate code preview HTML with Shiki syntax highlighting
 * @param {string} content - File content
 * @param {string} ext - File extension for language detection
 * @returns {string} HTML string for preview
 */
export function generateCodePreview(content, ext) {
  const lines = content.split("\n").slice(0, MAX_PREVIEW_LINES);
  const truncatedLines = lines.map((line) =>
    line.length > MAX_CHARS_PER_LINE ? `${line.slice(0, MAX_CHARS_PER_LINE)}…` : line
  );
  const previewContent = truncatedLines.join("\n");

  // Get Shiki language from extension
  const lang = EXT_TO_LANG[ext?.toLowerCase()] || "plaintext";

  // Use Shiki highlighting (snazzy theme)
  const highlighted = highlightCode(previewContent, lang);

  return `<pre class="thumbnail-code-preview"><code class="shiki">${highlighted}</code></pre>`;
}

/**
 * Generate text preview HTML - uses Shiki for markdown, plain for others
 * @param {string} content - File content
 * @param {string} ext - File extension (optional, for markdown detection)
 * @returns {string} HTML string for preview
 */
export function generateTextPreview(content, ext = "") {
  const lines = content.split("\n").slice(0, MAX_PREVIEW_LINES);
  const truncatedLines = lines.map((line) =>
    line.length > MAX_CHARS_PER_LINE ? `${line.slice(0, MAX_CHARS_PER_LINE)}…` : line
  );
  const previewContent = truncatedLines.join("\n");

  // Use Shiki for markdown and JSON, plain for others
  const lowerExt = ext?.toLowerCase();
  if (lowerExt === "md" || lowerExt === "json" || lowerExt === "yaml" || lowerExt === "yml") {
    const lang = EXT_TO_LANG[lowerExt] || "plaintext";
    const highlighted = highlightCode(previewContent, lang);
    return `<pre class="thumbnail-code-preview"><code class="shiki">${highlighted}</code></pre>`;
  }

  // Plain text fallback
  const escaped = truncatedLines.map((line) => escapeHtml(line)).join("\n");

  return `<pre class="thumbnail-text-preview">${escaped}</pre>`;
}

/**
 * Generate CSV preview as a mini table
 * @param {string} content - CSV file content
 * @returns {string} HTML string for table preview
 */
export function generateCsvPreview(content) {
  const rows = parseCsvRows(content, 4); // Max 4 rows
  if (rows.length === 0) {
    return `<div class="thumbnail-csv-empty">Empty CSV</div>`;
  }

  const maxCols = 4;
  const html = rows
    .map((row) => {
      const cells = row
        .slice(0, maxCols)
        .map((cell) => {
          const truncated = cell.length > 8 ? `${cell.slice(0, 8)}…` : cell;
          return `<td>${escapeHtml(truncated)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table class="thumbnail-csv-table">${html}</table>`;
}

/**
 * Simple CSV parser (handles basic CSV, not full RFC 4180)
 * @param {string} content - CSV content
 * @param {number} maxRows - Maximum rows to parse
 * @returns {string[][]} Array of row arrays
 */
function parseCsvRows(content, maxRows) {
  const lines = content.split("\n").filter((line) => line.trim());
  return lines.slice(0, maxRows).map((line) => {
    // Simple split on comma (doesn't handle quoted fields with commas)
    return line.split(",").map((cell) => cell.trim());
  });
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
