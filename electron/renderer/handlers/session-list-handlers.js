/**
 * Session List Event Handlers
 *
 * Centralized event delegation for session list interactions
 */

/**
 * Setup event handlers for session list using event delegation
 *
 * @param {HTMLElement} sessionsList - Sessions list container
 * @param {Object} sessionService - Session service instance (SSOT)
 * @param {Function} updateSessionsList - Function to refresh sessions list
 * @param {Object} elements - DOM elements
 * @param {Object} appState - Application state
 * @param {Object} ipcAdapter - IPC adapter for command queue processing
 */
export function setupSessionListHandlers(
  sessionsList,
  sessionService,
  updateSessionsList,
  elements,
  appState,
  ipcAdapter
) {
  // Click handler for session switching and actions
  sessionsList.addEventListener("click", async (e) => {
    const target = e.target;
    const sessionItem = target.closest(".session-item");

    if (!sessionItem) return;

    const sessionId = sessionItem.dataset.sessionId;
    if (!sessionId) return;

    // Handle action buttons
    const action = target.dataset?.action || target.closest("[data-action]")?.dataset?.action;

    if (action === "summarize") {
      await handleSummarize(sessionId, sessionService, appState, ipcAdapter);
      e.stopPropagation();
      return;
    }

    if (action === "rename") {
      await handleRename(sessionItem, sessionId, sessionService, updateSessionsList);
      e.stopPropagation();
      return;
    }

    if (action === "delete") {
      await handleDelete(sessionId, sessionService, updateSessionsList, elements, appState);
      e.stopPropagation();
      return;
    }

    // If clicking on rename input, don't switch session
    if (target.classList.contains("session-title-input")) {
      e.stopPropagation();
      return;
    }

    // Otherwise, switch to this session (only if different)
    if (sessionId !== sessionService.getCurrentSessionId()) {
      await handleSwitch(sessionId, sessionService, updateSessionsList, elements, appState);
    } else {
      // Already in this session - do nothing (better UX, no popup)
      console.log("Already in session:", sessionId);
    }
  });

  console.log("✅ Session list event handlers attached (delegation)");
}

/**
 * Handle session summarize
 */
async function handleSummarize(sessionId, sessionService, appState, ipcAdapter) {
  // Only summarize if this is the current session
  if (sessionId !== sessionService.getCurrentSessionId()) {
    alert("Please switch to this session first to summarize it.");
    return;
  }

  try {
    console.log("Summarizing session:", sessionId);

    // Track Python status - summarization started
    if (appState) {
      appState.setState("python.status", "busy_summarizing");
      console.log("🔄 Python status: busy_summarizing");
    }

    const result = await sessionService.summarizeSession(sessionId);

    // Track Python status - summarization ended
    if (appState) {
      appState.setState("python.status", "idle");
      console.log("✅ Python status: idle");
    }

    // Process queued commands
    if (ipcAdapter && ipcAdapter.commandQueue.length > 0) {
      console.log("📦 Processing queued commands after summarization...");
      await ipcAdapter.processQueue();
    }

    if (result.success) {
      console.log("✅ Session summarized successfully");
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("Error summarizing session:", error);

    // Ensure status is reset even on error
    if (appState) {
      appState.setState("python.status", "idle");
    }

    // Process queue even on error
    if (ipcAdapter && ipcAdapter.commandQueue.length > 0) {
      await ipcAdapter.processQueue();
    }

    alert(`Error summarizing session: ${error.message}`);
  }
}

/**
 * Handle session rename
 */
async function handleRename(sessionItem, sessionId, sessionService, _updateSessionsList) {
  const titleDiv = sessionItem.querySelector(".session-title");
  if (!titleDiv) return;

  const currentTitle = titleDiv.textContent;

  // Create inline input for renaming
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentTitle;
  input.className = "session-title-input";
  input.style.cssText =
    "width: 100%; padding: 4px; font-size: 13px; border: 1px solid var(--color-border-focus); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary);";

  // Replace title with input
  titleDiv.style.display = "none";
  titleDiv.parentNode.insertBefore(input, titleDiv.nextSibling);
  input.focus();
  input.select();

  const saveRename = async () => {
    const newTitle = input.value.trim();

    // Remove input
    input.remove();
    titleDiv.style.display = "";

    if (!newTitle || newTitle === currentTitle) return;

    try {
      console.log("Renaming session:", sessionId, "to:", newTitle);
      const result = await sessionService.renameSession(sessionId, newTitle);

      if (result.success) {
        console.log("✅ Session renamed successfully");
        titleDiv.textContent = newTitle;
      } else {
        console.error("Failed to rename session:", result.error);
        alert(`Failed to rename session: ${result.error}`);
      }
    } catch (error) {
      console.error("Error renaming session:", error);
      alert(`Error renaming session: ${error.message}`);
    }
  };

  input.addEventListener("blur", saveRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRename();
    } else if (e.key === "Escape") {
      input.remove();
      titleDiv.style.display = "";
    }
  });
}

