/**
 * Markdown rendering utility with security sanitization
 * Enhanced with syntax highlighting, math rendering, and Mermaid diagrams
 */

import DOMPurify from "dompurify";
import katex from "katex";
// Import from npm packages (bundled by Vite)
import { Marked, marked } from "marked";
import markedFootnote from "marked-footnote";
import mermaid from "mermaid";
import { createHighlighter } from "shiki";
import snazzyTheme from "../../ui/shiki-snazzy.json";
import { ComponentLifecycle } from "../core/component-lifecycle.js";
import { globalLifecycleManager } from "../core/lifecycle-manager.js";
import { getCSSVariable } from "./css-variables.js";

// Shiki highlighter - initialized async, used sync once ready
let shikiHighlighter = null;

// Common languages to pre-load for best performance
const SHIKI_LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "html",
  "css",
  "json",
  "yaml",
  "markdown",
  "bash",
  "shell",
  "sql",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "csharp",
  "ruby",
  "php",
  "swift",
];

// Initialize Shiki with WASM engine (fast, CSP allows wasm-unsafe-eval)
createHighlighter({
  themes: [snazzyTheme],
  langs: SHIKI_LANGUAGES,
})
  .then((highlighter) => {
    shikiHighlighter = highlighter;
    console.log("[Shiki] Syntax highlighter initialized");
  })
  .catch((err) => {
    console.error("[Shiki] Failed to initialize:", err);
  });

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
  // Single dark-friendly palette pulled from CSS tokens
  // Higher-contrast, dark-friendly palette for ER diagrams (hard-coded to avoid CSS var overrides)
  const primaryColor = "#7dd3fc"; // light blue accent
  const textColor = "#e5e7eb";
  const surface1 = "#0b1220"; // base canvas
  const surface2 = "#111827"; // entity fill
  const surface3 = "#182235"; // headers/alt rows
  const borderStrong = "#94a3b8";
  const successColor = getCSSVariable("--color-status-success", "#22c55e");
  const warningColor = getCSSVariable("--color-status-warning", "#f59e0b");
  const errorColor = getCSSVariable("--color-status-error", "#ef4444");

  return {
    startOnLoad: false,
    theme: "base", // Use base theme with custom variables
    securityLevel: "loose",
    fontFamily: "system-ui, -apple-system, sans-serif",
    themeVariables: {
      // Primary colors
      primaryColor,
      primaryTextColor: textColor,
      primaryBorderColor: primaryColor,

      // Lines and edges
      lineColor: primaryColor,
      edgeLabelBackground: surface1,

      // Secondary and tertiary colors with better contrast
      secondaryColor: successColor, // Green for variety
      tertiaryColor: warningColor, // Amber for distinction

      // Text
      textColor,

      // Backgrounds
      mainBkg: surface1,
      nodeBorder: primaryColor,
      clusterBkg: surface3,
      clusterBorder: primaryColor,
      nodeTextColor: textColor,

      // Gantt chart specific colors (critical for readability)
      gridColor: "#475569",
      todayLineColor: errorColor, // Red for today marker

      // Section colors (different background for each section)
      sectionBkgColor: surface2,
      sectionBkgColor2: surface3,
      altSectionBkgColor: surface1,

      // Task colors (colorful bars for tasks)
      taskBkgColor: "#3b82f6", // Blue
      taskTextColor: "#ffffff",
      taskTextOutsideColor: textColor,
      taskTextClickableColor: primaryColor,
      taskBorderColor: "#1d4ed8",

      // Active task (different color for active/in-progress)
      activeTaskBkgColor: successColor, // Green
      activeTaskBorderColor: "#059669",

      // Done tasks (completed)
      doneTaskBkgColor: "#94a3b8", // Gray for completed
      doneTaskBorderColor: "#64748b",

      // Critical tasks (high priority)
      critBkgColor: errorColor, // Red
      critBorderColor: "#dc2626",

      // Pie chart colors (distinct palette for slices)
      pie1: primaryColor, // Blue
      pie2: successColor, // Green
      pie3: warningColor, // Amber
      pie4: errorColor, // Red
      pie5: "#8b5cf6", // Purple
      pie6: "#ec4899", // Pink
      pie7: "#14b8a6", // Teal
      pie8: "#f97316", // Orange
      pie9: "#6366f1", // Indigo
      pie10: "#84cc16", // Lime
      pie11: "#06b6d4", // Cyan
      pie12: "#a855f7", // Violet
      pieTitleTextColor: textColor,
      pieSectionTextColor: textColor,
      pieLegendTextColor: textColor,
      pieStrokeColor: surface1,
      pieStrokeWidth: "2px",
      pieOpacity: "0.9",

      // Sequence diagram specific colors
      actorBorder: primaryColor,
      actorBkg: surface1,
      actorTextColor: textColor,
      actorLineColor: primaryColor,
      signalColor: textColor,
      signalTextColor: textColor,
      labelBoxBkgColor: surface3,
      labelBoxBorderColor: primaryColor,
      labelTextColor: textColor,
      loopTextColor: textColor,
      noteBorderColor: primaryColor,
      noteBkgColor: surface3,
      noteTextColor: textColor,
      activationBorderColor: primaryColor,
      activationBkgColor: primaryColor,
      sequenceNumberColor: "#ffffff", // Always white for contrast on brand color
    },
    // Explicit ER diagram styling for readability in dark mode
    themeCSS: `
      /* ER diagram global primitives (fallback catch-alls) */
      .er rect,
      .er polygon {
        fill: ${surface2} !important;
        stroke: ${borderStrong} !important;
        stroke-width: 1.6px !important;
      }
      .er path,
      .er line {
        stroke: ${primaryColor} !important;
        stroke-width: 2px !important;
        fill: none !important;
      }
      .er text,
      .er .label {
        fill: ${textColor} !important;
        font-weight: 500 !important;
      }
      /* Entity shells */
      .er .entityBox {
        fill: ${surface3} !important;
        stroke: ${borderStrong} !important;
        stroke-width: 2px !important;
      }
      .er .entityLabel {
        fill: ${textColor} !important;
        font-weight: 700 !important;
      }
      /* Attribute rows */
      .er .attributeBoxEven {
        fill: ${surface2} !important;
        stroke: ${borderStrong} !important;
        stroke-width: 1.4px !important;
      }
      .er .attributeBoxOdd {
        fill: ${surface1} !important;
        stroke: ${borderStrong} !important;
        stroke-width: 1.4px !important;
      }
      .er .attributeLabel {
        fill: ${textColor} !important;
        font-weight: 500 !important;
      }
      .er .key {
        fill: ${warningColor} !important;
        font-weight: 700 !important;
      }
      /* Relationships */
      .er .relationshipLabel {
        fill: ${textColor} !important;
        font-weight: 600 !important;
      }
      .er .relationshipLine {
        stroke: ${primaryColor} !important;
        stroke-width: 2.25px !important;
      }
      /* Relationship label backgrounds and markers */
      .er .relationshipLabelBox,
      .er .labelBkg,
      .er .edgeLabel .label {
        fill: ${surface2} !important;
        background-color: ${surface2} !important;
        color: ${textColor} !important;
      }
      .er .edgeLabel .label {
        font-weight: 600 !important;
      }
      .er .marker {
        fill: none !important;
        stroke: ${primaryColor} !important;
        stroke-width: 1.25px !important;
      }
      /* Row fills and borders (Mermaid uses inline hsl fills on path nodes) */
      .er .row-rect-odd path,
      svg.erDiagram .row-rect-odd path,
      .erDiagram .row-rect-odd path,
      svg[id^="mermaid-"] .row-rect-odd path {
        fill: ${surface2} !important;
        stroke: ${borderStrong} !important;
        stroke-width: 1.4px !important;
      }
      .er .row-rect-even path,
      svg.erDiagram .row-rect-even path,
      .erDiagram .row-rect-even path,
      svg[id^="mermaid-"] .row-rect-even path {
        fill: ${surface1} !important;
        stroke: ${borderStrong} !important;
        stroke-width: 1.4px !important;
      }
      /* Generic node fallback (Mermaid sometimes uses .node) */
      .er .node rect,
      .er .node polygon {
        fill: ${surface2} !important;
        stroke: ${borderStrong} !important;
        stroke-width: 1.25px !important;
      }
    `,
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

// Track diagrams currently being rendered to prevent double-renders
const renderingInProgress = new Set();

// Singleton IntersectionObserver for visible-first rendering
let mermaidObserver = null;

// Batching mechanism for processMermaidDiagrams calls during session load
const pendingElements = new Set();
let batchTimeout = null;
const BATCH_DELAY_MS = 50; // Wait 50ms to collect all elements before processing

// Scroll-based fallback for large conversations where observer may miss elements
let scrollFallbackTimeout = null;
let scrollFallbackInitialized = false;

// Concurrency control for Mermaid rendering
const MAX_MERMAID_CONCURRENCY = 2;
let activeMermaidRenders = 0;
const mermaidRenderQueue = [];

function scheduleMermaidRender(diagram) {
  const run = () => {
    activeMermaidRenders += 1;
    renderDiagramWhenIdle(diagram)
      .catch(() => {})
      .finally(() => {
        // Always clear in-progress flag so future renders can proceed if needed
        renderingInProgress.delete(diagram.id);
        activeMermaidRenders = Math.max(0, activeMermaidRenders - 1);
        const next = mermaidRenderQueue.shift();
        if (next) {
          scheduleMermaidRender(next);
        }
      });
  };

  if (activeMermaidRenders >= MAX_MERMAID_CONCURRENCY) {
    mermaidRenderQueue.push(diagram);
    return;
  }

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 1000 });
  } else {
    setTimeout(run, 0);
  }
}

