/**
 * Integration Tests - Plugin System
 * Tests the plugin infrastructure and lifecycle
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../electron/renderer/core/event-bus.js";
import { AppState } from "../../../electron/renderer/core/state.js";
import { createPlugin, PluginRegistry } from "../../../electron/renderer/plugins/plugin-interface.js";

describe("Plugin Integration Tests", () => {
  let app;
  let registry;

  beforeEach(() => {
    app = {
      eventBus: new EventBus(),
      state: new AppState(),
      services: {},
      config: {},
    };
    registry = new PluginRegistry(app);
    app.pluginRegistry = registry;
  });

  afterEach(() => {
    app.eventBus.off();
  });

  describe("Plugin Registration", () => {
    it("should register a plugin", async () => {
      const testPlugin = createPlugin({
        name: "test-plugin",
        version: "1.0.0",
        async install(app) {
          app.testValue = "installed";
        },
      });

      await registry.register(testPlugin);

      expect(registry.hasPlugin("test-plugin")).toBe(true);
      expect(app.testValue).toBe("installed");
      expect(testPlugin.installed).toBe(true);
    });

    it("should emit plugin:registered event", async () => {
      const handler = vi.fn();
      app.eventBus.on("plugin:registered", handler);

      const testPlugin = createPlugin({
        name: "test-plugin",
        version: "1.0.0",
        async install() {},
      });

      await registry.register(testPlugin);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            plugin: expect.objectContaining({
              name: "test-plugin",
              version: "1.0.0",
            }),
          }),
        })
      );
    });

    it("should not register duplicate plugins", async () => {
      const plugin1 = createPlugin({
        name: "duplicate",
        version: "1.0.0",
        async install() {},
      });

      await registry.register(plugin1);
      const result = await registry.register(plugin1);

      expect(result).toBe(false);
    });

    it("should enforce plugin dependencies", async () => {
      const dependentPlugin = createPlugin({
        name: "dependent",
        version: "1.0.0",
        dependencies: ["required-plugin"],
        async install() {},
      });

      await expect(registry.register(dependentPlugin)).rejects.toThrow(/requires.*required-plugin/);
    });

    it("should allow plugin with satisfied dependencies", async () => {
      const requiredPlugin = createPlugin({
        name: "required-plugin",
        version: "1.0.0",
        async install() {},
      });

      const dependentPlugin = createPlugin({
        name: "dependent",
        version: "1.0.0",
        dependencies: ["required-plugin"],
        async install() {},
      });

      await registry.register(requiredPlugin);
      await registry.register(dependentPlugin);

      expect(registry.hasPlugin("dependent")).toBe(true);
    });
  });

  describe("Plugin Unregistration", () => {
    it("should unregister a plugin", async () => {
      const testPlugin = createPlugin({
        name: "test-plugin",
        version: "1.0.0",
        async install(app) {
          app.testValue = "installed";
        },
        async uninstall(app) {
          app.testValue = "uninstalled";
        },
      });

      await registry.register(testPlugin);
      expect(registry.hasPlugin("test-plugin")).toBe(true);

      await registry.unregister("test-plugin");
      expect(registry.hasPlugin("test-plugin")).toBe(false);
      expect(app.testValue).toBe("uninstalled");
    });

    it("should emit plugin:unregistered event", async () => {
      const handler = vi.fn();
      app.eventBus.on("plugin:unregistered", handler);

      const testPlugin = createPlugin({
        name: "test-plugin",
        version: "1.0.0",
        async install() {},
      });

      await registry.register(testPlugin);
      await registry.unregister("test-plugin");

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            plugin: expect.objectContaining({
              name: "test-plugin",
            }),
          }),
        })
      );
    });

    it("should handle unregistering non-existent plugin", async () => {
      const result = await registry.unregister("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("Plugin Hooks", () => {
    it("should register and execute hooks", async () => {
      registry.registerHook("test:hook", (data) => {
        return { ...data, modified: true };
      });

      const result = await registry.executeHook("test:hook", { value: 1 });

      expect(result).toEqual({ value: 1, modified: true });
    });

    it("should execute multiple hooks in priority order", async () => {
      registry.registerHook("test:priority", (data) => ({ ...data, order: [...(data.order || []), "low"] }), 0);
      registry.registerHook("test:priority", (data) => ({ ...data, order: [...(data.order || []), "high"] }), 10);
      registry.registerHook("test:priority", (data) => ({ ...data, order: [...(data.order || []), "medium"] }), 5);

      const result = await registry.executeHook("test:priority", {});

      expect(result.order).toEqual(["high", "medium", "low"]);
    });

    it("should catch hook errors and continue", async () => {
      registry.registerHook("test:error", () => {
        throw new Error("Hook error");
      });
      registry.registerHook("test:error", (data) => ({ ...data, success: true }));

      const result = await registry.executeHook("test:error", {});

      expect(result.success).toBe(true);
    });
  });

  describe("Plugin Middlewares", () => {
    it("should register and execute middlewares", async () => {
      registry.registerMiddleware((data) => {
        return { ...data, middleware1: true };
      });

      registry.registerMiddleware((data) => {
        return { ...data, middleware2: true };
      });

      const result = await registry.executeMiddlewares({ value: 1 });

      expect(result).toEqual({
        value: 1,
        middleware1: true,
        middleware2: true,
      });
    });

    it("should catch middleware errors and continue", async () => {
      registry.registerMiddleware(() => {
        throw new Error("Middleware error");
      });
      registry.registerMiddleware((data) => ({ ...data, success: true }));

      const result = await registry.executeMiddlewares({});

      expect(result.success).toBe(true);
    });
  });

  describe("Plugin Queries", () => {
    it("should get plugin by name", async () => {
      const testPlugin = createPlugin({
        name: "test-plugin",
        version: "1.0.0",
        async install() {},
      });

      await registry.register(testPlugin);

      const retrieved = registry.getPlugin("test-plugin");
      expect(retrieved).toBe(testPlugin);
    });

    it("should get all plugins", async () => {
      const plugin1 = createPlugin({
        name: "plugin1",
        version: "1.0.0",
        async install() {},
      });

      const plugin2 = createPlugin({
        name: "plugin2",
        version: "1.0.0",
        async install() {},
      });

      await registry.register(plugin1);
      await registry.register(plugin2);

      const plugins = registry.getAllPlugins();
      expect(plugins.length).toBe(2);
      expect(plugins).toContain(plugin1);
      expect(plugins).toContain(plugin2);
    });

    it("should check if plugin exists", async () => {
      expect(registry.hasPlugin("non-existent")).toBe(false);

      const testPlugin = createPlugin({
        name: "test-plugin",
        version: "1.0.0",
        async install() {},
      });

      await registry.register(testPlugin);
      expect(registry.hasPlugin("test-plugin")).toBe(true);
    });
  });

  describe("Plugin Debug", () => {
    it("should return debug snapshot", async () => {
      const plugin1 = createPlugin({
        name: "plugin1",
        version: "1.0.0",
        async install() {},
      });

      await registry.register(plugin1);
      registry.registerHook("test:hook", () => {});
      registry.registerMiddleware(() => {});

      const snapshot = registry.getDebugSnapshot();

      expect(snapshot.plugins.length).toBe(1);
      expect(snapshot.plugins[0].name).toBe("plugin1");
      expect(snapshot.hooks).toContain("test:hook");
      expect(snapshot.middlewares).toBe(1);
    });
  });
});

describe("Plugin Factory Tests", () => {
  it("should create plugin with factory", () => {
    const testPlugin = createPlugin({
      name: "factory-plugin",
      version: "1.0.0",
      description: "Test plugin",
      async install(app) {
        app.installed = true;
      },
    });

    expect(testPlugin.name).toBe("factory-plugin");
    expect(testPlugin.version).toBe("1.0.0");
    expect(testPlugin.description).toBe("Test plugin");
    expect(testPlugin.install).toBeDefined();
  });

  it("should handle optional fields", () => {
    const testPlugin = createPlugin({
      name: "minimal-plugin",
      async install() {},
    });

    expect(testPlugin.version).toBe("1.0.0");
    expect(testPlugin.description).toBe("");
    expect(testPlugin.dependencies).toEqual([]);
  });
});

describe("Plugin Lifecycle Tests", () => {
  let app;
  let registry;

  beforeEach(() => {
    app = {
      eventBus: new EventBus(),
      state: new AppState(),
      services: {},
      config: {},
    };
    registry = new PluginRegistry(app);
  });

  it("should call install on registration", async () => {
    const installSpy = vi.fn();

    const testPlugin = createPlugin({
      name: "lifecycle-test",
      version: "1.0.0",
      install: installSpy,
    });

    await registry.register(testPlugin);

    expect(installSpy).toHaveBeenCalledWith(app);
  });

  it("should call uninstall on unregistration", async () => {
    const uninstallSpy = vi.fn();

    const testPlugin = createPlugin({
      name: "lifecycle-test",
      version: "1.0.0",
      async install() {},
      uninstall: uninstallSpy,
    });

    await registry.register(testPlugin);
    await registry.unregister("lifecycle-test");

    expect(uninstallSpy).toHaveBeenCalledWith(app);
  });

  it("should support enable/disable lifecycle methods", async () => {
    const enableSpy = vi.fn();
    const disableSpy = vi.fn();

    const testPlugin = createPlugin({
      name: "lifecycle-test",
      version: "1.0.0",
      async install() {},
      enable: enableSpy,
      disable: disableSpy,
    });

    await registry.register(testPlugin);

    await testPlugin.enable(app);
    expect(enableSpy).toHaveBeenCalledWith(app);

    await testPlugin.disable(app);
    expect(disableSpy).toHaveBeenCalledWith(app);
  });
});

describe("Plugin Metadata Tests", () => {
  it("should return plugin metadata", () => {
    const testPlugin = createPlugin({
      name: "metadata-test",
      version: "2.0.0",
      description: "Test description",
      dependencies: ["dep1", "dep2"],
      async install() {},
    });

    const metadata = testPlugin.getMetadata();

    expect(metadata).toEqual({
      name: "metadata-test",
      version: "2.0.0",
      description: "Test description",
      dependencies: ["dep1", "dep2"],
      installed: false,
    });
  });

  it("should update installed status", async () => {
    const testPlugin = createPlugin({
      name: "metadata-test",
      version: "1.0.0",
      async install() {},
    });

    expect(testPlugin.getMetadata().installed).toBe(false);

    const app = {
      eventBus: new EventBus(),
      state: new AppState(),
      services: {},
    };
    const registry = new PluginRegistry(app);

    await registry.register(testPlugin);
    expect(testPlugin.getMetadata().installed).toBe(true);
  });
});
