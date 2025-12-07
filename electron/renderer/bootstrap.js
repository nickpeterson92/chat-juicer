/**
 * Bootstrap - Phase-Based Application Initialization
 *
 * Refactored from 960-line monolith to phase-based architecture with:
 * - 7 discrete initialization phases with explicit dependencies
 * - Validation gates between phases to catch errors early
 * - Error recovery strategies for graceful degradation
 * - Independent testability of each phase
 * - Zero breaking changes to existing functionality
 *
 * Architecture:
 * Phase 1: Adapters (Foundation) - DOMAdapter, IPCAdapter, StorageAdapter, EventBus
 * Phase 2: State & DOM (Core Infrastructure) - AppState, DOM elements
 * Phase 3: Services (Business Logic) - MessageService, FileService, SessionService, FunctionCallService
 * Phase 4: Components (UI Layer) - ChatContainer, InputArea, FilePanel, sendMessage
 * Phase 5: Event Handlers (Interaction Layer) - All event listeners and IPC handlers
 * Phase 6: Plugins & Debug (Extension Layer) - PluginRegistry, DebugDashboard
 * Phase 7: Data Loading (Initialization Data) - Sessions, model config, welcome view
 */

import { ErrorRecoveryStrategy, handlePhaseError } from "./bootstrap/error-recovery.js";
import { validatePhaseResult } from "./bootstrap/validators.js";
import { globalLifecycleManager } from "./core/lifecycle-manager.js";
import { AppState } from "./core/state.js";
import { getCSSVariable } from "./utils/css-variables.js";

/**
 * Phase-based bootstrap orchestrator
 * @returns {Promise<Object>} Application instance
 */
export async function bootstrapSimple() {
  const bootstrapStart = performance.now();
  const phaseResults = {};

  try {
    // ==========================================
    // Phase 1: Adapters (Foundation)
    // ==========================================
    const { initializeAdapters } = await import("./bootstrap/phases/phase1-adapters.js");
    phaseResults.adapters = await initializeAdapters();
    validatePhaseResult("adapters", phaseResults.adapters, {
      required: ["domAdapter", "ipcAdapter", "storageAdapter", "eventBus"],
    });

    // ==========================================
    // Phase 2: State & DOM (Core Infrastructure)
    // ==========================================
    const { initializeStateAndDOM } = await import("./bootstrap/phases/phase2-state-dom.js");
    phaseResults.stateDOM = await initializeStateAndDOM(phaseResults.adapters);
    validatePhaseResult("stateDOM", phaseResults.stateDOM, {
      required: ["appState", "elements"],
    });

    // ==========================================
    // Phase 3: Services (Business Logic)
    // ==========================================
    const { initializeServices } = await import("./bootstrap/phases/phase3-services.js");
    phaseResults.services = await initializeServices({
      ...phaseResults.adapters,
      appState: phaseResults.stateDOM.appState,
    });
    validatePhaseResult("services", phaseResults.services, {
      required: ["messageService", "fileService", "functionCallService", "sessionService"],
    });

    // ==========================================
    // Phase 4: Components (UI Layer)
    // ==========================================
    const { initializeComponents } = await import("./bootstrap/phases/phase4-components.js");
    phaseResults.components = await initializeComponents({
      ...phaseResults.stateDOM,
      ...phaseResults.adapters,
      services: phaseResults.services,
    });
    validatePhaseResult("components", phaseResults.components, {
      required: ["chatContainer", "filePanel", "sendMessage"],
      optional: ["inputArea"], // May fail if DOM elements missing
    });
    window.components = phaseResults.components;

    // ==========================================
    // Phase 5: Event Handlers (Interaction Layer)
    // ==========================================
    const { initializeEventHandlers } = await import("./bootstrap/phases/phase5-event-handlers.js");
    phaseResults.eventHandlers = await initializeEventHandlers({
      ...phaseResults.adapters,
      ...phaseResults.stateDOM,
      services: phaseResults.services,
      components: phaseResults.components,
      sendMessage: phaseResults.components.sendMessage,
    });

    // ==========================================
    // Phase 6: Plugins & Debug (Extension Layer)
    // ==========================================
    const { initializePlugins } = await import("./bootstrap/phases/phase6-plugins.js");
    phaseResults.plugins = await initializePlugins({
      ...phaseResults.adapters,
      ...phaseResults.stateDOM,
      services: phaseResults.services,
      components: phaseResults.components,
    });

    // ==========================================
    // Phase 7: Data Loading (Initialization Data)
    // ==========================================
    const { loadInitialData } = await import("./bootstrap/phases/phase7-data-loading.js");
    phaseResults.dataLoading = await loadInitialData({
      ...phaseResults.stateDOM,
      ...phaseResults.adapters,
      services: phaseResults.services,
      components: phaseResults.components,
      updateSessionsList: phaseResults.eventHandlers.updateSessionsList,
    });

    // ==========================================
    // Finalization
    // ==========================================
    const app = phaseResults.plugins.app;

    // Unified cleanup (idempotent via event handler guard)
    const runAppCleanup = () => {
      try {
        if (typeof phaseResults.eventHandlers?.cleanup === "function") {
          phaseResults.eventHandlers.cleanup();
        } else {
          globalLifecycleManager.unmountAll();
        }
      } catch (cleanupError) {
        console.error("[Bootstrap] Cleanup failed:", cleanupError);
      }
    };

    app.cleanup = runAppCleanup;
    app.lifecycleManager = globalLifecycleManager;

    // Setup cleanup on window unload
    window.addEventListener("beforeunload", () => {
      runAppCleanup();
    });

    // Validate critical colors (development safety check)
    try {
      const { validateCriticalColors } = await import("./config/colors.js");
      validateCriticalColors();
    } catch (error) {
      console.warn("[Bootstrap] Color validation failed (non-critical):", error);
    }

    const bootstrapDuration = performance.now() - bootstrapStart;
    app.eventBus.emit("app:bootstrap:complete", { duration: bootstrapDuration });

    return app;
  } catch (error) {
    console.error("[Bootstrap] Failed:", error);

    // Attempt error recovery
    const recovery = await handlePhaseError(error, phaseResults);

    if (recovery.strategy === ErrorRecoveryStrategy.CONTINUE_DEGRADED) {
      console.warn("[Bootstrap] Continuing in degraded mode:", recovery.message);
      return phaseResults.plugins?.app || createMinimalApp(phaseResults);
    }

    if (recovery.strategy === ErrorRecoveryStrategy.SHOW_ERROR_UI) {
      showBootstrapErrorUI(error, recovery);
    }

    throw error;
  }
}

