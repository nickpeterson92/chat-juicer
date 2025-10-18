/**
 * Toast notification system for ephemeral system messages
 * Shows temporary popup bubbles that auto-dismiss
 * Includes full accessibility support (ARIA, keyboard, screen readers)
 */

import { TOAST_FADE_DURATION, TOAST_PULSE_DURATION } from "../config/constants.js";

// Track active toasts for deduplication and limits
const activeToasts = new Map(); // message -> toast element
const MAX_CONCURRENT_TOASTS = 5;
const DEDUP_WINDOW_MS = 1000; // Don't show same message within 1 second

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type: 'info' | 'success' | 'warning' | 'error'
 * @param {number} duration - Duration in milliseconds (default 3000)
 * @returns {HTMLElement|null} Toast element or null if suppressed
 */
export function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container");
  if (!container) {
    console.error("Toast container not found");
    return null;
  }

  // Deduplication: Don't show same message if it's already active
  if (activeToasts.has(message)) {
    const existing = activeToasts.get(message);
    // Flash the existing toast to indicate repeated notification
    existing.classList.add("toast-pulse");

    // Remove pulse class after animation completes
    const handlePulseEnd = () => {
      existing.classList.remove("toast-pulse");
      existing.removeEventListener("animationend", handlePulseEnd);
    };
    existing.addEventListener("animationend", handlePulseEnd);

    return existing;
  }

  // Limit concurrent toasts
  if (activeToasts.size >= MAX_CONCURRENT_TOASTS) {
    // Remove oldest toast to make room
    const oldestKey = activeToasts.keys().next().value;
    const oldestToast = activeToasts.get(oldestKey);
    dismissToast(oldestToast, oldestKey);
  }

  const toast = document.createElement("div");
  toast.className = "toast animate-slideIn";

  // Accessibility: ARIA attributes for screen readers
  toast.setAttribute("role", "alert"); // Announce immediately
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  toast.setAttribute("aria-atomic", "true"); // Read entire message
  toast.setAttribute("tabindex", "0"); // Make focusable for keyboard nav

  // Type-specific styling
  const typeStyles = {
    info: "bg-blue-500 text-white",
    success: "bg-emerald-500 text-white",
    warning: "bg-amber-500 text-white",
    error: "bg-red-500 text-white",
  };

  toast.classList.add(...(typeStyles[type] || typeStyles.info).split(" "));
  toast.textContent = message;

  // Track this toast
  activeToasts.set(message, toast);

  // Keyboard: Allow dismissal with Enter or Escape when focused
  const keyHandler = (e) => {
    if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
      e.preventDefault();
      dismissToast(toast, message);
    }
  };
  toast.addEventListener("keydown", keyHandler);

  // Mouse: Click to dismiss
  toast.addEventListener("click", () => dismissToast(toast, message));

  container.appendChild(toast);

  // Auto-dismiss after duration
  const timeoutId = setTimeout(() => {
    dismissToast(toast, message);
  }, duration);

  // Store timeout ID for manual dismissal
  toast.dataset.timeoutId = timeoutId;

  return toast;
}

/**
 * Dismiss a toast notification
 * @param {HTMLElement} toast - Toast element to dismiss
 * @param {string} message - Message key for tracking
 */
function dismissToast(toast, message) {
  if (!toast || !toast.parentNode) return; // Already removed

  // Clear timeout if exists
  if (toast.dataset.timeoutId) {
    clearTimeout(parseInt(toast.dataset.timeoutId, 10));
  }

  // Remove from tracking
  activeToasts.delete(message);

  // Remove immediately from DOM
  if (toast.parentNode) {
    toast.parentNode.removeChild(toast);
  }
}

/**
 * Clear all active toasts (for cleanup)
 */
export function clearAllToasts() {
  const toasts = Array.from(activeToasts.entries());
  toasts.forEach(([message, toast]) => {
    dismissToast(toast, message);
  });
  activeToasts.clear();
}
