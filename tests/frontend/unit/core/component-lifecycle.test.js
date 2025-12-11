import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it("throws when component is not an object", () => {
    expect(() => ComponentLifecycle.mount(null, "Invalid", lifecycleManager)).toThrow(TypeError);
  });

  it("throws when lifecycle manager is missing", () => {
    expect(() => ComponentLifecycle.mount({}, "MissingLifecycle")).toThrow("LifecycleManager required");
  });

  it("logs onMount errors without crashing", () => {
    const error = new Error("boom");
    const component = {
      onMount() {
        throw error;
      },
    };

    expect(() => ComponentLifecycle.mount(component, "ErrorComponent", lifecycleManager)).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("onMount error"), error);
  });

  it("delegates clearTimer to lifecycle manager", () => {
    const clearSpy = vi.spyOn(lifecycleManager, "clearTimer");
    const component = {};

    ComponentLifecycle.mount(component, "TimerComponent", lifecycleManager);
    component.clearTimer("t1");

    expect(clearSpy).toHaveBeenCalledWith(component, "t1");
  });

  it("logs onUnmount errors but still cleans up", () => {
    const error = new Error("unmount failure");
    const component = {
      onUnmount() {
        throw error;
      },
    };
    const unmountSpy = vi.spyOn(lifecycleManager, "unmount");

    ComponentLifecycle.mount(component, "UnmountError", lifecycleManager);
    expect(() => ComponentLifecycle.unmount(component, lifecycleManager)).not.toThrow();

    expect(console.error).toHaveBeenCalledWith("ComponentLifecycle onUnmount error:", error);
    expect(unmountSpy).toHaveBeenCalledWith(component);
    expect(component._lifecycle).toBeUndefined();
  });
});
