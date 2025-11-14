/**
 * Unit tests for Critical Colors Configuration
 * Tests color constants and validation logic
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CRITICAL_COLORS, getBrandPrimary, getBrandSecondary, validateCriticalColors } from "@/config/colors.js";

describe("CRITICAL_COLORS", () => {
  describe("Constants", () => {
    it("should be frozen to prevent modifications", () => {
      expect(Object.isFrozen(CRITICAL_COLORS)).toBe(true);
    });

    it("should contain BRAND_PRIMARY", () => {
      expect(CRITICAL_COLORS.BRAND_PRIMARY).toBe("#0d63fb");
    });

    it("should contain BRAND_SECONDARY", () => {
      expect(CRITICAL_COLORS.BRAND_SECONDARY).toBe("#0a4fc9");
    });

    it("should contain all accent colors", () => {
      expect(CRITICAL_COLORS.BRAND_ACCENT_1).toBe("#deff4d");
      expect(CRITICAL_COLORS.BRAND_ACCENT_2).toBe("#c7baff");
      expect(CRITICAL_COLORS.BRAND_ACCENT_3).toBe("#ff4d5f");
      expect(CRITICAL_COLORS.BRAND_ACCENT_4).toBe("#1de1f2");
      expect(CRITICAL_COLORS.BRAND_ACCENT_5).toBe("#012faf");
    });

    it("should prevent property reassignment", () => {
      expect(() => {
        CRITICAL_COLORS.BRAND_PRIMARY = "#ff0000";
      }).toThrow();
    });

    it("should prevent adding new properties", () => {
      expect(() => {
        CRITICAL_COLORS.NEW_COLOR = "#ff0000";
      }).toThrow();
    });
  });

  describe("Helper Functions", () => {
    it("getBrandPrimary should return correct color", () => {
      expect(getBrandPrimary()).toBe("#0d63fb");
    });

    it("getBrandSecondary should return correct color", () => {
      expect(getBrandSecondary()).toBe("#0a4fc9");
    });
  });
});

describe("validateCriticalColors", () => {
  beforeEach(() => {
    // Clear console mocks
    vi.clearAllMocks();

    // Mock console methods
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should warn if called before CSS loads", () => {
    // Mock document.readyState as "loading"
    Object.defineProperty(document, "readyState", {
      value: "loading",
      writable: true,
      configurable: true,
    });

    const result = validateCriticalColors();

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Validation called before CSS loaded"));
  });

  it("should return true when all colors match", () => {
    // Mock document.readyState as "complete"
    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });

    // Mock getComputedStyle to return matching colors
    const mockGetComputedStyle = vi.fn(() => ({
      getPropertyValue: (prop) => {
        if (prop === "--color-brand-primary") return "#0d63fb";
        if (prop === "--color-brand-secondary") return "#0a4fc9";
        if (prop === "--color-brand-accent-1") return "#deff4d";
        if (prop === "--color-brand-accent-2") return "#c7baff";
        if (prop === "--color-brand-accent-3") return "#ff4d5f";
        if (prop === "--color-brand-accent-4") return "#1de1f2";
        if (prop === "--color-brand-accent-5") return "#012faf";
        return "";
      },
    }));
    global.getComputedStyle = mockGetComputedStyle;

    const result = validateCriticalColors();

    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("All critical colors validated successfully"));
  });

  it("should warn when BRAND_PRIMARY mismatches", () => {
    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });

    // Mock getComputedStyle to return mismatched primary color
    const mockGetComputedStyle = vi.fn(() => ({
      getPropertyValue: (prop) => {
        if (prop === "--color-brand-primary") return "#ff0000"; // Wrong!
        if (prop === "--color-brand-secondary") return "#0a4fc9";
        if (prop === "--color-brand-accent-1") return "#deff4d";
        if (prop === "--color-brand-accent-2") return "#c7baff";
        if (prop === "--color-brand-accent-3") return "#ff4d5f";
        if (prop === "--color-brand-accent-4") return "#1de1f2";
        if (prop === "--color-brand-accent-5") return "#012faf";
        return "";
      },
    }));
    global.getComputedStyle = mockGetComputedStyle;

    const result = validateCriticalColors();

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("MISMATCH DETECTED: --color-brand-primary"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("CSS: #ff0000"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("JS:  #0d63fb"));
  });

  it("should warn when BRAND_SECONDARY mismatches", () => {
    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });

    const mockGetComputedStyle = vi.fn(() => ({
      getPropertyValue: (prop) => {
        if (prop === "--color-brand-primary") return "#0d63fb";
        if (prop === "--color-brand-secondary") return "#ff0000"; // Wrong!
        if (prop === "--color-brand-accent-1") return "#deff4d";
        if (prop === "--color-brand-accent-2") return "#c7baff";
        if (prop === "--color-brand-accent-3") return "#ff4d5f";
        if (prop === "--color-brand-accent-4") return "#1de1f2";
        if (prop === "--color-brand-accent-5") return "#012faf";
        return "";
      },
    }));
    global.getComputedStyle = mockGetComputedStyle;

    const result = validateCriticalColors();

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("MISMATCH DETECTED: --color-brand-secondary"));
  });

  it("should warn when accent colors mismatch", () => {
    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });

    const mockGetComputedStyle = vi.fn(() => ({
      getPropertyValue: (prop) => {
        if (prop === "--color-brand-primary") return "#0d63fb";
        if (prop === "--color-brand-secondary") return "#0a4fc9";
        if (prop === "--color-brand-accent-1") return "#ff0000"; // Wrong!
        if (prop === "--color-brand-accent-2") return "#c7baff";
        if (prop === "--color-brand-accent-3") return "#ff4d5f";
        if (prop === "--color-brand-accent-4") return "#1de1f2";
        if (prop === "--color-brand-accent-5") return "#012faf";
        return "";
      },
    }));
    global.getComputedStyle = mockGetComputedStyle;

    const result = validateCriticalColors();

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("MISMATCH DETECTED: --color-brand-accent-1"));
  });

  it("should handle empty CSS variable values gracefully", () => {
    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });

    // Mock getComputedStyle to return empty strings (CSS not loaded yet)
    const mockGetComputedStyle = vi.fn(() => ({
      getPropertyValue: () => "",
    }));
    global.getComputedStyle = mockGetComputedStyle;

    const result = validateCriticalColors();

    // Should return true because empty values are skipped
    expect(result).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("should detect multiple mismatches", () => {
    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });

    const mockGetComputedStyle = vi.fn(() => ({
      getPropertyValue: (prop) => {
        if (prop === "--color-brand-primary") return "#ff0000"; // Wrong!
        if (prop === "--color-brand-secondary") return "#00ff00"; // Wrong!
        if (prop === "--color-brand-accent-1") return "#deff4d";
        if (prop === "--color-brand-accent-2") return "#c7baff";
        if (prop === "--color-brand-accent-3") return "#ff4d5f";
        if (prop === "--color-brand-accent-4") return "#1de1f2";
        if (prop === "--color-brand-accent-5") return "#012faf";
        return "";
      },
    }));
    global.getComputedStyle = mockGetComputedStyle;

    const result = validateCriticalColors();

    expect(result).toBe(false);
    // Should have warned about both mismatches
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});

describe("Integration", () => {
  it("should export all required constants", () => {
    expect(CRITICAL_COLORS).toBeDefined();
    expect(getBrandPrimary).toBeDefined();
    expect(getBrandSecondary).toBeDefined();
    expect(validateCriticalColors).toBeDefined();
  });

  it("should return consistent colors across helper functions", () => {
    expect(getBrandPrimary()).toBe(CRITICAL_COLORS.BRAND_PRIMARY);
    expect(getBrandSecondary()).toBe(CRITICAL_COLORS.BRAND_SECONDARY);
  });
});
