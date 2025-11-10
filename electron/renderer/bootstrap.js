/**
 * Bootstrap - Application initialization for new architecture
 *
 * Works with the existing HTML structure and enhances it with new services,
 * adapters, and coordinated event handlers.
 *
 * Replaces legacy index.js with a cleaner, testable architecture.
 */

// Adapters (Infrastructure)
import { DOMAdapter } from "./adapters/DOMAdapter.js";
import { IPCAdapter } from "./adapters/IPCAdapter.js";
import { StorageAdapter } from "./adapters/StorageAdapter.js";
import { FileService } from "./services/file-service.js";
import { FunctionCallService } from "./services/function-call-service.js";
// Services (Business Logic)
import { MessageService } from "./services/message-service.js";
import { SessionService } from "./services/session-service.js";

// UI Components
// Note: showWelcomePage is now imported dynamically via showWelcomeView

// State Management
import { AppState } from "./core/state.js";

// Managers
import { elements, initializeElements } from "./managers/dom-manager.js";

/**
 * Bootstrap the application with existing HTML
 *
 * @returns {Promise<Object>} Application instance with services
 */
export async function bootstrapSimple() {
  console.log("🚀 Bootstrapping Chat Juicer (Simple Mode)...");

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

  console.log("✅ Services initialized");
  console.log("📦 Services available:", {
    messageService: "✓",
    fileService: "✓",
    functionCallService: "✓",
    sessionService: "✓",
  });

  // ======================
  // 4. Import Session State
  // ======================
  const { sessionState } = await import("./services/session-service.js");

  console.log("✅ Session state imported");

  // ======================
  // 5. Verify DOM Elements Exist
  // ======================
  const requiredElements = ["chat-container", "sessions-list", "user-input", "send-btn"];

  for (const id of requiredElements) {
    if (!document.getElementById(id)) {
      console.warn(`⚠️ Required element not found: #${id}`);
    }
  }

  console.log("✅ DOM verification complete");

  // ======================
  // 6. Setup Event Listeners
  // ======================

  // Sidebar toggle
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }

  // ========================
  // FILE PANEL FUNCTIONALITY
  // ========================

  // Import file manager
  const { loadFiles, setActiveFilesDirectory, activeFilesDirectory } = await import("./managers/file-manager.js");

  // Files panel toggle
  const openFilesBtn = document.getElementById("open-files-btn");
  const filesPanel = document.getElementById("files-panel");
  if (openFilesBtn && filesPanel) {
    openFilesBtn.addEventListener("click", () => {
      const wasCollapsed = filesPanel.classList.contains("collapsed");
      filesPanel.classList.toggle("collapsed");

      // Auto-refresh files when opening the panel (better UX)
      if (wasCollapsed && sessionState.currentSessionId) {
        // Respect the currently active tab
        const activeTab = document.querySelector(".files-tab.active");
        const tabType = activeTab?.dataset.directory || "sources";
        const directory = `data/files/${sessionState.currentSessionId}/${tabType}`;
        const filesContainer = document.getElementById("files-container");
        if (filesContainer) {
          console.log(`🔄 Auto-refreshing files panel on open (${tabType} tab)`);
          loadFiles(directory, filesContainer);
        }
      }
    });
  }

  // Get files container
  const filesContainer = document.getElementById("files-container");

  // Refresh files button
  const refreshFilesBtn = document.getElementById("refresh-files-btn");
  if (refreshFilesBtn) {
    refreshFilesBtn.addEventListener("click", () => {
      if (sessionState.currentSessionId) {
        const directory = `data/files/${sessionState.currentSessionId}/${activeFilesDirectory.includes("output") ? "output" : "sources"}`;
        loadFiles(directory, filesContainer);
      }
    });
  }

  // File tabs switching (sources/output)
  const sourcesTab = document.getElementById("tab-sources");
  const outputTab = document.getElementById("tab-output");
  const filesTabs = [sourcesTab, outputTab].filter(Boolean);

  for (const tab of filesTabs) {
    tab.addEventListener("click", () => {
      let directory = tab.dataset.directory;

      // Use session-specific directories when session is active
      if (sessionState.currentSessionId) {
        if (directory === "sources") {
          directory = `data/files/${sessionState.currentSessionId}/sources`;
        } else if (directory === "output") {
          directory = `data/files/${sessionState.currentSessionId}/output`;
        }
      }

      // Update active tab styling
      for (const t of filesTabs) {
        t.classList.remove("active");
      }
      tab.classList.add("active");

      // Update active directory and load files
      console.log(`📂 Switching to ${tab.dataset.directory} tab, directory: ${directory}`);
      setActiveFilesDirectory(directory);
      loadFiles(directory, filesContainer);
    });
  }

  // Drag & drop file upload
  const chatPanel = document.querySelector(".chat-panel"); // Use querySelector since it's a class, not an ID
  const fileDropZone = document.getElementById("file-drop-zone");

  // Prevent default drag behavior
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    document.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      false
    );
  });

  // Show drop zone when dragging files over chat panel OR welcome page
  const welcomePageContainer = document.getElementById("welcome-page-container");

  if (fileDropZone) {
    // Show drop zone on drag over chat panel
    if (chatPanel) {
      chatPanel.addEventListener("dragenter", (e) => {
        console.log("🎯 dragenter on chat-panel", e.dataTransfer?.types);
        if (e.dataTransfer?.types.includes("Files")) {
          fileDropZone.classList.add("active");
        }
      });
    }

    // Show drop zone on drag over welcome page
    if (welcomePageContainer) {
      welcomePageContainer.addEventListener("dragenter", (e) => {
        if (e.dataTransfer?.types.includes("Files")) {
          fileDropZone.classList.add("active");
        }
      });
    }

    // Hide drop zone when leaving
    fileDropZone.addEventListener("dragleave", (e) => {
      if (e.target === fileDropZone) {
        fileDropZone.classList.remove("active");
      }
    });

    // Handle file drop
    const handleFileDrop = async (e) => {
      e.preventDefault();
      fileDropZone.classList.remove("active");

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      console.log("🗂️ Files dropped:", files.length, "files");
      console.log("📍 Drop location:", e.target.id || e.target.className);

      // Track if we're on welcome page BEFORE creating session
      const isOnWelcomePage = document.body.classList.contains("view-welcome");
      console.log("📄 View:", isOnWelcomePage ? "WELCOME" : "CHAT");
      console.log("🔑 Current session:", sessionState.currentSessionId || "NONE");

      // If no session, create one first (but DON'T switch views - stay on welcome page)
      if (!sessionState.currentSessionId) {
        console.log("No session - creating one for file upload");
        try {
          // Create session without title - backend will generate default timestamp-based title
          const result = await sessionService.createSession({});
          if (result.success) {
            sessionState.currentSessionId = result.sessionId;
            console.log("✅ Session created:", result.sessionId);

            // Reload sessions list to show the new session in sidebar
            const sessionsResult = await sessionService.loadSessions();
            if (sessionsResult.success) {
              updateSessionsList(sessionsResult.sessions || []);
            }
          } else {
            throw new Error(result.error);
          }
          // STAY on welcome page for file uploads - only switch to chat on first message
        } catch (error) {
          console.error("Failed to create session:", error);
          alert("Failed to create session for file upload");
          return;
        }
      }

      // Upload each file using FileService
      const { showToast } = await import("./utils/toast.js");
      let uploadedCount = 0;
      let _failedCount = 0;

      for (const file of files) {
        try {
          console.log(`Uploading ${file.name} using FileService...`);

          const result = await fileService.uploadFile(file, sessionState.currentSessionId);

          if (result.success) {
            console.log(`✅ File uploaded: ${file.name}`);
            uploadedCount++;

            // Refresh the appropriate file container based on view
            if (sessionState.currentSessionId) {
              const directory = `data/files/${sessionState.currentSessionId}/sources`;

              if (isOnWelcomePage) {
                // Show welcome files section if hidden
                const welcomeFilesSection = document.getElementById("welcome-files-section");
                if (welcomeFilesSection) {
                  welcomeFilesSection.style.display = "block";
                }

                // Load files into welcome page container
                const welcomeFilesContainer = document.getElementById("welcome-files-container");
                if (welcomeFilesContainer) {
                  loadFiles(directory, welcomeFilesContainer);
                }
              } else {
                // Load files into right-side panel (chat view)
                loadFiles(directory, filesContainer);
              }
            }
          } else {
            console.error(`File upload failed: ${result.error}`);
            _failedCount++;
            showToast(`Failed to upload ${file.name}`, "error", 3000);
          }
        } catch (error) {
          console.error("Error uploading file:", error);
          _failedCount++;
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
      chatPanel.addEventListener("drop", handleFileDrop);
      console.log("✅ File drop handler attached to chat-panel");
    } else {
      console.warn("⚠️ chat-panel not found, file drops in chat view will not work");
    }
    if (welcomePageContainer) {
      welcomePageContainer.addEventListener("drop", handleFileDrop);
      console.log("✅ File drop handler attached to welcome-page-container");
    }
    if (fileDropZone) {
      fileDropZone.addEventListener("drop", handleFileDrop);
      console.log("✅ File drop handler attached to file-drop-zone");
    }
  }

  // Helper function to send message
  async function sendMessage(message, clearInput) {
    console.log("sendMessage called:", message);

    if (!message || !message.trim()) {
      console.log("Empty message, ignoring");
      return;
    }

    try {
      // If on welcome page, switch to chat view first
      if (document.body.classList.contains("view-welcome")) {
        console.log("On welcome page, switching to chat view");
        const { showChatView } = await import("./managers/view-manager.js");
        await showChatView(elements, appState);
      }

      // Display user message in chat
      const { addMessage } = await import("./ui/chat-ui.js");
      const chatContainer = document.getElementById("chat-container");
      if (chatContainer) {
        addMessage(chatContainer, message.trim(), "user");
      }

      // Send the message via MessageService
      console.log("Sending message via MessageService...");
      const sendResult = await messageService.sendMessage(message.trim(), sessionState.currentSessionId);

      if (sendResult.success) {
        console.log("✅ Message sent successfully");
      } else {
        console.error("❌ Message send failed:", sendResult.error);
        alert(`Failed to send message: ${sendResult.error}`);
      }

      // Clear the input if provided
      if (clearInput) {
        clearInput.value = "";
      }

      // Focus chat input after sending
      const chatInput = document.getElementById("user-input");
      if (chatInput) {
        chatInput.focus();
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      console.error(error.stack);
    }
  }

  // Auto-resize textarea helper
  function autoResizeTextarea(textarea) {
    if (!textarea || textarea.tagName !== "TEXTAREA") return;

    textarea.style.height = "auto";
    const maxHeight = 200;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  // Chat view: Send button & input
  const sendBtn = document.getElementById("send-btn");
  const userInput = document.getElementById("user-input");

  if (sendBtn && userInput) {
    sendBtn.addEventListener("click", () => {
      sendMessage(userInput.value, userInput);
    });

    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        console.log("Enter key pressed in chat input");
        e.preventDefault();
        sendMessage(userInput.value, userInput);
      }
    });

    // Auto-resize textarea as user types
    if (userInput.tagName === "TEXTAREA") {
      userInput.addEventListener("input", () => {
        autoResizeTextarea(userInput);
      });

      // Initialize height
      autoResizeTextarea(userInput);
    }

    console.log("✅ Chat input event listeners attached");
  }

  // NOTE: Welcome page handlers (input/send/refresh/keypress) are managed in view-manager.js
  // to allow proper cleanup on view transitions. Only global/persistent handlers here.

  // Initialize theme and titlebar on startup
  const { initializeTheme, toggleTheme } = await import("./managers/theme-manager.js");
  const { initializeTitlebar } = await import("./ui/titlebar.js");

  initializeTheme(elements);
  initializeTitlebar(); // Windows/Linux only, returns null on macOS

  // Theme toggle
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      toggleTheme(elements);
    });
  }

  // Restart bot button
  const restartBtn = document.getElementById("restart-btn");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      ipcAdapter.restartBot();
    });
  }

  // New session button - Start fresh chat
  const newSessionBtn = document.getElementById("new-session-btn");
  if (newSessionBtn) {
    newSessionBtn.addEventListener("click", async () => {
      try {
        console.log("Creating new session...");

        // Clear current session ID in state
        const previousSessionId = sessionState.currentSessionId;
        sessionState.currentSessionId = null;

        // Clear current session using SessionService
        await sessionService.clearCurrentSession();

        // Remove active state from previous session in UI
        if (previousSessionId) {
          const sessionsList = document.getElementById("sessions-list");
          const previousSessionElement = sessionsList?.querySelector(`[data-session-id="${previousSessionId}"]`);
          if (previousSessionElement) {
            previousSessionElement.classList.remove("active");
          }
        }

        // Clear chat UI
        const { clearChat } = await import("./ui/chat-ui.js");
        const { clearFunctionCards } = await import("./ui/function-card-ui.js");
        const chatContainer = document.getElementById("chat-container");
        if (chatContainer) {
          clearChat(chatContainer);
          clearFunctionCards(chatContainer);
        }

        // Show welcome view
        const { showWelcomeView } = await import("./managers/view-manager.js");
        await showWelcomeView(elements, appState);

        // Close sidebar after action
        if (sidebar && !sidebar.classList.contains("collapsed")) {
          sidebar.classList.add("collapsed");
        }

        console.log("✅ New session started");
      } catch (error) {
        console.error("Failed to create new session:", error);
      }
    });
  }

  // Click away to close panels
  document.addEventListener("click", (e) => {
    // Close sidebar
    if (sidebar && !sidebar.classList.contains("collapsed")) {
      if (!sidebar.contains(e.target) && !sidebarToggle?.contains(e.target)) {
        sidebar.classList.add("collapsed");
      }
    }

    // Close files panel
    if (filesPanel && !filesPanel.classList.contains("collapsed")) {
      if (!filesPanel.contains(e.target) && !openFilesBtn?.contains(e.target)) {
        filesPanel.classList.add("collapsed");
      }
    }
  });

  // Handle external links in chat - open in system browser
  const chatContainer = document.getElementById("chat-container");
  if (chatContainer) {
    chatContainer.addEventListener("click", async (e) => {
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

  console.log("✅ Event listeners setup");

  // ======================
  // 7. Send Ready Signal
  // ======================
  ipcAdapter.send("renderer-ready");
  console.log("✅ Renderer ready signal sent");

  // ======================
  // 8. Show Welcome Page
  // ======================
  const welcomeContainer = document.getElementById("welcome-page-container");
  if (welcomeContainer) {
    console.log("🎬 Initializing welcome view on startup");
    // Use showWelcomeView which handles rendering AND event listeners
    const { showWelcomeView } = await import("./managers/view-manager.js");
    await showWelcomeView(elements, appState);
    console.log("✅ Welcome view initialized (with listeners)");
  }

  // ======================
  // 9. Setup IPC Message Handlers
  // ======================

  // Import message handler
  const { processMessage } = await import("./handlers/message-handlers.js");

  // JSON buffer for parsing multi-line messages
  let jsonBuffer = "";
  const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB safety limit

  // Listen for bot output (streaming messages)
  console.log("Setting up onPythonStdout handler...");
  ipcAdapter.onPythonStdout((output) => {
    console.log("📥 Received bot output:", output);

    try {
      // Handle structured JSON messages from Python backend
      const lines = output.toString().split("\n");
      console.log("Split into lines:", lines.length);

      for (let line of lines) {
        if (!line.trim()) continue;

        // Remove __JSON__ markers if present
        line = line.replace(/^__JSON__/, "").replace(/__JSON__$/, "");
        console.log("Processing line:", line.substring(0, 100));

        // Accumulate JSON if we're building a multi-line message
        if (jsonBuffer || line.startsWith("{")) {
          jsonBuffer += line;

          // Safety check
          if (jsonBuffer.length > MAX_BUFFER_SIZE) {
            console.error("JSON buffer overflow detected");
            jsonBuffer = "";
            continue;
          }

          try {
            // Try to parse the accumulated buffer
            const message = JSON.parse(jsonBuffer);
            console.log("✅ Parsed message:", message.type);
            jsonBuffer = ""; // Reset on success

            // Process the message with services
            console.log("Calling processMessage with:", {
              messageType: message.type,
              hasAppState: !!appState,
              hasElements: !!elements,
            });
            processMessage(message, {
              appState,
              elements,
              services: {
                messageService,
                fileService,
                functionCallService,
                sessionService,
              },
            });
            console.log("✅ Message processed");
          } catch (e) {
            // Not yet complete JSON, keep accumulating
            if (!e.message.includes("Unexpected end of JSON")) {
              console.error("Failed to parse JSON:", e);
              jsonBuffer = "";
            } else {
              console.log("Incomplete JSON, accumulating...");
            }
          }
        }
      }
    } catch (error) {
      console.error("Error handling bot output:", error);
      console.error(error.stack);
    }
  });
  console.log("✅ onPythonStdout handler registered");

  // Listen for bot errors
  ipcAdapter.onPythonStderr((error) => {
    console.error("Bot error:", error);
  });

  // Listen for bot disconnection
  ipcAdapter.onPythonExit(() => {
    console.warn("Bot disconnected");
  });

  console.log("✅ IPC message handlers setup");

  // ======================
  // 9b. Listen for session creation events
  // ======================

  // Listen for session-created event from backend (dispatched by message handlers)
  window.addEventListener("session-created", async (event) => {
    console.log("🎉 Session created event received:", event.detail);

    // Reload sessions list to show the new session
    try {
      const result = await sessionService.loadSessions();
      if (result.success) {
        updateSessionsList(result.sessions || []);
        console.log("✅ Sessions list updated after session creation");
      }
    } catch (error) {
      console.error("Failed to reload sessions after creation:", error);
    }
  });

  console.log("✅ Session event listeners setup");

  // ======================
  // 10. Load Initial Data
  // ======================

  // ======================
  // Session List Rendering (Phase 3 Renderers)
  // ======================

  const { renderSessionList, renderEmptySessionList } = await import("./ui/renderers/session-list-renderer.js");
  const { setupSessionListHandlers } = await import("./handlers/session-list-handlers.js");

  /**
   * Update sessions list using Phase 3 renderer
   * @param {Array|null} sessions - Optional array of sessions to render
   */
  function updateSessionsList(sessions = null) {
    console.log("🎨 updateSessionsList called with:", sessions?.length || 0, "sessions");
    const sessionsList = document.getElementById("sessions-list");
    if (!sessionsList) {
      console.warn("⚠️ sessions-list element not found");
      return;
    }

    sessionsList.innerHTML = "";

    // Use provided sessions or fall back to sessionState
    const sessionsToRender = sessions || sessionState.sessions || [];
    console.log("🎨 Rendering", sessionsToRender.length, "sessions");

    // Update sessionState if new sessions provided
    if (sessions) {
      sessionState.sessions = sessions;
    }

    if (sessionsToRender.length === 0) {
      // Use Phase 3 renderer for empty state
      const emptyElement = renderEmptySessionList("No sessions yet", domAdapter);
      sessionsList.appendChild(emptyElement);
      return;
    }

    // Transform backend session format (session_id) to renderer format (id)
    const transformedSessions = sessionsToRender.map((session) => ({
      id: session.session_id,
      title: session.title,
      created_at: session.created_at || session.last_used,
    }));

    // Use Phase 3 renderer
    const fragment = renderSessionList(transformedSessions, sessionState.currentSessionId, domAdapter);

    if (fragment) {
      sessionsList.appendChild(fragment);
    }
  }

  // Setup event handlers once (event delegation)
  const sessionsList = document.getElementById("sessions-list");
  if (sessionsList) {
    setupSessionListHandlers(sessionsList, sessionService, sessionState, updateSessionsList, elements, appState);
  }

  // Load model config metadata from backend and initialize model selector
  try {
    const configResult = await ipcAdapter.sendSessionCommand("config_metadata", {});
    if (configResult.success) {
      const { models, reasoning_levels } = configResult;
      const { initializeModelConfig } = await import("./ui/welcome-page.js");
      initializeModelConfig(models, reasoning_levels);
      console.log("✅ Model config loaded:", models?.length || 0, "models");
    }
  } catch (error) {
    console.error("Failed to load model config:", error);
  }

  // Load sessions and populate sidebar using SessionService
  try {
    const result = await sessionService.loadSessions();
    console.log("📋 SessionService.loadSessions() result:", result);
    if (result.success) {
      console.log("📋 Sessions to render:", result.sessions?.length || 0, "sessions");
      updateSessionsList(result.sessions || []);
      console.log("✅ Sessions loaded via SessionService");
    } else {
      console.error("❌ Failed to load sessions:", result.error);
    }

    // Load files if there's an active session
    if (sessionState.currentSessionId) {
      const sessionDirectory = `data/files/${sessionState.currentSessionId}/sources`;
      setActiveFilesDirectory(sessionDirectory);
      loadFiles(sessionDirectory, filesContainer);
      console.log("✅ Files loaded for current session");
    } else {
      // Clear loading state if no session
      if (filesContainer) {
        filesContainer.innerHTML = '<div class="files-empty">No session selected</div>';
      }
    }
  } catch (error) {
    console.error("Failed to load sessions:", error);
  }

  console.log("🎉 Chat Juicer (Simple Mode) bootstrapped successfully!");

  // ======================
  // Return Application Instance
  // ======================
  const app = {
    // Services (main API)
    services: {
      message: messageService,
      file: fileService,
      functionCall: functionCallService,
      session: sessionService,
    },

    // Adapters (for advanced usage)
    adapters: {
      dom: domAdapter,
      ipc: ipcAdapter,
      storage: storageAdapter,
    },

    // State management
    state: appState,

    // DOM elements
    elements: elements,

    // Cleanup function
    cleanup: () => {
      console.log("🧹 Cleaning up simple bootstrap...");
      // In simple mode, minimal cleanup needed
    },
  };

  // Expose globally for debugging
  window.app = app;

  return app;
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
        console.error("❌ Failed to bootstrap (simple):", error);
      }
    });
  } else {
    try {
      window.app = await bootstrapSimple();
    } catch (error) {
      console.error("❌ Failed to bootstrap (simple):", error);
    }
  }
}