/**
 * Handle session delete
 */
async function handleDelete(sessionId, sessionService, updateSessionsList, elements, appState) {
  // Get session title for confirmation
  const sessionItem = document.querySelector(`[data-session-id="${sessionId}"]`);
  const titleDiv = sessionItem?.querySelector(".session-title");
  const sessionTitle = titleDiv?.textContent || "Untitled Conversation";

  const confirmDelete = confirm(`Delete session "${sessionTitle}"?`);
  if (!confirmDelete) return;

  try {
    console.log("Deleting session:", sessionId);

    // Check which view we're on BEFORE deleting (to decide sidebar auto-close behavior)
    const wasOnWelcomePage = document.body.classList.contains("view-welcome");

    // IMPORTANT: Check if we're deleting the current session BEFORE calling deleteSession
    // (deleteSession will set currentSessionId to null, making the check impossible after)
    const isDeletingCurrentSession = sessionId === sessionService.getCurrentSessionId();
    console.log("🗑️ Delete check:", {
      deletedSessionId: sessionId,
      currentSessionIdBeforeDelete: sessionService.getCurrentSessionId(),
      isDeletingCurrentSession,
    });

    const result = await sessionService.deleteSession(sessionId);

    if (result.success) {
      console.log("✅ Session deleted successfully");

      // Reload sessions list
      const sessions = await sessionService.loadSessions();
      if (sessions.success) {
        updateSessionsList(sessions.sessions || []);
      }

      // If we deleted the current session, clear and show welcome page
      if (isDeletingCurrentSession) {
        console.log("🏠 Deleted active session, navigating to welcome page");

        // Clear FilePanel component FIRST (Phase 7 - release file handles!)
        if (window.components?.filePanel) {
          // CRITICAL: Close all file handles before deletion to prevent "Too many open files"
          window.components.filePanel.closeAllHandles();
          window.components.filePanel.setSession(null);
          window.components.filePanel.clear();
          console.log("✅ FilePanel handles closed and cleared before deletion");
        }

        // Clear chat UI (Phase 7: use component)
        if (window.components?.chatContainer) {
          window.components.chatContainer.clear();
        } else {
          console.error("⚠️ ChatContainer component not available - UI not cleared");
        }

        // Show welcome view (pass services for session creation)
        const { showWelcomeView } = await import("../managers/view-manager.js");
        await showWelcomeView(elements, appState, { sessionService });
      }

      // Close sidebar after delete (better UX) - but only if we were on chat view
      // Keep sidebar open if we were on welcome page so user can manage multiple sessions
      if (!wasOnWelcomePage) {
        const sidebar = document.getElementById("sidebar");
        if (sidebar && !sidebar.classList.contains("collapsed")) {
          sidebar.classList.add("collapsed");
        }
      }
    } else {
      console.error("Failed to delete session:", result.error);
      alert(`Failed to delete session: ${result.error}`);
    }
  } catch (error) {
    console.error("Error deleting session:", error);
    alert(`Error deleting session: ${error.message}`);
  }
}

/**
 * Handle session switch
 */
