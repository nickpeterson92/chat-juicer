/**
 * Lifecycle Manager Performance Benchmarks
 * Measures overhead of lifecycle management system
 */

import { bench, describe } from "vitest";
import { ComponentLifecycle } from "../../src/frontend/renderer/core/component-lifecycle.js";
import { EventBus } from "../../src/frontend/renderer/core/event-bus.js";
import { LifecycleManager } from "../../src/frontend/renderer/core/lifecycle-manager.js";

describe("LifecycleManager Performance", () => {
  let manager;

  beforeEach(() => {
    manager = new LifecycleManager();
  });

  afterEach(() => {
    manager.unmountAll();
  });

  bench("Component registration", () => {
    const component = {};
    manager.register(component, "BenchComponent");
  });

  bench("setTimeout creation", () => {
    const component = {};
    manager.register(component, "TimerComponent");
    manager.setTimeout(component, () => {}, 100);
  });

  bench("setInterval creation", () => {
    const component = {};
    manager.register(component, "IntervalComponent");
    manager.setInterval(component, () => {}, 100);
  });

  bench("EventBus scoping", () => {
    const component = {};
    const eventBus = new EventBus();
    manager.register(component, "EventComponent");
    manager.createScopedEventBus(component, eventBus);
  });

  bench("Component unmount (10 timers)", () => {
    const component = {};
    manager.register(component, "UnmountComponent");

    for (let i = 0; i < 10; i++) {
      manager.setTimeout(component, () => {}, 100);
    }

    manager.unmount(component);
  });

  bench("Full lifecycle (mount + 5 timers + unmount)", () => {
    const component = {};
    ComponentLifecycle.mount(component, "FullCycleComponent", manager);

    for (let i = 0; i < 5; i++) {
      component.setTimeout(() => {}, 100);
    }

    ComponentLifecycle.unmount(component, manager);
  });

  bench("1000 component lifecycles", () => {
    for (let i = 0; i < 1000; i++) {
      const component = {};
      manager.register(component, `Component${i}`);
      manager.setTimeout(component, () => {}, 100);
      manager.unmount(component);
    }
  });
});

describe("Native vs Lifecycle-Managed Comparison", () => {
  let manager;

  beforeEach(() => {
    manager = new LifecycleManager();
  });

  afterEach(() => {
    manager.unmountAll();
  });

  bench("Native setTimeout", () => {
    const timerId = setTimeout(() => {}, 100);
    clearTimeout(timerId);
  });

  bench("Lifecycle-managed setTimeout", () => {
    const component = {};
    manager.register(component, "CompareComponent");
    const timerId = manager.setTimeout(component, () => {}, 100);
    manager.clearTimer(component, timerId);
  });

  bench("Native setInterval", () => {
    const timerId = setInterval(() => {}, 100);
    clearInterval(timerId);
  });

  bench("Lifecycle-managed setInterval", () => {
    const component = {};
    manager.register(component, "CompareComponent");
    const timerId = manager.setInterval(component, () => {}, 100);
    manager.clearTimer(component, timerId);
  });
});

describe("EventBus Performance", () => {
  let manager;
  let eventBus;

  beforeEach(() => {
    manager = new LifecycleManager();
    eventBus = new EventBus();
  });

  afterEach(() => {
    manager.unmountAll();
  });

  bench("Native EventBus subscription", () => {
    const unsubscribe = eventBus.on("test", () => {});
    unsubscribe();
  });

  bench("Scoped EventBus subscription", () => {
    const component = {};
    manager.register(component, "EventComponent");
    const scopedBus = manager.createScopedEventBus(component, eventBus);
    const unsubscribe = scopedBus.on("test", () => {});
    unsubscribe();
  });

  bench("10 native subscriptions + unsubscribe", () => {
    const unsubscribers = [];
    for (let i = 0; i < 10; i++) {
      unsubscribers.push(eventBus.on(`event${i}`, () => {}));
    }
    for (const fn of unsubscribers) {
      fn();
    }
  });

  bench("10 scoped subscriptions + auto-cleanup", () => {
    const component = {};
    manager.register(component, "EventComponent");
    const scopedBus = manager.createScopedEventBus(component, eventBus);

    for (let i = 0; i < 10; i++) {
      scopedBus.on(`event${i}`, () => {});
    }

    manager.unmount(component);
  });
});

describe("Memory Efficiency", () => {
  let manager;

  beforeEach(() => {
    manager = new LifecycleManager();
  });

  afterEach(() => {
    manager.unmountAll();
  });

  bench("10 components with 5 timers each", () => {
    const components = [];

    for (let i = 0; i < 10; i++) {
      const component = {};
      components.push(component);
      ComponentLifecycle.mount(component, `Component${i}`, manager);

      for (let j = 0; j < 5; j++) {
        component.setTimeout(() => {}, 100);
      }
    }

    // Cleanup all
    for (const comp of components) {
      ComponentLifecycle.unmount(comp, manager);
    }
  });

  bench("Debug snapshot generation", () => {
    // Create 10 components
    for (let i = 0; i < 10; i++) {
      const component = {};
      manager.register(component, `Component${i}`);
      manager.setTimeout(component, () => {}, 100);
    }

    manager.getDebugSnapshot();
  });
});
