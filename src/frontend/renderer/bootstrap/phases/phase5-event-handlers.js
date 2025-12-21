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
import { loadFilesIntoState } from "../../managers/file-manager.js";
import { MessageHandlerPlugin } from "../../plugins/core-plugins.js";
import { renderEmptySessionList, renderSessionList } from "../../ui/renderers/session-list-renderer.js";
import { initializeTitlebar } from "../../ui/titlebar.js";
import { getPreviewType, hasBinaryExtension, hasTextExtension } from "../../utils/content-preview.js";
import { readTextFileChunk } from "../../utils/file-utils.js";
import {
  completeFileUpload,
  finishUploadProgress,
  startUploadProgress,
  updateUploadProgress,
} from "../../utils/upload-progress.js";

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
  // Mount event handlers component with lifecycle management
  ComponentLifecycle.mount(eventHandlersComponent, "EventHandlers", globalLifecycleManager);

  // Use SessionService as single source of truth
  const sessionService = services.sessionService;

  const listeners = []; // Track DOM listeners for cleanup
  const stateUnsubscribers = []; // Track AppState subscriptions for cleanup
  let hasCleanedUp = false; // Idempotent cleanup guard

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
        // Use DOM state as source of truth to avoid stale/null state requiring double clicks
        const isCollapsed = sidebar.classList.contains("collapsed");
        appState.setState("ui.sidebarCollapsed", !isCollapsed);
      });
    }

    // Click away to close panels
    addListener(document, "click", (e) => {
      // Close sidebar (using AppState)
      if (sidebar && !appState.getState("ui.sidebarCollapsed")) {
        if (!sidebar.contains(e.target) && !sidebarToggle?.contains(e.target)) {
          appState.setState("ui.sidebarCollapsed", true);
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

    // Handle links anywhere in the renderer:
    // - Same-page file:// anchors: scroll within the current window
    // - Other links: open in system browser via IPC
    const ensureLinkTitle = (anchor) => {
      if (!anchor || anchor.getAttribute("title")) return;
      const rawHref = anchor.getAttribute("href") || "";
      const displayHref = rawHref || anchor.href || "";
      if (displayHref) {
        anchor.setAttribute("title", displayHref);
      }
    };

    const findScrollableAncestor = (el) => {
      let node = el?.parentElement;
      while (node && node !== document.body) {
        const hasScroll = node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth;
        const overflow = window.getComputedStyle(node).overflowY;
        if (hasScroll && (overflow === "auto" || overflow === "scroll" || overflow === "overlay")) {
          return node;
        }
        node = node.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };

    const handleAnchorClick = async (e) => {
      if (e.defaultPrevented) return;
      // Respect modifier clicks (new tab/window)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      const link = e.target.closest("a");
      if (!link?.href) return;
      ensureLinkTitle(link);

      try {
        const rawHref = link.getAttribute("href") || "";
        const targetUrl = new URL(link.href, window.location.href);
        const currentUrl = new URL(window.location.href);

        const hash = targetUrl.hash || (rawHref.startsWith("#") ? rawHref : "");
        const isSameFile =
          targetUrl.protocol === currentUrl.protocol &&
          targetUrl.host === currentUrl.host &&
          targetUrl.pathname === currentUrl.pathname;

        // Handle same-document navigation first (supports dev server + bundled file://)
        if (isSameFile && hash) {
          e.preventDefault();
          const targetId = decodeURIComponent(hash.slice(1));
          const targetEl =
            document.getElementById(targetId) ||
            document.querySelector(`[name="${CSS?.escape ? CSS.escape(targetId) : targetId}"]`);

          if (targetEl) {
            // Defer to ensure layout is settled before scrolling
            requestAnimationFrame(() => {
              targetEl.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
              const scrollContainer = findScrollableAncestor(targetEl);
              if (scrollContainer) {
                const containerTop = scrollContainer.getBoundingClientRect().top;
                const targetTop = targetEl.getBoundingClientRect().top;
                const offset = targetTop - containerTop + scrollContainer.scrollTop - 12; // small padding
                scrollContainer.scrollTo({ top: offset, behavior: "smooth" });
              }
            });
            return;
          }

          console.warn("Anchor target not found for hash", { hash, targetId });
          // Fallback to updating hash to let browser handle if element not found
          window.location.hash = hash;
          return;
        }

        // Block same-file navigation (even without hash) from opening externally
        if (isSameFile && targetUrl.protocol === "file:") {
          e.preventDefault();
          return;
        }

        if (!link.href.startsWith("#")) {
          e.preventDefault();
          await ipcAdapter.openExternalUrl(link.href);
        }
      } catch (error) {
        console.error("Failed to handle link click:", error);
      }
    };

    addListener(document, "click", handleAnchorClick, true); // capture to catch early
    addListener(
      document,
      "mouseover",
      (e) => {
        const link = e.target.closest("a");
        if (link) ensureLinkTitle(link);
      },
      true
    );

    // ======================
    // 1.5. Reactive DOM Bindings (AppState → DOM)
    // ======================

    // Bind ui.bodyViewClass to document.body
    const updateBodyViewClass = (viewClass) => {
      document.body.classList.remove("view-welcome", "view-chat");
      document.body.classList.add(viewClass);
    };
    // Apply initial state immediately
    updateBodyViewClass(appState.getState("ui.bodyViewClass"));
    stateUnsubscribers.push(appState.subscribe("ui.bodyViewClass", updateBodyViewClass));

    // Bind ui.sidebarCollapsed to sidebar element
    const updateSidebarCollapsed = (collapsed) => {
      if (sidebar) {
        const isCollapsed = collapsed ?? false; // Default to expanded unless explicitly true
        sidebar.classList.toggle("collapsed", isCollapsed);
      }
    };
    // Apply initial state immediately
    updateSidebarCollapsed(appState.getState("ui.sidebarCollapsed"));
    stateUnsubscribers.push(appState.subscribe("ui.sidebarCollapsed", updateSidebarCollapsed));

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
      // Sibling Architecture: Target the drawer by new ID
      const drawer = document.getElementById("welcome-files-drawer");
      if (!drawer) return;

      // Find wrapper to toggle state
      const cardWrapper = drawer.closest(".welcome-input-card");
      if (!cardWrapper) return;

      if (visible) {
        // Ensure wrapper is expanded
        requestAnimationFrame(() => cardWrapper.classList.add("has-files"));
      } else {
        // Trigger collapse animation
        cardWrapper.classList.remove("has-files");
      }
    };
    // Apply initial state immediately
    updateWelcomeFilesSection(appState.getState("ui.welcomeFilesSectionVisible"));
    stateUnsubscribers.push(appState.subscribe("ui.welcomeFilesSectionVisible", updateWelcomeFilesSection));

    // Bind ui.loadingLampVisible to streaming message loading indicator
    const updateLoadingLampVisibility = (visible) => {
      const currentAssistant = appState.getState("message.currentAssistant");
      const messageElement = currentAssistant?.closest(".message");
      const loadingLamp =
        messageElement?.querySelector(".loading-lamp") ||
        document.querySelector("[data-streaming='true'] .loading-lamp");

      if (!loadingLamp) {
        return;
      }

      if (visible) {
        // Ensure lamp is shown for active streaming
        loadingLamp.style.removeProperty("transition");
        loadingLamp.style.opacity = "1";
        loadingLamp.style.display = "inline-block";
        return;
      }

      // Fade out and remove when visibility is disabled
      loadingLamp.style.transition = "opacity 200ms ease-out";
      loadingLamp.style.opacity = "0";
      window.setTimeout(() => {
        if (loadingLamp.isConnected) {
          loadingLamp.remove();
        }
      }, 200);
    };
    // Apply initial state immediately
    updateLoadingLampVisibility(appState.getState("ui.loadingLampVisible"));
    stateUnsubscribers.push(appState.subscribe("ui.loadingLampVisible", updateLoadingLampVisibility));

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
        hideDropZoneTimer = window.setTimeout(() => {
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

      const isOnWelcomePage = document.body.classList.contains("view-welcome");

      // DEFERRED SESSION CREATION: On welcome page without session, buffer files in memory
      // Session will be created when user sends their first message
      if (isOnWelcomePage && !sessionService.getCurrentSessionId()) {
        const pendingFiles = appState.getState("ui.pendingWelcomeFiles") || [];
        const { showToast } = await import("../../utils/toast.js");
        const MAX_PENDING_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file

        for (const file of files) {
          // Reject files that are too large for memory buffering
          if (file.size > MAX_PENDING_FILE_SIZE) {
            showToast(`${file.name} exceeds 50MB limit`, "warning", 3000);
            continue;
          }

          // Create preview data
          let previewUrl = null;
          let previewContent = null;
          let previewType = null;

          if (file.type?.startsWith("image/")) {
            previewUrl = URL.createObjectURL(file);
            previewType = "image";
          } else if (file.type === "application/pdf") {
            // PDF preview requires more work (pdf.js), stick to icon for now or implement later
            previewType = "pdf";
          } else {
            // Check if it's a code/text file based on extension or mime type
            // IMPORTANT: Exclude known binary formats even if small
            const isBinaryFile = hasBinaryExtension(file.name);
            const isTextFile = !isBinaryFile && (file.type?.startsWith("text/") || hasTextExtension(file.name));

            if (isTextFile) {
              try {
                // Read first 2KB for preview
                previewContent = await readTextFileChunk(file, 2048);
                previewType = getPreviewType(file.name);
              } catch (err) {
                console.warn("Failed to read local file for preview:", err);
              }
            }
            // Binary files will have previewType = null, which triggers placeholder icon
          }

          // Add to pending files buffer
          pendingFiles.push({
            file, // Keep original File object for upload later
            previewUrl,
            previewContent,
            previewType, // 'image', 'code', 'text', 'csv'
            name: file.name,
            size: file.size,
            type: file.type,
          });
        }

        appState.setState("ui.pendingWelcomeFiles", [...pendingFiles]);
        appState.setState("ui.welcomeFilesSectionVisible", true);

        showToast(`${files.length} file${files.length > 1 ? "s" : ""} ready to attach`, "success", 2000);
        return;
      }

      // If we have an active session, upload directly (existing behavior)

      // Upload each file using FileService with progress tracking
      const { showToast } = await import("../../utils/toast.js");
      let uploadedCount = 0;
      let failedCount = 0;

      // Start progress bar
      startUploadProgress(files.length);

      for (const file of files) {
        // Update progress with current file name
        updateUploadProgress(file.name, 0);

        try {
          // Pass progress callback for real-time byte progress
          const result = await services.fileService.uploadFile(file, sessionService.getCurrentSessionId(), (percent) =>
            updateUploadProgress(file.name, percent)
          );

          if (result.success) {
            uploadedCount++;
            completeFileUpload(file.name, true);

            // Add image files to pending attachments for next message
            if (file.type?.startsWith("image/")) {
              const currentAttachments = appState.getState("message.pendingAttachments") || [];
              appState.setState("message.pendingAttachments", [
                ...currentAttachments,
                {
                  type: "image_ref",
                  filename: file.name,
                  path: `sources/${file.name}`,
                  mimeType: file.type,
                },
              ]);
            }

            // Refresh the appropriate file container
            if (sessionService.getCurrentSessionId()) {
              const directory = `data/files/${sessionService.getCurrentSessionId()}/sources`;

              if (isOnWelcomePage) {
                appState.setState("ui.welcomeFilesSectionVisible", true);

                // Load files into AppState (rendering happens via subscription in view-manager)
                window.setTimeout(async () => {
                  try {
                    await loadFilesIntoState(appState, directory, "sources");
                  } catch (error) {
                    console.error("Failed to load files after upload", error);
                  }
                }, 100);
              } else {
                if (components.filePanel) {
                  window.setTimeout(async () => {
                    try {
                      await components.filePanel.refresh();
                    } catch (error) {
                      console.error("Failed to refresh file panel after upload", error);
                    }
                  }, 100);
                }
              }
            }
          } else {
            failedCount++;
            completeFileUpload(file.name, false);
            console.error(`File upload failed: ${result.error}`);
            showToast(`Failed to upload ${file.name}`, "error", 3000);
          }
        } catch (error) {
          failedCount++;
          completeFileUpload(file.name, false);
          console.error("Error uploading file:", error);
          showToast(`Error uploading ${file.name}`, "error", 3000);
        }
      }

      // Finish progress bar (it will auto-hide after showing completion)
      finishUploadProgress(uploadedCount, failedCount);

      // Show summary toast for multiple files (progress bar handles single file feedback)
      if (files.length > 1) {
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

    // Handle files selected via file dialog (from attachment plus button)
    const handleFilesFromDialog = async (event) => {
      const { filePaths } = event.detail;
      if (!filePaths || filePaths.length === 0) return;

      const isOnWelcomePage = document.body.classList.contains("view-welcome");

      // Convert file paths to File-like objects by reading them
      const { showToast } = await import("../../utils/toast.js");
      const pendingFiles = appState.getState("ui.pendingWelcomeFiles") || [];
      const MAX_PENDING_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file

      // Process files from paths (Node.js fs access via IPC)
      for (const filePath of filePaths) {
        try {
          // Get file info and content via IPC
          const fileName = filePath.split("/").pop() || filePath.split("\\").pop();

          // For welcome page, we need to create pending file entries
          // Since we can't directly read files in renderer, we'll upload after session creation
          // For now, store the path and let the upload happen when session is created
          if (isOnWelcomePage && !sessionService.getCurrentSessionId()) {
            // Read file via fetch (for local files packaged with app) or create File reference
            // Read file via IPC (fetch file:// fails in renderer)
            const fileData = await ipcAdapter.readFile(filePath);
            if (!fileData || !fileData.success) throw new Error(fileData?.error || "Failed to read file");

            // Convert base64 to Blob
            const byteCharacters = atob(fileData.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: fileData.mimeType });
            const file = new File([blob], fileName, { type: blob.type });

            if (file.size > MAX_PENDING_FILE_SIZE) {
              showToast(`${fileName} exceeds 50MB limit`, "warning", 3000);
              continue;
            }

            // Create preview data
            let previewUrl = null;
            let previewContent = null;
            let previewType = null;

            if (file.type?.startsWith("image/")) {
              previewUrl = URL.createObjectURL(file);
              previewType = "image";
            } else if (file.type === "application/pdf") {
              previewType = "pdf";
            } else {
              const isBinaryFile = hasBinaryExtension(file.name);
              const isTextFile = !isBinaryFile && (file.type?.startsWith("text/") || hasTextExtension(file.name));

              if (isTextFile) {
                try {
                  previewContent = await readTextFileChunk(file, 2048);
                  previewType = getPreviewType(file.name);
                } catch (err) {
                  console.warn("Failed to read local file for preview:", err);
                }
              }
            }

            pendingFiles.push({
              file,
              previewUrl,
              previewContent,
              previewType,
              name: file.name,
              size: file.size,
              type: file.type,
            });
          } else {
            // If we have an active session, upload directly via file service
            // Read the file via fetch and upload
            // Read file via IPC (fetch file:// fails in renderer)
            const fileData = await ipcAdapter.readFile(filePath);
            if (!fileData || !fileData.success) throw new Error(fileData?.error || "Failed to read file");

            // Convert base64 to Blob
            const byteCharacters = atob(fileData.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: fileData.mimeType });
            const file = new File([blob], fileName, { type: blob.type });

            const result = await services.fileService.uploadFile(file, sessionService.getCurrentSessionId());
            if (result.success) {
              // Add image files to pending attachments
              if (file.type?.startsWith("image/")) {
                const currentAttachments = appState.getState("message.pendingAttachments") || [];
                appState.setState("message.pendingAttachments", [
                  ...currentAttachments,
                  {
                    type: "image_ref",
                    filename: file.name,
                    path: `sources/${file.name}`,
                    mimeType: file.type,
                  },
                ]);
              }

              // Refresh file panel
              if (components.filePanel) {
                await components.filePanel.refresh();
              }
            } else {
              showToast(`Failed to upload ${fileName}`, "error", 3000);
            }
          }
        } catch (error) {
          console.error("Failed to process file from dialog:", error);
          showToast(`Error processing file`, "error", 3000);
        }
      }

      // Update pending files state
      if (isOnWelcomePage && !sessionService.getCurrentSessionId() && pendingFiles.length > 0) {
        appState.setState("ui.pendingWelcomeFiles", [...pendingFiles]);
        appState.setState("ui.welcomeFilesSectionVisible", true);
        showToast(`${filePaths.length} file${filePaths.length > 1 ? "s" : ""} ready to attach`, "success", 2000);
      }
    };

    window.addEventListener("files-selected-from-dialog", handleFilesFromDialog);
    listeners.push({ element: window, event: "files-selected-from-dialog", handler: handleFilesFromDialog });

    // Setup chat input attachment plus button
    const chatAttachmentBtn = document.getElementById("chat-attachment-plus-btn");
    let chatAttachmentMenu = null;

    if (chatAttachmentBtn) {
      const createChatMenu = () => {
        const menu = document.createElement("div");
        menu.className = "attachment-context-menu";
        menu.id = "chat-attachment-context-menu";
        menu.innerHTML = `
          <button class="attachment-menu-item" data-action="attach-file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
            Attach file
          </button>
        `;
        document.body.appendChild(menu);
        return menu;
      };

      const closeChatMenu = () => {
        chatAttachmentBtn.classList.remove("open");
        if (chatAttachmentMenu) {
          chatAttachmentMenu.classList.remove("visible");
        }
      };

      const openChatMenu = async () => {
        if (!chatAttachmentMenu) {
          chatAttachmentMenu = createChatMenu();

          const attachMenuItem = chatAttachmentMenu.querySelector('[data-action="attach-file"]');
          if (attachMenuItem) {
            attachMenuItem.addEventListener("click", async (e) => {
              e.preventDefault();
              e.stopPropagation();
              closeChatMenu();

              try {
                const filePaths = await ipcAdapter.openFileDialog({ multiple: true });
                if (filePaths && filePaths.length > 0) {
                  window.dispatchEvent(
                    new CustomEvent("files-selected-from-dialog", {
                      detail: { filePaths },
                    })
                  );
                }
              } catch (error) {
                console.error("Failed to open file dialog:", error);
              }
            });
          }
        }

        // Position menu above button with viewport clamping
        const btnRect = chatAttachmentBtn.getBoundingClientRect();
        chatAttachmentMenu.style.position = "fixed";
        chatAttachmentMenu.style.transform = "translateY(-100%)";
        chatAttachmentMenu.style.top = `${btnRect.top - 8}px`;

        // Calculate left position, ensuring menu stays within viewport
        const menuWidth = 140; // min-width from CSS
        let leftPos = btnRect.left + btnRect.width / 2 - menuWidth / 2;

        // Clamp to viewport bounds (8px padding from edges)
        leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - menuWidth - 8));
        chatAttachmentMenu.style.left = `${leftPos}px`;

        chatAttachmentBtn.classList.add("open");
        chatAttachmentMenu.classList.add("visible");
      };

      addListener(chatAttachmentBtn, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = chatAttachmentBtn.classList.contains("open");
        if (isOpen) {
          closeChatMenu();
        } else {
          openChatMenu();
        }
      });

      // Close menu when clicking outside
      const closeChatMenuOnOutsideClick = (e) => {
        if (chatAttachmentMenu && !chatAttachmentBtn.contains(e.target) && !chatAttachmentMenu.contains(e.target)) {
          closeChatMenu();
        }
      };
      addListener(document, "click", closeChatMenuOnOutsideClick);
    }

    // Setup chat MCP toggle buttons (scoped to chat-input-section)
    const chatInputSection = document.querySelector(".chat-input-section");
    if (chatInputSection) {
      const chatMcpButtons = chatInputSection.querySelectorAll(".mcp-toggle-btn");
      let mcpUpdateTimeout = null;

      const updateSessionMcpConfig = async () => {
        const sessionId = sessionService.getCurrentSessionId();
        if (!sessionId) return;

        // Collect enabled MCP servers only from the chat input section
        const mcpConfig = [];
        chatInputSection.querySelectorAll(".mcp-toggle-btn.active").forEach((btn) => {
          const mcpType = btn.dataset.mcp;
          // Map to backend keys
          if (mcpType === "sequential") mcpConfig.push("sequential");
          else if (mcpType === "fetch") mcpConfig.push("fetch");
          else if (mcpType === "tavily") mcpConfig.push("tavily");
        });

        try {
          await window.electronAPI.sessionCommand("update_config", {
            session_id: sessionId,
            mcp_config: mcpConfig,
          });
          logger.info(`Updated session config for ${sessionId}: ${mcpConfig.join(", ")}`);
        } catch (error) {
          console.error("Failed to update MCP config:", error);
        }
      };

      chatMcpButtons.forEach((btn) => {
        addListener(btn, "click", () => {
          // Toggle active state
          btn.classList.toggle("active");

          // Animation
          if (btn.classList.contains("active")) {
            btn.classList.add("animate-on");
          } else {
            btn.classList.add("animate-off");
          }

          btn.addEventListener(
            "animationend",
            () => {
              btn.classList.remove("animate-on", "animate-off");
            },
            { once: true }
          );

          // Debounce update
          if (mcpUpdateTimeout) clearTimeout(mcpUpdateTimeout);
          mcpUpdateTimeout = setTimeout(updateSessionMcpConfig, 300);
        });
      });
    }

    // ======================
    // 3. Titlebar
    // ======================

    initializeTitlebar();

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

    // Settings button (placeholder)
    const settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) {
      addListener(settingsBtn, "click", () => {
        alert("Coming Soon!");
      });
    }

    // New session button
    const newSessionBtn = document.getElementById("new-session-btn");
    if (newSessionBtn) {
      addListener(newSessionBtn, "click", async () => {
        try {
          const previousSessionId = sessionService.getCurrentSessionId();

          if (components.filePanel) {
            components.filePanel.setSession(null);
            components.filePanel.clear();
          }

          // Clear UI state but do NOT delete database data
          // clearCurrentSession() was incorrectly deleting all messages
          appState.setState("session.current", null);

          // Clean up pending welcome files to prevent memory leaks
          const pendingFiles = appState.getState("ui.pendingWelcomeFiles") || [];
          pendingFiles.forEach((f) => {
            if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
          });
          appState.setState("ui.pendingWelcomeFiles", []);

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
          await showWelcomeView(elements, appState);

          // Collapse sidebar when showing welcome view
          appState.setState("ui.sidebarCollapsed", true);
        } catch (error) {
          console.error("[session] Failed to create new session:", error);
        }
      });
    }

    // ======================
    // 5. EventBus Message Handlers
    // ======================

    // CRITICAL: Install MessageHandlerPlugin BEFORE registering handlers.
    // This plugin routes "message:received" events to "message:{type}" events.
    // Without this, handlers for "message:function_detected" etc. will never fire.
    const app = { eventBus };
    await MessageHandlerPlugin.install(app);

    registerMessageHandlers({
      appState,
      elements,
      ipcAdapter,
      components,
      services: {
        messageService: services.messageService,
        fileService: services.fileService,
        functionCallService: services.functionCallService,
        sessionService: services.sessionService,
        streamManager: services.streamManager,
      },
    });

    // ======================
    // 6. IPC Listeners (V2 Binary Protocol)
    // ======================

    // V2: Receive messages as objects directly (no parsing needed)
    ipcAdapter.onBotMessage((message) => {
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

    // ======================
    // 7. Session Event Listeners
    // ======================

    const captureSessionItemPositions = (container) => {
      if (!container) return new Map();

      const positions = new Map();
      const items = container.querySelectorAll(".session-item");

      items.forEach((item) => {
        const sessionId = item.dataset?.sessionId;
        if (!sessionId) return;

        const rect = item.getBoundingClientRect();
        positions.set(sessionId, {
          top: rect.top,
          left: rect.left,
        });
      });

      return positions;
    };

    const animateSessionReorder = (container, previousPositions) => {
      if (!container || previousPositions.size === 0) return;

      const items = Array.from(container.querySelectorAll(".session-item"));
      const durationMs = 420;
      const easing = "cubic-bezier(0.33, 1, 0.68, 1)"; // smooth ease-out

      items.forEach((item) => {
        const sessionId = item.dataset?.sessionId;
        if (!sessionId) return;

        const prev = previousPositions.get(sessionId);
        if (!prev) return;

        const rect = item.getBoundingClientRect();
        const deltaX = prev.left - rect.left;
        const deltaY = prev.top - rect.top;

        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
          return;
        }

        item.style.willChange = "transform";

        const animation = item.animate(
          [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }],
          {
            duration: durationMs,
            easing,
            fill: "both",
          }
        );

        animation.addEventListener("finish", () => {
          item.style.willChange = "";
        });
      });
    };

    // Helper to update sessions list
    function updateSessionsList(sessions = null) {
      const sessionsList = document.getElementById("sessions-list");
      if (!sessionsList) return;

      const previousPositions = captureSessionItemPositions(sessionsList);
      const previousOrder = Array.from(sessionsList.querySelectorAll("[data-session-id]")).map(
        (node) => node.dataset.sessionId
      );

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
        created_at: session.created_at,
        pinned: Boolean(session.pinned),
      }));

      const fragment = renderSessionList(
        transformedSessions,
        sessionService.getCurrentSessionId(),
        domAdapter,
        services.streamManager
      );

      if (fragment) {
        sessionsList.appendChild(fragment);
      }

      const newOrder = Array.from(sessionsList.querySelectorAll("[data-session-id]")).map(
        (node) => node.dataset.sessionId
      );
      const orderChanged =
        previousOrder.length === newOrder.length ? newOrder.some((id, index) => id !== previousOrder[index]) : true;

      if (orderChanged) {
        animateSessionReorder(sessionsList, previousPositions);
      }
    }

    // Session created event
    window.addEventListener("session-created", async (event) => {
      const session = event.detail.session || event.detail;
      const sessionId = session.session_id || event.detail.session_id;

      if (sessionId) {
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
          // UI will be updated automatically via AppState subscriptions
          updateSessionsList();
        }
      }
    });

    // Session updated event
    window.addEventListener("session-updated", () => {
      // Update UI immediately with SessionService data
      updateSessionsList(sessionService.getSessions());
    });

    // ======================
    // 8. Session List Handlers
    // ======================

    const sessionsList = document.getElementById("sessions-list");
    if (sessionsList) {
      setupSessionListHandlers({
        sessionListContainer: sessionsList,
        sessionService,
        streamManager: services.streamManager,
        updateSessionsList,
        elements,
        appState,
        ipcAdapter,
      });
    }

    // Cleanup function
    const cleanup = () => {
      if (hasCleanedUp) return;
      hasCleanedUp = true;
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

      // Destroy component-level subscriptions (AppState)
      const destroyComponent = (component, name) => {
        if (component && typeof component.destroy === "function") {
          try {
            component.destroy();
          } catch (error) {
            console.error(`Failed to destroy ${name}:`, error);
          }
        }
      };

      destroyComponent(components.chatContainer, "ChatContainer");
      destroyComponent(components.filePanel, "FilePanel");
      destroyComponent(components.inputArea, "InputArea");

      // Unmount any lifecycle-managed components/timers
      globalLifecycleManager.unmountAll();
    };

    return { cleanup, updateSessionsList };
  } catch (error) {
    console.error("Phase 5 failed:", error);
    throw new Error(`Event handler initialization failed: ${error.message}`);
  }
}