/**
 * Create minimal app object for degraded mode
 */
function createMinimalApp(phaseResults) {
  return {
    state: phaseResults.stateDOM?.appState || new AppState(),
    services: phaseResults.services || {},
    adapters: phaseResults.adapters || {},
    components: phaseResults.components || {},
    degraded: true,
    degradedReason: "Partial initialization failure",
  };
}

/**
 * Show bootstrap error UI
 */
function showBootstrapErrorUI(error, recovery) {
  // Get CSS variables for theming
  const overlayBg = getCSSVariable("--color-overlay-backdrop", "rgba(0, 0, 0, 0.9)");
  const surfaceBg = getCSSVariable("--color-surface-2", "#ffffff");
  const textPrimary = getCSSVariable("--color-text-primary", "#1a1a1a");
  const statusError = getCSSVariable("--color-status-error", "#dc2626");
  const surface3 = getCSSVariable("--color-surface-3", "#f8f8f6");
  const brandPrimary = getCSSVariable("--color-brand-primary", "#0066cc");
  const textWhite = "#ffffff"; // Button text always white for contrast

  // Create error overlay using native DOM APIs
  const overlay = document.createElement("div");
  overlay.id = "bootstrap-error-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: ${overlayBg};
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  overlay.innerHTML = `
    <div style="
      background: ${surfaceBg};
      padding: 2rem;
      border-radius: 8px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      color: ${textPrimary};
    ">
      <h2 style="margin-top: 0; color: ${statusError};">⚠️ Initialization Error</h2>
      <p style="margin: 1rem 0;"><strong>Phase:</strong> ${recovery.phase}</p>
      <p style="margin: 1rem 0;">${recovery.message}</p>
      <details style="margin: 1rem 0;">
        <summary style="cursor: pointer; font-weight: bold;">Error Details</summary>
        <pre style="
          background: ${surface3};
          padding: 1rem;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 12px;
          margin-top: 0.5rem;
          color: ${textPrimary};
        ">${error.stack}</pre>
      </details>
      <button onclick="location.reload()" style="
        background: ${brandPrimary};
        color: ${textWhite};
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 500;
      ">Reload Application</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

/**
 * Initialize the application when DOM is ready
 */
export async function init() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", async () => {
      try {
        window.app = await bootstrapSimple();
      } catch (error) {
        console.error("[Bootstrap] Failed to bootstrap:", error);
      }
    });
  } else {
    try {
      window.app = await bootstrapSimple();
    } catch (error) {
      console.error("[Bootstrap] Failed to bootstrap:", error);
    }
  }
}
