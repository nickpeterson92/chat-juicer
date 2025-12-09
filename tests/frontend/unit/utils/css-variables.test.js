import { getBrandPrimaryColor, getCSSVariable, isValidHex } from "@utils/css-variables.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("css-variables utils", () => {
  beforeEach(() => {
    // Reset any previously set variables to avoid cross-test leakage
    document.documentElement.style.cssText = "";
  });

  it("returns the computed CSS variable when present", () => {
    document.documentElement.style.setProperty("--color-brand-primary", "#123456");

    const value = getCSSVariable("--color-brand-primary", "#ffffff");

    expect(value).toBe("#123456");
  });

  it("uses fallback and logs a warning when the variable is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const value = getCSSVariable("--missing-variable", "#ffffff");

    expect(value).toBe("#ffffff");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("CSS variable --missing-variable not found"));

    warnSpy.mockRestore();
  });

  it("retrieves the brand primary color via helper", () => {
    document.documentElement.style.setProperty("--color-brand-primary", "#abcdef");

    expect(getBrandPrimaryColor()).toBe("#abcdef");
  });

  it("validates hex strings", () => {
    expect(isValidHex("#abc")).toBe(true);
    expect(isValidHex("#abcdef")).toBe(true);
    expect(isValidHex("#abcd")).toBe(false);
    expect(isValidHex("abc")).toBe(false);
  });
});
