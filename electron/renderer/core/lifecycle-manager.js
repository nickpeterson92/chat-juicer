/**
 * LifecycleManager - Centralized cleanup coordinator for components
 *
 * Tracks timers, event listeners, and component lifecycle to prevent memory leaks.
 * Provides automatic cleanup when components are unmounted or destroyed.
 *
 * Architecture:
 * - Component registration with unique IDs
 * - Tracked setTimeout/setInterval with automatic cleanup
 * - Scoped EventBus proxies for automatic listener removal
 * - Zero-overhead WeakMap-based tracking
 *
 * Usage:
 * ```js
 * const manager = new LifecycleManager();
 * const component = {};
 * manager.register(component, 'MyComponent');
 *
 * // Tracked timer (auto-clears on unmount)
 * manager.setTimeout(component, () => {...}, 100);
 *
 * // Scoped event bus (auto-unsubscribes on unmount)
 * const scopedBus = manager.createScopedEventBus(component, globalEventBus);
 * scopedBus.on('event', handler);
 *
 * // Cleanup all resources
 * manager.unmount(component);
 * ```
 */

export class LifecycleManager {
  constructor() {
    // Component registry: Map<componentId, {component, name, timers, unsubscribers}>
    this.components = new Map();

    // WeakMap for component -> componentId lookup (prevents memory leaks)
    this.componentIds = new WeakMap();

    // Counter for generating unique component IDs
    this.nextId = 0;
  }

  /**
   * Register a component with the lifecycle manager
   * @param {Object} component - Component object to track
   * @param {string} name - Human-readable component name for debugging
   * @returns {string} Component ID
   */
  register(component, name) {
    if (!component || typeof component !== "object") {
      throw new TypeError("Component must be an object");
    }

    // Check if already registered
    let componentId = this.componentIds.get(component);
    if (componentId) {
      console.warn(`[Lifecycle] Component "${name}" already registered:`, componentId);
      return componentId;
    }

    // Generate unique ID
    componentId = `${name}_${this.nextId++}`;

    // Create component entry
    this.components.set(componentId, {
      component,
      name,
      timers: new Set(), // Set of timer IDs
      unsubscribers: new Set(), // Set of unsubscribe functions
      mounted: true,
    });

    // Store reverse lookup
    this.componentIds.set(component, componentId);

    console.log(`[Lifecycle] Registered component: ${componentId}`);
    return componentId;
  }

  /**
   * Tracked setTimeout that auto-clears on component unmount
   * @param {Object} component - Component object
   * @param {Function} callback - Timer callback
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timer ID
   */
  setTimeout(component, callback, delay) {
    const componentId = this.componentIds.get(component);
    if (!componentId) {
      console.warn("[Lifecycle] setTimeout called on unregistered component");
      return window.setTimeout(callback, delay);
    }

    const entry = this.components.get(componentId);
    if (!entry || !entry.mounted) {
      console.warn(`[Lifecycle] setTimeout called on unmounted component: ${componentId}`);
      return null;
    }

    // Create wrapped callback that removes timer from tracking
    const timerId = window.setTimeout(() => {
      entry.timers.delete(timerId);
      callback();
    }, delay);

    entry.timers.add(timerId);
    return timerId;
  }

  /**
   * Tracked setInterval that auto-clears on component unmount
   * @param {Object} component - Component object
   * @param {Function} callback - Timer callback
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timer ID
   */
  setInterval(component, callback, delay) {
    const componentId = this.componentIds.get(component);
    if (!componentId) {
      console.warn("[Lifecycle] setInterval called on unregistered component");
      return window.setInterval(callback, delay);
    }

    const entry = this.components.get(componentId);
    if (!entry || !entry.mounted) {
      console.warn(`[Lifecycle] setInterval called on unmounted component: ${componentId}`);
      return null;
    }

    const timerId = window.setInterval(callback, delay);
    entry.timers.add(timerId);
    return timerId;
  }

