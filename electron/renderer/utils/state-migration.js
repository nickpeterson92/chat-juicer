/**
 * State Migration Utilities
 * Helpers for migrating from mixed patterns to AppState-only
 *
 * Phase 1: Foundation utilities for transitioning to centralized state management
 */

/**
 * Create a reactive binding between a DOM element and state path
 *
 * @param {HTMLElement} element - DOM element to bind
 * @param {string} statePath - AppState path to watch (e.g., "session.current")
 * @param {Function} updateFn - Function to update element when state changes (receives newValue, oldValue, element)
 * @param {Object} appState - AppState instance
 * @returns {Function} Unsubscribe function to clean up the binding
 *
 * @example
 * const cleanup = createReactiveBinding(
 *   document.getElementById('session-title'),
 *   'session.current',
 *   (newValue, oldValue, element) => {
 *     element.textContent = newValue || 'No session';
 *   },
 *   appState
 * );
 */
export function createReactiveBinding(element, statePath, updateFn, appState) {
  if (!element || !(element instanceof HTMLElement)) {
    throw new TypeError("element must be a valid HTMLElement");
  }

  if (!statePath || typeof statePath !== "string") {
    throw new TypeError("statePath must be a non-empty string");
  }

  if (typeof updateFn !== "function") {
    throw new TypeError("updateFn must be a function");
  }

  if (!appState || typeof appState.subscribe !== "function") {
    throw new TypeError("appState must be a valid AppState instance with subscribe method");
  }

  // Initial update with current state value
  const currentValue = appState.getState(statePath);
  try {
    updateFn(currentValue, undefined, element);
  } catch (error) {
    console.error(`[StateBinding] Initial update failed for path "${statePath}":`, error);
  }

  // Subscribe to state changes
  const unsubscribe = appState.subscribe(statePath, (newValue, oldValue) => {
    try {
      updateFn(newValue, oldValue, element);
    } catch (error) {
      console.error(`[StateBinding] Update failed for path "${statePath}":`, error);
    }
  });

  return unsubscribe;
}

/**
 * Migrate service state to AppState
 * Logs warning if service has internal state that should be in AppState
 *
 * @param {Object} service - Service instance to migrate
 * @param {Object} appState - AppState instance
 * @param {Object} mapping - Map of service properties to state paths
 *   Example: { currentSessionId: 'session.current', sessions: 'session.list' }
 * @returns {Object} Migration result with status and migrated properties
 *
 * @example
 * const result = migrateServiceState(
 *   sessionService,
 *   appState,
 *   {
 *     currentSessionId: 'session.current',
 *     sessions: 'session.list',
 *     isLoadingSessions: 'session.isLoading'
 *   }
 * );
 */
export function migrateServiceState(service, appState, mapping) {
  if (!service || typeof service !== "object") {
    throw new TypeError("service must be an object");
  }

  if (!appState || typeof appState.setState !== "function") {
    throw new TypeError("appState must be a valid AppState instance with setState method");
  }

  if (!mapping || typeof mapping !== "object") {
    throw new TypeError("mapping must be an object");
  }

  const result = {
    success: true,
    migratedProperties: [],
    warnings: [],
    errors: [],
  };

  // Migrate each mapped property
  for (const [serviceProp, statePath] of Object.entries(mapping)) {
    try {
      // Check if service has this property
      if (!(serviceProp in service)) {
        result.warnings.push(`Service property "${serviceProp}" not found`);
        continue;
      }

      // Validate state path exists
      if (!appState.validatePath(statePath)) {
        result.warnings.push(`State path "${statePath}" is not valid in AppState schema`);
        continue;
      }

      // Get service value
      const serviceValue = service[serviceProp];

      // Set in AppState
      appState.setState(statePath, serviceValue);

      result.migratedProperties.push({
        serviceProp,
        statePath,
        value: serviceValue,
      });
    } catch (error) {
      result.errors.push({
        serviceProp,
        statePath,
        error: error.message,
      });
      result.success = false;
    }
  }

  // Log migration summary
  if (result.migratedProperties.length > 0) {
    console.info(
      `[StateMigration] Migrated ${result.migratedProperties.length} properties from service to AppState:`,
      result.migratedProperties.map((p) => `${p.serviceProp} -> ${p.statePath}`)
    );
  }

  if (result.warnings.length > 0) {
    console.warn("[StateMigration] Warnings during migration:", result.warnings);
  }

  if (result.errors.length > 0) {
    console.error("[StateMigration] Errors during migration:", result.errors);
  }

  return result;
}

/**
 * Create state logger for debugging
 * Logs all state changes during development
 *
 * @param {Object} appState - AppState instance
 * @param {Object} options - Logger options
 * @param {boolean} options.includeOldValue - Include old values in logs (default: true)
 * @param {string[]} options.filter - Array of path patterns to filter (default: all paths)
 * @param {boolean} options.verbose - Verbose logging with timestamps (default: false)
 * @returns {Function} Unsubscribe function to stop logging
 *
 * @example
 * // Log all state changes
 * const stopLogger = createStateLogger(appState);
 *
 * // Log with filtering
 * const stopLogger = createStateLogger(appState, {
 *   filter: ['session.*', 'message.*'],
 *   verbose: true
 * });
 */
