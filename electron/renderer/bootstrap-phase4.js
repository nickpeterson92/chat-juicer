/**
 * Bootstrap Phase 4 - Application initialization with EventBus architecture
 *
 * This bootstrap integrates:
 * - EventBus for decoupled communication
 * - Plugin system with 7 core plugins
 * - Performance monitoring
 * - Analytics tracking
 * - Debug tools (dev mode)
 * - Message handlers V2 (EventBus-integrated)
 */

// Adapters (Infrastructure)
import { DOMAdapter } from "./adapters/DOMAdapter.js";
import { IPCAdapter } from "./adapters/IPCAdapter.js";
import { StorageAdapter } from "./adapters/StorageAdapter.js";
// Phase 4 Core Systems
import { globalEventBus } from "./core/event-bus.js";
// State Management
import { AppState } from "./core/state.js";
// Event Handlers (Phase 4)
import { registerMessageHandlers, setupMessageRouter } from "./handlers/message-handlers-v2.js";
// Managers
import { elements, initializeElements } from "./managers/dom-manager.js";
import { getCorePlugins, PluginRegistry } from "./plugins/index.js";

// Services (Business Logic)
import { FileService } from "./services/file-service.js";
import { FunctionCallService } from "./services/function-call-service.js";
import { MessageService } from "./services/message-service.js";
import { SessionService } from "./services/session-service.js";
import { globalAnalytics } from "./utils/analytics/index.js";
import { DebugDashboard } from "./utils/debug/index.js";
import { globalMetrics } from "./utils/performance/index.js";

/**
 * Bootstrap the application with Phase 4 architecture
 *
 * @returns {Promise<Object>} Application instance with Phase 4 features
 */