  /**
   * Clear a tracked timer manually
   * @param {Object} component - Component object
   * @param {number} timerId - Timer ID to clear
   */
  clearTimer(component, timerId) {
    const componentId = this.componentIds.get(component);
    if (!componentId) return;

    const entry = this.components.get(componentId);
    if (!entry) return;

    if (entry.timers.has(timerId)) {
      window.clearTimeout(timerId); // Works for both setTimeout and setInterval
      entry.timers.delete(timerId);
    }
  }

  /**
   * Create a scoped EventBus proxy that auto-unsubscribes on unmount
   * @param {Object} component - Component object
   * @param {EventBus} eventBus - EventBus instance to proxy
   * @returns {Proxy} Scoped EventBus proxy
   */
  createScopedEventBus(component, eventBus) {
    const componentId = this.componentIds.get(component);
    if (!componentId) {
      console.warn("[Lifecycle] createScopedEventBus called on unregistered component");
      return eventBus;
    }

    const entry = this.components.get(componentId);
    if (!entry) {
      console.warn(`[Lifecycle] createScopedEventBus called on unknown component: ${componentId}`);
      return eventBus;
    }

    // Create proxy that intercepts on/once methods
    return new Proxy(eventBus, {
      get: (target, prop) => {
        if (prop === "on" || prop === "once") {
          return (...args) => {
            // Call original method and get unsubscribe function
            const unsubscribe = target[prop](...args);

            // Track unsubscribe function for cleanup
            if (typeof unsubscribe === "function") {
              entry.unsubscribers.add(unsubscribe);

              // Return wrapped unsubscribe that also removes from tracking
              return () => {
                entry.unsubscribers.delete(unsubscribe);
                unsubscribe();
              };
            }

            return unsubscribe;
          };
        }

        // Pass through all other methods
        return target[prop];
      },
    });
  }

  /**
   * Unmount a component and cleanup all resources
   * @param {Object} component - Component object to unmount
   */
  unmount(component) {
    const componentId = this.componentIds.get(component);
    if (!componentId) {
      console.warn("[Lifecycle] unmount called on unregistered component");
      return;
    }

    const entry = this.components.get(componentId);
    if (!entry) {
      console.warn(`[Lifecycle] unmount called on unknown component: ${componentId}`);
      return;
    }

    console.log(`[Lifecycle] Unmounting component: ${componentId}`, {
      timers: entry.timers.size,
      listeners: entry.unsubscribers.size,
    });

    // Clear all timers
    for (const timerId of entry.timers) {
      window.clearTimeout(timerId);
    }
    entry.timers.clear();

    // Unsubscribe all event listeners
    for (const unsubscribe of entry.unsubscribers) {
      try {
        unsubscribe();
      } catch (err) {
        console.error(`[Lifecycle] Error unsubscribing listener in ${componentId}:`, err);
      }
    }
    entry.unsubscribers.clear();

    // Mark as unmounted
    entry.mounted = false;

    // Remove from registry
    this.components.delete(componentId);
    this.componentIds.delete(component);

    console.log(`[Lifecycle] Component unmounted: ${componentId}`);
  }

  /**
   * Unmount all registered components
   */
  unmountAll() {
    console.log(`[Lifecycle] Unmounting all components (${this.components.size} total)`);

    // Copy keys to avoid mutation during iteration
    const componentIds = Array.from(this.components.keys());

    for (const componentId of componentIds) {
      const entry = this.components.get(componentId);
      if (entry?.component) {
        this.unmount(entry.component);
      }
    }
  }

  /**
   * Get debug snapshot of current lifecycle state
   * @returns {Object} Debug information
   */
  getDebugSnapshot() {
    const components = Array.from(this.components.entries()).map(([id, entry]) => ({
      id,
      name: entry.name,
      mounted: entry.mounted,
      timers: entry.timers.size,
      listeners: entry.unsubscribers.size,
    }));

    return {
      totalComponents: this.components.size,
      components,
      totalTimers: components.reduce((sum, c) => sum + c.timers, 0),
      totalListeners: components.reduce((sum, c) => sum + c.listeners, 0),
    };
  }
}

// Global lifecycle manager instance
export const globalLifecycleManager = new LifecycleManager();
