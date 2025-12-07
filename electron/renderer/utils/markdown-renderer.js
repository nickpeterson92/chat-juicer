/**
 * Markdown rendering utility with security sanitization
 * Enhanced with syntax highlighting, math rendering, and Mermaid diagrams
 */

import DOMPurify from "dompurify";
import hljs from "highlight.js";
import katex from "katex";
// Import from npm packages (bundled by Vite)
import { Marked, marked } from "marked";
import markedFootnote from "marked-footnote";
import mermaid from "mermaid";
import { ComponentLifecycle } from "../core/component-lifecycle.js";
import { globalLifecycleManager } from "../core/lifecycle-manager.js";
import { getCSSVariable } from "./css-variables.js";

// Markdown renderer component for lifecycle management
const markdownRendererComponent = {};

// Initialize markdown renderer component once
if (!markdownRendererComponent._lifecycle) {
  ComponentLifecycle.mount(markdownRendererComponent, "MarkdownRenderer", globalLifecycleManager);
}

/**
 * Get Mermaid theme configuration from CSS variables
 * Dynamically reads theme-appropriate colors for diagram rendering
 * @returns {Object} Mermaid configuration object
 */
function getMermaidConfig() {
  // Detect current theme
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  return {
    startOnLoad: false,
    theme: "base", // Use base theme with custom variables
    securityLevel: "loose",
    fontFamily: "system-ui, -apple-system, sans-serif",
    themeVariables: {
      // Primary colors
      primaryColor: getCSSVariable("--color-brand-primary", "#0066cc"),
      primaryTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      primaryBorderColor: getCSSVariable("--color-brand-primary", "#0066cc"),

      // Lines and edges
      lineColor: getCSSVariable("--color-brand-primary", "#0066cc"),
      edgeLabelBackground: getCSSVariable("--color-surface-1", isDark ? "#2a2d3a" : "#f8f8f6"),

      // Secondary and tertiary colors with better contrast
      secondaryColor: isDark ? "#10b981" : "#059669", // Green for variety
      tertiaryColor: isDark ? "#f59e0b" : "#d97706", // Amber for distinction

      // Text
      textColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),

      // Backgrounds
      mainBkg: getCSSVariable("--color-surface-1", isDark ? "#2a2d3a" : "#f8f8f6"),
      nodeBorder: getCSSVariable("--color-brand-primary", "#0066cc"),
      clusterBkg: getCSSVariable("--color-surface-3", isDark ? "#363947" : "#e8e8e6"),
      clusterBorder: getCSSVariable("--color-brand-primary", "#0066cc"),
      nodeTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),

      // Gantt chart specific colors (critical for readability)
      gridColor: isDark ? "#4b5563" : "#d1d5db", // Subtle grid lines
      todayLineColor: getCSSVariable("--color-status-error", "#ef4444"), // Red for today marker

      // Section colors (different background for each section)
      sectionBkgColor: isDark ? "#1e293b" : "#f1f5f9",
      sectionBkgColor2: isDark ? "#334155" : "#e2e8f0",
      altSectionBkgColor: isDark ? "#0f172a" : "#f8fafc",

      // Task colors (colorful bars for tasks)
      taskBkgColor: isDark ? "#3b82f6" : "#2563eb", // Blue
      taskTextColor: "#ffffff",
      taskTextOutsideColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      taskTextClickableColor: getCSSVariable("--color-brand-primary", "#0066cc"),
      taskBorderColor: isDark ? "#1e40af" : "#1d4ed8",

      // Active task (different color for active/in-progress)
      activeTaskBkgColor: getCSSVariable("--color-status-success", "#10b981"), // Green
      activeTaskBorderColor: isDark ? "#059669" : "#047857",

      // Done tasks (completed)
      doneTaskBkgColor: isDark ? "#64748b" : "#94a3b8", // Gray for completed
      doneTaskBorderColor: isDark ? "#475569" : "#64748b",

      // Critical tasks (high priority)
      critBkgColor: getCSSVariable("--color-status-error", "#ef4444"), // Red
      critBorderColor: isDark ? "#dc2626" : "#b91c1c",

      // Pie chart colors (distinct palette for slices)
      pie1: getCSSVariable("--color-brand-primary", "#0066cc"), // Blue
      pie2: getCSSVariable("--color-status-success", "#10b981"), // Green
      pie3: getCSSVariable("--color-status-warning", "#f59e0b"), // Amber
      pie4: getCSSVariable("--color-status-error", "#ef4444"), // Red
      pie5: "#8b5cf6", // Purple
      pie6: "#ec4899", // Pink
      pie7: "#14b8a6", // Teal
      pie8: "#f97316", // Orange
      pie9: "#6366f1", // Indigo
      pie10: "#84cc16", // Lime
      pie11: "#06b6d4", // Cyan
      pie12: "#a855f7", // Violet
      pieTitleTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      pieSectionTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      pieLegendTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      pieStrokeColor: getCSSVariable("--color-surface-1", isDark ? "#1e293b" : "#ffffff"),
      pieStrokeWidth: "2px",
      pieOpacity: "0.9",

      // Sequence diagram specific colors
      actorBorder: getCSSVariable("--color-brand-primary", "#0066cc"),
      actorBkg: getCSSVariable("--color-surface-1", isDark ? "#2a2d3a" : "#f8f8f6"),
      actorTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      actorLineColor: getCSSVariable("--color-brand-primary", "#0066cc"),
      signalColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      signalTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      labelBoxBkgColor: getCSSVariable("--color-surface-3", isDark ? "#363947" : "#e8e8e6"),
      labelBoxBorderColor: getCSSVariable("--color-brand-primary", "#0066cc"),
      labelTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      loopTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      noteBorderColor: getCSSVariable("--color-brand-primary", "#0066cc"),
      noteBkgColor: getCSSVariable("--color-surface-3", isDark ? "#363947" : "#e8e8e6"),
      noteTextColor: getCSSVariable("--color-text-primary", isDark ? "#f1f5f9" : "#191b29"),
      activationBorderColor: getCSSVariable("--color-brand-primary", "#0066cc"),
      activationBkgColor: getCSSVariable("--color-brand-primary", "#0066cc"),
      sequenceNumberColor: "#ffffff", // Always white for contrast on brand color
    },
  };
}

