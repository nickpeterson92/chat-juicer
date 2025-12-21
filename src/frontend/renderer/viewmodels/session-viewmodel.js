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
