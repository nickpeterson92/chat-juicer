/**
 * Lifecycle Manager Tests
 * Tests for automatic timer and event listener cleanup
 */

import { ComponentLifecycle } from "../../../../electron/renderer/core/component-lifecycle.js";
import { LifecycleManager } from "../../../../electron/renderer/core/lifecycle-manager.js";

describe("LifecycleManager", () => {
  let manager;

  beforeEach(() => {
    manager = new LifecycleManager();
  });

  afterEach(() => {
    manager.unmountAll();
  });

  describe("Component Registration", () => {
    it("should register a component and return unique ID", () => {
      const component = {};
      const id = manager.register(component, "TestComponent");

      expect(id).toMatch(/^TestComponent_\d+$/);
      expect(manager.components.has(id)).toBe(true);
    });

    it("should not re-register the same component", () => {
      const component = {};
      const id1 = manager.register(component, "TestComponent");
      const id2 = manager.register(component, "TestComponent");

      expect(id1).toBe(id2);
    });

    it("should track multiple components independently", () => {
      const comp1 = {};
      const comp2 = {};

      const id1 = manager.register(comp1, "Component1");
      const id2 = manager.register(comp2, "Component2");

      expect(id1).not.toBe(id2);
      expect(manager.components.size).toBe(2);
    });

    it("should throw TypeError for null component", () => {
      expect(() => manager.register(null, "NullComponent")).toThrow(TypeError);
    });

    it("should throw TypeError for non-object component", () => {
      expect(() => manager.register("string", "StringComponent")).toThrow(TypeError);
      expect(() => manager.register(123, "NumberComponent")).toThrow(TypeError);
      expect(() => manager.register(undefined, "UndefinedComponent")).toThrow(TypeError);
    });
  });

  describe("Timer Management", () => {
    it("should track setTimeout and clear on unmount", async () => {
      const component = {};
      manager.register(component, "TimerComponent");

      let called = false;
      const timerId = manager.setTimeout(
        component,
        () => {
          called = true;
        },
        10
      );

      expect(timerId).toBeDefined();

      // Unmount before timer fires
      await new Promise((resolve) => setTimeout(resolve, 5));
      manager.unmount(component);

      // Wait to ensure timer doesn't fire
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(called).toBe(false);
    });

    it("should allow manual timer clearing", async () => {
      const component = {};
      manager.register(component, "ManualClearComponent");

      let called = false;
      const timerId = manager.setTimeout(
        component,
        () => {
          called = true;
        },
        20
      );

      // Clear manually
      manager.clearTimer(component, timerId);

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(called).toBe(false);
    });
  });

  describe("Warnings and guards", () => {
    it("should warn and still fire timer when setTimeout called on unregistered component", async () => {
      vi.useFakeTimers();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const callback = vi.fn();

      const timerId = manager.setTimeout({}, callback, 5);

      // Timer ID exists (either number or Timer object depending on environment)
      expect(timerId).toBeDefined();
      vi.runAllTimers();
      expect(callback).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("should warn and return null when setTimeout called on unmounted component", () => {
      const component = {};
      const id = manager.register(component, "Unmounted");
      // Manually mark as unmounted but keep the entry
      const entry = manager.components.get(id);
      entry.mounted = false;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const timerId = manager.setTimeout(component, () => {}, 10);

      expect(timerId).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });

    it("should noop when clearing timer for unknown component", () => {
      expect(() => manager.clearTimer({}, 123)).not.toThrow();
    });

    it("should noop when clearing timer that does not exist in set", () => {
      const component = {};
      manager.register(component, "TimerComponent");
      // Clear a timer ID that was never added
      expect(() => manager.clearTimer(component, 99999)).not.toThrow();
    });

    it("should noop when entry is missing for clearTimer", () => {
      const component = {};
      const id = manager.register(component, "MissingEntry");
      manager.components.delete(id); // Remove entry but keep WeakMap reference
      expect(() => manager.clearTimer(component, 123)).not.toThrow();
    });

    it("should warn but not throw when unmounting unknown component", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(() => manager.unmount({})).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });

    it("should allow unmountAll on empty manager", () => {
      manager.unmountAll();
      expect(manager.components.size).toBe(0);
    });

    it("should warn on duplicate registration of the same component", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const component = {};

      const firstId = manager.register(component, "Dup");
      const secondId = manager.register(component, "Dup");

      expect(secondId).toBe(firstId);
      expect(warnSpy).toHaveBeenCalled();
    });

    it("should warn when component entry is missing during unmount", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const component = {};
      const id = manager.register(component, "MissingEntry");

      manager.components.delete(id);

      expect(() => manager.unmount(component)).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });

    it("should continue unmount even if an unsubscribe handler throws", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const component = {};
      const id = manager.register(component, "ThrowingUnsub");
      const entry = manager.components.get(id);
      entry.unsubscribers.add(() => {
        throw new Error("unsubscribe failure");
      });

      expect(() => manager.unmount(component)).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("should noop addUnsubscriber with null component", () => {
      expect(() => manager.addUnsubscriber(null, () => {})).not.toThrow();
    });

    it("should noop addUnsubscriber with non-function unsubscriber", () => {
      const component = {};
      manager.register(component, "TestComponent");
      expect(() => manager.addUnsubscriber(component, "not a function")).not.toThrow();
      expect(() => manager.addUnsubscriber(component, null)).not.toThrow();
    });

    it("should warn when addUnsubscriber called on unregistered component", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      manager.addUnsubscriber({}, () => {});
      expect(warnSpy).toHaveBeenCalledWith("[Lifecycle] addUnsubscriber called on unregistered component");
    });

    it("should noop addUnsubscriber on unmounted component", () => {
      const component = {};
      manager.register(component, "UnmountedComponent");
      manager.unmount(component);

      // Re-register to get a reference, then mark as unmounted
      const comp2 = {};
      const id = manager.register(comp2, "Comp2");
      const entry = manager.components.get(id);
      entry.mounted = false;

      expect(() => manager.addUnsubscriber(comp2, () => {})).not.toThrow();
      expect(entry.unsubscribers.size).toBe(0);
    });
  });

  describe("Memory Leak Prevention", () => {
    it("should handle 1000 component lifecycles without memory growth", () => {
      const initialSize = manager.components.size;

      for (let i = 0; i < 1000; i++) {
        const component = {};
        manager.register(component, `Component${i}`);
        manager.setTimeout(component, () => {}, 100);
        manager.unmount(component);
      }

      expect(manager.components.size).toBe(initialSize);
    });

    it("should clear all timers on unmountAll", async () => {
      const components = [];
      let totalCalls = 0;

      // Create 10 components with timers
      for (let i = 0; i < 10; i++) {
        const comp = {};
        components.push(comp);
        manager.register(comp, `Component${i}`);
        manager.setTimeout(
          comp,
          () => {
            totalCalls++;
          },
          20
        );
      }

      // Unmount all immediately
      manager.unmountAll();

      // Wait and verify no timers fired
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(totalCalls).toBe(0);
    });

    it("should skip unmount when component entry is missing component reference", () => {
      manager.components.set("orphan_1", {
        component: null,
        name: "Orphan",
        timers: new Set(),
        unsubscribers: new Set(),
        mounted: true,
      });

      expect(() => manager.unmountAll()).not.toThrow();
      expect(manager.components.has("orphan_1")).toBe(true);
    });
  });

  describe("Debug Snapshot", () => {
    it("should provide accurate debug information", () => {
      const comp1 = {};
      const comp2 = {};

      manager.register(comp1, "Component1");
      manager.register(comp2, "Component2");

      manager.setTimeout(comp1, () => {}, 100);
      manager.setTimeout(comp2, () => {}, 100);

      const snapshot = manager.getDebugSnapshot();

      expect(snapshot.totalComponents).toBe(2);
      expect(snapshot.totalTimers).toBe(2);
      expect(snapshot.components).toHaveLength(2);
    });
  });
});

