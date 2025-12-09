/**
 * Chat UI components for message rendering and display
 * Optimized with DOM caching and batched scroll updates
 */

import smokeAnimationData from "../../../ui/Smoke.json";
import { CRITICAL_COLORS } from "../config/colors.js";
import { MAX_MESSAGES } from "../config/constants.js";
import { ComponentLifecycle } from "../core/component-lifecycle.js";
import { globalLifecycleManager } from "../core/lifecycle-manager.js";
import { initLottieWithColor } from "../utils/lottie-color.js";
import { initializeCodeCopyButtons, processMermaidDiagrams, renderMarkdown } from "../utils/markdown-renderer.js";
import { scheduleScroll } from "../utils/scroll-utils.js";

// Message cache for O(1) message management (replaces O(n) querySelectorAll)
const messageCache = new Map();

// RAF batching state for streaming updates
// Coalesces rapid token updates into single render per frame (~60fps)
let pendingRenderContent = null;
let pendingRenderElement = null;
let pendingRenderContainer = null;
let pendingRenderRAF = null;

// Chat UI component for lifecycle management
const chatUIComponent = {};

// Initialize chat UI component once
if (!chatUIComponent._lifecycle) {
  ComponentLifecycle.mount(chatUIComponent, "ChatUI", globalLifecycleManager);
}

// Lightweight render cache to avoid re-rendering identical markdown (e.g., on session reopen)
const renderCache = new Map();
const MAX_RENDER_CACHE = 200;

function cacheRenderedMarkdown(content, isComplete, html) {
  const key = `${isComplete ? "C" : "P"}:${content}`;
  renderCache.set(key, html);
  if (renderCache.size > MAX_RENDER_CACHE) {
    const firstKey = renderCache.keys().next().value;
    renderCache.delete(firstKey);
  }
  return html;
}

function getCachedRenderedMarkdown(content, isComplete) {
  const key = `${isComplete ? "C" : "P"}:${content}`;
  return renderCache.get(key);
}

/**
 * Add a message to the chat container
 * @param {HTMLElement} chatContainer - The chat container element
 * @param {string} content - Message content
 * @param {string} type - Message type (user|assistant|system|error)
 * @param {Object} options - Additional options
 * @param {boolean} options.partial - Whether this is a partial/interrupted response
 * @returns {HTMLElement} The message content element
 */
export function createMessageElement(chatContainer, content, type = "assistant", options = {}) {
  const messageDiv = document.createElement("div");
  // Base message styles + type-specific styles
  const baseClasses = "message mb-6 animate-slideIn [contain:layout_style]";
  const typeClasses = {
    user: "user text-left",
    assistant: "assistant",
    system: "system",
    error: "error",
  };
  messageDiv.className = `${baseClasses} ${typeClasses[type] || ""}`;

  // Add partial indicator class if this is an interrupted response
  if (options.partial && type === "assistant") {
    messageDiv.classList.add("message-partial");
  }

  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  messageDiv.dataset.messageId = messageId;

  const contentDiv = document.createElement("div");
  // Content styles based on message type
  if (type === "user") {
    contentDiv.className =
      "inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-user-gradient text-white";
  } else if (type === "assistant") {
    contentDiv.className =
      "message-content text-gray-800 dark:text-slate-100 max-w-full block py-4 px-0 leading-relaxed break-words whitespace-pre-wrap";
  } else if (type === "system") {
    contentDiv.className =
      "inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-amber-50 text-amber-900 text-sm italic";
  } else if (type === "error") {
    contentDiv.className =
      "inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-red-50 text-red-900";
  }

  // Render markdown for assistant messages, plain text for others
  if (type === "assistant") {
    const cached = getCachedRenderedMarkdown(content, true);
    if (cached) {
      contentDiv.innerHTML = cached;
      chatUIComponent.setTimeout(() => {
        processMermaidDiagrams(contentDiv)
          .catch((err) => window.electronAPI.log("error", "Mermaid processing error", { error: err.message }))
          .finally(() => {
            initializeCodeCopyButtons(contentDiv);
            if (chatContainer) {
              scheduleScroll(chatContainer);
            }
          });
      }, 0);
    } else {
      contentDiv.innerHTML = renderMarkdown(content, true); // isComplete = true for static messages
      chatUIComponent.setTimeout(() => {
        processMermaidDiagrams(contentDiv)
          .catch((err) => window.electronAPI.log("error", "Mermaid processing error", { error: err.message }))
          .finally(() => {
            initializeCodeCopyButtons(contentDiv);
            cacheRenderedMarkdown(content, true, contentDiv.innerHTML);
            if (chatContainer) {
              scheduleScroll(chatContainer);
            }
          });
      }, 0);
    }
  } else {
    contentDiv.textContent = content;
  }

  messageDiv.appendChild(contentDiv);

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

  return { messageDiv, contentDiv };
}

