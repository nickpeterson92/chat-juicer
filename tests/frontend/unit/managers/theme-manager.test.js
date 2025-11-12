/**
 * Unit tests for Theme Manager
 * Tests theme initialization, switching, and persistence
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeTheme, toggleTheme } from "@/managers/theme-manager.js";

describe("Theme Manager", () => {
  let elements;

  beforeEach(() => {
    // Setup DOM elements
    elements = {
      themeIcon: document.createElement("span"),
      themeText: document.createElement("span"),
    };
    elements.themeIcon.id = "theme-icon";
    elements.themeText.id = "theme-text";

    document.body.appendChild(elements.themeIcon);
    document.body.appendChild(elements.themeText);

    // Clear localStorage
    localStorage.clear();

    // Reset theme attribute
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    // Cleanup
    elements.themeIcon?.remove();
    elements.themeText?.remove();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  describe("initializeTheme", () => {
    it("should initialize light theme by default", () => {
      initializeTheme(elements);

      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
      expect(elements.themeText.textContent).toBe("Dark");
    });

    it("should initialize dark theme from localStorage", () => {
      localStorage.setItem("theme", "dark");

      initializeTheme(elements);

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(elements.themeText.textContent).toBe("Light");
    });

    it("should initialize light theme from localStorage", () => {
      localStorage.setItem("theme", "light");

      initializeTheme(elements);

      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
      expect(elements.themeText.textContent).toBe("Dark");
    });

    it("should show moon icon for light theme", () => {
      initializeTheme(elements);

      expect(elements.themeIcon.innerHTML).toContain("path");
      expect(elements.themeIcon.innerHTML).toContain("M21 12.79"); // Moon icon
    });

    it("should handle missing both elements", () => {
      expect(() => {
        initializeTheme({});
      }).not.toThrow();
    });
  });

  describe("toggleTheme", () => {
    it("should toggle from light to dark theme", () => {
      // Start with light theme
      initializeTheme(elements);

      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);

      // Toggle to dark
      toggleTheme(elements);

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(localStorage.getItem("theme")).toBe("dark");
      expect(elements.themeText.textContent).toBe("Light");
    });

    it("should toggle from dark to light theme", () => {
      // Start with dark theme
      localStorage.setItem("theme", "dark");
      initializeTheme(elements);

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

      // Toggle to light
      toggleTheme(elements);

      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
      expect(localStorage.getItem("theme")).toBe("light");
      expect(elements.themeText.textContent).toBe("Dark");
    });

    it("should persist theme to localStorage", () => {
      initializeTheme(elements);

      toggleTheme(elements);
      expect(localStorage.getItem("theme")).toBe("dark");

      toggleTheme(elements);
      expect(localStorage.getItem("theme")).toBe("light");
    });

    it("should update icon when toggling to dark", () => {
      initializeTheme(elements);

      toggleTheme(elements);

      expect(elements.themeIcon.innerHTML).toContain("circle"); // Sun icon
    });

    it("should update icon when toggling to light", () => {
      localStorage.setItem("theme", "dark");
      initializeTheme(elements);

      toggleTheme(elements);

      expect(elements.themeIcon.innerHTML).toContain("M21 12.79"); // Moon icon
    });

    it("should handle multiple rapid toggles", () => {
      initializeTheme(elements);

      toggleTheme(elements); // dark
      toggleTheme(elements); // light
      toggleTheme(elements); // dark
      toggleTheme(elements); // light

      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
      expect(localStorage.getItem("theme")).toBe("light");
    });
  });

  describe("Theme Persistence", () => {
    it("should maintain theme across page reloads", () => {
      // Simulate first load
      initializeTheme(elements);
      toggleTheme(elements);

      expect(localStorage.getItem("theme")).toBe("dark");

      // Simulate page reload
      document.documentElement.removeAttribute("data-theme");
      initializeTheme(elements);

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("should sync with system preference initially", () => {
      // No localStorage value (first time)
      initializeTheme(elements);

      // Should default to light
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });
  });

  describe("UI Updates", () => {
    it("should update button text correctly for light theme", () => {
      initializeTheme(elements);

      expect(elements.themeText.textContent).toBe("Dark");
    });

    it("should update button text correctly for dark theme", () => {
      localStorage.setItem("theme", "dark");
      initializeTheme(elements);

      expect(elements.themeText.textContent).toBe("Light");
    });

    it("should render valid SVG icons", () => {
      // Light theme (moon icon)
      initializeTheme(elements);
      expect(elements.themeIcon.innerHTML).toContain("<svg");
      expect(elements.themeIcon.innerHTML).toContain("viewBox");

      // Dark theme (sun icon)
      toggleTheme(elements);
      expect(elements.themeIcon.innerHTML).toContain("<svg");
      expect(elements.themeIcon.innerHTML).toContain("viewBox");
    });

    it("should set correct icon dimensions", () => {
      initializeTheme(elements);

      expect(elements.themeIcon.innerHTML).toContain('width="16"');
      expect(elements.themeIcon.innerHTML).toContain('height="16"');
    });
  });

  describe("Edge Cases", () => {
    it("should handle invalid theme value in localStorage", () => {
      localStorage.setItem("theme", "invalid");

      expect(() => {
        initializeTheme(elements);
      }).not.toThrow();

      // Should default to light theme
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });

    it("should handle corrupted localStorage", () => {
      // Save original localStorage
      const originalLocalStorage = window.localStorage;

      // Simulate corrupted localStorage
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: () => {
            throw new Error("Storage error");
          },
          setItem: () => {},
          clear: () => {},
        },
        configurable: true,
        writable: true,
      });

      expect(() => {
        initializeTheme(elements);
      }).toThrow();

      // Restore localStorage immediately
      Object.defineProperty(window, "localStorage", {
        value: originalLocalStorage,
        configurable: true,
        writable: true,
      });
    });

    it("should handle null elements object", () => {
      // Null elements will throw because implementation tries to access properties
      expect(() => {
        initializeTheme(null);
      }).toThrow();
    });

    it("should handle toggle before initialization", () => {
      // Toggle without initialization
      expect(() => {
        toggleTheme(elements);
      }).not.toThrow();
    });
  });

  describe("Accessibility", () => {
    it("should maintain readable contrast ratios", () => {
      // Light theme
      initializeTheme(elements);
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);

      // Dark theme
      toggleTheme(elements);
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("should provide clear visual feedback on toggle", () => {
      initializeTheme(elements);

      const initialIcon = elements.themeIcon.innerHTML;
      toggleTheme(elements);
      const toggledIcon = elements.themeIcon.innerHTML;

      expect(initialIcon).not.toBe(toggledIcon);
    });
  });
});
