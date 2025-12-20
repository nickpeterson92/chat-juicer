/**
 * Get computed CSS variable value with fallback
 * @param {string} varName - Variable name (with or without --)
 * @param {string} fallback - Fallback color if undefined
 * @returns {string} Color value (hex, rgb, rgba, etc.)
 * @example
 * getCSSVariable('--color-surface-1', '#ffffff') // Returns '#f8f8f6' in light mode
 * getCSSVariable('color-brand-primary') // Accepts without -- prefix
 */
export function getCSSVariable(varName, fallback = "#000000") {
  const name = varName.startsWith("--") ? varName : `--${varName}`;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  if (!value) {
    console.warn(`CSS variable ${name} not found, using fallback: ${fallback}`);
    return fallback;
  }

  return value;
}

/**
 * Get brand primary color (shorthand for common use)
 * @returns {string} Brand primary color value
 */
export function getBrandPrimaryColor() {
  return getCSSVariable("--color-brand-primary", "#0066cc");
}

/**
 * Validate hex color format
 * @param {string} color - Color string to validate
 * @returns {boolean} True if valid hex format
 */
export function isValidHex(color) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}
