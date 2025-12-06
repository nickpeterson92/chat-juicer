/**
 * Phase 6: Plugins
 * Initialize plugin system
 *
 * Dependencies: All previous phases (full app object required)
 * Outputs: PluginRegistry, DebugDashboard
 * Criticality: LOW (plugins are enhancements, not critical)
 */

import { getCorePlugins, PluginRegistry } from "../../plugins/index.js";

/**
 * Initialize plugins and debug dashboard
 * @param {Object} deps - Dependencies from previous phases
 * @returns {Promise<import('../types.js').PluginsPhaseResult>}
 */
export async function initializePlugins({ eventBus, appState, services, adapters, elements, components }) {
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
      config: {
        version: "1.0.0",
        environment: import.meta.env.MODE,
      },
    };

    // Expose globally IMMEDIATELY (before plugins need it)
    window.app = app;

    // Initialize plugin registry
    const pluginRegistry = new PluginRegistry(app);
    app.pluginRegistry = pluginRegistry;

    // Install core plugins
    const corePlugins = getCorePlugins();
    const pluginResults = [];

    for (const plugin of corePlugins) {
      try {
        await pluginRegistry.register(plugin);
        pluginResults.push({ name: plugin.name, status: "success" });
      } catch (error) {
        pluginResults.push({ name: plugin.name, status: "error", error: error.message });
        console.error(`Plugin ${plugin.name} failed:`, error.message);
      }
    }

    return {
      pluginRegistry,
      pluginResults,
      app, // Return full app object for final assembly
    };
  } catch (error) {
    console.error("Phase 6 failed:", error);
    throw new Error(`Plugin initialization failed: ${error.message}`);
  }
}
