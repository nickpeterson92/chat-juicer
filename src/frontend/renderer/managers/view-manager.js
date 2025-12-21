/**
 * View Manager
 * Manages view state and transitions between welcome and chat views
 *
 * STATE MANAGEMENT ARCHITECTURE (Phase 5 Complete):
 * - Uses AppState.setState() for all state updates (lines 34, 38, 51, 170, 173, 481)
 * - NO direct DOM manipulation (all via AppState subscriptions)
 * - Reactive DOM updates registered in bootstrap/phases/phase5-event-handlers.js:
 *   - ui.bodyViewClass → document.body.classList (lines 110-117)
 *   - ui.sidebarCollapsed → sidebar.classList.toggle() (lines 119-127)
 *
 */

import { ComponentLifecycle } from "../core/component-lifecycle.js";
import { globalLifecycleManager } from "../core/lifecycle-manager.js";
import { addMessage } from "../ui/chat-ui.js";
import { ModelSelector } from "../ui/components/model-selector.js";
import { getSuggestionPrompt, hideWelcomePage, showWelcomePage } from "../ui/welcome-page.js";

// View manager component for lifecycle management
const viewManagerComponent = {};

/**
 * Track welcome page event listeners for cleanup
 * @type {Array<{element: HTMLElement, event: string, handler: Function, controller?: AbortController}>}
 */
const welcomePageListeners = [];

// Debounce welcome files rendering to prevent overlapping dynamic imports
const WELCOME_FILES_RENDER_DEBOUNCE_MS = 50;
let welcomeFilesRenderTimerId = null;
let pendingWelcomeFilesPayload = null;
let welcomeFilesRenderInFlight = false;
let welcomeFilesRenderQueued = false;

function scheduleWelcomeFilesRender(appState, files) {
  const welcomeFilesContainer = document.getElementById("welcome-files-container");
  if (!welcomeFilesContainer) {
    return;
  }

  pendingWelcomeFilesPayload = { files, welcomeFilesContainer };

  if (welcomeFilesRenderTimerId) {
    viewManagerComponent.clearTimer(welcomeFilesRenderTimerId);
  }

  welcomeFilesRenderTimerId = viewManagerComponent.setTimeout(() => {
    void renderWelcomeFiles(appState);
  }, WELCOME_FILES_RENDER_DEBOUNCE_MS);
}

async function renderWelcomeFiles(appState) {
  if (welcomeFilesRenderInFlight) {
    welcomeFilesRenderQueued = true;
    return;
  }

  welcomeFilesRenderInFlight = true;
  welcomeFilesRenderQueued = false;

  try {
    const payload = pendingWelcomeFilesPayload;
    pendingWelcomeFilesPayload = null;

    if (!payload || appState.getState("ui.currentView") !== "welcome") {
      return;
    }

    const { files, welcomeFilesContainer } = payload;

    if (!files || files.length === 0) {
      appState.setState("ui.welcomeFilesSectionVisible", false);
      return;
    }

    const sessionService = window.app?.services?.sessionService;
    const currentSessionId = sessionService?.getCurrentSessionId();
    if (!currentSessionId) {
      return;
    }

    const { renderFileList, loadFilesIntoState } = await import("./file-manager.js");
    const directory = `data/files/${currentSessionId}/sources`;
    renderFileList(files, welcomeFilesContainer, {
      directory,
      isWelcomePage: true,
      onDelete: async () => {
        const result = await loadFilesIntoState(appState, directory, "sources");
        if (!result.files || result.files.length === 0) {
          appState.setState("ui.welcomeFilesSectionVisible", false);
        }
      },
    });
  } finally {
    welcomeFilesRenderInFlight = false;
    if (welcomeFilesRenderQueued && pendingWelcomeFilesPayload) {
      welcomeFilesRenderQueued = false;
      void renderWelcomeFiles(appState);
    }
  }
}

/**
 * Show the welcome view
 * @param {Object} elements - DOM elements from dom-manager
 * @param {Object} appState - Application state
 */
