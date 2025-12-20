/**
 * Scroll utilities for optimized scroll handling
 * Batches scroll updates using requestAnimationFrame to prevent layout thrashing
 * Includes smart auto-scroll that respects user scroll position and detects active scrolling
 */

let scrollPending = false;
let scrollTarget = null;
const lastScrollTs = new Map(); // Throttle rapid-fire calls

// Distance from bottom (in pixels) to consider "near bottom" for auto-scroll
// ~8-10 lines of text - if within this range, user is "following along"
// 200px gives buffer room for large content chunks like mermaid placeholders (~100px)
const SCROLL_THRESHOLD = 200;

// User scroll detection (prevents scroll fighting during streaming)
const userScrolling = new Map(); // Track which containers have active user scrolling
const ignoreNextScroll = new Map(); // Track programmatic scrolls to ignore in listener
const scrollTimeouts = new Map(); // Debounce timeouts for scroll detection
const lastScrollState = new Map(); // Track last scroll position to detect content growth vs user scroll
const SCROLL_DEBOUNCE_MS = 150; // Time to wait after scroll stops before allowing auto-scroll

/**
 * Check if user is near the bottom of the container
 * Used to determine if auto-scroll should happen
 * Also checks if we were near the PREVIOUS bottom (handles content growth)
 * @param {HTMLElement} container - Container element to check
 * @returns {boolean} True if user is near bottom or was near previous bottom
 */
function isNearBottom(container) {
  if (!container) return false;

  const position = container.scrollTop + container.clientHeight;
  const bottom = container.scrollHeight;

  // Check if we're near the current bottom
  if (position >= bottom - SCROLL_THRESHOLD) {
    return true;
  }

  // Also check if we were near the PREVIOUS bottom (content just grew)
  // This handles the case where a large chunk (e.g., mermaid placeholder) arrives
  // and pushes us more than SCROLL_THRESHOLD away from the new bottom
  const lastState = lastScrollState.get(container);
  if (lastState && lastState.scrollHeight > 0) {
    const previousBottom = lastState.scrollHeight;
    if (position >= previousBottom - SCROLL_THRESHOLD) {
      return true; // We were at/near the old bottom, content grew
    }
  }

  return false;
}

/**
 * Handle user scroll event - marks container as actively scrolling
 * Distinguishes between actual user scrolling and content-growth-induced scroll events
 * @param {HTMLElement} container - Container being scrolled
 */
function handleUserScroll(container) {
  if (!container) return;

  // Ignore programmatic scrolls (triggered by scheduleScroll)
  if (ignoreNextScroll.get(container)) {
    ignoreNextScroll.set(container, false);
    return;
  }

  // Get current and previous scroll state
  const currentScrollTop = container.scrollTop;
  const currentScrollHeight = container.scrollHeight;
  const lastState = lastScrollState.get(container) || { scrollTop: 0, scrollHeight: 0 };

  // Detect content growth vs user scroll:
  // - Content growth: scrollHeight increased, scrollTop stayed same (or adjusted by browser)
  // - User scroll: scrollTop changed independently of content growth
  const scrollHeightDelta = currentScrollHeight - lastState.scrollHeight;
  const scrollTopDelta = currentScrollTop - lastState.scrollTop;

  // Update stored state
  lastScrollState.set(container, { scrollTop: currentScrollTop, scrollHeight: currentScrollHeight });

  // If nothing changed, this is a spurious scroll event (common during rapid rendering) - ignore
  if (scrollHeightDelta === 0 && scrollTopDelta === 0) {
    return;
  }

  // If scrollHeight grew and scrollTop didn't change much (within tolerance),
  // this is likely content growth, not user scroll - don't mark as user scrolling
  if (scrollHeightDelta > 0 && Math.abs(scrollTopDelta) < 10) {
    return;
  }

  // If user scrolled UP (scrollTop decreased), that's definitely intentional
  // If scrollTop increased by less than content growth, user might have scrolled up relatively
  const isLikelyUserScroll = scrollTopDelta < 0 || (scrollHeightDelta > 0 && scrollTopDelta < scrollHeightDelta - 50);

  if (!isLikelyUserScroll && scrollHeightDelta > 0) {
    // Content grew and user is still following along - not a user scroll
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
  lastScrollState.set(container, {
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
  });

  // Listen for user scroll events
  container.addEventListener("scroll", () => handleUserScroll(container), { passive: true });
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
 */
export function scheduleScroll(container, options = {}) {
  const { force = false } = options;

  // Check if user is actively scrolling (prevents scroll fighting)
  if (!force && userScrolling.get(container)) return;

  // Only auto-scroll if user is near bottom (or forced)
  if (!force && !isNearBottom(container)) return;

  // Throttle rapid-fire calls (cap at ~40fps) to reduce layout pressure on huge sessions
  const now = performance.now();
  const lastTs = lastScrollTs.get(container) || 0;
  if (!force && now - lastTs < 25) {
    return;
  }
  lastScrollTs.set(container, now);

  // Update state to latest call's values (last caller wins)
  // This is consistent with scrollTarget and ensures the most recent intent is honored
  scrollTarget = container;

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

        scrollTarget = null;
      }
      scrollPending = false;
    });
  }
}
