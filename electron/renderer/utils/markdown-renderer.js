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

/**
 * Initialize Mermaid with theme-specific configuration
 * @param {boolean} isDark - Whether to use dark theme
 */
function initializeMermaid(isDark = false) {
  const theme = isDark ? "dark" : "default";

  mermaid.initialize({
    startOnLoad: false,
    theme: theme,
    securityLevel: "loose",
    fontFamily: "system-ui, -apple-system, sans-serif",
    themeVariables: isDark
      ? {
          // Dark theme colors
          primaryColor: "#0066cc",
          primaryTextColor: "#f1f5f9",
          primaryBorderColor: "#3b82f6",
          lineColor: "#3b82f6",
          edgeLabelBackground: "#2a2d3a",
          secondaryColor: "#3b82f6",
          tertiaryColor: "#363947",
          textColor: "#f1f5f9",
          mainBkg: "#2a2d3a",
          nodeBorder: "#3b82f6",
          clusterBkg: "#363947",
          clusterBorder: "#3b82f6",
          nodeTextColor: "#f1f5f9",
          // Sequence diagram dark theme
          actorBorder: "#3b82f6",
          actorBkg: "#2a2d3a",
          actorTextColor: "#f1f5f9",
          actorLineColor: "#3b82f6",
          signalColor: "#f1f5f9",
          signalTextColor: "#f1f5f9",
          labelBoxBkgColor: "#363947",
          labelBoxBorderColor: "#3b82f6",
          labelTextColor: "#f1f5f9",
          loopTextColor: "#f1f5f9",
          noteBorderColor: "#3b82f6",
          noteBkgColor: "#363947",
          noteTextColor: "#f1f5f9",
          activationBorderColor: "#3b82f6",
          activationBkgColor: "#0066cc",
          sequenceNumberColor: "#ffffff",
        }
      : {
          // Light theme colors
          primaryColor: "#0066cc",
          primaryTextColor: "#1f2937",
          primaryBorderColor: "#0066cc",
          lineColor: "#0066cc",
          edgeLabelBackground: "#f8f8f6",
          secondaryColor: "#3b82f6",
          tertiaryColor: "#e8e8e6",
          textColor: "#1f2937",
          mainBkg: "#f8f8f6",
          nodeBorder: "#0066cc",
          clusterBkg: "#e8e8e6",
          clusterBorder: "#0066cc",
          nodeTextColor: "#1f2937",
          // Sequence diagram light theme
          actorBorder: "#0066cc",
          actorBkg: "#f8f8f6",
          actorTextColor: "#1f2937",
          actorLineColor: "#0066cc",
          signalColor: "#1f2937",
          signalTextColor: "#1f2937",
          labelBoxBkgColor: "#e8e8e6",
          labelBoxBorderColor: "#0066cc",
          labelTextColor: "#1f2937",
          loopTextColor: "#1f2937",
          noteBorderColor: "#0066cc",
          noteBkgColor: "#e8e8e6",
          noteTextColor: "#1f2937",
          activationBorderColor: "#0066cc",
          activationBkgColor: "#0066cc",
          sequenceNumberColor: "#ffffff",
        },
  });
}

// Initialize Mermaid with current theme
const isDarkMode = document.documentElement.getAttribute("data-theme") === "dark";
initializeMermaid(isDarkMode);

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
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      initializeMermaid(isDark);
      // Re-render all existing diagrams with new theme
      reRenderAllMermaidDiagrams();
    }
  });
});

themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

/**
 * HTML-escape text for safe rendering
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Configure marked with custom renderer
const renderer = new marked.Renderer();

// Syntax highlighting for code blocks
renderer.code = (token) => {
  const code = token.text || "";
  const language = token.lang || "";

  // Handle Mermaid diagrams specially
  if (language === "mermaid") {
    const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
    return `<pre class="mermaid" id="${id}">${escapeHtml(code)}</pre>`;
  }

  // Syntax highlighting for other languages
  if (language && hljs.getLanguage(language)) {
    try {
      const highlighted = hljs.highlight(code, { language }).value;
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
    } catch (_err) {
      // Fall through to plain code on error
    }
  }

  // Fallback to plain code
  return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
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
 * Process Mermaid diagrams in a rendered element
 *
 * IMPORTANT: Only call after streaming is complete or for static content.
 * Calling during streaming causes race conditions with innerHTML replacement.
 *
 * @param {HTMLElement} element - Container element with rendered markdown
 */
export async function processMermaidDiagrams(element) {
  if (!element) return;

  // Clone HTML to temp container to avoid race conditions with DOM mutations
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = element.innerHTML;

  const mermaidBlocks = tempContainer.querySelectorAll("pre.mermaid:not([data-processed])");
  if (mermaidBlocks.length === 0) return;

  // Collect diagram data for concurrent rendering
  const diagramsToRender = Array.from(mermaidBlocks).map((block) => ({
    id: block.id,
    code: block.textContent,
    block: block,
  }));

  // Render all diagrams concurrently
  const renderPromises = diagramsToRender.map(async ({ id, code, block }) => {
    try {
      const { svg } = await mermaid.render(id, code);

      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-wrapper";
      wrapper.dataset.processed = "true";
      wrapper.dataset.mermaidCode = code; // Store original code for theme changes
      wrapper.innerHTML = svg;

      // Fix missing height attribute from viewBox
      const insertedSvg = wrapper.querySelector("svg");
      if (insertedSvg && !insertedSvg.getAttribute("height")) {
        const viewBox = insertedSvg.getAttribute("viewBox");
        if (viewBox) {
          const height = parseFloat(viewBox.split(" ")[3]);
          if (height) insertedSvg.setAttribute("height", height);
        }
      }

      return { block, wrapper };
    } catch (err) {
      console.error(`Mermaid rendering error (${id}):`, err);
      const errorDiv = document.createElement("div");
      errorDiv.className = "mermaid-error";
      errorDiv.textContent = `Mermaid Error: ${err.message}`;
      errorDiv.dataset.processed = "error";
      return { block, wrapper: errorDiv };
    }
  });

  const results = await Promise.all(renderPromises);

  // Replace blocks in temp container
  results.forEach(({ block, wrapper }) => {
    if (block.parentNode) {
      block.parentNode.replaceChild(wrapper, block);
    }
  });

  // Atomic innerHTML replacement prevents race conditions
  if (document.body.contains(element)) {
    element.innerHTML = tempContainer.innerHTML;
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
