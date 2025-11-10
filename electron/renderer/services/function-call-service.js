/**
 * FunctionCallService - Pure business logic for function call tracking
 * NO DEPENDENCIES on DOM - uses adapters for infrastructure
 *
 * Handles:
 * - Function call state management
 * - Call status tracking (pending, streaming, completed, error)
 * - Arguments buffering and parsing
 * - Call result management
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
   */
  constructor({ storageAdapter }) {
    this.storage = storageAdapter;

    // Call tracking
    this.activeCalls = new Map(); // call_id -> {name, args, status, result, timestamp}
    this.argumentsBuffer = new Map(); // call_id -> buffered arguments string
    this.completedCalls = new Map(); // call_id -> {name, args, result, duration}
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

    this.activeCalls.set(callId, call);
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
    const call = this.activeCalls.get(callId);

    if (!call) {
      return null;
    }

    call.status = status;

    if (status === CallStatus.COMPLETED || status === CallStatus.ERROR || status === CallStatus.CANCELLED) {
      call.endTime = Date.now();
      call.duration = call.endTime - call.startTime;

      // Move to completed calls
      this.completedCalls.set(callId, { ...call });

      // Remove from active calls
      this.activeCalls.delete(callId);
      this.argumentsBuffer.delete(callId);

      // Keep completed calls limited
      if (this.completedCalls.size > 100) {
        const oldestKey = this.completedCalls.keys().next().value;
        this.completedCalls.delete(oldestKey);
      }
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
    const current = this.argumentsBuffer.get(callId) || "";
    const updated = current + delta;
    this.argumentsBuffer.set(callId, updated);

    // Update active call if exists
    const call = this.activeCalls.get(callId);
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
    const buffered = this.argumentsBuffer.get(callId) || "{}";
    let parsed = buffered;

    try {
      parsed = JSON.parse(buffered);
    } catch (error) {
      // Keep as string if parse fails
      console.warn(`Failed to parse arguments for call ${callId}:`, error);
    }

    const call = this.activeCalls.get(callId);
    if (call) {
      call.args = parsed;
    }

    // Clear buffer
    this.argumentsBuffer.delete(callId);

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
    const call = this.activeCalls.get(callId);

    if (!call) {
      return null;
    }

    call.result = result;
    call.status = CallStatus.COMPLETED;
    call.endTime = Date.now();
    call.duration = call.endTime - call.startTime;

    // Move to completed
    this.completedCalls.set(callId, { ...call });

    // Remove from active
    this.activeCalls.delete(callId);
    this.argumentsBuffer.delete(callId);

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
    const call = this.activeCalls.get(callId);

    if (!call) {
      return null;
    }

    call.error = error;
    call.status = CallStatus.ERROR;
    call.endTime = Date.now();
    call.duration = call.endTime - call.startTime;

    // Move to completed
    this.completedCalls.set(callId, { ...call });

    // Remove from active
    this.activeCalls.delete(callId);
    this.argumentsBuffer.delete(callId);

    return call;
  }

  /**
   * Get call by ID
   *
   * @param {string} callId - Call ID
   * @returns {Object|null} Call data or null
   */
  getCall(callId) {
    return this.activeCalls.get(callId) || this.completedCalls.get(callId) || null;
  }

  /**
   * Get all active calls
   *
   * @returns {Array<Object>} Array of active calls
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get completed calls
   *
   * @param {number} limit - Max number to return (default: 20)
   * @returns {Array<Object>} Array of completed calls (most recent first)
   */
  getCompletedCalls(limit = 20) {
    const completed = Array.from(this.completedCalls.values());
    return completed.slice(-limit).reverse();
  }

  /**
   * Check if call exists
   *
   * @param {string} callId - Call ID
   * @returns {boolean} True if call exists
   */
  hasCall(callId) {
    return this.activeCalls.has(callId) || this.completedCalls.has(callId);
  }

  /**
   * Remove call from tracking
   *
   * @param {string} callId - Call ID
   * @returns {boolean} True if removed
   */
  removeCall(callId) {
    const activeRemoved = this.activeCalls.delete(callId);
    const completedRemoved = this.completedCalls.delete(callId);
    this.argumentsBuffer.delete(callId);

    return activeRemoved || completedRemoved;
  }

  /**
   * Clear all active calls
   */
  clearActiveCalls() {
    this.activeCalls.clear();
    this.argumentsBuffer.clear();
  }

  /**
   * Clear all completed calls
   */
  clearCompletedCalls() {
    this.completedCalls.clear();
  }

  /**
   * Get call statistics
   *
   * @returns {Object} Statistics about calls
   */
  getCallStats() {
    const completed = Array.from(this.completedCalls.values());

    const totalCompleted = completed.filter((c) => c.status === CallStatus.COMPLETED).length;
    const totalErrors = completed.filter((c) => c.status === CallStatus.ERROR).length;
    const totalCancelled = completed.filter((c) => c.status === CallStatus.CANCELLED).length;

    const durations = completed.filter((c) => c.duration).map((c) => c.duration);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      active: this.activeCalls.size,
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
    const call = this.activeCalls.get(callId);

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
    this.activeCalls.clear();
    this.argumentsBuffer.clear();
    this.completedCalls.clear();
  }
}
