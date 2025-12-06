import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComponentLifecycle } from "@/core/component-lifecycle.js";
import { LifecycleManager } from "@/core/lifecycle-manager.js";

describe("ComponentLifecycle", () => {
  let lifecycleManager;

  beforeEach(() => {
    lifecycleManager = new LifecycleManager();
    vi.useRealTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("mounts component, wires timers, and calls hooks", async () => {
    vi.useFakeTimers();
    const onMount = vi.fn();
    const onUnmount = vi.fn();

    const component = { onMount, onUnmount };

    ComponentLifecycle.mount(component, "TestComponent", lifecycleManager);
    expect(component.setTimeout).toBeTypeOf("function");
    expect(onMount).toHaveBeenCalled();

    const cb = vi.fn();
    const timerId = component.setTimeout(cb, 10);
    expect(timerId).toBeTruthy();

    ComponentLifecycle.unmount(component, lifecycleManager);
    expect(onUnmount).toHaveBeenCalled();

    // Timer should be cleared during unmount
    vi.advanceTimersByTime(20);
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("guards unmount when lifecycle metadata is missing", () => {
    const component = {};
    ComponentLifecycle.unmount(component, lifecycleManager);
    expect(component.setTimeout).toBeUndefined();
  });
});