/**
 * Get or create the mermaid visibility observer
 * Renders diagrams only when they enter the viewport
 * @returns {IntersectionObserver}
 */
function getMermaidObserver() {
  if (mermaidObserver) return mermaidObserver;

  mermaidObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const wrapper = entry.target;
          const id = wrapper.dataset.mermaidId;

          // Skip if already rendering or processed
          if (renderingInProgress.has(id) || wrapper.dataset.processed) {
            mermaidObserver.unobserve(wrapper);
            continue;
          }

          const code = mermaidCodeStore.get(id);
          if (id && code) {
            // Mark as rendering and trigger
            renderingInProgress.add(id);
            mermaidObserver.unobserve(wrapper);

            renderDiagramWhenIdle({ id, code, placeholder: wrapper }).then(() => {
              renderingInProgress.delete(id);
            });
          }
        }
      }
    },
    {
      // Start rendering when diagram is within 200px of viewport
      rootMargin: "200px 0px",
      threshold: 0,
    }
  );

  return mermaidObserver;
}

// Configure marked with custom renderer
const renderer = new marked.Renderer();

// Syntax highlighting for code blocks using Shiki
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

  // Syntax highlighting using Shiki (if ready) or fallback to plain text
  let highlightedCode;
  const lang = language || "text";

  if (shikiHighlighter) {
    try {
      // Check if the language is loaded, otherwise use plaintext
      const loadedLangs = shikiHighlighter.getLoadedLanguages();
      const effectiveLang = loadedLangs.includes(lang) ? lang : "plaintext";

      // Shiki returns full HTML with <pre><code>...</code></pre>
      // We need to extract just the inner content for our wrapper
      const html = shikiHighlighter.codeToHtml(code, {
        lang: effectiveLang,
        theme: "Snazzy",
      });

      // Shiki outputs: <pre class="shiki" style="..."><code>...</code></pre>
      // We want just the inner code element content
      const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
      if (codeMatch) {
        highlightedCode = `<code class="shiki language-${lang}">${codeMatch[1]}</code>`;
      } else {
        highlightedCode = `<code class="shiki language-${lang}">${escapeHtml(code)}</code>`;
      }
    } catch (_err) {
      // Fall through to plain code on error
      highlightedCode = `<code class="shiki">${escapeHtml(code)}</code>`;
    }
  } else {
    // Shiki not ready yet - fallback to plain escaped code
    highlightedCode = `<code class="shiki">${escapeHtml(code)}</code>`;
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
      // Accessibility attributes (KaTeX, footnotes, etc.)
      "aria-hidden",
      "aria-label",
      "aria-describedby",
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
      } finally {
        // Defensive guard: ensure processed flag is always set for downstream checks/tests
        if (!placeholder.dataset.processed) {
          placeholder.dataset.processed = "error";
        }
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
 * Check if an element is currently visible in the viewport
 * @param {HTMLElement} el - Element to check
 * @returns {boolean} True if element is in or near viewport
 */
function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  // Consider visible if within 200px of viewport (matches observer rootMargin)
  return rect.top < windowHeight + 200 && rect.bottom > -200;
}

