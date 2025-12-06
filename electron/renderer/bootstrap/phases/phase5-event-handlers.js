/**
 * Phase 5: Event Handlers
 * Attach event listeners for user interactions and IPC
 *
 * Dependencies: All previous phases (uses elements, services, components)
 * Outputs: Cleanup function for all listeners
 * Criticality: MEDIUM (core functionality works without some listeners)
 */

import { ComponentLifecycle } from "../../core/component-lifecycle.js";
import { globalLifecycleManager } from "../../core/lifecycle-manager.js";
import { registerMessageHandlers } from "../../handlers/message-handlers-v2.js";
import { setupSessionListHandlers } from "../../handlers/session-list-handlers.js";
import { loadFiles } from "../../managers/file-manager.js";
import { renderEmptySessionList, renderSessionList } from "../../ui/renderers/session-list-renderer.js";
import { initializeTitlebar } from "../../ui/titlebar.js";

// Event handlers component for lifecycle management
const eventHandlersComponent = {};

/**
 * Initialize event handlers
 * @param {Object} deps - Dependencies from previous phases
 * @returns {Promise<import('../types.js').EventHandlersPhaseResult>}
 */
export async function initializeEventHandlers({
  elements,
  appState,
  services,
  components,
  ipcAdapter,
  domAdapter,
  eventBus,
  sendMessage: _sendMessage,
}) {
  console.log("Phase 5: Initializing event handlers...");

  // Mount event handlers component with lifecycle management
  ComponentLifecycle.mount(eventHandlersComponent, "EventHandlers", globalLifecycleManager);

  // Use SessionService as single source of truth
  const sessionService = services.sessionService;

  const listeners = []; // Track DOM listeners for cleanup
  const stateUnsubscribers = []; // Track AppState subscriptions for cleanup

  // Helper to track listeners
  function addListener(element, event, handler, options) {
    if (!element) return;
    element.addEventListener(event, handler, options);
    listeners.push({ element, event, handler });
  }

  try {
    // ======================
    // 1. UI Interaction Listeners
    // ======================

    // Sidebar toggle
    const sidebarToggle = document.getElementById("sidebar-toggle");
    const sidebar = document.getElementById("sidebar");
    if (sidebarToggle && sidebar) {
      addListener(sidebarToggle, "click", () => {
        sidebar.classList.toggle("collapsed");
      });
    }

    // Click away to close panels
    addListener(document, "click", (e) => {
      // Close sidebar
      if (sidebar && !sidebar.classList.contains("collapsed")) {
        if (!sidebar.contains(e.target) && !sidebarToggle?.contains(e.target)) {
          sidebar.classList.add("collapsed");
        }
      }

      // Close files panel
      if (components.filePanel?.isVisible()) {
        const panel = components.filePanel.getPanel();
        const toggleBtn = document.getElementById("open-files-btn");
        if (panel && !panel.contains(e.target) && !toggleBtn?.contains(e.target)) {
          components.filePanel.hide();
        }
      }
    });

    // Handle external links in chat - open in system browser
    const chatContainer = document.getElementById("chat-container");
    if (chatContainer) {
      addListener(chatContainer, "click", async (e) => {
        const link = e.target.closest("a");
        if (link?.href && !link.href.startsWith("#")) {
          e.preventDefault();
          try {
            await ipcAdapter.openExternalUrl(link.href);
          } catch (error) {
            console.error("Failed to open external URL:", error);
          }
        }
      });
    }

    console.log("  ✓ UI interaction listeners attached");

    // ======================
    // 1.5. Reactive DOM Bindings (AppState → DOM)
    // ======================

    // Bind ui.aiThinkingActive to DOM
    const updateAiThinking = (active) => {
      if (elements.aiThinking) {
        elements.aiThinking.classList.toggle("active", active);
      }
    };
    // Apply initial state immediately
    updateAiThinking(appState.getState("ui.aiThinkingActive"));
    stateUnsubscribers.push(appState.subscribe("ui.aiThinkingActive", updateAiThinking));

    // Bind ui.welcomeFilesSectionVisible to DOM
    const updateWelcomeFilesSection = (visible) => {
      const welcomeFilesSection = document.getElementById("welcome-files-section");
      if (welcomeFilesSection) {
        welcomeFilesSection.style.display = visible ? "block" : "none";
      }
    };
    // Apply initial state immediately
    updateWelcomeFilesSection(appState.getState("ui.welcomeFilesSectionVisible"));
    stateUnsubscribers.push(appState.subscribe("ui.welcomeFilesSectionVisible", updateWelcomeFilesSection));

    console.log("  ✓ Reactive DOM bindings registered");

    // ======================
    // 2. Drag & Drop File Upload
    // ======================

    const chatPanel = document.querySelector(".chat-panel");
    const fileDropZone = document.getElementById("file-drop-zone");
    const welcomePageContainer = document.getElementById("welcome-page-container");

    // Track drag state for elegant drop zone management
    let dragCounter = 0;
    let hideDropZoneTimer = null;

    // Helper to show drop zone
    const showDropZone = () => {
      if (fileDropZone) {
        fileDropZone.classList.add("active");
        // Clear any pending hide timer
        if (hideDropZoneTimer) {
          clearTimeout(hideDropZoneTimer);
          hideDropZoneTimer = null;
        }
      }
    };

    // Helper to hide drop zone (with optional delay)
    const hideDropZone = (immediate = false) => {
      if (!fileDropZone) return;

      if (immediate) {
        fileDropZone.classList.remove("active");
        dragCounter = 0;
        if (hideDropZoneTimer) {
          clearTimeout(hideDropZoneTimer);
          hideDropZoneTimer = null;
        }
      } else {
        // Debounced hide - gives time for dragenter to cancel if moving between elements
        if (hideDropZoneTimer) {
          clearTimeout(hideDropZoneTimer);
        }
        hideDropZoneTimer = eventHandlersComponent.setTimeout(() => {
          fileDropZone.classList.remove("active");
          dragCounter = 0;
          hideDropZoneTimer = null;
        }, 50);
      }
    };

    // Document-level drag handling
    addListener(document, "dragenter", (e) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes("Files")) {
        dragCounter++;
        showDropZone();
      }
    });

    addListener(document, "dragover", (e) => {
      e.preventDefault();
      // Keep drop zone visible during drag
      if (e.dataTransfer?.types.includes("Files")) {
        showDropZone();
      }
    });

    addListener(document, "dragleave", (e) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes("Files")) {
        dragCounter--;
        // Only hide if we've left all drag contexts
        if (dragCounter <= 0) {
          hideDropZone();
        }
      }
    });

    addListener(document, "drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Immediately hide drop zone on any drop (even outside drop zones)
      hideDropZone(true);
    });

    // Handle file drop
    const handleFileDrop = async (e) => {
      e.preventDefault();
      fileDropZone.classList.remove("active");

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      console.log("Files dropped:", files.length, "files");

      const isOnWelcomePage = document.body.classList.contains("view-welcome");

      // If no session, create one first
      if (!sessionService.getCurrentSessionId()) {
        console.log("No session - creating one for file upload");
        try {
          const result = await sessionService.createSession({});

          if (result.success) {
            console.log("Session created:", result.sessionId);

            if (components.filePanel) {
              components.filePanel.setSession(result.sessionId);
            }

            // Reload sessions list (SessionService will notify observers)
            const sessionsResult = await sessionService.loadSessions();
            if (sessionsResult.success) {
              updateSessionsList(sessionsResult.sessions || []);
            }
          } else {
            throw new Error(result.error || "Unknown error creating session");
          }
        } catch (error) {
          console.error("Failed to create session:", error);
          alert(`Failed to create session for file upload: ${error.message}`);
          return;
        }
      }

      // Upload each file using FileService
      const { showToast } = await import("../../utils/toast.js");
      let uploadedCount = 0;

      for (const file of files) {
        try {
          const result = await services.fileService.uploadFile(file, sessionService.getCurrentSessionId());

          if (result.success) {
            console.log(`File uploaded: ${file.name}`);
            uploadedCount++;

            // Refresh the appropriate file container
            if (sessionService.getCurrentSessionId()) {
              const directory = `data/files/${sessionService.getCurrentSessionId()}/sources`;

              if (isOnWelcomePage) {
                appState.setState("ui.welcomeFilesSectionVisible", true);

                const welcomeFilesContainer = document.getElementById("welcome-files-container");
                if (welcomeFilesContainer) {
                  eventHandlersComponent.setTimeout(() => {
                    loadFiles(directory, welcomeFilesContainer);
                  }, 100);
                }
              } else {
                if (components.filePanel) {
                  eventHandlersComponent.setTimeout(() => {
                    components.filePanel.refresh();
                  }, 100);
                }
              }
            }
          } else {
            console.error(`File upload failed: ${result.error}`);
            showToast(`Failed to upload ${file.name}`, "error", 3000);
          }
        } catch (error) {
          console.error("Error uploading file:", error);
          showToast(`Error uploading ${file.name}`, "error", 3000);
        }
      }

      // Show summary toast
      if (files.length === 1) {
        if (uploadedCount === 1) {
          showToast(`File uploaded: ${files[0].name}`, "success", 2000);
        }
      } else if (files.length > 1) {
        if (uploadedCount === files.length) {
          showToast(`${uploadedCount} files uploaded successfully`, "success", 2000);
        } else if (uploadedCount > 0) {
          showToast(`${uploadedCount}/${files.length} files uploaded`, "warning", 3000);
        }
      }
    };

    // Attach drop handler to all drop targets
    if (chatPanel) {
      addListener(chatPanel, "drop", handleFileDrop);
    }
    if (welcomePageContainer) {
      addListener(welcomePageContainer, "drop", handleFileDrop);
    }
    if (fileDropZone) {
      addListener(fileDropZone, "drop", handleFileDrop);
    }

    console.log("  ✓ Drag-and-drop handlers attached");

    // ======================
    // 3. Titlebar
    // ======================

    initializeTitlebar();

    console.log("  ✓ Titlebar initialized");

    // ======================
    // 4. Session Management
    // ======================

    // Restart bot button
    const restartBtn = document.getElementById("restart-btn");
    if (restartBtn) {
      addListener(restartBtn, "click", () => {
        ipcAdapter.restartBot();
      });
    }

    // New session button
    const newSessionBtn = document.getElementById("new-session-btn");
    if (newSessionBtn) {
      addListener(newSessionBtn, "click", async () => {
        try {
          console.log("Creating new session...");

          const previousSessionId = sessionService.getCurrentSessionId();

          if (components.filePanel) {
            components.filePanel.setSession(null);
            components.filePanel.clear();
          }

          await sessionService.clearCurrentSession();

          if (previousSessionId) {
            const sessionsList = document.getElementById("sessions-list");
            const previousSessionElement = sessionsList?.querySelector(`[data-session-id="${previousSessionId}"]`);
            if (previousSessionElement) {
              previousSessionElement.classList.remove("active");
            }
          }

          if (components.chatContainer) {
            components.chatContainer.clear();
          }

          const { showWelcomeView } = await import("../../managers/view-manager.js");
          await showWelcomeView(elements, appState, services);

          if (sidebar && !sidebar.classList.contains("collapsed")) {
            sidebar.classList.add("collapsed");
          }

          console.log("New session started");
        } catch (error) {
          console.error("Failed to create new session:", error);
        }
      });
    }

    console.log("  ✓ Session management handlers attached");

    // ======================
    // 5. EventBus Message Handlers
    // ======================

    registerMessageHandlers({
      appState,
      elements,
      ipcAdapter,
      services: {
        messageService: services.messageService,
        fileService: services.fileService,
        functionCallService: services.functionCallService,
        sessionService: services.sessionService,
      },
    });

    console.log("  ✓ EventBus message handlers registered");

    // ======================
    // 6. IPC Listeners (V2 Binary Protocol)
    // ======================

    // V2: Receive messages as objects directly (no parsing needed)
    ipcAdapter.onBotMessage((message) => {
      console.log("Received message:", message.type);

      eventBus.emit("message:received", message, {
        source: "backend",
        timestamp: Date.now(),
      });
    });

    ipcAdapter.onPythonStderr((error) => {
      console.error("Bot error:", error);
    });

    ipcAdapter.onPythonExit(() => {
      console.warn("Bot disconnected");
    });

    console.log("  ✓ IPC listeners attached");

    // ======================
    // 7. Session Event Listeners
    // ======================

    // Helper to update sessions list
    function updateSessionsList(sessions = null) {
      const sessionsList = document.getElementById("sessions-list");
      if (!sessionsList) return;

      sessionsList.innerHTML = "";

      // Use SessionService as single source of truth
      const sessionsToRender = sessions || sessionService.getSessions();

      if (sessionsToRender.length === 0) {
        const emptyElement = renderEmptySessionList("No sessions yet", domAdapter);
        sessionsList.appendChild(emptyElement);
        return;
      }

      const transformedSessions = sessionsToRender.map((session) => ({
        id: session.session_id,
        title: session.title,
        created_at: session.created_at || session.last_used,
      }));

      const fragment = renderSessionList(transformedSessions, sessionService.getCurrentSessionId(), domAdapter);

      if (fragment) {
        sessionsList.appendChild(fragment);
      }
    }

    // Session created event
    window.addEventListener("session-created", async (event) => {
      console.log("[SessionEvents] Session created event received:", event.detail);

      const session = event.detail.session || event.detail;
      const sessionId = session.session_id || event.detail.session_id;

      if (sessionId) {
        console.log("[SessionEvents] Session created:", sessionId);

        if (components.filePanel) {
          components.filePanel.setSession(sessionId);
        }

        if (session.model && session.reasoning_effort) {
          const { updateChatModelSelector } = await import("../../utils/chat-model-updater.js");
          updateChatModelSelector(session);
        }

        // Immediately add session to SessionService's local state and update UI
        // This ensures the session appears right away (even with default title)
        // When session-updated fires later with generated title, it will update the existing session
        if (sessionId) {
          sessionService.updateSession({
            session_id: sessionId,
            title: session.title || "New Conversation",
            last_used: new Date().toISOString(),
            created_at: new Date().toISOString(),
            model: session.model,
            reasoning_effort: session.reasoning_effort,
            mcp_config: session.mcp_config,
          });
          // UI will be updated automatically via SessionService observer pattern
          updateSessionsList();
        }
      }
    });

    // Session updated event
    window.addEventListener("session-updated", (event) => {
      console.log("[SessionEvents] Session updated event received:", event.detail);

      // Update UI immediately with SessionService data
      updateSessionsList(sessionService.getSessions());
    });

    console.log("  ✓ Session event listeners attached");

    // ======================
    // 8. Session List Handlers
    // ======================

    const sessionsList = document.getElementById("sessions-list");
    if (sessionsList) {
      setupSessionListHandlers(sessionsList, sessionService, updateSessionsList, elements, appState, ipcAdapter);
    }

    console.log("  ✓ Session list handlers attached");

    // Cleanup function
    const cleanup = () => {
      console.log("Cleaning up event handlers...");
      // Clear any pending drop zone timer
      if (hideDropZoneTimer) {
        clearTimeout(hideDropZoneTimer);
        hideDropZoneTimer = null;
      }
      // Remove DOM event listeners
      for (const { element, event, handler } of listeners) {
        element?.removeEventListener(event, handler);
      }
      listeners.length = 0;
      // Unsubscribe from AppState changes
      for (const unsubscribe of stateUnsubscribers) {
        unsubscribe();
      }
      stateUnsubscribers.length = 0;
    };

    return { cleanup, updateSessionsList };
  } catch (error) {
    console.error("Phase 5 failed:", error);
    throw new Error(`Event handler initialization failed: ${error.message}`);
  }
}