// Initialize Mermaid with dynamic config from CSS variables
mermaid.initialize(getMermaidConfig());

/**
 * Re-render all existing mermaid diagrams with current theme
 */
async function reRenderAllMermaidDiagrams() {
  // Find all rendered mermaid wrappers
  const mermaidWrappers = document.querySelectorAll(".mermaid-wrapper[data-processed]");

  for (const wrapper of mermaidWrappers) {
    // Find the original pre.mermaid element's code
    // We need to store the original code somewhere - let's add it as data attribute
    const svg = wrapper.querySelector("svg");
    if (!svg) continue;

    // Check if we have the original code stored
    const originalCode = wrapper.dataset.mermaidCode;
    if (!originalCode) continue;

    try {
      const id = `mermaid-rerender-${Math.random().toString(36).substring(2, 11)}`;
      const { svg: newSvg } = await mermaid.render(id, originalCode);

      wrapper.innerHTML = newSvg;

      // Fix missing height attribute
      const insertedSvg = wrapper.querySelector("svg");
      if (insertedSvg && !insertedSvg.getAttribute("height")) {
        const viewBox = insertedSvg.getAttribute("viewBox");
        if (viewBox) {
          const height = parseFloat(viewBox.split(" ")[3]);
          if (height) insertedSvg.setAttribute("height", height);
        }
      }
    } catch (err) {
      console.error("[MERMAID] Re-render error:", err.message);
    }
  }
}

// Watch for theme changes and reinitialize Mermaid
const themeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
      console.log("[Mermaid] Theme changed, re-initializing...");
      mermaid.initialize(getMermaidConfig());
      // Re-render all existing diagrams with new theme
      reRenderAllMermaidDiagrams();
    }
  });
});

themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

// Also listen for custom theme-changed event (redundant safety)
document.addEventListener("theme-changed", () => {
  console.log("[Mermaid] Custom theme-changed event, re-initializing...");
  mermaid.initialize(getMermaidConfig());
  reRenderAllMermaidDiagrams();
});

