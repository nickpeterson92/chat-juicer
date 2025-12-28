/**
 * Tool Registry - Centralized configuration for function call rendering.
 *
 * Each tool entry contains:
 * - icon: SVG string for the tool icon
 * - name: Human-readable display name
 * - hasCustomRenderer: Whether to skip generic args display
 * - priorityArg: Key to extract for collapsed card subtitle
 *
 * To add a new tool: add an entry here, then optionally add a custom renderer.
 */

// Default icon for unregistered tools
const DEFAULT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>';

/**
 * Tool configuration registry.
 * Keys are normalized (lowercase, no underscores/hyphens).
 */
export const TOOL_REGISTRY = {
  // === File Operations ===
  readfile: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M16 12h2"/><path d="M16 8h2"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/><path d="M6 12h2"/><path d="M6 8h2"/></svg>',
    name: "Read",
    hasCustomRenderer: true,
    priorityArg: "path",
  },
  listdirectory: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/></svg>',
    name: "List",
    hasCustomRenderer: true,
    priorityArg: "path",
  },
  searchfiles: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    name: "File Search",
    hasCustomRenderer: true,
    priorityArg: "pattern",
  },
  editfile: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.226 5.226-2.52-2.52A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.351"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/></svg>',
    name: "Edit",
    hasCustomRenderer: true,
    priorityArg: "path",
  },
  textedit: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.226 5.226-2.52-2.52A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.351"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/></svg>',
    name: "Edit",
    hasCustomRenderer: false,
    priorityArg: "path",
  },
  regexedit: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.226 5.226-2.52-2.52A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.351"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/></svg>',
    name: "Regex",
    hasCustomRenderer: false,
    priorityArg: "path",
  },
  inserttext: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.226 5.226-2.52-2.52A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.351"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><path d="M8 18h1"/></svg>',
    name: "Insert",
    hasCustomRenderer: false,
    priorityArg: "path",
  },
  generatedocument: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>',
    name: "Generate",
    hasCustomRenderer: false,
    priorityArg: "name",
  },

  // === Sequential Thinking ===
  sequentialthinking: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></svg>',
    name: "Thought",
    hasCustomRenderer: false,
    priorityArg: "thought",
  },

  // === Web/Fetch ===
  fetch: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z"/></svg>',
    name: "Fetch",
    hasCustomRenderer: true,
    priorityArg: "url",
  },

  // === Tavily MCP Tools ===
  tavilysearch: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    name: "Web Search",
    hasCustomRenderer: true,
    priorityArg: "query",
  },
  tavilyextract: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"/><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"/><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"/><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"/></svg>',
    name: "Extract",
    hasCustomRenderer: true,
    priorityArg: "urls",
  },
  tavilymap: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/><path d="M9 3v15M15 6v15"/></svg>',
    name: "Map",
    hasCustomRenderer: true,
    priorityArg: "url",
  },
  tavilycrawl: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 12-1.5 3"/><path d="M19.63 18.81 22 20"/><path d="M6.47 8.23a1.68 1.68 0 0 1 2.44 1.93l-.64 2.08a6.76 6.76 0 0 0 10.16 7.67l.42-.27a1 1 0 1 0-2.73-4.21l-.42.27a1.76 1.76 0 0 1-2.63-1.99l.64-2.08A6.66 6.66 0 0 0 3.94 3.9l-.7.4a1 1 0 1 0 2.55 4.34z"/></svg>',
    name: "Crawl",
    hasCustomRenderer: true,
    priorityArg: "url",
  },

  // === Summarization ===
  summarizeconversation: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>',
    name: "Summarize",
    hasCustomRenderer: false,
    priorityArg: null,
  },

  // === Code Interpreter ===
  executepythoncode: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>',
    name: "Code",
    hasCustomRenderer: false,
    priorityArg: "code",
  },

  // === Schema Fetch Tools ===
  listregistereddatabases: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>',
    name: "Databases",
    hasCustomRenderer: true,
    priorityArg: null,
  },
  gettableschema: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
    name: "Schema",
    hasCustomRenderer: true,
    priorityArg: "table_name",
  },
  salesforce: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19c0-1.7-1.3-3-3-3h-1.1c-.3-1.8-1.9-3.2-3.8-3.2-2.1 0-3.9 1.6-4.1 3.7C3.1 16.9 1.5 18.8 1.5 21h16c1.7 0 3-1.3 3-3z"/><path d="M11.5 10V2"/><path d="M6 7l5.5-5 5.5 5"/></svg>',
    name: "Salesforce",
    hasCustomRenderer: false,
    priorityArg: null,
  },
};

/**
 * Normalize a tool name for registry lookup.
 * Strips prefixes (mcp_, wrapped_) and normalizes casing/separators.
 * @param {string} name - Raw tool name
 * @returns {string} Normalized key
 */
export function normalizeToolName(name) {
  return name
    .replace(/^(mcp_|wrapped_)/, "")
    .toLowerCase()
    .replace(/[_-]/g, "");
}

/**
 * Get tool configuration from registry.
 * @param {string} toolName - Raw or normalized tool name
 * @returns {Object} Tool config (or default config if not registered)
 */
export function getToolConfig(toolName) {
  const key = normalizeToolName(toolName);
  return (
    TOOL_REGISTRY[key] || {
      icon: DEFAULT_ICON,
      name: null, // Will use default formatting
      hasCustomRenderer: false,
      priorityArg: null,
    }
  );
}

/**
 * Get SVG icon for a tool.
 * @param {string} toolName - Tool name
 * @returns {string} SVG string
 */
export function getToolIcon(toolName) {
  return getToolConfig(toolName).icon;
}

/**
 * Get display name for a tool.
 * @param {string} toolName - Tool name
 * @returns {string} Human-readable name
 */
export function getToolDisplayName(toolName) {
  const config = getToolConfig(toolName);
  if (config.name) {
    return config.name;
  }
  // Default: capitalize and clean up
  return toolName
    .replace(/^(mcp_|wrapped_)/, "")
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Check if a tool has a custom result renderer (skip generic args display).
 * @param {string} toolName - Tool name
 * @returns {boolean}
 */
export function hasCustomRenderer(toolName) {
  return getToolConfig(toolName).hasCustomRenderer;
}

/**
 * Get the priority argument key for collapsed card subtitle.
 * @param {string} toolName - Tool name
 * @returns {string|null}
 */
export function getPriorityArg(toolName) {
  return getToolConfig(toolName).priorityArg;
}
