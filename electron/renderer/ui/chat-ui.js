/**
 * Chat UI components for message rendering and display
 * Optimized with DOM caching and batched scroll updates
 */

import { MAX_MESSAGES } from "../config/constants.js";
import { processMermaidDiagrams, renderMarkdown } from "../utils/markdown-renderer.js";
import { scheduleScroll } from "../utils/scroll-utils.js";

// Message cache for O(1) message management (replaces O(n) querySelectorAll)
const messageCache = new Map();

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
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  messageDiv.dataset.messageId = messageId;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  // Render markdown for assistant messages, plain text for others
  if (type === "assistant") {
    contentDiv.innerHTML = renderMarkdown(content);
    // Process Mermaid diagrams asynchronously after DOM insertion
    setTimeout(() => {
      processMermaidDiagrams(contentDiv).catch((err) =>
        window.electronAPI.log("error", "Mermaid processing error", { error: err.message })
      );
    }, 0);
  } else {
    contentDiv.textContent = content;
  }

  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  // Cache reference for O(1) access
  messageCache.set(messageId, messageDiv);

  // Limit message history using cache size (O(1) instead of O(n) querySelectorAll)
  if (messageCache.size > MAX_MESSAGES) {
    // Remove oldest message
    const firstKey = messageCache.keys().next().value;
    const oldMsg = messageCache.get(firstKey);
    if (oldMsg) {
      oldMsg.remove();
    }
    messageCache.delete(firstKey);
  }

  // Batched scroll update (prevents layout thrashing during streaming)
  scheduleScroll(chatContainer);

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
    const loadingDots = messageDiv.querySelector(".loading-lamp");
    if (loadingDots) {
      loadingDots.style.display = "none";
    }
  }

  // Render markdown during streaming
  currentAssistantElement.innerHTML = renderMarkdown(content);

  // DO NOT process Mermaid during streaming - it causes race conditions
  // Mermaid will be processed after streaming completes in handleAssistantEnd

  // Batched scroll update
  scheduleScroll(chatContainer);
}

/**
 * Create a new assistant message with streaming indicator
 * @param {HTMLElement} chatContainer - The chat container element
 * @returns {HTMLElement} The text span element for streaming content
 */
export function createStreamingAssistantMessage(chatContainer) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message assistant streaming";
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  messageDiv.dataset.messageId = messageId;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  // Add loading smoke animation initially (inline SVG with volumetric puffs)
  const loadingSpan = document.createElement("span");
  loadingSpan.className = "loading-lamp";
  loadingSpan.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="display: inline-block;">
      <defs>
        <filter id="smokeBlur">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2"/>
        </filter>
      </defs>
      <style>
        @keyframes puff1 { 0% { opacity: 0; transform: translateY(10px) scale(0.3); } 30% { opacity: 0.5; } 100% { opacity: 0; transform: translateY(-45px) scale(1.5); } }
        @keyframes puff2 { 0% { opacity: 0; transform: translateY(10px) scale(0.3); } 30% { opacity: 0.5; } 100% { opacity: 0; transform: translateY(-45px) scale(1.5); } }
        @keyframes puff3 { 0% { opacity: 0; transform: translateY(10px) scale(0.3); } 30% { opacity: 0.5; } 100% { opacity: 0; transform: translateY(-45px) scale(1.5); } }
        .puff-1 { animation: puff1 2.5s ease-out infinite; transform-origin: center; }
        .puff-2 { animation: puff2 2.5s ease-out infinite; animation-delay: 0.8s; transform-origin: center; }
        .puff-3 { animation: puff3 2.5s ease-out infinite; animation-delay: 1.6s; transform-origin: center; }
      </style>
      <ellipse class="puff-1" cx="32" cy="52" rx="8" ry="6" fill="#0066cc" filter="url(#smokeBlur)"/>
      <ellipse class="puff-2" cx="30" cy="52" rx="8" ry="6" fill="#0066cc" filter="url(#smokeBlur)"/>
      <ellipse class="puff-3" cx="34" cy="52" rx="8" ry="6" fill="#0066cc" filter="url(#smokeBlur)"/>
    </svg>
  `;

  const textSpan = document.createElement("span");
  textSpan.className = "streaming-text";

  contentDiv.appendChild(loadingSpan);
  contentDiv.appendChild(textSpan);
  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  // Cache reference
  messageCache.set(messageId, messageDiv);

  // Batched scroll update
  scheduleScroll(chatContainer);

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
  messageCache.clear(); // Critical: clear cache to prevent memory leaks
}

/**
 * Clear the message cache
 * Should be called on session switches and bot restarts
 */
export function clearMessageCache() {
  messageCache.clear();
}
