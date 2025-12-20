/**
 * StreamManager - Manages per-session streaming state for concurrent sessions.
 *
 * Phase 2: Concurrent Session Processing
 * Handles buffering, state reconstruction, and active stream tracking.
 *
 * Key Responsibilities:
 * - Per-session stream lifecycle (start, append, end)
 * - Background session event buffering (tool cards)
 * - Stream state reconstruction on session switch
 * - Active stream count tracking (for max concurrent limit)
 * - Session cleanup on switch away
 *
 * Usage:
 *   const streamManager = new StreamManager(appState);
 *   streamManager.startStream(sessionId);
 *   streamManager.appendToBuffer(sessionId, content);
 *   const isActive = streamManager.isStreaming(sessionId);
 *   streamManager.endStream(sessionId);
 */

export class StreamManager {
  /**
   * @param {Object} appState - AppState instance with sessionStreams Map
   */
  constructor(appState) {
    this.appState = appState;
  }

  /**
   * Start streaming for a session.
   * Initializes or resets streaming state for the session.
   *
   * @param {string} sessionId - Session ID to start streaming
   */
  startStream(sessionId) {
    const state = this.appState.getSessionStreamState(sessionId);
    state.isStreaming = true;
    state.assistantBuffer = "";
    state.interrupted = false;
  }

  /**
   * Append content to session's assistant buffer.
   *
   * @param {string} sessionId - Session ID
   * @param {string} content - Content to append
   */
  appendToBuffer(sessionId, content) {
    const state = this.appState.getSessionStreamState(sessionId);
    state.assistantBuffer += content;
  }

  /**
   * End streaming for a session.
   * Marks stream as complete but preserves state for potential reconstruction.
   *
   * @param {string} sessionId - Session ID to end streaming
   */
  endStream(sessionId) {
    const state = this.appState.getSessionStreamState(sessionId);
    state.isStreaming = false;
  }

  /**
   * Get the current buffer content for a session.
   *
   * @param {string} sessionId - Session ID
   * @returns {string} Current buffer content
   */
  getBuffer(sessionId) {
    if (!this.appState.sessionStreams.has(sessionId)) {
      return "";
    }
    const state = this.appState.getSessionStreamState(sessionId);
    return state.assistantBuffer;
  }

  /**
   * Set (replace) the entire buffer content for a session.
   * Used when switching away from active session to sync appState buffer to streamManager.
   *
   * @param {string} sessionId - Session ID
   * @param {string} content - Content to set as the buffer
   */
  setBuffer(sessionId, content) {
    const state = this.appState.getSessionStreamState(sessionId);
    state.assistantBuffer = content;
  }

  /**
   * Check if a session is currently streaming.
   *
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if session is actively streaming
   */
  isStreaming(sessionId) {
    if (!this.appState.sessionStreams.has(sessionId)) {
      return false;
    }
    const state = this.appState.getSessionStreamState(sessionId);
    return state.isStreaming;
  }

  /**
   * Get count of currently streaming sessions.
   * Used for enforcing max concurrent stream limit.
   *
   * @returns {number} Number of active streams
   */
  getActiveStreamCount() {
    let count = 0;
    for (const [, state] of this.appState.sessionStreams) {
      if (state.isStreaming) count++;
    }
    return count;
  }

  /**
   * Buffer a tool event for a background session.
   * Accumulates tool state so it can be reconstructed when switching to session.
   *
   * @param {string} sessionId - Session ID
   * @param {string} callId - Function call ID
   * @param {string} eventType - Event type: "start" | "arguments_delta" | "end"
   * @param {Object} data - Event data (name, delta, result, error)
   */
  bufferToolEvent(sessionId, callId, eventType, data) {
    const state = this.appState.getSessionStreamState(sessionId);

    if (eventType === "start") {
      state.functionCalls.set(callId, {
        name: data.name,
        arguments: "",
        status: "running",
        result: null,
      });
    } else if (eventType === "arguments_delta") {
      const tool = state.functionCalls.get(callId);
      if (tool) {
        tool.arguments += data.delta;
      }
    } else if (eventType === "end") {
      const tool = state.functionCalls.get(callId);
      if (tool) {
        tool.status = data.error ? "error" : "completed";
        tool.result = data.result || data.error;
      }
    }
  }

  /**
   * Get all buffered tool states for a session.
   * Used for reconstructing tool cards when switching to session.
   *
   * @param {string} sessionId - Session ID
   * @returns {Array<[string, Object]>} Array of [callId, toolState] entries
   *
   * Each toolState: { name, arguments, status, result }
   */
  getBufferedTools(sessionId) {
    const state = this.appState.getSessionStreamState(sessionId);
    return Array.from(state.functionCalls.entries());
  }

  /**
   * Clean up session state.
   * Called on switch away after stream completes to free memory.
   *
   * @param {string} sessionId - Session ID to clean up
   */
  cleanupSession(sessionId) {
    this.appState.clearSessionStreamState(sessionId);
  }
}

export default StreamManager;
