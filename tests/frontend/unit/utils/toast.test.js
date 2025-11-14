/**
 * Unit tests for Toast notification system
 * Tests toast creation, dismissal, deduplication, and accessibility features
 */

import { clearAllToasts, showToast } from "@utils/toast.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Toast Utilities", () => {
  let container;

  beforeEach(() => {
    // Create toast container
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);

    // Reset any active toasts
    clearAllToasts();

    // Setup timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Cleanup
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("showToast", () => {
    it("should create and display a toast notification", () => {
      const toast = showToast("Test message", "info");

      expect(toast).toBeTruthy();
      expect(toast.textContent).toBe("Test message");
      expect(container.children.length).toBe(1);
    });

    it("should apply correct styling for info type", () => {
      const toast = showToast("Info message", "info");

      expect(toast.style.backgroundColor).toBe("#3b82f6"); // --color-status-info fallback
      expect(toast.style.color).toBe("#ffffff"); // White text
    });

    it("should apply correct styling for success type", () => {
      const toast = showToast("Success message", "success");

      expect(toast.style.backgroundColor).toBe("#10b981"); // --color-status-success fallback
      expect(toast.style.color).toBe("#ffffff"); // White text
    });

    it("should apply correct styling for warning type", () => {
      const toast = showToast("Warning message", "warning");

      expect(toast.style.backgroundColor).toBe("#f59e0b"); // --color-status-warning fallback
      expect(toast.style.color).toBe("#ffffff"); // White text
    });

    it("should apply correct styling for error type", () => {
      const toast = showToast("Error message", "error");

      expect(toast.style.backgroundColor).toBe("#ef4444"); // --color-status-error fallback
      expect(toast.style.color).toBe("#ffffff"); // White text
    });

    it("should return null when container not found", () => {
      // Remove container
      container.remove();

      const toast = showToast("Test message", "info");

      expect(toast).toBeNull();
    });

    it("should set appropriate ARIA attributes", () => {
      const toast = showToast("Accessible toast", "info");

      expect(toast.getAttribute("role")).toBe("alert");
      expect(toast.getAttribute("aria-live")).toBe("polite");
      expect(toast.getAttribute("aria-atomic")).toBe("true");
      expect(toast.getAttribute("tabindex")).toBe("0");
    });

    it("should set assertive ARIA live for error type", () => {
      const toast = showToast("Error toast", "error");

      expect(toast.getAttribute("aria-live")).toBe("assertive");
    });

    it("should auto-dismiss after specified duration", () => {
      const _toast = showToast("Auto dismiss", "info", 1000);

      expect(container.children.length).toBe(1);

      // Fast-forward time
      vi.advanceTimersByTime(1000);

      expect(container.children.length).toBe(0);
    });

    it("should use default duration of 3000ms", () => {
      const _toast = showToast("Default duration", "info");

      expect(container.children.length).toBe(1);

      // Before timeout
      vi.advanceTimersByTime(2999);
      expect(container.children.length).toBe(1);

      // After timeout
      vi.advanceTimersByTime(1);
      expect(container.children.length).toBe(0);
    });
  });

  describe("Deduplication", () => {
    it("should not create duplicate toasts for same message", () => {
      const toast1 = showToast("Duplicate", "info");
      const toast2 = showToast("Duplicate", "info");

      expect(toast1).toBe(toast2);
      expect(container.children.length).toBe(1);
    });

    it("should pulse existing toast when duplicate message shown", () => {
      const toast = showToast("Pulse test", "info");

      // Show duplicate
      showToast("Pulse test", "info");

      expect(toast.classList.contains("toast-pulse")).toBe(true);
    });

    it("should remove pulse class after animation ends", () => {
      const toast = showToast("Pulse test", "info");

      // Show duplicate
      showToast("Pulse test", "info");
      expect(toast.classList.contains("toast-pulse")).toBe(true);

      // Trigger animationend event
      const event = new Event("animationend");
      toast.dispatchEvent(event);

      expect(toast.classList.contains("toast-pulse")).toBe(false);
    });

    it("should allow same message after toast dismissed", () => {
      const toast1 = showToast("Reshow", "info", 1000);

      // Dismiss first toast
      vi.advanceTimersByTime(1000);
      expect(container.children.length).toBe(0);

      // Show same message again
      const toast2 = showToast("Reshow", "info");

      expect(toast2).toBeTruthy();
      expect(container.children.length).toBe(1);
      expect(toast1).not.toBe(toast2);
    });
  });

  describe("Concurrent Toast Limit", () => {
    it("should limit concurrent toasts to MAX_CONCURRENT_TOASTS", () => {
      // Create 5 toasts (max)
      for (let i = 0; i < 5; i++) {
        showToast(`Toast ${i}`, "info", 10000);
      }

      expect(container.children.length).toBe(5);

      // 6th toast should remove oldest
      showToast("Toast 6", "info", 10000);

      expect(container.children.length).toBe(5);
      expect(container.children[0].textContent).toBe("Toast 1"); // Toast 0 removed
    });

    it("should remove oldest toast when limit exceeded", () => {
      const toast1 = showToast("First", "info", 10000);

      for (let i = 1; i < 5; i++) {
        showToast(`Toast ${i}`, "info", 10000);
      }

      // Add 6th toast
      showToast("Sixth", "info", 10000);

      // First toast should be removed
      expect(container.contains(toast1)).toBe(false);
    });
  });

  describe("Toast Dismissal", () => {
    it("should dismiss toast when clicked", () => {
      const toast = showToast("Click to dismiss", "info", 10000);

      expect(container.children.length).toBe(1);

      toast.click();

      expect(container.children.length).toBe(0);
    });

    it("should dismiss toast when Enter key pressed", () => {
      const toast = showToast("Keyboard dismiss", "info", 10000);
      toast.focus();

      expect(container.children.length).toBe(1);

      const event = new KeyboardEvent("keydown", { key: "Enter" });
      toast.dispatchEvent(event);

      expect(container.children.length).toBe(0);
    });

    it("should dismiss toast when Escape key pressed", () => {
      const toast = showToast("Keyboard dismiss", "info", 10000);
      toast.focus();

      expect(container.children.length).toBe(1);

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      toast.dispatchEvent(event);

      expect(container.children.length).toBe(0);
    });

    it("should dismiss toast when Space key pressed", () => {
      const toast = showToast("Keyboard dismiss", "info", 10000);
      toast.focus();

      expect(container.children.length).toBe(1);

      const event = new KeyboardEvent("keydown", { key: " " });
      toast.dispatchEvent(event);

      expect(container.children.length).toBe(0);
    });

    it("should clear timeout when manually dismissed", () => {
      const toast = showToast("Manual dismiss", "info", 10000);

      expect(toast.dataset.timeoutId).toBeTruthy();

      toast.click();

      // Should not throw when timeout fires
      expect(() => {
        vi.advanceTimersByTime(10000);
      }).not.toThrow();
    });
  });

  describe("clearAllToasts", () => {
    it("should remove all active toasts", () => {
      showToast("Toast 1", "info", 10000);
      showToast("Toast 2", "info", 10000);
      showToast("Toast 3", "info", 10000);

      expect(container.children.length).toBe(3);

      clearAllToasts();

      expect(container.children.length).toBe(0);
    });

    it("should clear all timeouts", () => {
      showToast("Toast 1", "info", 1000);
      showToast("Toast 2", "info", 2000);

      clearAllToasts();

      // Advancing time should not cause errors
      expect(() => {
        vi.advanceTimersByTime(5000);
      }).not.toThrow();
    });

    it("should handle empty toast list gracefully", () => {
      expect(() => {
        clearAllToasts();
      }).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing duration parameter", () => {
      const toast = showToast("No duration", "info");

      expect(toast).toBeTruthy();
      expect(container.children.length).toBe(1);
    });

    it("should handle invalid toast type gracefully", () => {
      const toast = showToast("Invalid type", "invalid-type");

      expect(toast).toBeTruthy();
      // Should default to info styling
      expect(toast.style.backgroundColor).toBe("#3b82f6"); // --color-status-info fallback
    });

    it("should handle empty message", () => {
      const toast = showToast("", "info");

      expect(toast).toBeTruthy();
      expect(toast.textContent).toBe("");
    });

    it("should not error when dismissing already dismissed toast", () => {
      const toast = showToast("Double dismiss", "info", 10000);

      toast.click();
      expect(container.children.length).toBe(0);

      // Try to dismiss again
      expect(() => {
        toast.click();
      }).not.toThrow();
    });

    it("should handle rapid successive calls", () => {
      for (let i = 0; i < 10; i++) {
        showToast(`Rapid ${i}`, "info", 10000);
      }

      // Should be limited to 5 concurrent
      expect(container.children.length).toBe(5);
    });
  });

  describe("Accessibility", () => {
    it("should be keyboard accessible", () => {
      const toast = showToast("Accessible", "info", 10000);

      expect(toast.getAttribute("tabindex")).toBe("0");
      expect(toast).toBeTruthy();
    });

    it("should announce to screen readers immediately for errors", () => {
      const toast = showToast("Critical error", "error");

      expect(toast.getAttribute("role")).toBe("alert");
      expect(toast.getAttribute("aria-live")).toBe("assertive");
    });

    it("should read entire message atomically", () => {
      const toast = showToast("Complete message", "info");

      expect(toast.getAttribute("aria-atomic")).toBe("true");
    });
  });
});