export function addMessage(chatContainer, content, type = "assistant", options = {}) {
  const { messageDiv, contentDiv } = createMessageElement(chatContainer, content, type, options);
  chatContainer.appendChild(messageDiv);

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
/**
 * Update assistant message with new streaming content - RAF BATCHED RENDERING
 * Uses requestAnimationFrame to coalesce rapid token updates (~60fps batching)
 * This prevents UI thread blocking during heavy streaming and keeps session switching responsive
 * @param {HTMLElement} chatContainer - The chat container element
 * @param {HTMLElement} currentAssistantElement - The current assistant text element
 * @param {string} content - New content to display
 */
export function updateAssistantMessage(chatContainer, currentAssistantElement, content) {
  if (!currentAssistantElement) {
    return;
  }

  // Store latest content - will be rendered on next animation frame
  pendingRenderContent = content;
  pendingRenderElement = currentAssistantElement;
  pendingRenderContainer = chatContainer;

  // Schedule RAF render if not already pending
  if (!pendingRenderRAF) {
    pendingRenderRAF = requestAnimationFrame(() => {
      // Clear RAF handle first so new updates can schedule
      pendingRenderRAF = null;

      // Render the latest content (skips intermediate states)
      if (pendingRenderElement && pendingRenderContent !== null) {
        pendingRenderElement.innerHTML = renderMarkdown(pendingRenderContent);

        // DO NOT process Mermaid during streaming - it causes race conditions
        // Mermaid will be processed after streaming completes in handleAssistantEnd

        // Smart scroll - content growth detection handles large chunks automatically
        scheduleScroll(pendingRenderContainer);
      }
    });
  }
}

/**
 * Cancel any pending RAF render and FLUSH pending content
 * CRITICAL: Renders any pending content immediately before clearing state
 * Otherwise the final streaming content gets lost when stream ends
 * Called on stream completion or session switch
 */
export function cancelPendingRender() {
  if (pendingRenderRAF) {
    cancelAnimationFrame(pendingRenderRAF);
    pendingRenderRAF = null;
  }

  // CRITICAL: Render any pending content immediately before clearing
  // This ensures the final tokens aren't lost when streaming ends
  if (pendingRenderContent !== null && pendingRenderElement) {
    pendingRenderElement.innerHTML = renderMarkdown(pendingRenderContent);

    if (pendingRenderContainer) {
      scheduleScroll(pendingRenderContainer);
    }
  }

  // Clear state after flushing
  pendingRenderContent = null;
  pendingRenderElement = null;
  pendingRenderContainer = null;
}

/**
 * Create a new assistant message with streaming indicator
 * @param {HTMLElement} chatContainer - The chat container element
 * @returns {HTMLElement} The text span element for streaming content
 */
export function createStreamingAssistantMessage(chatContainer) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message assistant mb-6 animate-slideIn [contain:layout_style] streaming";
  messageDiv.dataset.streaming = "true";
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  messageDiv.dataset.messageId = messageId;

  const contentDiv = document.createElement("div");
  contentDiv.className =
    "message-content text-gray-800 dark:text-slate-100 max-w-full block py-4 px-0 leading-relaxed break-words whitespace-pre-wrap";

  // Add loading indicator (start with dot, replace with Lottie if available)
  const loadingSpan = document.createElement("span");
  loadingSpan.className = "loading-lamp";
  // Use CRITICAL_COLORS for guaranteed brand color availability (no CSS variable timing dependency)
  const brandColor = CRITICAL_COLORS.BRAND_PRIMARY;
  loadingSpan.style.cssText = `display: inline-block !important; width: 48px; height: 48px; vertical-align: middle; margin-right: 8px; opacity: 1; line-height: 48px; text-align: center; font-size: 32px; color: ${brandColor}; font-weight: bold;`;
  loadingSpan.textContent = "●"; // Start with visible fallback in brand blue

  const textSpan = document.createElement("span");
  textSpan.className = "streaming-text";

  contentDiv.appendChild(loadingSpan);
  contentDiv.appendChild(textSpan);
  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);

  // Initialize Lottie animation immediately after element is in DOM
  requestAnimationFrame(() => {
    try {
      // Clear the dot before initializing Lottie
      loadingSpan.textContent = "";

      // Use CRITICAL_COLORS for guaranteed brand color availability (no CSS variable timing dependency)
      const safeBrandColor = CRITICAL_COLORS.BRAND_PRIMARY;

      const animation = initLottieWithColor(loadingSpan, smokeAnimationData, safeBrandColor);
      if (!animation) {
        console.error("Failed to initialize Lottie animation");
        loadingSpan.textContent = "●"; // Restore fallback if Lottie fails
      }
    } catch (error) {
      console.error("[Chat UI] Error loading Lottie:", error);
      loadingSpan.textContent = "●"; // Restore fallback on error
    }
  });

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
  const streamingMsg = chatContainer.querySelector("[data-streaming='true']");
  if (streamingMsg) {
    streamingMsg.classList.remove("streaming");
    streamingMsg.removeAttribute("data-streaming");

    // Remove streaming cursor
    const cursor = streamingMsg.querySelector(".streaming-cursor");
    if (cursor) {
      cursor.remove();
    }

    // Fade out loading smoke animation over 800ms before removing (lifecycle-managed)
    const loadingLamp = streamingMsg.querySelector(".loading-lamp");
    if (loadingLamp) {
      loadingLamp.style.transition = "opacity 800ms ease-out";
      loadingLamp.style.opacity = "0";
      chatUIComponent.setTimeout(() => {
        loadingLamp.remove();
      }, 800);
    }

    // Note: Mermaid processing is handled in handleAssistantEnd to avoid race conditions
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