/**
 * HTML-escape text for safe rendering
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Store mermaid code by ID (avoids data attribute sanitization issues)
const mermaidCodeStore = new Map();

// Configure marked with custom renderer
const renderer = new marked.Renderer();

// Syntax highlighting for code blocks
renderer.code = (token) => {
  const code = token.text || "";
  const language = token.lang || "";

  // Handle Mermaid diagrams specially - output loading placeholder immediately
  // This allows spinner to show during streaming before processMermaidDiagrams runs
  if (language === "mermaid") {
    const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
    // Store code in Map to avoid data attribute sanitization issues
    mermaidCodeStore.set(id, code);
    return `<div class="mermaid-wrapper mermaid-loading" data-mermaid-id="${id}"><div class="mermaid-placeholder"><div class="mermaid-spinner"></div><span>Rendering diagram...</span></div></div>`;
  }

  // Syntax highlighting for other languages
  let highlightedCode;
  const _languageLabel = language || "text";

  if (language && hljs.getLanguage(language)) {
    try {
      const highlighted = hljs.highlight(code, { language }).value;
      highlightedCode = `<code class="hljs language-${language}">${highlighted}</code>`;
    } catch (_err) {
      // Fall through to plain code on error
      highlightedCode = `<code class="hljs">${escapeHtml(code)}</code>`;
    }
  } else {
    // Fallback to plain code
    highlightedCode = `<code class="hljs">${escapeHtml(code)}</code>`;
  }

  // Wrap in code-block-wrapper with overlaid copy button inside pre
  // IMPORTANT: No whitespace between wrapper and pre to avoid rendering gaps
  return `<div class="code-block-wrapper"><pre><button class="code-copy-btn" title="Copy code" data-code="${escapeHtml(code).replace(/"/g, "&quot;")}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>${highlightedCode}</pre></div>`;
};

// Configure marked with renderer and extensions (without footnotes for streaming safety)
marked.use({
  renderer,
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert line breaks to <br>
  headerIds: true, // Generate header IDs
  mangle: false, // Don't escape email addresses
  pedantic: false, // Don't use strict markdown rules
  silent: true, // Don't throw on parse errors
});

// Create separate marked instance with footnotes for complete content
// Use the Marked constructor (imported as named export)
const markedWithFootnotes = new Marked({
  renderer,
  gfm: true,
  breaks: true,
  headerIds: true,
  mangle: false,
  pedantic: false,
  silent: true,
});

// Add footnote support to the complete-content parser
try {
  markedWithFootnotes.use(markedFootnote());
} catch (err) {
  console.warn("[MARKDOWN] Footnote extension failed to load:", err.message);
}

/**
 * Render markdown to safe HTML with all extensions
 * @param {string} markdown - Raw markdown text
 * @param {boolean} isComplete - Whether this is complete content (not streaming fragment)
 * @returns {string} Sanitized HTML
 */
