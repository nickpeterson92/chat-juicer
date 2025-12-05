/**
 * Phase 4: Components
 * Initialize UI components with proper dependency injection
 *
 * Dependencies: Phase 2 (DOM elements), Phase 3 (services)
 * Outputs: ChatContainer, InputArea, FilePanel, sendMessage callback
 * Criticality: HIGH (UI won't work without components)
 */

import { ChatContainer } from "../../ui/components/chat-container.js";
import { FilePanel } from "../../ui/components/file-panel.js";
import { InputArea } from "../../ui/components/input-area.js";
import { setupScrollDetection } from "../../utils/scroll-utils.js";

/**
 * Initialize UI components
 * @param {Object} deps - Dependencies from previous phases
 * @returns {Promise<import('../types.js').ComponentsPhaseResult>}
 */
export async function initializeComponents({ elements, appState, services, ipcAdapter }) {
  console.log("📦 Phase 4: Initializing components...");

  try {
    // Import view manager for sendMessage
    const { showChatView } = await import("../../managers/view-manager.js");

    // Component references (will be populated)
    const components = {};

    // CRITICAL: Define sendMessage FIRST (closure over services)
    // This must be defined before InputArea initialization
    async function sendMessage(message, clearInput) {
      if (!message || !message.trim()) {
        console.log("Empty message, ignoring");
        return;
      }

      try {
        // Switch to chat view if on welcome page
        if (document.body.classList.contains("view-welcome")) {
          console.log("On welcome page, switching to chat view");
          await showChatView(elements, appState);
        }

        // Display user message in chat
        if (components.chatContainer) {
          components.chatContainer.addUserMessage(message.trim());
        } else {
          console.error("⚠️ ChatContainer component not available");
        }

        // Send via MessageService using SessionService
        console.log("Sending message via MessageService...");
        const currentSessionId = services.sessionService.getCurrentSessionId();
        const sendResult = await services.messageService.sendMessage(message.trim(), currentSessionId);

        if (sendResult.success) {
          console.log("✅ Message sent successfully");
        } else {
          console.error("❌ Message send failed:", sendResult.error);
          alert(`Failed to send message: ${sendResult.error}`);
        }

        // Clear input if provided
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

    // Initialize components
    components.chatContainer = new ChatContainer(document.getElementById("chat-container"));
    console.log("  ✓ ChatContainer initialized");

    // Setup scroll detection to prevent scroll fighting during streaming
    setupScrollDetection(components.chatContainer.getElement());
    console.log("  ✓ Scroll detection enabled");

    components.filePanel = new FilePanel(
      document.getElementById("files-panel"),
      document.getElementById("open-files-btn"),
      document.getElementById("files-container"),
      document.getElementById("refresh-files-btn"),
      document.getElementById("tab-sources"),
      document.getElementById("tab-output")
    );
    console.log("  ✓ FilePanel initialized");

    // Initialize InputArea with sendMessage callback
    const sendBtn = document.getElementById("send-btn");
    const userInput = document.getElementById("user-input");
    const chatModelSelector = document.getElementById("chat-model-selector");

    if (sendBtn && userInput) {
      components.inputArea = new InputArea(userInput, sendBtn, (message) => sendMessage(message, userInput), {
        modelSelectorContainer: chatModelSelector,
        ipcAdapter: ipcAdapter,
        sessionService: services.sessionService, // Pass SessionService for model selector to get currentSessionId
        getModelConfig: null, // Will be injected after model config loads
      });
      console.log("  ✓ InputArea initialized with sendMessage callback");
    } else {
      console.warn("  ⚠️ InputArea not initialized (missing send-btn or user-input)");
      components.inputArea = null;
    }

    // Make components globally accessible
    window.components = components;

    return {
      ...components,
      sendMessage, // Export for use in Phase 5 (event handlers)
    };
  } catch (error) {
    console.error("❌ Phase 4 failed:", error);
    throw new Error(`Component initialization failed: ${error.message}`);
  }
}