export function createStateLogger(appState, options = {}) {
  if (!appState || typeof appState.subscribe !== "function") {
    throw new TypeError("appState must be a valid AppState instance with subscribe method");
  }

  const { includeOldValue = true, filter = null, verbose = false } = options;

  // Validate filter if provided
  if (filter !== null && !Array.isArray(filter)) {
    throw new TypeError("options.filter must be an array of path patterns");
  }

  /**
   * Check if path matches any filter pattern
   * @param {string} path - State path
   * @returns {boolean}
   */
  const matchesFilter = (path) => {
    if (!filter || filter.length === 0) {
      return true;
    }

    return filter.some((pattern) => {
      // Convert wildcard pattern to regex
      const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(path);
    });
  };

  // Subscribe to all state changes with wildcard
  const unsubscribe = appState.subscribe("*", ({ path, newValue, oldValue }) => {
    // Filter if configured
    if (!matchesFilter(path)) {
      return;
    }

    // Build log message
    const timestamp = verbose ? `[${new Date().toISOString()}]` : "";
    const logPrefix = `${timestamp}[StateLogger]`.trim();

    if (includeOldValue) {
      console.log(`${logPrefix} ${path}:`, {
        old: oldValue,
        new: newValue,
      });
    } else {
      console.log(`${logPrefix} ${path}:`, newValue);
    }
  });

  console.info("[StateLogger] Started logging state changes", {
    includeOldValue,
    filter: filter || "all paths",
    verbose,
  });

  return () => {
    unsubscribe();
    console.info("[StateLogger] Stopped logging state changes");
  };
}

/**
 * Create a two-way sync between service property and AppState
 * Useful during transition period when both service and AppState need to stay in sync
 *
 * @param {Object} service - Service instance
 * @param {string} serviceProp - Property name on service
 * @param {Object} appState - AppState instance
 * @param {string} statePath - State path in AppState
 * @returns {Object} Sync control with update methods and cleanup
 *
 * @example
 * const sync = createTwoWaySync(
 *   sessionService,
 *   'currentSessionId',
 *   appState,
 *   'session.current'
 * );
 *
 * // Later: stop syncing
 * sync.cleanup();
 */
export function createTwoWaySync(service, serviceProp, appState, statePath) {
  if (!service || typeof service !== "object") {
    throw new TypeError("service must be an object");
  }

  if (!serviceProp || typeof serviceProp !== "string") {
    throw new TypeError("serviceProp must be a non-empty string");
  }

  if (!appState || typeof appState.subscribe !== "function" || typeof appState.setState !== "function") {
    throw new TypeError("appState must be a valid AppState instance");
  }

  if (!statePath || typeof statePath !== "string") {
    throw new TypeError("statePath must be a non-empty string");
  }

  // Validate property exists
  if (!(serviceProp in service)) {
    throw new Error(`Property "${serviceProp}" does not exist on service`);
  }

  // Validate state path
  if (!appState.validatePath(statePath)) {
    console.warn(`[TwoWaySync] State path "${statePath}" is not valid in AppState schema`);
  }

  // Initial sync: service -> AppState
  appState.setState(statePath, service[serviceProp]);

  // Subscribe to AppState changes and update service
  const unsubscribe = appState.subscribe(statePath, (newValue) => {
    if (service[serviceProp] !== newValue) {
      service[serviceProp] = newValue;
    }
  });

  // Store original property descriptor
  const originalDescriptor = Object.getOwnPropertyDescriptor(service, serviceProp);
  let currentValue = service[serviceProp];

  // Replace service property with getter/setter that syncs to AppState
  Object.defineProperty(service, serviceProp, {
    get() {
      return currentValue;
    },
    set(newValue) {
      if (currentValue !== newValue) {
        currentValue = newValue;
        appState.setState(statePath, newValue);
      }
    },
    configurable: true,
    enumerable: true,
  });

  console.info(`[TwoWaySync] Created two-way sync: ${serviceProp} <-> ${statePath}`);

  return {
    /**
     * Manually update service value (triggers sync to AppState)
     */
    updateService(value) {
      service[serviceProp] = value;
    },

    /**
     * Manually update AppState value (triggers sync to service)
     */
    updateState(value) {
      appState.setState(statePath, value);
    },

    /**
     * Clean up sync and restore original property
     */
    cleanup() {
      unsubscribe();

      // Restore original property descriptor
      if (originalDescriptor) {
        Object.defineProperty(service, serviceProp, originalDescriptor);
      } else {
        delete service[serviceProp];
        service[serviceProp] = currentValue;
      }

      console.info(`[TwoWaySync] Cleaned up sync: ${serviceProp} <-> ${statePath}`);
    },
  };
}
