/**
 * Plugin System Edge Case Tests
 * Tests real-world edge cases and failure scenarios
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../../electron/renderer/core/event-bus.js";
import { AppState } from "../../../../electron/renderer/core/state.js";
import { createPlugin, PluginRegistry } from "../../../../electron/renderer/plugins/plugin-interface.js";

describe("Plugin Edge Cases", () => {
  let app;
  let registry;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    app = {
      eventBus: new EventBus(),
      state: new AppState(),
      services: {},
      config: {},
    };
    registry = new PluginRegistry(app);
    app.pluginRegistry = registry;

    // Suppress console output during tests
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    app.eventBus.off();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("Plugin Installation Failures", () => {
    it("should not register plugin if install() throws", async () => {
      const failingPlugin = createPlugin({
        name: "failing-plugin",
        version: "1.0.0",
        async install() {
          throw new Error("Install failed");
        },
      });

      await expect(registry.register(failingPlugin)).rejects.toThrow("Install failed");

      // Plugin should NOT be registered
      expect(registry.hasPlugin("failing-plugin")).toBe(false);
      expect(failingPlugin.installed).toBe(false);
    });

    it("should not emit plugin:registered if install fails", async () => {
      const registeredHandler = vi.fn();
      app.eventBus.on("plugin:registered", registeredHandler);

      const failingPlugin = createPlugin({
        name: "failing-plugin",
        version: "1.0.0",
        async install() {
          throw new Error("Install failed");
        },
      });

      try {
        await registry.register(failingPlugin);
      } catch (error) {
        // Expected to throw
      }

      // Should NOT have emitted registered event
      expect(registeredHandler).not.toHaveBeenCalled();
    });

    it("should maintain registry integrity after failed installation", async () => {
      // Register successful plugin first
      const goodPlugin = createPlugin({
        name: "good-plugin",
        version: "1.0.0",
        async install(app) {
          app.goodValue = "installed";
        },
      });

      await registry.register(goodPlugin);

      // Try to register failing plugin
      const badPlugin = createPlugin({
        name: "bad-plugin",
        version: "1.0.0",
        async install() {
          throw new Error("Bad install");
        },
      });

      try {
        await registry.register(badPlugin);
      } catch (error) {
        // Expected
      }

      // Good plugin should still be registered
      expect(registry.hasPlugin("good-plugin")).toBe(true);
      expect(registry.hasPlugin("bad-plugin")).toBe(false);
      expect(app.goodValue).toBe("installed");
      expect(registry.getAllPlugins().length).toBe(1);
    });
  });

  describe("Plugin Uninstallation Failures", () => {
    it("should handle errors during uninstall gracefully", async () => {
      const problematicPlugin = createPlugin({
        name: "problematic-plugin",
        version: "1.0.0",
        async install() {
          // Installs fine
        },
        async uninstall() {
          throw new Error("Uninstall failed");
        },
      });

      await registry.register(problematicPlugin);
      expect(registry.hasPlugin("problematic-plugin")).toBe(true);

      // Uninstall should throw
      await expect(registry.unregister("problematic-plugin")).rejects.toThrow("Uninstall failed");

      // Plugin should remain in registry (uninstall failed)
      expect(registry.hasPlugin("problematic-plugin")).toBe(true);
    });

    it("should not emit plugin:unregistered if uninstall fails", async () => {
      const unregisteredHandler = vi.fn();
      app.eventBus.on("plugin:unregistered", unregisteredHandler);

      const plugin = createPlugin({
        name: "test-plugin",
        version: "1.0.0",
        async install() {},
        async uninstall() {
          throw new Error("Uninstall failed");
        },
      });

      await registry.register(plugin);

      try {
        await registry.unregister("test-plugin");
      } catch (error) {
        // Expected
      }

      // Should NOT have emitted unregistered event
      expect(unregisteredHandler).not.toHaveBeenCalled();
    });
  });

  describe("Multiple Plugin Dependencies", () => {
    it("should handle plugin with multiple dependencies", async () => {
      const dep1 = createPlugin({
        name: "dep1",
        version: "1.0.0",
        async install() {},
      });

      const dep2 = createPlugin({
        name: "dep2",
        version: "1.0.0",
        async install() {},
      });

      const dependentPlugin = createPlugin({
        name: "dependent",
        version: "1.0.0",
        dependencies: ["dep1", "dep2"],
        async install() {},
      });

      // Should fail if both deps not installed
      await expect(registry.register(dependentPlugin)).rejects.toThrow();

      // Install first dep
      await registry.register(dep1);

      // Should still fail (missing dep2)
      await expect(registry.register(dependentPlugin)).rejects.toThrow(/requires.*dep2/);

      // Install second dep
      await registry.register(dep2);

      // Should now succeed
      await registry.register(dependentPlugin);
      expect(registry.hasPlugin("dependent")).toBe(true);
    });

    it("should check all dependencies before install attempt", async () => {
      const installSpy = vi.fn();

      const dependentPlugin = createPlugin({
        name: "dependent",
        version: "1.0.0",
        dependencies: ["missing1", "missing2"],
        async install() {
          installSpy();
        },
      });

      try {
        await registry.register(dependentPlugin);
      } catch (error) {
        // Expected to throw
      }

      // Install should never have been called (dependencies checked first)
      expect(installSpy).not.toHaveBeenCalled();
    });
  });

  describe("Plugin Lifecycle State", () => {
    it("should maintain correct installed state through lifecycle", async () => {
      const plugin = createPlugin({
        name: "lifecycle-plugin",
        version: "1.0.0",
        async install() {},
        async uninstall() {},
      });

      // Initially not installed
      expect(plugin.installed).toBe(false);

      // After registration
      await registry.register(plugin);
      expect(plugin.installed).toBe(true);

      // After unregistration
      await registry.unregister("lifecycle-plugin");
      expect(plugin.installed).toBe(false);
    });

    it("should handle rapid install/uninstall cycles", async () => {
      const plugin = createPlugin({
        name: "rapid-plugin",
        version: "1.0.0",
        async install(app) {
          app.installCount = (app.installCount || 0) + 1;
        },
        async uninstall(app) {
          app.uninstallCount = (app.uninstallCount || 0) + 1;
        },
      });

      // Install and uninstall 5 times
      for (let i = 0; i < 5; i++) {
        await registry.register(plugin);
        expect(registry.hasPlugin("rapid-plugin")).toBe(true);

        await registry.unregister("rapid-plugin");
        expect(registry.hasPlugin("rapid-plugin")).toBe(false);
      }

      expect(app.installCount).toBe(5);
      expect(app.uninstallCount).toBe(5);
    });
  });

  describe("Plugin Metadata Edge Cases", () => {
    it("should handle plugin with minimal metadata", () => {
      const minimalPlugin = createPlugin({
        name: "minimal",
        version: "1.0.0",
        // No description, no dependencies, no hooks
      });

      expect(minimalPlugin.name).toBe("minimal");
      expect(minimalPlugin.version).toBe("1.0.0");
      expect(minimalPlugin.dependencies).toEqual([]);
      expect(minimalPlugin.getMetadata()).toEqual({
        name: "minimal",
        version: "1.0.0",
        description: undefined,
        installed: false,
      });
    });

    it("should handle plugin with empty dependencies array", async () => {
      const plugin = createPlugin({
        name: "no-deps",
        version: "1.0.0",
        dependencies: [], // Explicitly empty
        async install() {},
      });

      // Should install fine (no dependencies to check)
      await registry.register(plugin);
      expect(registry.hasPlugin("no-deps")).toBe(true);
    });

    it("should handle plugin with undefined dependencies", async () => {
      const plugin = createPlugin({
        name: "undefined-deps",
        version: "1.0.0",
        dependencies: undefined,
        async install() {},
      });

      await registry.register(plugin);
      expect(registry.hasPlugin("undefined-deps")).toBe(true);
    });
  });

  describe("Plugin Hook Edge Cases", () => {
    it("should handle hook with no registered handlers", () => {
      registry.registerHook("test:hook");

      // Calling empty hook should not crash
      expect(() => {
        const results = registry.callHook("test:hook", { value: 42 });
        expect(results).toEqual([]);
      }).not.toThrow();
    });

    it("should handle hook handler that throws", () => {
      const goodHandler = vi.fn((data) => data.value * 2);
      const badHandler = vi.fn(() => {
        throw new Error("Handler error");
      });

      registry.registerHook("test:hook");
      registry.registerHookHandler("test:hook", goodHandler);
      registry.registerHookHandler("test:hook", badHandler);

      // Should not crash, but error should be caught
      expect(() => registry.callHook("test:hook", { value: 5 })).not.toThrow();

      // Good handler should have been called
      expect(goodHandler).toHaveBeenCalled();
      expect(badHandler).toHaveBeenCalled();
    });
  });

  describe("Plugin Middleware Edge Cases", () => {
    it("should handle middleware that throws", () => {
      const goodMiddleware = vi.fn((data) => ({ ...data, good: true }));
      const badMiddleware = vi.fn(() => {
        throw new Error("Middleware error");
      });

      registry.registerMiddleware(goodMiddleware);
      registry.registerMiddleware(badMiddleware);

      const inputData = { value: 42 };

      // Should not crash
      expect(() => {
        const result = registry.applyMiddleware(inputData);
        // Good middleware should have run, bad middleware should be caught
        expect(goodMiddleware).toHaveBeenCalled();
        expect(badMiddleware).toHaveBeenCalled();
      }).not.toThrow();
    });

    it("should handle middleware returning null", () => {
      const nullMiddleware = () => null;
      registry.registerMiddleware(nullMiddleware);

      const result = registry.applyMiddleware({ value: 42 });

      // Should handle null gracefully
      expect(result).toBe(null);
    });

    it("should handle middleware chain with multiple transformations", () => {
      const middleware1 = (data) => ({ ...data, step1: true });
      const middleware2 = (data) => ({ ...data, step2: true });
      const middleware3 = (data) => ({ ...data, step3: true });

      registry.registerMiddleware(middleware1);
      registry.registerMiddleware(middleware2);
      registry.registerMiddleware(middleware3);

      const result = registry.applyMiddleware({ initial: true });

      expect(result).toEqual({
        initial: true,
        step1: true,
        step2: true,
        step3: true,
      });
    });
  });

  describe("Registry Edge Cases", () => {
    it("should handle unregistering non-existent plugin", async () => {
      const result = await registry.unregister("non-existent");

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("non-existent"));
    });

    it("should handle getting non-existent plugin", () => {
      const plugin = registry.getPlugin("non-existent");

      expect(plugin).toBeUndefined();
    });

    it("should handle checking non-existent plugin", () => {
      const exists = registry.hasPlugin("non-existent");

      expect(exists).toBe(false);
    });

    it("should return empty array for getAllPlugins when no plugins registered", () => {
      const plugins = registry.getAllPlugins();

      expect(plugins).toEqual([]);
      expect(Array.isArray(plugins)).toBe(true);
    });
  });
});
