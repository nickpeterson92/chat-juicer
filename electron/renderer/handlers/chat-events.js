/**
 * Chat Event Handlers
 * Handles chat-related events and coordinates between UI and services
 */

import { prepareMessageForDisplay } from "../viewmodels/message-viewmodel.js";

/**
 * Setup chat event handlers
 *
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.chatContainer - Chat container component
 * @param {Object} dependencies.inputArea - Input area component
 * @param {Object} dependencies.messageService - Message service
 * @param {Object} dependencies.ipcAdapter - IPC adapter
 * @returns {Object} Event handler cleanup function
 */
export function setupChatEventHandlers({ chatContainer, inputArea, messageService, ipcAdapter }) {
  const handlers = [];

  // Handle user message send
  const handleSend = async (message) => {
    // Add user message to UI immediately
    chatContainer.addUserMessage(message);

    // Disable input while processing
    inputArea.disable();

    try {
      // Send message to backend
      await messageService.sendMessage(message);
    } catch (error) {
      console.error("Failed to send message:", error);
      // Show error in chat
      chatContainer.addAssistantMessage(`Error: ${error.message}`);
    } finally {
      // Re-enable input
      inputArea.enable();
      inputArea.focus();
    }
  };

  // Setup input send handler
  inputArea.onSend(handleSend);

  // Handle incoming assistant message
  const handleAssistantMessage = (data) => {
    const { content, messageId, isStreaming } = data;

    if (isStreaming) {
      // Update existing message for streaming
      chatContainer.updateMessage(messageId, content);
    } else {
      // Add new complete message
      chatContainer.addAssistantMessage(content, messageId);
    }
  };

  handlers.push(ipcAdapter.on("assistant-message", handleAssistantMessage));

  // Handle message history load
  const handleMessageHistory = (data) => {
    const { messages } = data;
    const viewModels = messages.map(prepareMessageForDisplay);
    chatContainer.setMessages(viewModels);
  };

  handlers.push(ipcAdapter.on("message-history", handleMessageHistory));

  // Handle streaming start
  const handleStreamStart = (data) => {
    const { messageId } = data;
    // Add placeholder message
    chatContainer.addAssistantMessage("", messageId);
  };

  handlers.push(ipcAdapter.on("stream-start", handleStreamStart));

  // Handle streaming chunk
  const handleStreamChunk = (data) => {
    const { messageId, content } = data;
    chatContainer.updateMessage(messageId, content);
  };

  handlers.push(ipcAdapter.on("stream-chunk", handleStreamChunk));

  // Handle streaming end
  const handleStreamEnd = (data) => {
    const { messageId } = data;
    // Nothing to do - message is already complete
    console.debug("Stream ended:", messageId);
  };

  handlers.push(ipcAdapter.on("stream-end", handleStreamEnd));

  // Handle error
  const handleError = (data) => {
    const { error, message } = data;
    const errorMessage = message || error || "An unknown error occurred";
    chatContainer.addAssistantMessage(`❌ Error: ${errorMessage}`);
    inputArea.enable();
  };

  handlers.push(ipcAdapter.on("error", handleError));

  // Return cleanup function
  return {
    cleanup: () => {
      for (const unsubscribe of handlers) {
        unsubscribe();
      }
    },
  };
}

/**
 * Handle chat clear event
 *
 * @param {Object} chatContainer - Chat container component
 */
export function handleChatClear(chatContainer) {
  chatContainer.clear();
}

/**
 * Handle chat scroll to bottom
 *
 * @param {Object} chatContainer - Chat container component
 * @param {boolean} smooth - Use smooth scrolling
 */
export function handleScrollToBottom(chatContainer, smooth = true) {
  chatContainer.scrollToBottom(smooth);
}

/**
 * Handle auto-scroll toggle
 *
 * @param {Object} chatContainer - Chat container component
 * @param {boolean} enabled - Enable auto-scroll
 */
export function handleAutoScrollToggle(chatContainer, enabled) {
  if (enabled) {
    chatContainer.enableAutoScroll();
  } else {
    chatContainer.disableAutoScroll();
  }
}
