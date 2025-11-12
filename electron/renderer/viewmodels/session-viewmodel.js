/**
 * SessionViewModel - Pure data transformation for session display
 * Transforms domain session objects into UI-ready data structures
 *
 * NO DEPENDENCIES on DOM, IPC, or Storage - pure functions only
 */

/**
 * Format timestamp for display
 *
 * @param {number|string|Date} timestamp - Timestamp in various formats
 * @returns {string} Formatted timestamp (e.g., "2 hours ago", "Jan 15, 2025")
 *
 * @example
 * formatTimestamp(Date.now() - 3600000) // => "1 hour ago"
 * formatTimestamp("2025-01-15T10:30:00") // => "Jan 15, 2025"
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return "Unknown";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  const now = Date.now();
  const diff = now - date.getTime();

  // Less than 1 minute
  if (diff < 60 * 1000) {
    return "Just now";
  }

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  }

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }

  // Less than 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  }

  // Format as date
  const options = { month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString(undefined, options);
}

/**
 * Generate default session title based on timestamp
 *
 * @param {number|string|Date} timestamp - Session creation timestamp
 * @returns {string} Default title (e.g., "Chat - Jan 15, 10:30 AM")
 *
 * @example
 * generateDefaultTitle(Date.now())
 * // => "Chat - Jan 15, 10:30 AM"
 */
export function generateDefaultTitle(timestamp) {
  if (!timestamp) return "Untitled Chat";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Untitled Chat";

  const options = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };

  const formatted = date.toLocaleDateString(undefined, options);
  return `Chat - ${formatted}`;
}

/**
 * Transform session object to view model for UI rendering
 *
 * @param {Object} session - Session object from backend
 * @param {string} session.session_id - Unique session ID
 * @param {string} session.title - Session title
 * @param {number|string} session.created_at - Creation timestamp
 * @param {number|string} session.updated_at - Last update timestamp
 * @param {boolean} isActive - Whether this is the active session
 * @returns {Object} View model with UI-ready data
 *
 * @example
 * const viewModel = createSessionViewModel({
 *   session_id: "abc123",
 *   title: "My Chat",
 *   created_at: 1704067200000,
 *   updated_at: 1704070800000
 * }, true);
 * // => {
 * //   id: "abc123",
 * //   title: "My Chat",
 * //   displayTitle: "My Chat",
 * //   formattedDate: "1 hour ago",
 * //   isActive: true,
 * //   classes: "session-item active"
 * // }
 */
export function createSessionViewModel(session, isActive = false) {
  const id = session.session_id || session.id;
  const title = session.title || generateDefaultTitle(session.created_at);
  const formattedDate = formatTimestamp(session.updated_at || session.created_at);

  return {
    id,
    title,
    displayTitle: title,
    formattedDate,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    isActive,
    classes: `session-item${isActive ? " active" : ""}`,
  };
}

/**
 * Transform array of sessions to view models
 * Sorts by updated_at (most recent first)
 *
 * @param {Array<Object>} sessions - Array of session objects
 * @param {string|null} activeSessionId - ID of currently active session
 * @returns {Array<Object>} Array of view models sorted by recency
 *
 * @example
 * const viewModels = createSessionListViewModel(
 *   [{session_id: "1", ...}, {session_id: "2", ...}],
 *   "1"
 * );
 * // => [viewModel1, viewModel2] sorted by updated_at
 */
export function createSessionListViewModel(sessions, activeSessionId = null) {
  if (!Array.isArray(sessions)) {
    return [];
  }

  // Sort by updated_at (most recent first)
  const sorted = [...sessions].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime();
    const bTime = new Date(b.updated_at || b.created_at).getTime();
    return bTime - aTime; // Descending order
  });

  return sorted.map((session) => {
    const id = session.session_id || session.id;
    return createSessionViewModel(session, id === activeSessionId);
  });
}

/**
 * Validate session object structure
 *
 * @param {any} session - Session to validate
 * @returns {Object} Validation result
 * @returns {boolean} return.valid - Whether session is valid
 * @returns {string|null} return.error - Error message if invalid
 *
 * @example
 * validateSession({session_id: "abc", title: "Chat"})
 * // => {valid: true, error: null}
 *
 * validateSession({title: "Chat"})
 * // => {valid: false, error: "Session must have session_id or id"}
 */
export function validateSession(session) {
  if (!session || typeof session !== "object") {
    return { valid: false, error: "Session must be an object" };
  }

  if (!session.session_id && !session.id) {
    return { valid: false, error: "Session must have session_id or id" };
  }

  return { valid: true, error: null };
}

/**
 * Truncate session title for display in constrained spaces
 *
 * @param {string} title - Session title
 * @param {number} maxLength - Maximum length (default: 50)
 * @returns {string} Truncated title with ellipsis if needed
 *
 * @example
 * truncateSessionTitle("A very long session title...", 10)
 * // => "A very lon..."
 */
export function truncateSessionTitle(title, maxLength = 50) {
  if (!title) return "Untitled";

  if (title.length <= maxLength) {
    return title;
  }

  return `${title.substring(0, maxLength)}...`;
}

/**
 * Calculate session age in days
 *
 * @param {number|string|Date} timestamp - Session creation timestamp
 * @returns {number} Age in days (rounded down)
 *
 * @example
 * calculateSessionAge(Date.now() - 5 * 24 * 60 * 60 * 1000)
 * // => 5
 */
export function calculateSessionAge(timestamp) {
  if (!timestamp) return 0;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 0;

  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  return Math.max(0, days);
}
