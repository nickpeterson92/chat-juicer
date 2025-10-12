/**
 * Chat UI components for message rendering and display
 */

import { MAX_MESSAGES } from "../config/constants.js";

/**
 * Add a message to the chat container
 * @param {HTMLElement} chatContainer - The chat container element
 * @param {string} content - Message content
 * @param {string} type - Message type (user|assistant|system|error)
 * @returns {HTMLElement} The message content element
 */
export function addMessage(chatContainer, content, type = "assistant") {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.textContent = content;

  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  // Limit message history to prevent memory issues
  const messages = chatContainer.querySelectorAll(".message");
  if (messages.length > MAX_MESSAGES) {
    // Remove oldest messages, keeping recent ones
    const toRemove = messages.length - MAX_MESSAGES;
    for (let i = 0; i < toRemove; i++) {
      messages[i].remove();
    }
  }

  // Auto-scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;

  return contentDiv;
}

/**
 * Update the current assistant message (for streaming)
 * @param {HTMLElement} chatContainer - The chat container element
 * @param {HTMLElement} currentAssistantElement - The current assistant text element
 * @param {string} content - New content to display
 */
export function updateAssistantMessage(chatContainer, currentAssistantElement, content) {
  if (!currentAssistantElement) {
    return;
  }

  // Hide loading dots when we have content
  const messageDiv = currentAssistantElement.closest(".message");
  if (messageDiv && content.length > 0) {
    const loadingDots = messageDiv.querySelector(".loading-dots");
    if (loadingDots) {
      loadingDots.style.display = "none";
    }
  }

  currentAssistantElement.textContent = content;
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Create a new assistant message with streaming indicator
 * @param {HTMLElement} chatContainer - The chat container element
 * @returns {HTMLElement} The text span element for streaming content
 */
export function createStreamingAssistantMessage(chatContainer) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message assistant streaming";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  // Add loading dots initially
  const loadingSpan = document.createElement("span");
  loadingSpan.className = "loading-dots";
  loadingSpan.innerHTML = "<span>•</span><span>•</span><span>•</span>";

  const textSpan = document.createElement("span");
  textSpan.className = "streaming-text";

  contentDiv.appendChild(loadingSpan);
  contentDiv.appendChild(textSpan);
  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  // Auto-scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;

  return textSpan;
}

/**
 * Complete the streaming message by removing indicators
 * @param {HTMLElement} chatContainer - The chat container element
 */
export function completeStreamingMessage(chatContainer) {
  const streamingMsg = chatContainer.querySelector(".message.assistant.streaming");
  if (streamingMsg) {
    streamingMsg.classList.remove("streaming");
    const cursor = streamingMsg.querySelector(".streaming-cursor");
    if (cursor) {
      cursor.remove();
    }
  }
}

/**
 * Clear all messages from chat container
 * @param {HTMLElement} chatContainer - The chat container element
 */
export function clearChat(chatContainer) {
  chatContainer.innerHTML = "";
}
