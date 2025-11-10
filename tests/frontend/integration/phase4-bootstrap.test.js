/**
 * REAL Integration Tests - Phase 4 Bootstrap
 * Tests the actual bootstrap process and integration points
 *
 * These tests would have caught all the errors we just fixed:
 * - Wrong function names (setupChatEvents vs setupChatEventHandlers)
 * - Missing parameters (showWelcomeView needs elements, state, services)
 * - Wrong exports (prepareMessageForDisplay vs createMessageViewModel)
 */

import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Phase 4 Bootstrap - REAL Integration Tests", () => {
  let dom;
  let window;
  let document;
  let mockElectronAPI;

  beforeEach(() => {
    // Create a realistic DOM structure (like our actual HTML)
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Chat Juicer</title>
        </head>
        <body>
          <div id="app">
            <!-- Sidebar -->
            <div id="sidebar">
              <button id="sidebar-toggle">Toggle</button>
              <div id="sessions-list"></div>
            </div>

            <!-- Welcome Page -->
            <div id="welcome-page-container" style="display: block;">
              <div class="welcome-page">
                <h1>Welcome</h1>
                <input id="welcome-input" />
                <button id="welcome-send-btn">Send</button>
              </div>
            </div>

            <!-- Chat Container -->
            <div id="chat-container" style="display: none;"></div>

            <!-- Input Area -->
            <div class="input-area">
              <textarea id="user-input"></textarea>
              <button id="send-btn">Send</button>
            </div>

            <!-- Files Panel -->
            <div id="files-panel">
              <button id="open-files-btn">Files</button>
              <div id="files-container"></div>
            </div>

            <!-- Drop Zone -->
            <div id="file-drop-zone"></div>

            <!-- Other required elements -->
            <div id="typing-indicator"></div>
            <div id="ai-thinking"></div>
          </div>
        </body>
      </html>
    `,
      {
        url: "http://localhost:5173",
        runScripts: "dangerously",
        resources: "usable",
      }
    );

    window = dom.window;
    document = window.document;

    // Make window and document global for the tests
    global.window = window;
    global.document = document;
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };

    // Mock Electron API
    mockElectronAPI = {
      sendUserInput: vi.fn(),
      onBotOutput: vi.fn(),
      sessionCommand: vi.fn().mockResolvedValue({ success: true }),
      uploadFile: vi.fn().mockResolvedValue({ success: true }),
      getUsername: vi.fn().mockResolvedValue("TestUser"),
      log: vi.fn(),
    };

    global.window.electronAPI = mockElectronAPI;

    // Mock import.meta.env
    vi.stubGlobal("import.meta", {
      env: {
        DEV: true,
        MODE: "test",
      },
    });
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
    delete global.window;
    delete global.document;
    delete global.localStorage;
  });

  describe("Bootstrap Process", () => {
    it("should successfully run bootstrapPhase4 without errors", async () => {
      // This test would have caught: function signature errors, missing exports, etc.
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      let error = null;
      let app = null;

      try {
        app = await bootstrapPhase4();
      } catch (e) {
        error = e;
      }

      expect(error).toBeNull();
      expect(app).toBeDefined();
    });

    it("should initialize all core Phase 4 systems", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      // Verify Phase 4 systems are initialized
      expect(app.eventBus).toBeDefined();
      expect(app.eventBus.emit).toBeInstanceOf(Function);

      expect(app.pluginRegistry).toBeDefined();
      expect(app.pluginRegistry.getAllPlugins).toBeInstanceOf(Function);

      expect(app.metrics).toBeDefined();
      expect(app.analytics).toBeDefined();

      expect(app.state).toBeDefined();
      expect(app.services).toBeDefined();
      expect(app.elements).toBeDefined();
    });

    it("should install all 7 core plugins", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      const plugins = app.pluginRegistry.getAllPlugins();
      expect(plugins.length).toBe(7);

      // Verify specific plugins
      expect(app.pluginRegistry.hasPlugin("message-handler")).toBe(true);
      expect(app.pluginRegistry.hasPlugin("state-sync")).toBe(true);
      expect(app.pluginRegistry.hasPlugin("performance-tracking")).toBe(true);
      expect(app.pluginRegistry.hasPlugin("error-tracking")).toBe(true);
      expect(app.pluginRegistry.hasPlugin("debug-tools")).toBe(true);
      expect(app.pluginRegistry.hasPlugin("keyboard-shortcuts")).toBe(true);
      expect(app.pluginRegistry.hasPlugin("auto-save")).toBe(true);
    });

    it("should register message handlers with EventBus", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      // Verify message handlers are registered
      expect(app.eventBus.hasListeners("message:assistant_start")).toBe(true);
      expect(app.eventBus.hasListeners("message:assistant_delta")).toBe(true);
      expect(app.eventBus.hasListeners("message:assistant_end")).toBe(true);
      expect(app.eventBus.hasListeners("message:error")).toBe(true);
    });

    it("should initialize DOM elements correctly", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      // Verify elements are captured
      expect(app.elements.chatContainer).toBeDefined();
      expect(app.elements.userInput).toBeDefined();
      expect(app.elements.sendBtn).toBeDefined();
      expect(app.elements.sessionsList).toBeDefined();
    });

    it("should show welcome page if no session", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      // Verify welcome page is visible
      expect(document.body.classList.contains("view-welcome")).toBe(true);
      expect(app.state.getState("ui.currentView")).toBe("welcome");
    });

    it("should emit bootstrap:complete event", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const bootCompleteHandler = vi.fn();

      // Must subscribe BEFORE bootstrap
      const { globalEventBus } = await import("../../../electron/renderer/core/event-bus.js");
      globalEventBus.on("app:bootstrap:complete", bootCompleteHandler);

      await bootstrapPhase4();

      expect(bootCompleteHandler).toHaveBeenCalledOnce();
      expect(bootCompleteHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            duration: expect.any(Number),
            phase: 4,
          }),
        })
      );
    });

    it("should track bootstrap performance", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");
      const { globalMetrics } = await import("../../../electron/renderer/utils/performance/metrics.js");

      await bootstrapPhase4();

      // Verify bootstrap metric was recorded
      const bootstrapMetrics = globalMetrics.getMetrics("bootstrap");
      expect(bootstrapMetrics.length).toBeGreaterThan(0);
      expect(bootstrapMetrics[0].value).toBeGreaterThan(0);
    });
  });

  describe("Message Flow Integration", () => {
    it("should handle backend messages through EventBus", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      const messageHandler = vi.fn();
      app.eventBus.on("message:received", messageHandler);

      // Simulate backend calling onBotOutput callback
      const onBotOutputCallback = mockElectronAPI.onBotOutput.mock.calls[0][0];
      onBotOutputCallback({
        type: "assistant_delta",
        content: "Test message",
      });

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "assistant_delta",
            content: "Test message",
          }),
        })
      );
    });

    it("should route messages to specific handlers", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      const assistantStartHandler = vi.fn();
      app.eventBus.on("message:assistant_start", assistantStartHandler);

      // Emit message
      app.eventBus.emit("message:received", { type: "assistant_start" });

      expect(assistantStartHandler).toHaveBeenCalled();
    });

    it("should handle message handler errors gracefully", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      // Register a handler that throws
      app.eventBus.on("message:test_error", () => {
        throw new Error("Handler error");
      });

      // Should not throw
      expect(() => {
        app.eventBus.emit("message:received", { type: "test_error" });
      }).not.toThrow();
    });
  });

  describe("Function Signature Validation", () => {
    it("should call showWelcomeView with correct parameters", async () => {
      // This test would have caught: showWelcomeView() vs showWelcomeView(elements, state, services)
      const { showWelcomeView } = await import("../../../electron/renderer/managers/view-manager.js");

      // Get required parameters
      const { AppState } = await import("../../../electron/renderer/core/state.js");
      const { initializeElements } = await import("../../../electron/renderer/managers/dom-manager.js");

      const state = new AppState();
      const elements = initializeElements();
      const services = {};

      // Should not throw
      await expect(showWelcomeView(elements, state, services)).resolves.not.toThrow();
    });

    it("should use correct viewmodel function names", async () => {
      // This test would have caught: prepareMessageForDisplay vs createMessageViewModel
      const viewmodel = await import("../../../electron/renderer/viewmodels/message-viewmodel.js");

      // Verify correct export exists
      expect(viewmodel.createMessageViewModel).toBeInstanceOf(Function);
      expect(viewmodel.prepareMessageForDisplay).toBeUndefined();
    });

    it("should use correct handler function names", async () => {
      // This test would have caught: setupChatEvents vs setupChatEventHandlers
      const handlers = await import("../../../electron/renderer/handlers/chat-events.js");

      // Verify correct export exists
      expect(handlers.setupChatEventHandlers).toBeInstanceOf(Function);
      expect(handlers.setupChatEvents).toBeUndefined();
    });
  });

  describe("Plugin Integration", () => {
    it("should allow plugins to register event listeners", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");
      const { createPlugin } = await import("../../../electron/renderer/plugins/plugin-interface.js");

      const app = await bootstrapPhase4();

      const testHandler = vi.fn();
      const testPlugin = createPlugin({
        name: "test-plugin",
        version: "1.0.0",
        async install(app) {
          app.eventBus.on("test:event", testHandler);
        },
      });

      await app.pluginRegistry.register(testPlugin);

      app.eventBus.emit("test:event", { data: "test" });

      expect(testHandler).toHaveBeenCalled();
    });

    it("should execute plugin hooks in order", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      const executionOrder = [];

      app.pluginRegistry.registerHook(
        "test:hook",
        (data) => {
          executionOrder.push("low");
          return data;
        },
        0
      );

      app.pluginRegistry.registerHook(
        "test:hook",
        (data) => {
          executionOrder.push("high");
          return data;
        },
        10
      );

      await app.pluginRegistry.executeHook("test:hook", {});

      expect(executionOrder).toEqual(["high", "low"]);
    });
  });

  describe("Performance Monitoring Integration", () => {
    it("should track operations via plugins", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");
      const { globalMetrics } = await import("../../../electron/renderer/utils/performance/metrics.js");

      const app = await bootstrapPhase4();

      // Emit performance tracking events
      app.eventBus.emit("performance:message_render_start");
      globalMetrics.startTimer("test_operation");

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 10));

      const duration = globalMetrics.endTimer("test_operation");
      app.eventBus.emit("performance:message_render_complete");

      expect(duration).toBeGreaterThan(5);
    });
  });

  describe("Analytics Integration", () => {
    it("should track events via plugins", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");
      const { globalAnalytics } = await import("../../../electron/renderer/utils/analytics/analytics-adapter.js");

      const app = await bootstrapPhase4();

      // Track should not throw
      await expect(globalAnalytics.track("test", "action", "label")).resolves.not.toThrow();
    });
  });

  describe("Debug Tools Integration (Dev Mode)", () => {
    it("should expose debug dashboard in dev mode", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");

      const app = await bootstrapPhase4();

      // Verify debug dashboard is exposed
      expect(window.__DEBUG__).toBeDefined();
      expect(window.__DEBUG__.getState).toBeInstanceOf(Function);
      expect(window.__DEBUG__.getMetrics).toBeInstanceOf(Function);
      expect(window.__DEBUG__.report).toBeInstanceOf(Function);
    });
  });

  describe("Error Recovery", () => {
    it("should handle plugin installation failures gracefully", async () => {
      const { bootstrapPhase4 } = await import("../../../electron/renderer/bootstrap-phase4.js");
      const { createPlugin } = await import("../../../electron/renderer/plugins/plugin-interface.js");

      const app = await bootstrapPhase4();

      const failingPlugin = createPlugin({
        name: "failing-plugin",
        version: "1.0.0",
        async install() {
          throw new Error("Plugin installation failed");
        },
      });

      // Should not crash the app
      await expect(app.pluginRegistry.register(failingPlugin)).rejects.toThrow("Plugin installation failed");

      // App should still be functional
      expect(app.eventBus).toBeDefined();
    });
  });
});
