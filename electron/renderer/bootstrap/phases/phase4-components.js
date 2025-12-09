/**
 * Phase 4: Components
 * Initialize UI components with proper dependency injection
 *
 * Dependencies: Phase 2 (DOM elements), Phase 3 (services)
 * Outputs: ChatContainer, InputArea, FilePanel, sendMessage callback
 * Criticality: HIGH (UI won't work without components)
 */

import { initializeMessageQueueService } from "../../services/message-queue-service.js";
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
  try {
    // Import view manager for sendMessage
    const { showChatView } = await import("../../managers/view-manager.js");

    // Component references (will be populated)
    const components = {};

    // Initialize MessageQueueService for message queuing
    const messageQueueService = initializeMessageQueueService({
      appState,
      messageService: services.messageService,
    });
    services.messageQueueService = messageQueueService;

    // CRITICAL: Define sendMessage FIRST (closure over services)
    // This must be defined before InputArea initialization
    // Now uses queue service to handle queueing when agent is busy
    async function sendMessage(message, clearInput) {
      if (!message || !message.trim()) {
        return;
      }

      try {
        // Switch to chat view if on welcome page
        if (document.body.classList.contains("view-welcome")) {
          await showChatView(elements, appState);
        }

        // Phase 3: Concurrent Sessions - check if CURRENT session is streaming
        // For concurrent sessions, only queue if the same session is busy
        // Different sessions can stream simultaneously (backend enforces MAX_CONCURRENT_STREAMS)
        const currentSessionId = services.sessionService.getCurrentSessionId();
        const isCurrentSessionStreaming = currentSessionId && services.streamManager?.isStreaming(currentSessionId);

        if (isCurrentSessionStreaming) {
          // Queue the message - it will be sent when THIS session is idle
          // Store sessionId with the queued message for proper routing
          messageQueueService.add(message.trim(), [], currentSessionId);

          // Clear input immediately (message is queued)
          if (clearInput) {
            clearInput.value = "";
          }

          // Focus chat input
          const chatInput = document.getElementById("user-input");
          if (chatInput) {
            chatInput.focus();
          }
          return;
        }

        // Backend is idle - send directly (normal flow)
        // Display user message in chat
        if (components.chatContainer) {
          components.chatContainer.addUserMessage(message.trim());
        } else {
          console.error("ChatContainer component not available");
        }

        // Send via MessageService using SessionService (currentSessionId already defined above)
        const sendResult = await services.messageService.sendMessage(message.trim(), currentSessionId);

        if (!sendResult.success) {
          console.error("Message send failed:", sendResult.error);
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

    // Initialize components with appState
    components.chatContainer = new ChatContainer(document.getElementById("chat-container"), {
      appState,
    });

    // Setup scroll detection to prevent scroll fighting during streaming
    setupScrollDetection(components.chatContainer.getElement());

    components.filePanel = new FilePanel(
      document.getElementById("files-panel"),
      document.getElementById("open-files-btn"),
      document.getElementById("files-container"),
      document.getElementById("refresh-files-btn"),
      document.getElementById("tab-sources"),
      document.getElementById("tab-output"),
      {
        appState,
      }
    );

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
        appState,
      });
    } else {
      console.warn("InputArea not initialized (missing send-btn or user-input)");
      components.inputArea = null;
    }

    // Make components globally accessible
    window.components = components;

    return {
      ...components,
      sendMessage, // Export for use in Phase 5 (event handlers)
    };
  } catch (error) {
    console.error("Phase 4 failed:", error);
    throw new Error(`Component initialization failed: ${error.message}`);
  }
}
