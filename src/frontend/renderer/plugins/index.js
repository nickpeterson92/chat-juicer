/**
 * Plugin System Exports
 * Centralized exports for plugin system
 */

export {
  AutoSavePlugin,
  DebugToolsPlugin,
  ErrorTrackingPlugin,
  getCorePlugins,
  KeyboardShortcutsPlugin,
  MessageHandlerPlugin,
  PerformanceTrackingPlugin,
  StateSyncPlugin,
} from "./core-plugins.js";
export { createPlugin, Plugin, PluginRegistry, plugin } from "./plugin-interface.js";
