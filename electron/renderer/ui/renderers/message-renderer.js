/**
 * MessageRenderer - Pure functions for rendering messages
 * NO DEPENDENCIES on services or global state
 *
 * Input: View models from MessageViewModel
 * Output: DOM elements via DOMAdapter
 */

/**
 * Render a single message to DOM
 *
 * @param {Object} viewModel - Message view model from MessageViewModel
 * @param {Object} domAdapter - DOM adapter for platform-agnostic DOM operations
 * @returns {HTMLElement} Message element
 */
export function renderMessage(viewModel, domAdapter) {
  const messageDiv = domAdapter.createElement("div");
  domAdapter.addClass(messageDiv, ...viewModel.baseClasses.split(" "));
  domAdapter.setAttribute(messageDiv, "data-message-id", viewModel.id);

  const contentDiv = domAdapter.createElement("div");
  domAdapter.addClass(contentDiv, ...viewModel.contentClasses.split(" "));

  if (viewModel.shouldRenderMarkdown) {
    // Markdown content - will be processed by markdown-renderer
    domAdapter.setInnerHTML(contentDiv, viewModel.content);
  } else {
    // Plain text content
    domAdapter.setTextContent(contentDiv, viewModel.content);
  }

  domAdapter.appendChild(messageDiv, contentDiv);

  return messageDiv;
}

/**
 * Render a batch of messages to a document fragment
 * More efficient than rendering one-by-one
 *
 * @param {Array<Object>} viewModels - Array of message view models
 * @param {Object} domAdapter - DOM adapter
 * @returns {DocumentFragment} Fragment containing all messages
 */
export function renderMessageBatch(viewModels, domAdapter) {
  const fragment = domAdapter.getDocument().createDocumentFragment();

  for (const viewModel of viewModels) {
    const messageElement = renderMessage(viewModel, domAdapter);
    fragment.appendChild(messageElement);
  }

  return fragment;
}

/**
 * Render user message (optimized path)
 *
 * @param {string} content - Message content
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} User message element
 */
export function renderUserMessage(content, domAdapter) {
  const messageDiv = domAdapter.createElement("div");
  domAdapter.addClass(messageDiv, "message", "mb-6", "animate-slideIn", "user", "text-left");
  domAdapter.setAttribute(
    messageDiv,
    "data-message-id",
    `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  );

  const contentDiv = domAdapter.createElement("div");
  domAdapter.addClass(
    contentDiv,
    "inline-block",
    "py-3",
    "px-4",
    "rounded-2xl",
    "max-w-[70%]",
    "break-words",
    "whitespace-pre-wrap",
    "leading-snug",
    "min-h-6",
    "bg-user-gradient",
    "text-white"
  );
  domAdapter.setTextContent(contentDiv, content);

  domAdapter.appendChild(messageDiv, contentDiv);

  return messageDiv;
}

/**
 * Render assistant message (optimized path)
 *
 * @param {string} content - Message content (markdown)
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Assistant message element
 */
export function renderAssistantMessage(content, domAdapter) {
  const messageDiv = domAdapter.createElement("div");
  domAdapter.addClass(messageDiv, "message", "mb-6", "animate-slideIn", "assistant");
  domAdapter.setAttribute(
    messageDiv,
    "data-message-id",
    `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  );

  const contentDiv = domAdapter.createElement("div");
  domAdapter.addClass(
    contentDiv,
    "message-content",
    "text-gray-800",
    "dark:text-slate-100",
    "max-w-full",
    "block",
    "py-4",
    "px-0",
    "leading-relaxed",
    "break-words",
    "whitespace-pre-wrap"
  );
  domAdapter.setInnerHTML(contentDiv, content); // Markdown already rendered

  domAdapter.appendChild(messageDiv, contentDiv);

  return messageDiv;
}

/**
 * Render error message
 *
 * @param {string} content - Error message content
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} Error message element
 */
export function renderErrorMessage(content, domAdapter) {
  const messageDiv = domAdapter.createElement("div");
  domAdapter.addClass(messageDiv, "message", "mb-6", "animate-slideIn", "error");
  domAdapter.setAttribute(
    messageDiv,
    "data-message-id",
    `msg-${Date.now()}-error-${Math.random().toString(36).substring(2, 11)}`
  );

  const contentDiv = domAdapter.createElement("div");
  domAdapter.addClass(
    contentDiv,
    "inline-block",
    "py-3",
    "px-4",
    "rounded-2xl",
    "max-w-[70%]",
    "break-words",
    "whitespace-pre-wrap",
    "leading-snug",
    "min-h-6",
    "bg-red-50",
    "text-red-900"
  );
  domAdapter.setTextContent(contentDiv, content);

  domAdapter.appendChild(messageDiv, contentDiv);

  return messageDiv;
}

/**
 * Render system message
 *
 * @param {string} content - System message content
 * @param {Object} domAdapter - DOM adapter
 * @returns {HTMLElement} System message element
 */
export function renderSystemMessage(content, domAdapter) {
  const messageDiv = domAdapter.createElement("div");
  domAdapter.addClass(messageDiv, "message", "mb-6", "animate-slideIn", "system");
  domAdapter.setAttribute(
    messageDiv,
    "data-message-id",
    `msg-${Date.now()}-system-${Math.random().toString(36).substring(2, 11)}`
  );

  const contentDiv = domAdapter.createElement("div");
  domAdapter.addClass(
    contentDiv,
    "inline-block",
    "py-3",
    "px-4",
    "rounded-2xl",
    "max-w-[70%]",
    "break-words",
    "whitespace-pre-wrap",
    "leading-snug",
    "min-h-6",
    "bg-amber-50",
    "text-amber-900",
    "text-sm",
    "italic"
  );
  domAdapter.setTextContent(contentDiv, content);

  domAdapter.appendChild(messageDiv, contentDiv);

  return messageDiv;
}

/**
 * Update message content (for streaming updates)
 *
 * @param {HTMLElement} messageElement - Existing message element
 * @param {string} newContent - Updated content
 * @param {Object} domAdapter - DOM adapter
 */
export function updateMessageContent(messageElement, newContent, domAdapter) {
  const contentDiv = domAdapter.querySelector(messageElement, '.message-content, div[class*="inline-block"]');

  if (!contentDiv) {
    console.warn("updateMessageContent: Content div not found");
    return;
  }

  // Preserve whether it's markdown or plain text
  const isMarkdown = domAdapter.hasClass(contentDiv, "message-content");

  if (isMarkdown) {
    domAdapter.setInnerHTML(contentDiv, newContent);
  } else {
    domAdapter.setTextContent(contentDiv, newContent);
  }
}

/**
 * Get message content from element
 *
 * @param {HTMLElement} messageElement - Message element
 * @param {Object} domAdapter - DOM adapter
 * @returns {string} Message content
 */
export function getMessageContent(messageElement, domAdapter) {
  const contentDiv = domAdapter.querySelector(messageElement, '.message-content, div[class*="inline-block"]');
  return contentDiv ? domAdapter.getTextContent(contentDiv) : "";
}

/**
 * Get message ID from element
 *
 * @param {HTMLElement} messageElement - Message element
 * @param {Object} domAdapter - DOM adapter
 * @returns {string|null} Message ID
 */
export function getMessageId(messageElement, domAdapter) {
  return domAdapter.getAttribute(messageElement, "data-message-id");
}