export async function showWelcomeView(elements, appState) {
  if (!elements.welcomePageContainer) {
    console.error("welcomePageContainer not found!");
    return;
  }

  // Update state FIRST before rendering
  appState.setState("ui.currentView", "welcome");

  // Clear any previous welcome model config (start fresh)
  appState.setState("ui.welcomeModelConfig", null);

  // Get system username
  let userName = "User"; // Fallback
  try {
    userName = await window.electronAPI.getUsername();
  } catch (error) {
    window.electronAPI.log("error", "Failed to get username", { error: error.message });
  }

  // Show welcome page
  showWelcomePage(elements.welcomePageContainer, userName);

  // Update body view class via AppState (reactive DOM will apply it)
  appState.setState("ui.bodyViewClass", "view-welcome");

  // Load configuration metadata and initialize ModelSelector
  // OPTIMIZATION: Try cached config first (instant), fallback to fetch if needed
  let cachedConfig = appState.getState("ui.cachedModelConfig");

  // If no cached config, fetch it (only happens on very first load)
  if (!cachedConfig) {
    try {
      const metadata = await window.electronAPI.sessionCommand("config_metadata", {});
      if (metadata?.models) {
        cachedConfig = {
          models: metadata.models,
          reasoning_levels: metadata.reasoning_levels || [],
        };
        appState.setState("ui.cachedModelConfig", cachedConfig);
      }
    } catch (error) {
      window.electronAPI.log("error", "Failed to load config metadata", { error: error.message });
    }
  }

  // Mount view manager component if not already mounted
  if (!viewManagerComponent._lifecycle) {
    ComponentLifecycle.mount(viewManagerComponent, "ViewManager", globalLifecycleManager);
  }

  // Setup subscription to render welcome page files when sources list changes
  const unsubscribeWelcomeFiles = appState.subscribe("files.sourcesList", (files) => {
    // Only render if we're on welcome page
    if (appState.getState("ui.currentView") === "welcome") {
      // Hide section if no files
      if (!files || files.length === 0) {
        appState.setState("ui.welcomeFilesSectionVisible", false);
        return;
      }

      scheduleWelcomeFilesRender(appState, files);
    }
  });
  globalLifecycleManager.addUnsubscriber(viewManagerComponent, unsubscribeWelcomeFiles);

  // DEFERRED SESSION: Subscribe to pending files (before session exists)
  const unsubscribePendingFiles = appState.subscribe("ui.pendingWelcomeFiles", async (pendingFiles) => {
    if (appState.getState("ui.currentView") !== "welcome") return;

    const welcomeFilesContainer = document.getElementById("welcome-files-container");
    if (!welcomeFilesContainer) return;

    // Hide section if no pending files
    if (!pendingFiles || pendingFiles.length === 0) {
      // Only hide if also no session files
      const sessionService = window.app?.services?.sessionService;
      if (!sessionService?.getCurrentSessionId()) {
        appState.setState("ui.welcomeFilesSectionVisible", false);
      }
      return;
    }

    // Render pending files as thumbnail grid
    const { renderPendingFilesGrid } = await import("./file-manager.js");
    renderPendingFilesGrid(pendingFiles, welcomeFilesContainer, appState);
  });
  globalLifecycleManager.addUnsubscriber(viewManagerComponent, unsubscribePendingFiles);

  // Initialize ModelSelector with cached config (instant, no waiting)
  if (cachedConfig?.models) {
    // Use requestAnimationFrame to wait for DOM, then initialize async
    requestAnimationFrame(() => {
      const modelSelectorContainer = document.querySelector("#welcome-page-container .model-config-inline");
      if (modelSelectorContainer) {
        initializeWelcomeModelSelector(modelSelectorContainer, cachedConfig);
      }
    });
  }

  // Clean up any existing welcome page listeners before attaching new ones
  detachWelcomePageListeners();

  // Attach welcome page event listeners after DOM is ready (lifecycle-managed)
  viewManagerComponent.setTimeout(() => {
    attachWelcomePageListeners(elements, appState);

    // Auto-refresh welcome page file list if there's an active session
    // This prevents showing stale/deleted files
    const sessionService = window.app?.services?.sessionService;
    const currentSessionId = sessionService?.getCurrentSessionId();
    if (currentSessionId) {
      const welcomeFilesContainer = document.getElementById("welcome-files-container");
      const welcomeFilesSection = document.getElementById("welcome-files-section");

      if (welcomeFilesContainer && welcomeFilesSection) {
        // Show the files section immediately when there's an active session (via AppState)
        appState.setState("ui.welcomeFilesSectionVisible", true);

        // Then load the files (will show placeholder if empty)
        import("../managers/file-manager.js").then(async ({ loadFilesIntoState }) => {
          const directory = `data/files/${currentSessionId}/sources`;
          await loadFilesIntoState(appState, directory, "sources");
        });
      }
    }
  }, 0);
}