/**
 * Scroll-based fallback to catch diagrams the IntersectionObserver may have missed
 * For large conversations, the observer can become unreliable
 */
function checkVisibleDiagramsFallback() {
  // Find all unprocessed loading diagrams
  const loadingWrappers = document.querySelectorAll(".mermaid-wrapper.mermaid-loading:not([data-processed])");

  for (const wrapper of loadingWrappers) {
    if (!isInViewport(wrapper)) continue;

    const id = wrapper.dataset.mermaidId;
    if (!id || renderingInProgress.has(id)) continue;

    const code = mermaidCodeStore.get(id);
    if (!code) continue;

    // Render this visible diagram that was missed
    renderingInProgress.add(id);

    // Unobserve to prevent duplicate renders
    if (mermaidObserver) {
      mermaidObserver.unobserve(wrapper);
    }

    scheduleMermaidRender({ id, code, placeholder: wrapper });
  }
}

/**
 * Initialize scroll-based fallback for large conversations
 * Uses debounced scroll listener to periodically check for missed diagrams
 */
function initScrollFallback() {
  if (scrollFallbackInitialized) return;
  scrollFallbackInitialized = true;

  const chatContainer = document.getElementById("chat-container");
  if (!chatContainer) return;

  chatContainer.addEventListener(
    "scroll",
    () => {
      // Debounce: wait 200ms after scroll stops before checking
      if (scrollFallbackTimeout) {
        clearTimeout(scrollFallbackTimeout);
      }
      scrollFallbackTimeout = setTimeout(checkVisibleDiagramsFallback, 200);
    },
    { passive: true }
  );
}

