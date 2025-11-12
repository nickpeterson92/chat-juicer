/**
 * ComponentLifecycle - Mixin for component lifecycle management
 *
 * Provides standard mount()/unmount() pattern for components with automatic
 * timer and event listener cleanup.
 *
 * Usage:
 * ```js
 * import { ComponentLifecycle } from './core/component-lifecycle.js';
 * import { globalLifecycleManager } from './core/lifecycle-manager.js';
 *
 * const component = {
 *   onMount() {
 *     console.log('Component mounted!');
 *     // Setup code here
 *   },
 *
 *   onUnmount() {
 *     console.log('Component unmounting!');
 *     // Additional cleanup if needed
 *   }
 * };
 *
 * // Mount component
 * ComponentLifecycle.mount(component, 'MyComponent', globalLifecycleManager);
 *
 * // Use lifecycle-managed timers
 * component.setTimeout(() => {...}, 1000);
 *
 * // Unmount component
 * ComponentLifecycle.unmount(component, globalLifecycleManager);
 * ```
 */

/**
 * Mount a component with lifecycle management
 * @param {Object} component - Component object
 * @param {string} name - Component name for debugging
 * @param {LifecycleManager} lifecycleManager - Lifecycle manager instance
 * @returns {string} Component ID
 */
export function mount(component, name, lifecycleManager) {
  if (!component || typeof component !== "object") {
    throw new TypeError("Component must be an object");
  }

  if (!lifecycleManager) {
    throw new Error("LifecycleManager required for component mounting");
  }

  // Register with lifecycle manager
  const componentId = lifecycleManager.register(component, name);

  // Store lifecycle metadata
  component._lifecycle = {
    id: componentId,
    manager: lifecycleManager,
    mounted: true,
  };

  // Add lifecycle-managed timer methods
  component.setTimeout = (callback, delay) => {
    return lifecycleManager.setTimeout(component, callback, delay);
  };

  component.clearTimer = (timerId) => {
    return lifecycleManager.clearTimer(component, timerId);
  };

  // Call component's onMount hook if exists
  if (typeof component.onMount === "function") {
    try {
      component.onMount();
    } catch (err) {
      console.error(`[ComponentLifecycle] onMount error in ${name}:`, err);
    }
  }

  console.log(`[ComponentLifecycle] Mounted: ${name} (${componentId})`);
  return componentId;
}

/**
 * Unmount a component and cleanup all resources
 * @param {Object} component - Component object
 * @param {LifecycleManager} lifecycleManager - Lifecycle manager instance
 */
export function unmount(component, lifecycleManager) {
  if (!component || !component._lifecycle) {
    console.warn("[ComponentLifecycle] Attempted to unmount component without lifecycle");
    return;
  }

  // Call component's onUnmount hook if exists
  if (typeof component.onUnmount === "function") {
    try {
      component.onUnmount();
    } catch (err) {
      console.error(`[ComponentLifecycle] onUnmount error:`, err);
    }
  }

  // Cleanup via lifecycle manager
  lifecycleManager.unmount(component);

  // Clean up lifecycle metadata
  delete component._lifecycle;
  delete component.setTimeout;
  delete component.clearTimer;

  console.log("[ComponentLifecycle] Component unmounted");
}

/**
 * Export as object for import flexibility
 */
export const ComponentLifecycle = {
  mount,
  unmount,
};
