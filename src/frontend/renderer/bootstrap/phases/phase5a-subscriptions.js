/**
 * Phase 5A: AppState Subscription Registration Documentation
 *
 * This file documents the centralized subscription registration system for
 * reactive UI updates. All AppState subscriptions are registered during the
 * bootstrap process to ensure UI automatically reflects state changes.
 *
 * ARCHITECTURE:
 * - Subscriptions registered in phase5-event-handlers.js (lines 107-184)
 * - Component-specific subscriptions registered in component constructors
 * - All subscriptions follow the pattern: appState.subscribe(path, handler)
 * - Unsubscribe functions tracked for cleanup on unmount
 *
 * SUBSCRIPTION LOCATIONS:
 *
 * 1. Bootstrap Subscriptions (phase5-event-handlers.js:107-184)
 *    - ui.bodyViewClass → Update document.body classes
 *    - ui.sidebarCollapsed → Toggle sidebar visibility
 *    - ui.aiThinkingActive → Update AI thinking indicator
 *    - ui.welcomeFilesSectionVisible → Show/hide welcome files section
 *    - ui.loadingLampVisible → Manage streaming loading indicator
 *
 * 2. Component Subscriptions:
 *
 *    ChatContainer (ui/components/chat-container.js:43-77)
 *    - message.currentAssistant → Auto-scroll on new message
 *    - message.assistantBuffer → Update streaming content
 *    - message.isStreaming → Finalize streaming on completion
 *    - ui.theme → React to theme changes
 *
 *    InputArea (ui/components/input-area.js:76-84)
 *    - message.isStreaming → Enable/disable input during streaming
 *
 *    FilePanel (ui/components/file-panel.js:76-81)
 *    - session.current → Auto-refresh on session change
 *
 *    ConnectionStatus (ui/components/connection-status.js:57-76)
 *    - connection.status → Update connection indicator UI
 *
 * SUBSCRIPTION PATTERNS:
 *
 * All subscriptions follow this pattern:
 *
 * ```javascript
 * // 1. Define update handler
 * const updateHandler = (newValue, oldValue) => {
 *   // Update DOM based on new value
 *   element.classList.toggle('active', newValue);
 * };
 *
 * // 2. Apply initial state immediately
 * updateHandler(appState.getState('path.to.state'));
 *
 * // 3. Subscribe to future changes
 * const unsubscribe = appState.subscribe('path.to.state', updateHandler);
 *
 * // 4. Track unsubscriber for cleanup
 * stateUnsubscribers.push(unsubscribe);
 * ```
 *
 * LIFECYCLE MANAGEMENT:
 *
 * - Bootstrap subscriptions tracked in stateUnsubscribers array
 * - Component subscriptions tracked in component.unsubscribers array
 * - Cleanup on window.beforeunload via globalLifecycleManager
 * - Prevents memory leaks and zombie subscriptions
 *
 * VERIFICATION:
 *
 * To verify all subscriptions are properly registered:
 *
 * 1. Check phase5-event-handlers.js:107-184 for bootstrap subscriptions
 * 2. Check component constructors for component-specific subscriptions
 * 3. Verify cleanup functions are called on unmount
 * 4. Use debug tools: window.app.state.listeners to inspect active subscriptions
 *
 * MIGRATION NOTES:
 *
 * This documentation completes Phase 6 of the State Management Consolidation.
 * All subscriptions are now centralized and follow consistent patterns.
 *
 * For adding new subscriptions:
 * 1. Determine if bootstrap-level (affects multiple components) or component-level
 * 2. Bootstrap: Add to phase5-event-handlers.js reactive DOM bindings section
 * 3. Component: Add to component's setupStateSubscriptions() method
 * 4. Always apply initial state immediately after subscribing
 * 5. Always track unsubscriber for cleanup
 *
 * @module bootstrap/phases/phase5a-subscriptions
 * @since 2025-12-06
 */

/**
 * Complete list of all AppState subscriptions in the application
 *
 * This serves as a reference for all reactive state → DOM bindings
 */
