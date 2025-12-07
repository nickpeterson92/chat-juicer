/**
 * FunctionCallService - Pure business logic for function call tracking
 * NO DEPENDENCIES on DOM - uses adapters for infrastructure
 *
 * Handles:
 * - Function call state management
 * - Call status tracking (pending, streaming, completed, error)
 * - Arguments buffering and parsing
 * - Call result management
 *
 * State Management:
 * - All function call state is now stored in AppState (single source of truth)
 * - FunctionCallService reads/writes state via appState.getState() and appState.setState()
 * - Uses appState.functions.activeCalls, argumentsBuffer, and completedCalls (BoundedMaps)
 */

/**
 * Function call states
 * @enum {string}
 */
export const CallStatus = {
  PENDING: "pending",
  STREAMING: "streaming",
  COMPLETED: "completed",
  ERROR: "error",
  CANCELLED: "cancelled",
};

/**
 * FunctionCallService class
 * Manages function call lifecycle with dependency injection
 */
export class FunctionCallService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.storageAdapter - Storage adapter for state persistence
   * @param {Object} dependencies.appState - Application state manager
   */
  constructor({ storageAdapter, appState }) {
    if (!appState) {
      throw new Error("FunctionCallService requires appState in constructor");
    }
    if (!storageAdapter) {
      throw new Error("FunctionCallService requires storageAdapter in constructor");
    }

    this.storage = storageAdapter;
    this.appState = appState;

    // NO internal state storage - use appState instead
    // State is stored in appState.functions.{activeCalls, argumentsBuffer, completedCalls}
  }

  /**
   * Create new function call
   *
   * @param {string} callId - Unique call ID
   * @param {string} name - Function name
   * @param {string|Object} args - Function arguments
   * @returns {Object} Call data
   */
  createCall(callId, name, args = {}) {
    if (!callId) {
      throw new Error("Call ID is required");
    }

    if (!name) {
      throw new Error("Function name is required");
    }

    const call = {
      id: callId,
      name,
      args: typeof args === "string" ? args : JSON.stringify(args),
      status: CallStatus.PENDING,
      result: null,
      error: null,
      timestamp: Date.now(),
      startTime: Date.now(),
      endTime: null,
    };

    const activeCalls = this.appState.getState("functions.activeCalls");
    activeCalls.set(callId, call);
    return call;
  }

  /**
   * Update call status
   *
   * @param {string} callId - Call ID
   * @param {string} status - New status
   * @returns {Object|null} Updated call data or null
   */
  updateCallStatus(callId, status) {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const call = activeCalls.get(callId);

    if (!call) {
      return null;
    }

    call.status = status;

    if (status === CallStatus.COMPLETED || status === CallStatus.ERROR || status === CallStatus.CANCELLED) {
      call.endTime = Date.now();
      call.duration = call.endTime - call.startTime;

      // Move to completed calls
      const completedCalls = this.appState.getState("functions.completedCalls");
      completedCalls.set(callId, { ...call });

      // Remove from active calls
      activeCalls.delete(callId);
      const argumentsBuffer = this.appState.getState("functions.argumentsBuffer");
      argumentsBuffer.delete(callId);

      // BoundedMap handles automatic eviction, no manual limit needed
    }

    return call;
  }

  /**
   * Append arguments delta to buffered arguments
   *
   * @param {string} callId - Call ID
   * @param {string} delta - Arguments delta
   * @returns {string} Full buffered arguments
   */
  appendArgumentsDelta(callId, delta) {
    const argumentsBuffer = this.appState.getState("functions.argumentsBuffer");
    const current = argumentsBuffer.get(callId) || "";
    const updated = current + delta;
    argumentsBuffer.set(callId, updated);

    // Update active call if exists
    const activeCalls = this.appState.getState("functions.activeCalls");
    const call = activeCalls.get(callId);
    if (call) {
      call.args = updated;
      call.status = CallStatus.STREAMING;
    }

    return updated;
  }

  /**
   * Finalize arguments for call
   * Parses buffered string into object
   *
   * @param {string} callId - Call ID
   * @returns {Object|string} Parsed arguments or original string on error
   */
  finalizeArguments(callId) {
    const argumentsBuffer = this.appState.getState("functions.argumentsBuffer");
    const buffered = argumentsBuffer.get(callId) || "{}";
    let parsed = buffered;

    try {
      parsed = JSON.parse(buffered);
    } catch (error) {
      // Keep as string if parse fails
      console.warn(`Failed to parse arguments for call ${callId}:`, error);
    }

    const activeCalls = this.appState.getState("functions.activeCalls");
    const call = activeCalls.get(callId);
    if (call) {
      call.args = parsed;
    }

    // Clear buffer
    argumentsBuffer.delete(callId);

    return parsed;
  }

  /**
   * Set call result
   *
   * @param {string} callId - Call ID
   * @param {any} result - Call result
   * @returns {Object|null} Updated call or null
   */
  setCallResult(callId, result) {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const call = activeCalls.get(callId);

    if (!call) {
      return null;
    }

    call.result = result;
    call.status = CallStatus.COMPLETED;
    call.endTime = Date.now();
    call.duration = call.endTime - call.startTime;

    // Copy to completed for historical tracking
    const completedCalls = this.appState.getState("functions.completedCalls");
    completedCalls.set(callId, { ...call });

    // NOTE: Do NOT delete from activeCalls here - the TTL cleanup timer
    // needs the card reference to fade out and remove the DOM element.
    // scheduleFunctionCardCleanup() handles deletion after TTL expires.
    const argumentsBuffer = this.appState.getState("functions.argumentsBuffer");
    argumentsBuffer.delete(callId);

    return call;
  }

  /**
   * Set call error
   *
   * @param {string} callId - Call ID
   * @param {string} error - Error message
   * @returns {Object|null} Updated call or null
   */
  setCallError(callId, error) {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const call = activeCalls.get(callId);

    if (!call) {
      return null;
    }

    call.error = error;
    call.status = CallStatus.ERROR;
    call.endTime = Date.now();
    call.duration = call.endTime - call.startTime;

    // Copy to completed for historical tracking
    const completedCalls = this.appState.getState("functions.completedCalls");
    completedCalls.set(callId, { ...call });

    // NOTE: Do NOT delete from activeCalls here - the TTL cleanup timer
    // needs the card reference to fade out and remove the DOM element.
    // scheduleFunctionCardCleanup() handles deletion after TTL expires.
    const argumentsBuffer = this.appState.getState("functions.argumentsBuffer");
    argumentsBuffer.delete(callId);

    return call;
  }

  /**
   * Get call by ID
   *
   * @param {string} callId - Call ID
   * @returns {Object|null} Call data or null
   */
  getCall(callId) {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const completedCalls = this.appState.getState("functions.completedCalls");
    return activeCalls.get(callId) || completedCalls.get(callId) || null;
  }

  /**
   * Get all active calls
   *
   * @returns {Array<Object>} Array of active calls
   */
  getActiveCalls() {
    const activeCalls = this.appState.getState("functions.activeCalls");
    // Filter out completed/errored calls - they stay in activeCalls for TTL cleanup
    // but should not be considered "active" semantically
    return Array.from(activeCalls.values()).filter(
      (call) => call.status !== CallStatus.COMPLETED && call.status !== CallStatus.ERROR
    );
  }

  /**
   * Get completed calls
   *
   * @param {number} limit - Max number to return (default: 20)
   * @returns {Array<Object>} Array of completed calls (most recent first)
   */
  getCompletedCalls(limit = 20) {
    const completedCalls = this.appState.getState("functions.completedCalls");
    const completed = Array.from(completedCalls.values());
    return completed.slice(-limit).reverse();
  }

  /**
   * Check if call exists
   *
   * @param {string} callId - Call ID
   * @returns {boolean} True if call exists
   */
  hasCall(callId) {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const completedCalls = this.appState.getState("functions.completedCalls");
    return activeCalls.has(callId) || completedCalls.has(callId);
  }

  /**
   * Remove call from tracking
   *
   * @param {string} callId - Call ID
   * @returns {boolean} True if removed
   */
  removeCall(callId) {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const completedCalls = this.appState.getState("functions.completedCalls");
    const argumentsBuffer = this.appState.getState("functions.argumentsBuffer");

    const activeRemoved = activeCalls.delete(callId);
    const completedRemoved = completedCalls.delete(callId);
    argumentsBuffer.delete(callId);

    return activeRemoved || completedRemoved;
  }

  /**
   * Clear all active calls
   */
  clearActiveCalls() {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const argumentsBuffer = this.appState.getState("functions.argumentsBuffer");
    activeCalls.clear();
    argumentsBuffer.clear();
  }

  /**
   * Clear all completed calls
   */
  clearCompletedCalls() {
    const completedCalls = this.appState.getState("functions.completedCalls");
    completedCalls.clear();
  }

  /**
   * Get call statistics
   *
   * @returns {Object} Statistics about calls
   */
  getCallStats() {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const completedCalls = this.appState.getState("functions.completedCalls");
    const completed = Array.from(completedCalls.values());

    // Count only truly active calls (not completed/errored waiting for TTL cleanup)
    const activeCount = Array.from(activeCalls.values()).filter(
      (c) => c.status !== CallStatus.COMPLETED && c.status !== CallStatus.ERROR
    ).length;

    const totalCompleted = completed.filter((c) => c.status === CallStatus.COMPLETED).length;
    const totalErrors = completed.filter((c) => c.status === CallStatus.ERROR).length;
    const totalCancelled = completed.filter((c) => c.status === CallStatus.CANCELLED).length;

    const durations = completed.filter((c) => c.duration).map((c) => c.duration);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      active: activeCount,
      completed: totalCompleted,
      errors: totalErrors,
      cancelled: totalCancelled,
      avgDuration: Math.round(avgDuration),
    };
  }

  /**
   * Get call duration
   *
   * @param {string} callId - Call ID
   * @returns {number|null} Duration in ms or null
   */
  getCallDuration(callId) {
    const call = this.getCall(callId);

    if (!call) {
      return null;
    }

    if (call.endTime) {
      return call.endTime - call.startTime;
    }

    // Still active - return current duration
    return Date.now() - call.startTime;
  }

  /**
   * Check if call is old (stale)
   * Useful for detecting hung calls
   *
   * @param {string} callId - Call ID
   * @param {number} threshold - Threshold in ms (default: 60s)
   * @returns {boolean} True if call is older than threshold
   */
  isCallStale(callId, threshold = 60000) {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const call = activeCalls.get(callId);

    if (!call) {
      return false;
    }

    const age = Date.now() - call.startTime;
    return age > threshold;
  }

  /**
   * Reset service state
   */
  reset() {
    const activeCalls = this.appState.getState("functions.activeCalls");
    const argumentsBuffer = this.appState.getState("functions.argumentsBuffer");
    const completedCalls = this.appState.getState("functions.completedCalls");
    activeCalls.clear();
    argumentsBuffer.clear();
    completedCalls.clear();
  }
}
