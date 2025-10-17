/**
 * JSON parsing utilities with LRU caching
 * Caches parsed JSON to avoid redundant parsing operations
 */

const parseCache = new Map();
const MAX_CACHE_SIZE = 50;

/**
 * Parse JSON with caching and safe error handling
 * Uses LRU eviction when cache exceeds MAX_CACHE_SIZE
 * @param {string} jsonStr - JSON string to parse
 * @param {any} defaultValue - Value to return on parse error
 * @returns {any} Parsed JSON or defaultValue
 */
export function safeParse(jsonStr, defaultValue = null) {
  if (!jsonStr || typeof jsonStr !== "string") {
    return defaultValue;
  }

  // Check cache first
  if (parseCache.has(jsonStr)) {
    return parseCache.get(jsonStr);
  }

  try {
    const result = JSON.parse(jsonStr);

    // Cache with LRU eviction
    if (parseCache.size >= MAX_CACHE_SIZE) {
      const firstKey = parseCache.keys().next().value;
      parseCache.delete(firstKey);
    }
    parseCache.set(jsonStr, result);

    return result;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Clear the JSON parse cache
 * Should be called on session switches to prevent stale data
 */
export function clearParseCache() {
  parseCache.clear();
}