export function renderMarkdown(markdown, isComplete = false) {
  if (!markdown) return "";

  let processed = markdown;

  // OPTIMIZATION: Quick check - only process math if delimiters present (40-60% faster)
  const hasMath = /[$\\]/.test(markdown);

  if (hasMath) {
    // OPTIMIZATION: Combined regex pass - single scan instead of 4 separate passes
    // Matches all math delimiters: \[...\], $$...$$, \(...\), $...$
    processed = processed.replace(
      /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g,
      (_match, displayBracket, displayDollar, inlineParen, inlineDollar) => {
        const math = displayBracket || displayDollar || inlineParen || inlineDollar;
        const displayMode = !!(displayBracket || displayDollar);

        try {
          return katex.renderToString(math, {
            displayMode,
            throwOnError: false,
            output: "html",
          });
        } catch (err) {
          console.error("[MATH ERROR]", err.message);
          return `<span class="math-error">${err.message}</span>`;
        }
      }
    );
  }

  // Parse markdown to HTML with error handling for streaming fragments
  // Use footnote-enabled parser only for complete content to avoid tokenizer errors
  let rawHtml;
  try {
    if (isComplete) {
      // Complete content: use parser with footnote support
      rawHtml = markedWithFootnotes.parse(processed);
    } else {
      // Streaming fragment: use basic parser without footnotes
      rawHtml = marked.parse(processed);
    }
  } catch (err) {
    // During streaming, fragments may be incomplete - return plain text wrapped in <p>
    console.warn("[MARKDOWN] Parse error (likely streaming fragment):", err.message);
    return DOMPurify.sanitize(`<p>${escapeHtml(markdown)}</p>`);
  }

  // Sanitize to prevent XSS attacks (expanded allowlist for extensions)
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "code",
      "pre",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "del",
      "ins",
      // Footnote elements
      "sup",
      "sub",
      "section",
      // Images
      "img",
      // Task lists
      "input",
      // Code copy button
      "button",
      // Extended markdown elements
      "dl",
      "dt",
      "dd",
      "abbr",
      "kbd",
      "mark",
      "details",
      "summary",
      // KaTeX elements
      "span",
      "div",
      "annotation",
      "semantics",
      "math",
      "mi",
      "mo",
      "mn",
      "ms",
      "mtext",
      "mrow",
      "mfrac",
      "msup",
      "msub",
      "msubsup",
      "mover",
      "munder",
      "munderover",
      // Comprehensive SVG elements for Mermaid diagrams
      "svg",
      "g",
      "path",
      "rect",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "text",
      "tspan",
      "textPath",
      "use",
      "defs",
      "marker",
      "clipPath",
      "mask",
      "pattern",
      "linearGradient",
      "radialGradient",
      "stop",
      "foreignObject",
    ],
    ALLOWED_ATTR: [
      "href",
      "class",
      "id",
      "style",
      // Image attributes
      "src",
      "alt",
      "title",
      "loading",
      "decoding",
      // Input attributes (for task lists)
      "type",
      "checked",
      "disabled",
      // Button attributes (for code copy button)
      "data-code",
      // Table attributes
      "align",
      "colspan",
      "rowspan",
      // Details/summary attributes
      "open",
      // KaTeX attributes
      "aria-hidden",
      "focusable",
      // Comprehensive SVG attributes for Mermaid
      "viewBox",
      "preserveAspectRatio",
      "xmlns",
      "xmlns:xlink",
      "d",
      "width",
      "height",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-dasharray",
      "stroke-linecap",
      "stroke-linejoin",
      "opacity",
      "fill-opacity",
      "stroke-opacity",
      "transform",
      "transform-origin",
      "points",
      // Text attributes
      "text-anchor",
      "dominant-baseline",
      "alignment-baseline",
      "font-size",
      "font-family",
      "font-weight",
      "font-style",
      // Marker attributes
      "marker-start",
      "marker-mid",
      "marker-end",
      "markerWidth",
      "markerHeight",
      "refX",
      "refY",
      "orient",
      // Gradient attributes
      "gradientUnits",
      "gradientTransform",
      "offset",
      "stop-color",
      "stop-opacity",
      // Use/clip attributes
      "xlink:href",
      "clip-path",
      "mask",
      // Mermaid data attributes
      "data-processed",
      "data-id",
    ],
    ALLOW_DATA_ATTR: true,
  });

  return cleanHtml;
}

/**
 * Fix SVG height attribute from viewBox if missing
 * @param {HTMLElement} wrapper - Mermaid wrapper element
 */
function fixMermaidSvgHeight(wrapper) {
  const svg = wrapper.querySelector("svg");
  if (svg && !svg.getAttribute("height")) {
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const height = parseFloat(viewBox.split(" ")[3]);
      if (height) svg.setAttribute("height", height);
    }
  }
}

/**
 * Render a single diagram during idle time
 * @param {Object} diagram - Diagram info { id, code, placeholder }
 * @returns {Promise<void>}
 */
