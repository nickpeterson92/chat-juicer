/**
 * Critical color constants for JavaScript operations
 *
 * PURPOSE: These colors are duplicated from CSS variables for zero-dependency operations
 * that cannot wait for CSS parsing (Lottie animations, canvas operations, early initialization).
 *
 * WHY THIS EXISTS:
 * - CSS custom properties are unavailable during early JavaScript initialization
 * - getComputedStyle() returns empty/black before CSS is fully parsed
 * - Lottie animations require immediate color values at render time
 * - Timing-sensitive operations need guaranteed color availability
 *
 * MAINTENANCE CONTRACT:
 * When changing brand colors, update BOTH locations:
 * 1. ui/input.css (lines 8 and 1562) - CSS variables
 * 2. This file (CRITICAL_COLORS) - JavaScript constants
 *
 * VALIDATION:
 * Run `validateCriticalColors()` in development to catch inconsistencies.
 * This validation is automatically called during app initialization.
 *
 * @module config/colors
 */

/**
 * Critical colors that must be available before CSS parsing completes
 * @constant {Object}
 * @readonly
 */
export const CRITICAL_COLORS = Object.freeze({
  /**
   * Primary brand color - Chat Juicer blue
   * MUST MATCH: --color-brand-primary in ui/input.css
   * USED BY: Lottie animations, loading indicators, early UI initialization
   */
  BRAND_PRIMARY: "#0d63fb",

  /**
   * Secondary brand color - Darker blue for gradients/hover
   * MUST MATCH: --color-brand-secondary in ui/input.css
   * USED BY: Gradients, hover states
   */
  BRAND_SECONDARY: "#0a4fc9",

  /**
   * Brand accent colors for UI variety
   * MUST MATCH: --color-brand-accent-* in ui/input.css
   */
  BRAND_ACCENT_1: "#deff4d", // Lime green
  BRAND_ACCENT_2: "#c7baff", // Light purple
  BRAND_ACCENT_3: "#ff4d5f", // Coral red
  BRAND_ACCENT_4: "#1de1f2", // Cyan
  BRAND_ACCENT_5: "#012faf", // Dark blue
});

/**
 * Validate that critical colors match CSS custom properties
 *
 * This function compares the JavaScript constants against actual CSS values
 * to detect inconsistencies that could cause visual bugs.
 *
 * WHEN TO USE:
 * - Automatically called during development mode initialization
 * - Manually call after updating colors to verify consistency
 * - Run in tests to catch color drift
 *
 * WARNINGS:
 * - Only works after CSS is loaded (post-DOMContentLoaded)
 * - Logs warning to console if mismatch detected
 * - Does NOT throw errors (non-blocking validation)
 *
 * @returns {boolean} True if all colors match, false if mismatches detected
 *
 * @example
 * // In development mode initialization:
 * if (import.meta.env.DEV) {
 *   validateCriticalColors();
 * }
 */
export function validateCriticalColors() {
  // Ensure CSS is loaded before validation
  if (document.readyState === "loading") {
    console.warn("[Colors] Validation called before CSS loaded - skipping validation");
    return false;
  }

  let allValid = true;
  const computedStyle = getComputedStyle(document.documentElement);

  // Validate brand primary color
  const brandPrimary = computedStyle.getPropertyValue("--color-brand-primary").trim();
  if (brandPrimary && brandPrimary !== CRITICAL_COLORS.BRAND_PRIMARY) {
    console.warn(
      `[Colors] ⚠️ MISMATCH DETECTED: --color-brand-primary\n` +
        `  CSS: ${brandPrimary}\n` +
        `  JS:  ${CRITICAL_COLORS.BRAND_PRIMARY}\n` +
        `  Action: Update CRITICAL_COLORS.BRAND_PRIMARY in config/colors.js`
    );
    allValid = false;
  }

  // Validate brand secondary color
  const brandSecondary = computedStyle.getPropertyValue("--color-brand-secondary").trim();
  if (brandSecondary && brandSecondary !== CRITICAL_COLORS.BRAND_SECONDARY) {
    console.warn(
      `[Colors] ⚠️ MISMATCH DETECTED: --color-brand-secondary\n` +
        `  CSS: ${brandSecondary}\n` +
        `  JS:  ${CRITICAL_COLORS.BRAND_SECONDARY}\n` +
        `  Action: Update CRITICAL_COLORS.BRAND_SECONDARY in config/colors.js`
    );
    allValid = false;
  }

  // Validate accent colors
  const accentMappings = {
    "--color-brand-accent-1": CRITICAL_COLORS.BRAND_ACCENT_1,
    "--color-brand-accent-2": CRITICAL_COLORS.BRAND_ACCENT_2,
    "--color-brand-accent-3": CRITICAL_COLORS.BRAND_ACCENT_3,
    "--color-brand-accent-4": CRITICAL_COLORS.BRAND_ACCENT_4,
    "--color-brand-accent-5": CRITICAL_COLORS.BRAND_ACCENT_5,
  };

  for (const [cssVar, jsValue] of Object.entries(accentMappings)) {
    const cssValue = computedStyle.getPropertyValue(cssVar).trim();
    if (cssValue && cssValue !== jsValue) {
      console.warn(
        `[Colors] ⚠️ MISMATCH DETECTED: ${cssVar}\n` +
          `  CSS: ${cssValue}\n` +
          `  JS:  ${jsValue}\n` +
          `  Action: Update CRITICAL_COLORS in config/colors.js`
      );
      allValid = false;
    }
  }

  if (allValid) {
    console.log("[Colors] ✅ All critical colors validated successfully");
  }

  return allValid;
}

/**
 * Get brand primary color with guaranteed availability
 *
 * This function provides the brand primary color with zero dependency on CSS parsing.
 * Unlike getBrandPrimaryColor() from css-variables.js, this ALWAYS returns the correct
 * color regardless of CSS load state.
 *
 * USE THIS when:
 * - Initializing Lottie animations
 * - Early render operations before CSS loads
 * - Canvas operations requiring immediate color values
 *
 * DO NOT USE for:
 * - Regular DOM styling (use CSS classes instead)
 * - Operations after CSS is guaranteed loaded
 *
 * @returns {string} Brand primary color hex code (#0066cc)
 */
export function getBrandPrimary() {
  return CRITICAL_COLORS.BRAND_PRIMARY;
}

/**
 * Get brand secondary color with guaranteed availability
 *
 * @returns {string} Brand secondary color hex code (#0052a3)
 */
export function getBrandSecondary() {
  return CRITICAL_COLORS.BRAND_SECONDARY;
}