/**
 * Process a batch of collected elements for mermaid diagrams
 * Called after batching delay to handle multiple rapid processMermaidDiagrams calls
 */
async function processBatchedMermaidDiagrams() {
  // Collect all pending elements and clear the set
  const elements = Array.from(pendingElements);
  pendingElements.clear();
  batchTimeout = null;

  if (elements.length === 0) return;

  // Initialize scroll-based fallback for large conversations
  initScrollFallback();

  // Find ALL loading placeholders across all pending elements
  const allWrappers = [];
  for (const element of elements) {
    if (!element || !document.body.contains(element)) continue;
    const wrappers = element.querySelectorAll(".mermaid-wrapper.mermaid-loading:not([data-processed])");
    for (const wrapper of wrappers) {
      allWrappers.push(wrapper);
    }
  }

  if (allWrappers.length === 0) return;

  const observer = getMermaidObserver();
  const visibleDiagrams = [];
  const deferredWrappers = [];

  // Separate visible from off-screen diagrams (across ALL messages)
  for (const wrapper of allWrappers) {
    const id = wrapper.dataset.mermaidId;
    const code = mermaidCodeStore.get(id);

    if (!id || !code) {
      console.error(`[MERMAID] Missing data for placeholder: id=${id}, inStore=${mermaidCodeStore.has(id)}`);
      wrapper.innerHTML = `<div class="mermaid-error">Mermaid Error: Missing diagram data</div>`;
      wrapper.classList.remove("mermaid-loading");
      wrapper.dataset.processed = "error";
      continue;
    }

    // Skip if already being rendered
    if (renderingInProgress.has(id)) continue;

    if (isInViewport(wrapper)) {
      visibleDiagrams.push({ id, code, placeholder: wrapper });
    } else {
      deferredWrappers.push(wrapper);
    }
  }

  // Visible diagrams: queue via concurrency-controlled scheduler
  for (const diagram of visibleDiagrams) {
    if (renderingInProgress.has(diagram.id)) continue;
    renderingInProgress.add(diagram.id);
    scheduleMermaidRender(diagram);
  }

  // Off-screen diagrams: observe only; render when in view
  for (const wrapper of deferredWrappers) {
    observer.observe(wrapper);
  }
}

/**
 * Process Mermaid diagrams in a rendered element with visible-first progressive loading
 *
 * Uses batching to coordinate multiple rapid calls (e.g., during session load).
 * When multiple messages load at once, their diagrams are batched and processed
 * together for optimal visible-first rendering.
 *
 * Rendering strategy:
 * 1. **Batching**: Collects elements for 50ms before processing
 * 2. **Visible-first**: Diagrams in viewport render immediately
 * 3. **Lazy loading**: Off-screen diagrams render when scrolled into view
 *
 * @param {HTMLElement} element - Container element with rendered markdown
 */
export async function processMermaidDiagrams(element) {
  if (!element) return;

  // Quick check - any diagrams to process?
  const hasWrappers = element.querySelector(".mermaid-wrapper.mermaid-loading:not([data-processed])");
  if (!hasWrappers) return;

  // Add to pending batch
  pendingElements.add(element);

  // Schedule batch processing (debounced)
  if (!batchTimeout) {
    batchTimeout = setTimeout(processBatchedMermaidDiagrams, BATCH_DELAY_MS);
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

/**
 * Highlight code using Shiki (for use by other modules like function-card-ui)
 * @param {string} code - Code to highlight
 * @param {string} language - Language for syntax highlighting
 * @returns {string} Highlighted HTML (inner content only, no wrapper tags)
 */
export function highlightCode(code, language = "plaintext") {
  if (!shikiHighlighter) {
    // Shiki not ready, return escaped plain text
    return escapeHtml(code);
  }

  try {
    const loadedLangs = shikiHighlighter.getLoadedLanguages();
    const effectiveLang = loadedLangs.includes(language) ? language : "plaintext";

    const html = shikiHighlighter.codeToHtml(code, {
      lang: effectiveLang,
      theme: "Snazzy",
    });

    // Extract just the inner content from <code>...</code>
    const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
    return codeMatch ? codeMatch[1] : escapeHtml(code);
  } catch (_err) {
    return escapeHtml(code);
  }
}