async function handleSwitch(sessionId, sessionService, updateSessionsList, elements, appState) {
  console.log("Switching to session:", sessionId);

  // Double-check: don't switch if already in this session
  if (sessionId === sessionService.getCurrentSessionId()) {
    console.log("Already in this session, skipping switch");
    return;
  }

  try {
    const result = await sessionService.switchSession(sessionId);

    if (result.success) {
      console.log("✅ Switched to session:", sessionId);

      // Update chat model selector to reflect session's config
      if (result.session) {
        import("../utils/chat-model-updater.js").then(({ updateChatModelSelector }) => {
          updateChatModelSelector(result.session);
        });
      }

      // Clear current chat UI (Phase 7: use component)
      if (window.components?.chatContainer) {
        window.components.chatContainer.clear();
      } else {
        console.error("⚠️ ChatContainer component not available - UI not cleared");
      }

      // Reset app state
      if (appState) {
        appState.setState("message.currentAssistant", null);
        appState.setState("message.assistantBuffer", "");
        if (appState.functions) {
          appState.functions.activeCalls?.clear();
          appState.functions.argumentsBuffer?.clear();
        }
      }

      // Render messages from backend response (Phase 7: use component)
      const messages = result.fullHistory || [];
      if (messages.length > 0) {
        console.log(`📨 Rendering ${messages.length} messages for session ${sessionId}`);

        if (window.components?.chatContainer) {
          // Use ChatContainer component
          for (const msg of messages) {
            console.log("Processing message:", {
              role: msg.role,
              contentType: typeof msg.content,
              isArray: Array.isArray(msg.content),
            });

            if (msg.role && msg.content) {
              let content = msg.content;
              const originalContent = content;

              // Handle different content formats
              if (Array.isArray(content)) {
                console.log("Content is array, length:", content.length);
                // Direct array (multipart message)
                // Handle both 'text' and 'output_text' types
                content = content
                  .filter((part) => part && (part.type === "text" || part.type === "output_text"))
                  .map((part) => part.text)
                  .join("\n");
                console.log("After array processing:", content);
              } else if (typeof content === "object" && content.text) {
                // Single text object
                content = content.text;
                console.log("Extracted from object.text:", content);
              } else if (typeof content === "string" && (content.startsWith("[") || content.startsWith("{"))) {
                // JSON string that needs parsing
                try {
                  const parsed = JSON.parse(content);
                  console.log("Parsed JSON:", { isArray: Array.isArray(parsed), hasText: !!parsed.text });

                  if (Array.isArray(parsed)) {
                    content = parsed
                      .filter((part) => part && (part.type === "text" || part.type === "output_text"))
                      .map((part) => part.text)
                      .join("\n");
                    console.log("After JSON array processing:", content);
                  } else if (parsed.text) {
                    content = parsed.text;
                    console.log("Extracted from parsed.text:", content);
                  }
                } catch (_e) {
                  // Not valid JSON, use as-is
                  console.log("Content is not valid JSON, using as-is");
                }
              }
              // else: content is already a plain string, use as-is

              // Only add if we have actual text content
              if (content && typeof content === "string" && content.trim()) {
                // Use appropriate method based on role
                if (msg.role === "user") {
                  window.components.chatContainer.addUserMessage(content);
                } else if (msg.role === "assistant") {
                  window.components.chatContainer.addAssistantMessage(content);
                }
              } else {
                console.warn("❌ Skipping message - invalid content:", {
                  role: msg.role,
                  finalContent: content,
                  originalContent: originalContent,
                });
              }
            }
          }
        } else {
          console.error("⚠️ ChatContainer component not available - messages not rendered");
        }
      } else {
        console.log(`📭 No messages to render for session ${sessionId}`);
      }

      // Update the list to show new active session
      updateSessionsList();

      // Switch to chat view if on welcome page
      if (document.body.classList.contains("view-welcome")) {
        const { showChatView } = await import("../managers/view-manager.js");
        await showChatView(elements, appState);
      }

      // Update FilePanel component with new session (Phase 7)
      if (window.components?.filePanel) {
        window.components.filePanel.setSession(sessionId);
        console.log("✅ FilePanel updated with new session");
      } else {
        console.error("⚠️ FilePanel component not available");
      }

      // Scroll to bottom AFTER view transitions complete (UX: show most recent)
      if (messages.length > 0 && window.components?.chatContainer) {
        const { scheduleScroll } = await import("../utils/scroll-utils.js");
        // Use double RAF to ensure layout is fully settled after showChatView
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scheduleScroll(window.components.chatContainer.getElement());
            console.log("📜 Scrolled to bottom after loading session");
          });
        });
      }
    } else {
      throw new Error(result.error);
    }

    // Close sidebar after switching (better UX)
    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.classList.contains("collapsed")) {
      sidebar.classList.add("collapsed");
    }
  } catch (error) {
    console.error("Failed to switch session:", error);
    alert(`Failed to switch session: ${error.message}`);
  }
}
