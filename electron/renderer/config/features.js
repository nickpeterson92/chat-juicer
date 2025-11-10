/**
 * Feature Flags Configuration
 * Control Phase 4 rollout and experimental features
 */

/**
 * Feature flags
 * Can be controlled via environment variables or localStorage
 */
export const features = {
  // ============================================
  // Phase 4 Features
  // ============================================

  /**
   * Use Phase 4 EventBus architecture
   * - EventBus for decoupled communication
   * - Plugin system with core plugins
   * - Performance monitoring
   * - Analytics tracking
   * - Debug tools
   *
   * Default: true (Phase 4 active)
   * Override: VITE_USE_PHASE4=false
   */
  usePhase4: import.meta.env.VITE_USE_PHASE4 !== "false",

  /**
   * Use EventBus message handlers (V2)
   * Requires usePhase4 to be true
   *
   * Default: true (when Phase 4 enabled)
   * Override: VITE_USE_EVENTBUS_HANDLERS=false
   */
  useEventBusHandlers: import.meta.env.VITE_USE_EVENTBUS_HANDLERS !== "false",

  /**
   * Enable core plugins
   * Requires usePhase4 to be true
   *
   * Default: true (when Phase 4 enabled)
   * Override: VITE_ENABLE_PLUGINS=false
   */
  enablePlugins: import.meta.env.VITE_ENABLE_PLUGINS !== "false",

  /**
   * Enable performance monitoring
   *
   * Default: true in dev, false in production
   * Override: VITE_ENABLE_PERF_MONITORING=true
   */
  enablePerformanceMonitoring: import.meta.env.VITE_ENABLE_PERF_MONITORING === "true" || import.meta.env.DEV,

  /**
   * Enable analytics tracking
   *
   * Default: true
   * Override: VITE_ENABLE_ANALYTICS=false
   */
  enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS !== "false",

  /**
   * Enable debug tools (DevTools integration)
   *
   * Default: true in dev mode only
   * Override: VITE_ENABLE_DEBUG_TOOLS=true
   */
  enableDebugTools: import.meta.env.VITE_ENABLE_DEBUG_TOOLS === "true" || import.meta.env.DEV,

  // ============================================
  // Existing Features
  // ============================================

  /**
   * Enable Mermaid diagram rendering
   */
  enableMermaid: import.meta.env.VITE_ENABLE_MERMAID !== "false",

  /**
   * Enable voice input (experimental)
   */
  enableVoiceInput: import.meta.env.VITE_ENABLE_VOICE === "true",

  /**
   * Enable AI suggestions (experimental)
   */
  enableAISuggestions: import.meta.env.DEV && import.meta.env.VITE_ENABLE_AI_SUGGEST === "true",
};

/**
 * Get feature flag value
 * Checks localStorage override first, then config
 *
 * @param {string} name - Feature name
 * @returns {boolean}
 */
export function isFeatureEnabled(name) {
  // Check localStorage override (for runtime toggling)
  const override = localStorage.getItem(`feature_${name}`);
  if (override !== null) {
    return override === "true";
  }

  // Fall back to config
  return features[name] ?? false;
}

/**
 * Set feature flag at runtime (persists to localStorage)
 *
 * @param {string} name - Feature name
 * @param {boolean} enabled - Enable/disable
 */
export function setFeature(name, enabled) {
  localStorage.setItem(`feature_${name}`, String(enabled));
  console.log(`[FeatureFlags] ${name} = ${enabled} (requires reload)`);
}

/**
 * Clear all feature flag overrides
 */
export function clearFeatureOverrides() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("feature_"));
  for (const key of keys) {
    localStorage.removeItem(key);
  }
  console.log("[FeatureFlags] All overrides cleared");
}

/**
 * Get all feature flags with their current values
 * @returns {Object}
 */
export function getAllFeatures() {
  const result = {};
  for (const [name, _defaultValue] of Object.entries(features)) {
    result[name] = isFeatureEnabled(name);
  }
  return result;
}

// Expose in dev mode for easy toggling
if (import.meta.env.DEV) {
  window.__FEATURES__ = {
    get: isFeatureEnabled,
    set: setFeature,
    clear: clearFeatureOverrides,
    getAll: getAllFeatures,

    // Quick toggles
    enablePhase4: () => setFeature("usePhase4", true),
    disablePhase4: () => setFeature("usePhase4", false),
  };

  console.log("💡 Feature flags available at window.__FEATURES__");
  console.log("   __FEATURES__.getAll()         → See all flags");
  console.log("   __FEATURES__.set(name, value) → Toggle flag");
  console.log("   __FEATURES__.enablePhase4()   → Enable Phase 4");
  console.log("   __FEATURES__.disablePhase4()  → Disable Phase 4");
}
