/**
 * Scroll utilities for optimized scroll handling
 * Batches scroll updates using requestAnimationFrame to prevent layout thrashing
 * Includes smart auto-scroll that respects user scroll position and detects active scrolling
 */

let scrollPending = false;
let scrollTarget = null;
let scrollForced = false;
let scrollStreaming = false;

// Distance from bottom (in pixels) to consider "near bottom"
const SCROLL_THRESHOLD = 150;
// Larger threshold for streaming (handles large content jumps like code blocks)
const STREAMING_THRESHOLD = 500;

// User scroll detection (prevents scroll fighting during streaming)
const userScrolling = new Map(); // Track which containers have active user scrolling
const ignoreNextScroll = new Map(); // Track programmatic scrolls to ignore in listener
const scrollTimeouts = new Map(); // Debounce timeouts for scroll detection
const SCROLL_DEBOUNCE_MS = 150; // Time to wait after scroll stops before allowing auto-scroll

/**
 * Check if user is near the bottom of the container
 * Used to determine if auto-scroll should happen
 * @param {HTMLElement} container - Container element to check
 * @param {boolean} isStreaming - Whether content is actively streaming (uses larger threshold)
 * @returns {boolean} True if user is near bottom
 */
function isNearBottom(container, isStreaming = false) {
  if (!container) return false;

  // Use larger threshold during streaming to handle large content jumps (code blocks, tables, etc.)
  const threshold = isStreaming ? STREAMING_THRESHOLD : SCROLL_THRESHOLD;
  const position = container.scrollTop + container.clientHeight;
  const bottom = container.scrollHeight;

  return position >= bottom - threshold;
}

/**
 * Handle user scroll event - marks container as actively scrolling
 * @param {HTMLElement} container - Container being scrolled
 */
function handleUserScroll(container) {
  if (!container) return;

  // Ignore programmatic scrolls (triggered by scheduleScroll)
  if (ignoreNextScroll.get(container)) {
    ignoreNextScroll.set(container, false);
    return;
  }

  // Mark as actively scrolling
  userScrolling.set(container, true);

  // Clear existing timeout
  const existingTimeout = scrollTimeouts.get(container);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Set new timeout to clear scrolling flag after debounce period
  const timeout = setTimeout(() => {
    userScrolling.set(container, false);
    scrollTimeouts.delete(container);
  }, SCROLL_DEBOUNCE_MS);

  scrollTimeouts.set(container, timeout);
}

/**
 * Setup scroll detection for a container
 * Call this once for each chat container to enable scroll detection
 * @param {HTMLElement} container - Container element to monitor
 */
export function setupScrollDetection(container) {
  if (!container) return;

  // Prevent duplicate listeners
  if (userScrolling.has(container)) return;

  // Initialize tracking
  userScrolling.set(container, false);

  // Listen for user scroll events
  container.addEventListener("scroll", () => handleUserScroll(container), { passive: true });

  console.log("[ScrollUtils] Scroll detection enabled for container");
}

/**
 * Schedule a scroll operation to be executed on next animation frame
 * Prevents multiple scroll operations per frame (batching optimization)
 * Smart auto-scroll: Only scrolls if user is near bottom (unless forced)
 * Respects active user scrolling to prevent scroll fighting
 *
 * @param {HTMLElement} container - Container element to scroll
 * @param {Object} options - Scroll options
 * @param {boolean} options.force - Force scroll even if user is not at bottom (default: false)
 * @param {boolean} options.streaming - Whether content is actively streaming (uses larger threshold for large content jumps)
 */
export function scheduleScroll(container, options = {}) {
  const { force = false, streaming = false } = options;

  // Check if user is actively scrolling (prevents scroll fighting)
  if (!force && userScrolling.get(container)) {
    console.log("[ScrollUtils] Smart scroll: Skipping auto-scroll - user is actively scrolling");
    return;
  }

  // Only auto-scroll if user is near bottom (or forced)
  // Use larger threshold during streaming to handle large content jumps
  if (!force && !isNearBottom(container, streaming)) {
    const threshold = streaming ? STREAMING_THRESHOLD : SCROLL_THRESHOLD;
    console.log(`[ScrollUtils] Smart scroll: Skipping auto-scroll - user is reading above (threshold: ${threshold}px)`);
    return;
  }

  // Update state immediately to handle rapid calls with different options
  // This ensures a "forced" scroll isn't lost if a standard scroll is already pending
  scrollTarget = container;
  scrollForced = scrollForced || force;
  scrollStreaming = scrollStreaming || streaming;

  if (!scrollPending) {
    scrollPending = true;

    requestAnimationFrame(() => {
      if (scrollTarget) {
        // Mark this scroll as programmatic so the listener ignores it
        ignoreNextScroll.set(scrollTarget, true);
        const currentTarget = scrollTarget; // Capture for timeout closure

        scrollTarget.scrollTop = scrollTarget.scrollHeight;

        // Safety: Clear flag after short delay in case scroll didn't happen/trigger event
        // This prevents blocking the next legitimate user scroll
        setTimeout(() => {
          if (ignoreNextScroll.get(currentTarget)) {
            ignoreNextScroll.set(currentTarget, false);
          }
        }, 50);

        if (scrollForced) {
          console.log("[ScrollUtils] Forced scroll to bottom");
        } else if (scrollStreaming) {
          console.log("[ScrollUtils] Streaming scroll (adaptive threshold)");
        }
        scrollTarget = null;
        scrollForced = false;
        scrollStreaming = false;
      }
      scrollPending = false;
    });
  }
}
