/**
 * Scroll utilities for optimized scroll handling
 * Batches scroll updates using requestAnimationFrame to prevent layout thrashing
 */

let scrollPending = false;
let scrollTarget = null;

/**
 * Schedule a scroll operation to be executed on next animation frame
 * Prevents multiple scroll operations per frame (batching optimization)
 * @param {HTMLElement} container - Container element to scroll
 */
export function scheduleScroll(container) {
  scrollTarget = container;

  if (!scrollPending) {
    scrollPending = true;
    requestAnimationFrame(() => {
      if (scrollTarget) {
        scrollTarget.scrollTop = scrollTarget.scrollHeight;
        scrollTarget = null;
      }
      scrollPending = false;
    });
  }
}
