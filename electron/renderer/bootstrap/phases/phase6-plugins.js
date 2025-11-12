/**
 * Phase 6: Plugins & Debug
 * Initialize plugin system and debug tools
 *
 * Dependencies: All previous phases (full app object required)
 * Outputs: PluginRegistry, DebugDashboard
 * Criticality: LOW (plugins are enhancements, not critical)
 */

import { getCorePlugins, PluginRegistry } from "../../plugins/index.js";
import { DebugDashboard } from "../../utils/debug/index.js";

/**
 * Initialize plugins and debug dashboard
 * @param {Object} deps - Dependencies from previous phases
 * @returns {Promise<import('../types.js').PluginsPhaseResult>}
 */
export async function initializePlugins({
  eventBus,
  appState,
  services,
  adapters,
  elements,
  components,
  sessionState,
}) {
  console.log("📦 Phase 6: Initializing plugins...");

  try {
    // Build app object
    const app = {
      eventBus,
      state: appState,
      appState, // Backward compatibility
      services,
      adapters,
      elements,
      components,
      sessionState,
      config: {
        version: "1.0.0",
        environment: import.meta.env.MODE,
      },
    };

    // Expose globally IMMEDIATELY (before plugins need it)
    window.app = app;
    console.log("  ✓ window.app exposed");

    // Initialize plugin registry
    const pluginRegistry = new PluginRegistry(app);
    app.pluginRegistry = pluginRegistry;

    // Install core plugins
    console.log("  🔌 Installing core plugins...");
    const corePlugins = getCorePlugins();
    const pluginResults = [];

    for (const plugin of corePlugins) {
      try {
        await pluginRegistry.register(plugin);
        pluginResults.push({ name: plugin.name, status: "success" });
        console.log(`    ✓ ${plugin.name}`);
      } catch (error) {
        pluginResults.push({ name: plugin.name, status: "error", error: error.message });
        console.error(`    ✗ ${plugin.name}:`, error.message);
      }
    }

    const successCount = pluginResults.filter((r) => r.status === "success").length;
    console.log(`  ✓ ${successCount}/${corePlugins.length} core plugins installed`);

    // Initialize debug dashboard (dev mode only)
    let debugDashboard = null;
    if (import.meta.env.DEV) {
      debugDashboard = new DebugDashboard(app);
      debugDashboard.init();
      app.debug = debugDashboard;
      console.log("  🔍 Debug dashboard initialized (window.__DEBUG__)");
    }

    return {
      pluginRegistry,
      debugDashboard,
      pluginResults,
      app, // Return full app object for final assembly
    };
  } catch (error) {
    console.error("❌ Phase 6 failed:", error);
    throw new Error(`Plugin initialization failed: ${error.message}`);
  }
}
