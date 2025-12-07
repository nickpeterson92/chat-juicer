/**
 * Lottie color override utilities using lottie-web
 * Provides native color overriding for Lottie animations
 */

import lottie from "lottie-web";

/**
 * Convert hex color to normalized RGB array used by Lottie
 * @param {string} hex - Hex color (e.g., "#0066cc")
 * @returns {number[]} Normalized RGB array [r, g, b] where values are 0-1
 */
function hexToLottieRGB(hex) {
  const cleaned = hex.replace("#", "");
  const r = Number.parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = Number.parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = Number.parseInt(cleaned.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Apply the target color to a Lottie color property.
 * Handles static colors and keyframed color animations.
 * @param {{ a: number, k: any }} colorProp - Color property from Lottie animation.
 * @param {number[]} targetRGB - Target color as normalized RGB array.
 */
function applyColor(colorProp, targetRGB) {
  if (!colorProp) return;

  const applyToArray = (arr) => {
    if (!Array.isArray(arr) || arr.length < 3) return;
    const alpha = arr[3] ?? 1;
    arr[0] = targetRGB[0];
    arr[1] = targetRGB[1];
    arr[2] = targetRGB[2];
    arr[3] = alpha;
  };

  if (Array.isArray(colorProp.k)) {
    if (colorProp.a === 1) {
      // Keyframed color - iterate keyframes
      colorProp.k.forEach((keyframe) => {
        if (keyframe && typeof keyframe === "object") {
          if (Array.isArray(keyframe.s)) applyToArray(keyframe.s);
          if (Array.isArray(keyframe.e)) applyToArray(keyframe.e);
        }
      });
    } else {
      // Static color
      applyToArray(colorProp.k);
    }
  }
}

/**
 * Walk shape hierarchy and update fill/stroke colors.
 * @param {Array} shapes - Lottie shapes array.
 * @param {number[]} targetRGB - Target color as normalized RGB array.
 */
function traverseShapes(shapes, targetRGB) {
  if (!Array.isArray(shapes)) return;

  shapes.forEach((shape) => {
    if (!shape || typeof shape !== "object") return;

    if (shape.ty === "fl" || shape.ty === "st") {
      applyColor(shape.c, targetRGB);
    }

    if (Array.isArray(shape.it)) {
      traverseShapes(shape.it, targetRGB);
    }
  });
}

/**
 * Traverse layers (including precomps) and update colors.
 * @param {Array} layers - Lottie layers array.
 * @param {number[]} targetRGB - Target color as normalized RGB array.
 */
function traverseLayers(layers, targetRGB) {
  if (!Array.isArray(layers)) return;

  layers.forEach((layer) => {
    if (!layer || typeof layer !== "object") return;

    if (Array.isArray(layer.shapes)) {
      traverseShapes(layer.shapes, targetRGB);
    }

    if (Array.isArray(layer.layers)) {
      traverseLayers(layer.layers, targetRGB);
    }
  });
}

/**
 * Override fill and stroke colors in animation data with target color.
 * @param {object} animationData - Lottie animation data.
 * @param {number[]} targetRGB - Target color as normalized RGB array.
 */
function overrideColors(animationData, targetRGB) {
  if (!animationData || typeof animationData !== "object") return;

  if (Array.isArray(animationData.layers)) {
    traverseLayers(animationData.layers, targetRGB);
  }

  if (Array.isArray(animationData.assets)) {
    animationData.assets.forEach((asset) => {
      if (asset && Array.isArray(asset.layers)) {
        traverseLayers(asset.layers, targetRGB);
      }
    });
  }
}

/**
 * Load Lottie animation with color override using lottie-web
 * @param {string|HTMLElement} container - Container element or selector
 * @param {object} animationData - Lottie animation JSON data
 * @param {string} colorHex - Hex color to override (e.g., "#0066cc")
 * @returns {object|null} Lottie animation instance
 */
export function initLottieWithColor(container, animationData, colorHex) {
  const containerEl = typeof container === "string" ? document.querySelector(container) : container;

  if (!containerEl) {
    console.error("Lottie container element not found");
    return null;
  }

  try {
    // Clone animation data to avoid mutating the imported object
    const animationDataCopy = JSON.parse(JSON.stringify(animationData));

    // Override colors
    const targetRGB = hexToLottieRGB(colorHex);
    overrideColors(animationDataCopy, targetRGB);

    // Load animation with lottie-web
    const animation = lottie.loadAnimation({
      container: containerEl,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData: animationDataCopy,
    });

    return animation;
  } catch (error) {
    console.error("Failed to load Lottie animation with color override:", error);
    return null;
  }
}