/**
 * Initialize ModelSelector for welcome page (extracted for cleaner async handling)
 * @private
 */
async function initializeWelcomeModelSelector(container, cachedConfig) {
  const welcomeModelSelector = new ModelSelector(container, {
    onChange: (model, reasoningEffort) => {
      // Store config in global appState (single source of truth)
      if (window.app?.appState) {
        window.app.appState.setState("ui.welcomeModelConfig", {
          model,
          reasoning_effort: reasoningEffort,
        });
      }
    },
    autoSyncBackend: false, // Welcome page is local-only
  });

  await welcomeModelSelector.initialize(cachedConfig.models, cachedConfig.reasoning_levels);

  // Store initial default selection immediately
  const initialSelection = welcomeModelSelector.getSelection();
  if (window.app?.appState) {
    window.app.appState.setState("ui.welcomeModelConfig", {
      model: initialSelection.model,
      reasoning_effort: initialSelection.reasoning_effort,
    });
  }

  window.electronAPI.log("info", "ModelSelector initialized on welcome page", {
    models: cachedConfig.models.length,
    reasoning_levels: cachedConfig.reasoning_levels?.length || 0,
    initialModel: initialSelection.model,
    initialReasoning: initialSelection.reasoning_effort,
  });
}

/**
 * Show the chat view
 * @param {Object} elements - DOM elements from dom-manager
 * @param {Object} appState - Application state
 */
export function showChatView(elements, appState) {
  if (!elements.welcomePageContainer) return;

  // Hide welcome page
  hideWelcomePage(elements.welcomePageContainer);

  // Clean up welcome page listeners to prevent memory leaks
  detachWelcomePageListeners();

  // Update state
  appState.setState("ui.currentView", "chat");

  // Update body view class via AppState (reactive DOM will apply it)
  appState.setState("ui.bodyViewClass", "view-chat");

  // Focus chat input (Phase 7: use InputArea component if available)
  if (window.components?.inputArea) {
    window.components.inputArea.focus();
  } else if (elements.userInput) {
    // Fallback to direct manipulation if component not available
    elements.userInput.focus();

    // Initialize textarea height properly (for textarea elements)
    if (elements.userInput.tagName === "TEXTAREA") {
      // Use requestAnimationFrame to ensure the view transition is complete
      requestAnimationFrame(() => {
        elements.userInput.style.height = "auto";
        const maxHeight = 200;
        const newHeight = Math.min(elements.userInput.scrollHeight, maxHeight);
        elements.userInput.style.height = `${newHeight}px`;
        elements.userInput.style.overflowY = elements.userInput.scrollHeight > maxHeight ? "auto" : "hidden";
      });
    }
  }
}

/**
 * Detach all welcome page event listeners
 */
function detachWelcomePageListeners() {
  welcomePageListeners.forEach(({ element, event, handler, controller }) => {
    if (controller) {
      controller.abort();
    } else {
      element?.removeEventListener(event, handler);
    }
  });
  welcomePageListeners.length = 0;
}

/**
 * Attach event listeners to welcome page elements
 * @param {Object} elements - DOM elements from dom-manager
 * @param {Object} appState - Application state
 */
