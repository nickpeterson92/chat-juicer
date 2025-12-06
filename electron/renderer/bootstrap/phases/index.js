/**
 * Bootstrap Phases
 * Centralized exports for all bootstrap phases
 */

export { initializeAdapters } from "./phase1-adapters.js";
export { initializeStateAndDOM } from "./phase2-state-dom.js";
export { initializeServices } from "./phase3-services.js";
export { initializeComponents } from "./phase4-components.js";
export { initializeEventHandlers } from "./phase5-event-handlers.js";
export { debugSubscriptions, SUBSCRIPTION_REGISTRY, validateSubscriptions } from "./phase5a-subscriptions.js";
export { initializePlugins } from "./phase6-plugins.js";
export { loadInitialData } from "./phase7-data-loading.js";
