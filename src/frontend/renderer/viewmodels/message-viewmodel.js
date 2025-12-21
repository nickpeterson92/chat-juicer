/**
 * MessageViewModel - Pure data transformation for message display
 * Transforms domain message objects into UI-ready data structures
 *
 * NO DEPENDENCIES on DOM, IPC, or Storage - pure functions only
 */

/**
 * Parse message content to extract displayable text
 * Handles various content structures from historical message data
 *
 * @param {string|Array|Object} content - Raw message content
 * @returns {string} Parsed content as string
 *
 * @example
 * // String content (most common)
 * parseMessageContent("Hello") // => "Hello"
 *
 * // Array of content parts
 * parseMessageContent([{text: "Hi"}, {text: "there"}]) // => "Hithere"
 *
 * // Complex object
 * parseMessageContent({data: "value"}) // => '{"data":"value"}'
 */
export function parseMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.text) return item.text;
        if (item?.output) return item.output;
        return "";
      })
      .filter((text) => text);
    return textParts.join("");
  }

  // Fallback: stringify objects
  return JSON.stringify(content);
}

/**
 * Transform message object to view model for UI rendering
 *
 * @param {Object} msg - Message object from backend
 * @param {string} msg.role - Message role
 * @param {string|Array|Object} msg.content - Message content
 * @returns {Object} View model with UI-ready data
 * @returns {string} return.id - Unique message ID
 * @returns {string} return.role - Message role (user|assistant|system|error)
 * @returns {string} return.content - Parsed content string
 * @returns {string} return.baseClasses - CSS classes for message container
 * @returns {string} return.contentClasses - CSS classes for content div
 * @returns {boolean} return.shouldRenderMarkdown - Whether to render as markdown
 *
 * @example
 * const viewModel = createMessageViewModel({
 *   role: "user",
 *   content: "Hello"
 * });
 * // => {
 * //   id: "msg-123456789-abc",
 * //   role: "user",
 * //   content: "Hello",
 * //   baseClasses: "message mb-6 ...",
 * //   contentClasses: "inline-block py-3 ...",
 * //   shouldRenderMarkdown: false
 * // }
 */
export function createMessageViewModel(msg) {
  const role = msg.role || "assistant";
  const content = parseMessageContent(msg.content);
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  // Base classes for all messages
  const baseClasses = "message mb-6 animate-slideIn [contain:layout_style]";

  // Type-specific classes
  const typeClassMap = {
    user: "user text-left",
    assistant: "assistant",
    system: "system",
    error: "error",
  };

  const typeClasses = typeClassMap[role] || "";

  // Content div classes based on message type
  const contentClassMap = {
    user: "inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-user-gradient text-white",
    assistant:
      "message-content text-gray-800 dark:text-slate-100 max-w-full block py-4 px-0 leading-relaxed break-words whitespace-pre-wrap",
    system:
      "inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-amber-50 text-amber-900 text-sm italic",
    error:
      "inline-block py-3 px-4 rounded-2xl max-w-[70%] break-words whitespace-pre-wrap leading-snug min-h-6 bg-red-50 text-red-900",
  };

  const contentClasses = contentClassMap[role] || contentClassMap.assistant;

  return {
    id: messageId,
    role,
    content,
    baseClasses: `${baseClasses} ${typeClasses}`.trim(),
    contentClasses,
    shouldRenderMarkdown: role === "assistant",
  };
}

/**
 * Validate message object structure
 *
 * @param {any} msg - Message to validate
 * @returns {Object} Validation result
 * @returns {boolean} return.valid - Whether message is valid
 * @returns {string|null} return.error - Error message if invalid
 *
 * @example
 * validateMessage({role: "user", content: "Hello"})
 * // => {valid: true, error: null}
 *
 * validateMessage({role: "user"})
 * // => {valid: false, error: "Message must have content"}
 */
export function validateMessage(msg) {
  if (!msg || typeof msg !== "object") {
    return { valid: false, error: "Message must be an object" };
  }

  if (!msg.role) {
    return { valid: false, error: "Message must have a role" };
  }

  if (msg.content === undefined || msg.content === null) {
    return { valid: false, error: "Message must have content" };
  }

  // Check for empty strings
  const parsedContent = parseMessageContent(msg.content);
  if (typeof parsedContent === "string" && parsedContent.trim() === "") {
    return { valid: false, error: "Message content cannot be empty" };
  }

  const allowedRoles = ["user", "assistant", "system", "error"];
  if (!allowedRoles.includes(msg.role)) {
    return { valid: false, error: `Invalid role: ${msg.role}. Must be one of: ${allowedRoles.join(", ")}` };
  }

  return { valid: true, error: null };
}
