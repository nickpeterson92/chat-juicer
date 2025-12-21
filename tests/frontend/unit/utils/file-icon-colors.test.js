import { describe, expect, it, vi } from "vitest";
import {
  getFileBadgeInfo,
  getFileIconColor,
  resolveFileIconColor,
} from "../../../../src/frontend/renderer/utils/file-icon-colors.js";

describe("file-icon-colors", () => {
  describe("getFileIconColor", () => {
    it("should return correct color var for known extensions", () => {
      expect(getFileIconColor("pdf")).toBe("var(--color-status-error)");
      expect(getFileIconColor("doc")).toBe("var(--color-status-info)");
      expect(getFileIconColor("jpg")).toBe("var(--color-file-image)");
      expect(getFileIconColor("js")).toBe("var(--color-file-code)");
    });

    it("should return default color for unknown extension", () => {
      expect(getFileIconColor("unknown")).toBe("var(--color-text-secondary)");
    });

    it("should handle mixed case extensions", () => {
      expect(getFileIconColor("PDF")).toBe("var(--color-status-error)");
    });

    it("should handle empty or null extension", () => {
      expect(getFileIconColor(null)).toBe("var(--color-text-secondary)");
      expect(getFileIconColor("")).toBe("var(--color-text-secondary)");
    });
  });

  describe("resolveFileIconColor", () => {
    it("should return raw color string if not a var()", () => {
      expect(resolveFileIconColor("#ff0000")).toBe("#ff0000");
      expect(resolveFileIconColor("red")).toBe("red");
    });

    it("should return computed style for valid var()", () => {
      // Mock getComputedStyle
      const mockGetPropertyValue = vi.fn().mockReturnValue(" #123456 ");
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        getPropertyValue: mockGetPropertyValue,
      });

      const resolved = resolveFileIconColor("var(--my-color)");

      expect(mockGetPropertyValue).toHaveBeenCalledWith("--my-color");
      expect(resolved).toBe("#123456");

      vi.restoreAllMocks();
    });

    it("should fallback to original string if computed value matches input (simulating unresolvable)", () => {
      const mockGetPropertyValue = vi.fn().mockReturnValue("");
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        getPropertyValue: mockGetPropertyValue,
      });

      const resolved = resolveFileIconColor("var(--unknown)");
      expect(resolved).toBe("var(--unknown)");

      vi.restoreAllMocks();
    });
  });

  describe("getFileBadgeInfo", () => {
    it("should return correct badge info for known extensions", () => {
      expect(getFileBadgeInfo("jpg")).toEqual({ class: "badge-image", label: "JPG" });
      expect(getFileBadgeInfo("pdf")).toEqual({ class: "badge-pdf", label: "PDF" });
      expect(getFileBadgeInfo("js")).toEqual({ class: "badge-code", label: "JS" });
    });

    it("should return default badge info for unknown extension", () => {
      const info = getFileBadgeInfo("unknown");
      expect(info).toEqual({ class: "badge-data", label: "UNKNOWN" });
    });

    it("should handle mixed case extensions", () => {
      expect(getFileBadgeInfo("JPG")).toEqual({ class: "badge-image", label: "JPG" });
    });

    it("should handle empty or null extension", () => {
      expect(getFileBadgeInfo(null)).toEqual({ class: "badge-data", label: "FILE" });
      expect(getFileBadgeInfo("")).toEqual({ class: "badge-data", label: "FILE" });
    });
  });
});