function attachWelcomePageListeners(elements, appState) {
  const welcomeInput = document.getElementById("welcome-input");
  const welcomeSendBtn = document.getElementById("welcome-send-btn");
  const suggestionPills = document.querySelectorAll(".suggestion-pill");
  const welcomeContainer = elements.welcomePageContainer;

  // NOTE: File drag-and-drop handlers are managed globally in bootstrap.js
  // to prevent duplicate listeners. We only handle visual feedback here.
  if (welcomeContainer) {
    const dragenterHandler = (e) => {
      if (e.dataTransfer?.types.includes("Files")) {
        if (elements.fileDropZone) {
          elements.fileDropZone.classList.add("active");
        }
      }
    };
    welcomeContainer.addEventListener("dragenter", dragenterHandler);
    welcomePageListeners.push({ element: welcomeContainer, event: "dragenter", handler: dragenterHandler });

    const dragoverHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    welcomeContainer.addEventListener("dragover", dragoverHandler);
    welcomePageListeners.push({ element: welcomeContainer, event: "dragover", handler: dragoverHandler });

    const dragleaveHandler = (e) => {
      // Only hide if leaving the welcome container entirely
      if (e.target === welcomeContainer) {
        if (elements.fileDropZone) {
          elements.fileDropZone.classList.remove("active");
        }
      }
    };
    welcomeContainer.addEventListener("dragleave", dragleaveHandler);
    welcomePageListeners.push({ element: welcomeContainer, event: "dragleave", handler: dragleaveHandler });

    // DROP handler is managed in bootstrap.js to prevent duplicates
  }

  // Handle welcome files refresh button
  const welcomeFilesRefreshBtn = document.getElementById("welcome-files-refresh");
  if (welcomeFilesRefreshBtn) {
    const refreshHandler = async () => {
      // Get current session ID from SessionService
      const sessionService = window.app?.services?.sessionService;
      const sessionId = sessionService?.getCurrentSessionId();

      if (sessionId) {
        // Load session-specific files using AppState pattern
        const directory = `data/files/${sessionId}/sources`;
        import("./file-manager.js").then(({ loadFilesIntoState }) => {
          loadFilesIntoState(appState, directory, "sources");
        });
      }
    };
    welcomeFilesRefreshBtn.addEventListener("click", refreshHandler);
    welcomePageListeners.push({ element: welcomeFilesRefreshBtn, event: "click", handler: refreshHandler });
  }

  // Handle model config changes - update session config if no messages sent yet
  async function handleModelConfigChange() {
    const sessionService = window.app?.services?.sessionService;
    if (!sessionService) return;

    const sessionId = sessionService.getCurrentSessionId();

    // Only update if there's a session
    if (!sessionId) return;

    const sessions = await sessionService.loadSessions(0, 100);
    if (!sessions.success) return;

    const currentSession = sessions.sessions.find((s) => s.session_id === sessionId);
    if (!currentSession || currentSession.message_count > 0) {
      return;
    }

    // Get new config
    const { getMcpConfig, getModelConfig } = await import("../ui/welcome-page.js");
    const mcpConfig = getMcpConfig();
    const modelConfig = getModelConfig();

    // Update session config via new backend command
    try {
      const response = await window.electronAPI.sessionCommand("update_config", {
        session_id: sessionId,
        model: modelConfig.model,
        mcp_config: mcpConfig,
        reasoning_effort: modelConfig.reasoning_effort,
      });

      if (response?.session_id) {
        // Reload sessions list to show updated metadata
        const sessionService = window.app?.services?.sessionService;
        if (sessionService) {
          const sessionsResult = await sessionService.loadSessions();
          if (sessionsResult.success) {
            // Trigger session list update
            window.dispatchEvent(
              new CustomEvent("sessions-loaded", {
                detail: { sessions: sessionsResult.sessions },
              })
            );
          }
        }
      } else {
        console.error("❌ Failed to update session config:", response?.error);
      }
    } catch (error) {
      console.error("❌ Error updating session config:", error);
    }
  }

  // Attach listeners to model cards and reasoning options (lifecycle-managed)
  viewManagerComponent.setTimeout(() => {
    // Model card clicks
    document.querySelectorAll(".model-card").forEach((card) => {
      const handler = () => handleModelConfigChange();
      card.addEventListener("click", handler);
      welcomePageListeners.push({ element: card, event: "click", handler });
    });

    // Reasoning option clicks
    document.querySelectorAll(".reasoning-option").forEach((option) => {
      const handler = () => handleModelConfigChange();
      option.addEventListener("click", handler);
      welcomePageListeners.push({ element: option, event: "click", handler });
    });

    // MCP toggle clicks
    document.querySelectorAll(".mcp-toggle-btn").forEach((btn) => {
      const handler = () => handleModelConfigChange();
      btn.addEventListener("click", handler);
      welcomePageListeners.push({ element: btn, event: "click", handler });
    });
  }, 100); // Wait for welcome page to render

  // Handle welcome input send
  let isProcessing = false; // Guard against duplicate calls
  const sendWelcomeMessage = async () => {
    // Get fresh reference to input (don't rely on closure)
    const welcomeInputElement = document.getElementById("welcome-input");

    if (!welcomeInputElement || isProcessing) {
      return;
    }

    const message = welcomeInputElement.value.trim();
    if (!message) {
      return;
    }

    if (appState.connection.status !== "CONNECTED") {
      return;
    }

    isProcessing = true; // Set guard

    try {
      // Get MCP config from checkboxes
      const { getMcpConfig, getModelConfig } = await import("../ui/welcome-page.js");
      const mcpConfig = getMcpConfig();
      const modelConfig = getModelConfig();

      // Create new session only if one does not already exist (e.g., created by file upload)
      const sessionService = window.app?.services?.sessionService;
      if (!sessionService) {
        console.error("❌ SessionService not available");
        window.electronAPI.log("error", "SessionService not available in view-manager");
        isProcessing = false;
        return;
      }

      let sessionId = sessionService.getCurrentSessionId();

      if (!sessionId) {
        const result = await sessionService.createSession({
          title: null,
          mcpConfig,
          model: modelConfig.model,
          reasoningEffort: modelConfig.reasoning_effort,
        });

        if (!result.success) {
          window.electronAPI.log("error", "Failed to create session from welcome page", { error: result.error });
          isProcessing = false; // Reset guard before returning
          return;
        }

        // SessionService returns { success, sessionId, title } (not wrapped in .data)
        sessionId = result.sessionId || null;

        window.electronAPI.log("info", "Session created with full configuration", {
          session_id: sessionId,
          mcp_config: mcpConfig,
          model: modelConfig.model,
          reasoning_effort: modelConfig.reasoning_effort,
        });

        // DEFERRED FILE UPLOAD: Upload any pending welcome files now that session exists
        const pendingFiles = appState.getState("ui.pendingWelcomeFiles") || [];
        if (pendingFiles.length > 0) {
          const fileService = window.app?.services?.fileService;
          if (fileService) {
            for (const pendingFile of pendingFiles) {
              try {
                await fileService.uploadFile(pendingFile.file, sessionId);

                // Add image files to pending attachments for the message
                if (pendingFile.type?.startsWith("image/")) {
                  const currentAttachments = appState.getState("message.pendingAttachments") || [];
                  appState.setState("message.pendingAttachments", [
                    ...currentAttachments,
                    {
                      type: "image_ref",
                      filename: pendingFile.name,
                      path: `sources/${pendingFile.name}`,
                      mimeType: pendingFile.type,
                    },
                  ]);
                }

                // Revoke object URL to free memory
                if (pendingFile.previewUrl) {
                  URL.revokeObjectURL(pendingFile.previewUrl);
                }
              } catch (error) {
                console.error("Failed to upload pending file:", pendingFile.name, error);
              }
            }

            // Clear pending files from state
            appState.setState("ui.pendingWelcomeFiles", []);
          }
        }

        // Update chat model selector IMMEDIATELY with the config we just created
        // (Don't wait for backend event - that comes after the message completes)
        const sessionData = {
          session_id: sessionId,
          title: result.title || null,
          model: modelConfig.model,
          reasoning_effort: modelConfig.reasoning_effort,
          mcp_config: mcpConfig,
        };

        // Dispatch session-created event to update the session list
        window.dispatchEvent(
          new CustomEvent("session-created", {
            detail: {
              session: sessionData, // Include full session data
              session_id: sessionId,
              title: result.title || null,
              source: "welcome_page",
            },
          })
        );
      } else {
        window.electronAPI.log("info", "Reusing existing session for welcome message", {
          session_id: sessionId,
          created_by: "file_upload",
        });

        // Update chat model selector with current config (for existing sessions too)
        // This handles the case where a file upload created the session
        const sessionData = {
          session_id: sessionId,
          model: modelConfig.model,
          reasoning_effort: modelConfig.reasoning_effort,
          mcp_config: mcpConfig,
        };

        const { updateChatModelSelector } = await import("../utils/chat-model-updater.js");
        updateChatModelSelector(sessionData);
        window.electronAPI.log("info", "Chat model selector updated for existing session");
      }

      // Clear the input
      welcomeInputElement.value = "";

      // Transition to chat view (either new or existing session)
      showChatView(elements, appState);

      // Collapse sidebar to give chat more space (matches behavior when switching sessions)
      appState.setState("ui.sidebarCollapsed", true);
      window.electronAPI.log("debug", "Sidebar collapsed after starting chat from welcome page");

      // Add user message to chat (Phase 7: use ChatContainer component if available)
      if (window.components?.chatContainer) {
        window.components.chatContainer.addUserMessage(message);
      } else {
        addMessage(elements.chatContainer, message, "user");
      }

      // Reset assistant message state
      appState.setState("message.currentAssistant", null);
      appState.setState("message.assistantBuffer", "");

      // Send to backend via IPCAdapter to include pending attachments
      // IPCAdapter.sendMessage() auto-includes images from message.pendingAttachments
      const ipcAdapter = window.app?.adapters?.ipcAdapter;
      if (ipcAdapter) {
        await ipcAdapter.sendMessage(message, sessionId);
      } else {
        // Fallback to direct call (legacy, won't include attachments)
        console.warn("[view-manager] ipcAdapter not available, attachments will not be sent");
        window.electronAPI.sendUserInput(message, sessionId);
      }

      // Session list will be updated automatically via session-created event
    } catch (error) {
      console.error("Error in sendWelcomeMessage:", error);
      window.electronAPI.log("error", "Failed to send welcome message", { error: error.message });
    } finally {
      // Always reset guard, even if there's an error
      isProcessing = false;
    }
  };

  // Send button click
  if (welcomeSendBtn) {
    welcomeSendBtn.addEventListener("click", sendWelcomeMessage);
    welcomePageListeners.push({ element: welcomeSendBtn, event: "click", handler: sendWelcomeMessage });
  }

  // Enter key to send
  if (welcomeInput) {
    const keydownHandler = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendWelcomeMessage();
      }
    };
    welcomeInput.addEventListener("keydown", keydownHandler);
    welcomePageListeners.push({ element: welcomeInput, event: "keydown", handler: keydownHandler });
  }

  // Suggestion pill clicks
  suggestionPills.forEach((pill) => {
    const clickHandler = () => {
      const category = pill.dataset.category;
      const prompt = getSuggestionPrompt(category);

      if (prompt && welcomeInput) {
        welcomeInput.value = prompt;
        welcomeInput.focus();
        welcomeInput.dispatchEvent(new Event("input", { bubbles: true }));

        // Auto-resize textarea
        welcomeInput.style.height = "auto";
        welcomeInput.style.height = `${Math.min(welcomeInput.scrollHeight, 200)}px`;
      }
    };
    pill.addEventListener("click", clickHandler);
    welcomePageListeners.push({ element: pill, event: "click", handler: clickHandler });
  });
}