describe("ComponentLifecycle", () => {
  let manager;

  beforeEach(() => {
    manager = new LifecycleManager();
  });

  afterEach(() => {
    manager.unmountAll();
  });

  it("should mount component with lifecycle methods", () => {
    const component = {};
    ComponentLifecycle.mount(component, "TestComponent", manager);

    expect(component.setTimeout).toBeDefined();
    expect(component.clearTimer).toBeDefined();
    expect(component._lifecycle).toBeDefined();
  });

  it("should call onMount hook if defined", () => {
    let mountCalled = false;
    const component = {
      onMount() {
        mountCalled = true;
      },
    };

    ComponentLifecycle.mount(component, "HookComponent", manager);
    expect(mountCalled).toBe(true);
  });

  it("should call onUnmount hook if defined", () => {
    let unmountCalled = false;
    const component = {
      onUnmount() {
        unmountCalled = true;
      },
    };

    ComponentLifecycle.mount(component, "HookComponent", manager);
    ComponentLifecycle.unmount(component, manager);

    expect(unmountCalled).toBe(true);
  });

  it("should cleanup lifecycle metadata on unmount", () => {
    const component = {};
    ComponentLifecycle.mount(component, "TestComponent", manager);

    expect(component._lifecycle).toBeDefined();

    ComponentLifecycle.unmount(component, manager);

    expect(component._lifecycle).toBeUndefined();
    expect(component.setTimeout).toBeUndefined();
  });
});