export const SUBSCRIPTION_REGISTRY = {
  /**
   * Bootstrap-level subscriptions
   * Registered in: phase5-event-handlers.js:107-184
   */
  bootstrap: [
    {
      path: "ui.bodyViewClass",
      handler: "updateBodyViewClass",
      location: "phase5-event-handlers.js:112-118",
      purpose: "Update document.body view classes (view-welcome, view-chat)",
    },
    {
      path: "ui.sidebarCollapsed",
      handler: "updateSidebarCollapsed",
      location: "phase5-event-handlers.js:121-129",
      purpose: "Toggle sidebar collapsed state",
    },
    {
      path: "ui.aiThinkingActive",
      handler: "updateAiThinking",
      location: "phase5-event-handlers.js:132-139",
      purpose: "Show/hide AI thinking indicator",
    },
    {
      path: "ui.welcomeFilesSectionVisible",
      handler: "updateWelcomeFilesSection",
      location: "phase5-event-handlers.js:142-150",
      purpose: "Show/hide welcome page files section",
    },
    {
      path: "ui.loadingLampVisible",
      handler: "updateLoadingLampVisibility",
      location: "phase5-event-handlers.js:153-183",
      purpose: "Manage streaming message loading indicator visibility",
    },
  ],

  /**
   * Component-level subscriptions
   * Registered in component constructors
   */
  components: {
    ChatContainer: [
      {
        path: "message.currentAssistant",
        location: "chat-container.js:43-49",
        purpose: "Auto-scroll to bottom on new assistant message",
      },
      {
        path: "message.assistantBuffer",
        location: "chat-container.js:55-59",
        purpose: "Update streaming message content",
      },
      {
        path: "message.isStreaming",
        location: "chat-container.js:65-68",
        purpose: "Finalize streaming when complete",
      },
      {
        path: "ui.theme",
        location: "chat-container.js:74-77",
        purpose: "React to theme changes (handled by CSS)",
      },
    ],
    InputArea: [
      {
        path: "message.isStreaming",
        location: "input-area.js:76-84",
        purpose: "Enable/disable input during streaming",
      },
    ],
    FilePanel: [
      {
        path: "session.current",
        location: "file-panel.js:76-81",
        purpose: "Auto-refresh file list on session change",
      },
    ],
    ConnectionStatus: [
      {
        path: "connection.status",
        location: "connection-status.js:57-76",
        purpose: "Update connection indicator state",
      },
    ],
  },
};

/**
 * Validate that all expected subscriptions are registered
 *
 * This function can be called during development to verify the subscription
 * system is properly configured.
 *
 * @param {AppState} appState - Application state instance
 * @returns {Object} Validation result with missing/extra subscriptions
 */
export function validateSubscriptions(appState) {
  const expectedPaths = [
    // Bootstrap subscriptions
    "ui.bodyViewClass",
    "ui.sidebarCollapsed",
    "ui.aiThinkingActive",
    "ui.welcomeFilesSectionVisible",
    "ui.loadingLampVisible",

    // Component subscriptions (verified via component tests)
    "message.currentAssistant",
    "message.assistantBuffer",
    "message.isStreaming",
    "ui.theme",
    "session.current",
    "connection.status",
  ];

  const registeredPaths = Array.from(appState.listeners.keys());
  const missing = expectedPaths.filter((path) => !registeredPaths.includes(path));
  const extra = registeredPaths.filter(
    (path) => !expectedPaths.includes(path) && path !== "*" // Wildcard is valid
  );

  return {
    valid: missing.length === 0,
    missing,
    extra,
    total: registeredPaths.length,
    expected: expectedPaths.length,
  };
}

/**
 * Debug utility: Print all active subscriptions
 *
 * Usage in console:
 * ```javascript
 * import { debugSubscriptions } from './bootstrap/phases/phase5a-subscriptions.js';
 * debugSubscriptions(window.app.state);
 * ```
 *
 * @param {AppState} appState - Application state instance
 */
export function debugSubscriptions(appState) {
  console.group("Active AppState Subscriptions");

  for (const [path, callbacks] of appState.listeners.entries()) {
    console.log(`${path}: ${callbacks.size} subscriber(s)`);
  }

  console.groupEnd();

  const validation = validateSubscriptions(appState);
  console.log("\nValidation:", validation);

  return validation;
}

/**
 * This module serves as documentation for Phase 6 of the State Management
 * Consolidation. It does not export a phase initialization function because
 * subscriptions are registered inline during phase5-event-handlers.js and
 * component initialization.
 *
 * The actual subscription registration happens in two places:
 * 1. Bootstrap: phase5-event-handlers.js:107-184
 * 2. Components: Individual component constructors
 *
 * This file exists to:
 * - Document the subscription architecture
 * - Provide a registry of all subscriptions
 * - Offer validation and debugging utilities
 * - Serve as a reference for developers
 */
