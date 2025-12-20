/**
 * Plugin System Interface
 * Provides extensibility for Chat Juicer without modifying core code
 */

/**
 * Base Plugin class that all plugins should extend
 */
export class Plugin {
  constructor() {
    this.name = "BasePlugin";
    this.version = "1.0.0";
    this.description = "";
    this.dependencies = [];
    this.installed = false;
  }

  /**
   * Called when plugin is installed
   * @param {Object} app - App context { eventBus, state, services, config }
   */
  async install(_app) {
    throw new Error("Plugin must implement install() method");
  }

  /**
   * Called when plugin is uninstalled
   * @param {Object} app - App context
   */
  async uninstall(_app) {
    // Optional cleanup
  }

  /**
   * Called when plugin is enabled
   * @param {Object} app - App context
   */
  async enable(_app) {
    // Optional
  }

  /**
   * Called when plugin is disabled
   * @param {Object} app - App context
   */
  async disable(_app) {
    // Optional
  }

  /**
   * Get plugin metadata
   * @returns {Object}
   */
  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      dependencies: this.dependencies,
      installed: this.installed,
    };
  }
}

/**
 * Plugin Registry - manages plugin lifecycle
 */
export class PluginRegistry {
  constructor(app) {
    this.app = app;
    this.plugins = new Map();
    this.hooks = new Map();
    this.middlewares = [];
  }

  /**
   * Register a plugin
   * @param {Plugin} plugin - Plugin instance
   * @returns {Promise<boolean>}
   */
  async register(plugin) {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[PluginRegistry] Plugin ${plugin.name} already registered`);
      return false;
    }

    // Check dependencies
    for (const dep of plugin.dependencies || []) {
      if (!this.plugins.has(dep)) {
        throw new Error(`Plugin ${plugin.name} requires ${dep} which is not installed`);
      }
    }

    try {
      await plugin.install(this.app);
      plugin.installed = true;
      this.plugins.set(plugin.name, plugin);

      this.app.eventBus.emit("plugin:registered", {
        plugin: plugin.getMetadata(),
      });

      console.log(`[PluginRegistry] Registered plugin: ${plugin.name} v${plugin.version}`);
      return true;
    } catch (error) {
      console.error(`[PluginRegistry] Failed to register plugin ${plugin.name}:`, error);
      throw error;
    }
  }

  /**
   * Unregister a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Promise<boolean>}
   */
  async unregister(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      console.warn(`[PluginRegistry] Plugin ${pluginName} not found`);
      return false;
    }

    try {
      await plugin.uninstall(this.app);
      plugin.installed = false;
      this.plugins.delete(pluginName);

      this.app.eventBus.emit("plugin:unregistered", {
        plugin: plugin.getMetadata(),
      });

      console.log(`[PluginRegistry] Unregistered plugin: ${pluginName}`);
      return true;
    } catch (error) {
      console.error(`[PluginRegistry] Failed to unregister plugin ${pluginName}:`, error);
      throw error;
    }
  }

  /**
   * Get plugin by name
   * @param {string} pluginName
   * @returns {Plugin|undefined}
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName);
  }

  /**
   * Get all registered plugins
   * @returns {Array<Plugin>}
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Check if plugin is registered
   * @param {string} pluginName
   * @returns {boolean}
   */
  hasPlugin(pluginName) {
    return this.plugins.has(pluginName);
  }

  /**
   * Register a hook (extension point)
   * @param {string} hookName - Hook name
   * @param {Function} handler - Hook handler
   * @param {number} priority - Priority (higher = earlier)
   */
  registerHook(hookName, handler, priority = 0) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    this.hooks.get(hookName).push({ handler, priority });
    this.hooks.get(hookName).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute a hook
   * @param {string} hookName - Hook name
   * @param {*} data - Hook data
   * @returns {Promise<*>} Modified data
   */
  async executeHook(hookName, data) {
    const handlers = this.hooks.get(hookName) || [];
    let result = data;

    for (const { handler } of handlers) {
      try {
        result = await handler(result, this.app);
      } catch (error) {
        console.error(`[PluginRegistry] Hook ${hookName} error:`, error);
      }
    }

    return result;
  }

  /**
   * Register middleware for message processing
   * @param {Function} middleware - Middleware function
   */
  registerMiddleware(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * Execute middlewares
   * @param {*} data - Data to process
   * @returns {Promise<*>}
   */
  async executeMiddlewares(data) {
    let result = data;

    for (const middleware of this.middlewares) {
      try {
        result = await middleware(result, this.app);
      } catch (error) {
        console.error("[PluginRegistry] Middleware error:", error);
      }
    }

    return result;
  }

  /**
   * Get debug snapshot
   * @returns {Object}
   */
  getDebugSnapshot() {
    return {
      plugins: Array.from(this.plugins.values()).map((p) => p.getMetadata()),
      hooks: Array.from(this.hooks.keys()),
      middlewares: this.middlewares.length,
    };
  }
}

/**
 * Plugin factory helper
 * @param {Object} config - Plugin configuration
 * @returns {Plugin}
 */
export function createPlugin(config) {
  const plugin = new Plugin();

  plugin.name = config.name;
  plugin.version = config.version || "1.0.0";
  plugin.description = config.description || "";
  plugin.dependencies = config.dependencies || [];

  if (config.install) {
    plugin.install = config.install;
  }

  if (config.uninstall) {
    plugin.uninstall = config.uninstall;
  }

  if (config.enable) {
    plugin.enable = config.enable;
  }

  if (config.disable) {
    plugin.disable = config.disable;
  }

  return plugin;
}

/**
 * Plugin decorator for easy plugin creation
 * @param {Object} metadata - Plugin metadata
 * @returns {Function} Class decorator
 */
export function plugin(metadata) {
  return (PluginClass) => {
    const originalClass = PluginClass;

    // Create new class that extends Plugin
    const DecoratedPlugin = class extends Plugin {
      constructor(...args) {
        super();
        this.name = metadata.name;
        this.version = metadata.version;
        this.description = metadata.description;
        this.dependencies = metadata.dependencies || [];

        // Create instance of original class
        const instance = new originalClass(...args);

        // Copy methods from original instance
        Object.getOwnPropertyNames(originalClass.prototype).forEach((prop) => {
          if (prop !== "constructor") {
            this[prop] = instance[prop];
          }
        });
      }
    };

    return DecoratedPlugin;
  };
}
