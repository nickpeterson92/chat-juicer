/**
 * Lifecycle Manager Tests
 * Tests for automatic timer and event listener cleanup
 */

import { ComponentLifecycle } from "../../electron/renderer/core/component-lifecycle.js";
import { EventBus } from "../../electron/renderer/core/event-bus.js";
import { LifecycleManager } from "../../electron/renderer/core/lifecycle-manager.js";

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
  });

  describe("Timer Management", () => {
    it("should track setTimeout and clear on unmount", (done) => {
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
      setTimeout(() => {
        manager.unmount(component);

        // Wait to ensure timer doesn't fire
        setTimeout(() => {
          expect(called).toBe(false);
          done();
        }, 20);
      }, 5);
    });

    it("should track setInterval and clear on unmount", (done) => {
      const component = {};
      manager.register(component, "IntervalComponent");

      let count = 0;
      const intervalId = manager.setInterval(
        component,
        () => {
          count++;
        },
        10
      );

      expect(intervalId).toBeDefined();

      // Let interval fire twice
      setTimeout(() => {
        expect(count).toBeGreaterThan(0);
        const countAtUnmount = count;

        // Unmount
        manager.unmount(component);

        // Wait and verify count doesn't increase
        setTimeout(() => {
          expect(count).toBe(countAtUnmount);
          done();
        }, 30);
      }, 25);
    });

    it("should allow manual timer clearing", (done) => {
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

      setTimeout(() => {
        expect(called).toBe(false);
        done();
      }, 30);
    });
  });

  describe("EventBus Integration", () => {
    it("should create scoped EventBus that auto-unsubscribes", () => {
      const component = {};
      manager.register(component, "EventComponent");

      const eventBus = new EventBus();
      const scopedBus = manager.createScopedEventBus(component, eventBus);

      let callCount = 0;
      scopedBus.on("test-event", () => {
        callCount++;
      });

      // Emit before unmount
      eventBus.emit("test-event");
      expect(callCount).toBe(1);

      // Unmount should unsubscribe
      manager.unmount(component);

      // Emit after unmount
      eventBus.emit("test-event");
      expect(callCount).toBe(1); // Should not increase
    });

    it("should track multiple event listeners", () => {
      const component = {};
      manager.register(component, "MultiEventComponent");

      const eventBus = new EventBus();
      const scopedBus = manager.createScopedEventBus(component, eventBus);

      let count1 = 0;
      let count2 = 0;

      scopedBus.on("event1", () => {
        count1++;
      });
      scopedBus.on("event2", () => {
        count2++;
      });

      eventBus.emit("event1");
      eventBus.emit("event2");

      expect(count1).toBe(1);
      expect(count2).toBe(1);

      // Unmount should unsubscribe both
      manager.unmount(component);

      eventBus.emit("event1");
      eventBus.emit("event2");

      expect(count1).toBe(1);
      expect(count2).toBe(1);
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

    it("should clear all timers on unmountAll", (done) => {
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
      setTimeout(() => {
        expect(totalCalls).toBe(0);
        done();
      }, 30);
    });
  });

  describe("Debug Snapshot", () => {
    it("should provide accurate debug information", () => {
      const comp1 = {};
      const comp2 = {};

      manager.register(comp1, "Component1");
      manager.register(comp2, "Component2");

      manager.setTimeout(comp1, () => {}, 100);
      manager.setInterval(comp2, () => {}, 100);

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
    expect(component.setInterval).toBeDefined();
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

  it("should check if component is mounted", () => {
    const component = {};

    expect(ComponentLifecycle.isMounted(component)).toBe(false);

    ComponentLifecycle.mount(component, "TestComponent", manager);
    expect(ComponentLifecycle.isMounted(component)).toBe(true);

    ComponentLifecycle.unmount(component, manager);
    expect(ComponentLifecycle.isMounted(component)).toBe(false);
  });
});