export async function bootstrapPhase4() {
  console.log("🚀 Bootstrapping Chat Juicer (Phase 4 - EventBus Architecture)...");

  // Start performance tracking
  globalMetrics.startTimer("bootstrap");

  // ======================
  // 1. Create Adapters
  // ======================
  const domAdapter = new DOMAdapter();
  const ipcAdapter = new IPCAdapter();
  const storageAdapter = new StorageAdapter();

  console.log("✅ Adapters initialized");

  // ======================
  // 2. Initialize State & Elements
  // ======================
  const appState = new AppState();
  initializeElements();

  console.log("✅ State & elements initialized");

  // ======================
  // 3. Create Services
  // ======================
  const messageService = new MessageService({ ipcAdapter, storageAdapter });
  const fileService = new FileService({ ipcAdapter, storageAdapter });
  const functionCallService = new FunctionCallService({ ipcAdapter, storageAdapter });
  const sessionService = new SessionService({ ipcAdapter, storageAdapter });

  const services = {
    messageService,
    fileService,
    functionCallService,
    sessionService,
  };

  console.log("✅ Services initialized");

  // ======================
  // 4. Create App Context (Phase 4)
  // ======================
  const app = {
    // Phase 4 core systems
    eventBus: globalEventBus,
    metrics: globalMetrics,
    analytics: globalAnalytics,

    // Existing systems
    state: appState,
    services,
    adapters: { domAdapter, ipcAdapter, storageAdapter },
    elements,

    // Configuration
    config: {
      version: "1.0.0",
      environment: import.meta.env.MODE,
      phase: 4,
    },
  };

  console.log("✅ App context created");

  // ======================
  // 5. Initialize Plugin System
  // ======================
  const pluginRegistry = new PluginRegistry(app);
  app.pluginRegistry = pluginRegistry;

  console.log("🔌 Installing core plugins...");

  const corePlugins = getCorePlugins();
  for (const plugin of corePlugins) {
    try {
      await pluginRegistry.register(plugin);
      console.log(`  ✓ ${plugin.name}`);
    } catch (error) {
      console.error(`  ✗ ${plugin.name}:`, error.message);
    }
  }

  console.log("✅ Core plugins installed");

  // ======================
  // 6. Register Message Handlers & Router (EventBus)
  // ======================
  // Register type-specific handlers (message:assistant_start, etc.)
  registerMessageHandlers({ appState, elements, services });

  // Setup router (message:received → message:${type})
  setupMessageRouter();

  // Debug: Check EventBus state
  console.log("📊 EventBus listener counts:", {
    "message:received": globalEventBus.listenerCount("message:received"),
    "message:assistant_start": globalEventBus.listenerCount("message:assistant_start"),
    "message:assistant_delta": globalEventBus.listenerCount("message:assistant_delta"),
    "message:assistant_end": globalEventBus.listenerCount("message:assistant_end"),
  });

  console.log("✅ Message handlers & router registered (EventBus)");

  // ======================
  // 7. Initialize Debug Dashboard (Dev Mode)
  // ======================
  if (import.meta.env.DEV) {
    const dashboard = new DebugDashboard(app);
    dashboard.init();
    app.debug = dashboard;

    console.log("🔍 Debug dashboard initialized (window.__DEBUG__)");
  }

  // ======================
  // 8. Import Session State
  // ======================
  const { sessionState } = await import("./services/session-service.js");

  console.log("✅ Session state imported");

  // ======================
  // 9. Verify DOM Elements
  // ======================
  const requiredElements = ["chat-container", "sessions-list", "user-input", "send-btn"];

  for (const id of requiredElements) {
    if (!document.getElementById(id)) {
      console.warn(`⚠️ Required element not found: #${id}`);
    }
  }

  console.log("✅ DOM verification complete");

  // ======================
  // 10. Setup IPC → EventBus Bridge
  // ======================
  // Bridge backend messages to EventBus (router will dispatch to handlers)
  ipcAdapter.onPythonStdout((rawOutput) => {
    console.log("[IPC Bridge] Received raw output from backend:", rawOutput.substring(0, 100));
    try {
      const lines = rawOutput.split("\n");
      const _jsonBuffer = "";
      const _MAX_BUFFER_SIZE = 1_000_000;

      for (const line of lines) {
        if (!line.trim()) continue;

        // Extract JSON from __JSON__...__JSON__ markers
        const jsonMatch = line.match(/__JSON__(.+?)__JSON__/);
        if (jsonMatch) {
          const jsonString = jsonMatch[1];
          console.log("[IPC Bridge] Extracted JSON:", jsonString.substring(0, 50));

          try {
            const message = JSON.parse(jsonString);
            console.log("✅ [IPC Bridge] Parsed message:", message.type);

            // Emit to EventBus (router will dispatch to type-specific handler)
            console.log("[IPC Bridge] Emitting to EventBus: message:received");
            globalEventBus.emit("message:received", message, {
              source: "backend",
              timestamp: Date.now(),
            });
            console.log("[IPC Bridge] EventBus emit complete");
          } catch (e) {
            console.error("[IPC Bridge] Failed to parse JSON:", e, "Raw:", jsonString);
          }
        }
      }
    } catch (error) {
      console.error("Error handling bot output:", error);
    }
  });

  console.log("✅ IPC → EventBus bridge setup");

  // ======================
  // 11. Initialize UI
  // ======================
  await initializeUI(app, sessionState);

  console.log("✅ UI initialized");

  // ======================
  // 12. Track Bootstrap Performance
  // ======================
  const bootstrapDuration = globalMetrics.endTimer("bootstrap");

  console.log("✅ Bootstrap complete");
  console.log(`⏱️  Bootstrap time: ${bootstrapDuration.toFixed(2)}ms`);

  // Track analytics
  globalAnalytics.track("app", "bootstrap", "phase4", bootstrapDuration);

  // Emit bootstrap complete event
  globalEventBus.emit("app:bootstrap:complete", {
    duration: bootstrapDuration,
    phase: 4,
  });

  // Expose app globally (dev mode)
  if (import.meta.env.DEV) {
    window.app = app;
  }

  return app;
}

/**
 * Initialize UI
 * @param {Object} app - Application context
 * @param {Object} sessionState - Session state
 */
async function initializeUI(app, sessionState) {
  const { state, elements, services, eventBus } = app;

  // Import UI modules
  const { showWelcomeView } = await import("./managers/view-manager.js");
  const { initializeTheme } = await import("./managers/theme-manager.js");

  // Initialize theme
  initializeTheme(state, elements);

  // Load sessions from session service
  try {
    const sessionsResult = await services.sessionService.loadSessions();
    if (sessionsResult.success && sessionsResult.sessions) {
      // Update sessions list in UI
      const { updateSessionsList } = await import("./handlers/session-list-handlers.js");
      updateSessionsList(sessionsResult.sessions);
    }
  } catch (error) {
    console.error("Failed to load sessions:", error);
  }

  // Show welcome page if no active session
  if (!sessionState.currentSessionId) {
    await showWelcomeView(elements, state, services);
  }

  // Emit UI ready event
  eventBus.emit("ui:ready");
}

/**
 * Backwards compatibility alias
 * Allows existing code to call bootstrapSimple() but get Phase 4
 */
export async function bootstrapSimple() {
  return bootstrapPhase4();
}