function renderDiagramWhenIdle({ id, code, placeholder }) {
  return new Promise((resolve) => {
    const doRender = async () => {
      try {
        const { svg } = await mermaid.render(id, code);
        placeholder.innerHTML = svg;
        placeholder.classList.remove("mermaid-loading");
        placeholder.dataset.processed = "true";
        placeholder.dataset.mermaidCode = code;
        fixMermaidSvgHeight(placeholder);
      } catch (err) {
        console.error(`Mermaid rendering error (${id}):`, err);
        placeholder.innerHTML = `<div class="mermaid-error">Mermaid Error: ${err.message}</div>`;
        placeholder.classList.remove("mermaid-loading");
        placeholder.dataset.processed = "error";
      }
      resolve();
    };

    // Use requestIdleCallback for non-blocking render, fallback to setTimeout
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(doRender, { timeout: 2000 });
    } else {
      setTimeout(doRender, 0);
    }
  });
}

/**
 * Process Mermaid diagrams in a rendered element with progressive loading
 *
 * The loading placeholders are rendered inline during markdown parsing (via renderer.code),
 * so users see spinners immediately during streaming. This function renders the actual
 * diagrams progressively using requestIdleCallback to keep UI responsive.
 *
 * Scroll behavior is handled by the caller via scheduleScroll() which has user-scroll
 * detection to prevent scroll fighting.
 *
 * IMPORTANT: Only call after streaming is complete or for static content.
 *
 * @param {HTMLElement} element - Container element with rendered markdown
 */
export async function processMermaidDiagrams(element) {
  if (!element) return;

  // Find loading placeholders (created by renderer.code during markdown parsing)
  const loadingWrappers = element.querySelectorAll(".mermaid-wrapper.mermaid-loading:not([data-processed])");
  if (loadingWrappers.length === 0) return;

  // Build list of diagrams to render from Map storage
  const diagramsToRender = [];
  for (const wrapper of loadingWrappers) {
    const id = wrapper.dataset.mermaidId;
    const code = mermaidCodeStore.get(id);

    if (id && code) {
      diagramsToRender.push({
        id,
        code,
        placeholder: wrapper,
      });
    } else {
      // Don't leave it stuck - show error for missing data
      console.error(`[MERMAID] Missing data for placeholder: id=${id}, inStore=${mermaidCodeStore.has(id)}`);
      wrapper.innerHTML = `<div class="mermaid-error">Mermaid Error: Missing diagram data</div>`;
      wrapper.classList.remove("mermaid-loading");
      wrapper.dataset.processed = "error";
    }
  }

  // Render progressively using idle callbacks
  // Each diagram renders when the browser is idle, keeping UI responsive
  for (const diagram of diagramsToRender) {
    await renderDiagramWhenIdle(diagram);
  }
}

/**
 * Check if text contains markdown syntax (heuristic)
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function hasMarkdown(text) {
  if (!text) return false;

  // Quick heuristic checks for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/m, // Headers
    /\*\*.*\*\*/, // Bold
    /_.*_/, // Italic
    /\[.*\]\(.*\)/, // Links
    /^```/m, // Code blocks
    /^[-*+]\s/m, // Lists
    /^\d+\.\s/m, // Ordered lists
    /\$.*?\$/, // Math expressions
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}

/**
 * Initialize copy buttons for code blocks
 * Call this after rendering markdown to attach event listeners
 * @param {HTMLElement} container - Container element with rendered markdown
 */
export function initializeCodeCopyButtons(container) {
  if (!container) return;

  const copyButtons = container.querySelectorAll(".code-copy-btn");

  copyButtons.forEach((button) => {
    // Remove any existing listeners to avoid duplicates
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);

    newButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.currentTarget;
      const code = btn.getAttribute("data-code");

      if (!code) return;

      try {
        // Decode HTML entities for proper copy
        const textarea = document.createElement("textarea");
        textarea.innerHTML = code;
        const decodedCode = textarea.value;

        await navigator.clipboard.writeText(decodedCode);

        // Visual feedback - change icon to checkmark
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;
        btn.classList.add("copied");

        // Reset after 2 seconds (lifecycle-managed)
        markdownRendererComponent.setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.classList.remove("copied");
        }, 2000);
      } catch (err) {
        console.error("[COPY] Failed to copy code:", err);

        // Fallback visual feedback on error
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>`;

        markdownRendererComponent.setTimeout(() => {
          btn.innerHTML = originalHTML;
        }, 2000);
      }
    });
  });
}
