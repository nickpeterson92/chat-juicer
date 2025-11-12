/**
 * StreamingBufferManager - Secure streaming buffer with size limits and backpressure
 * Prevents memory exhaustion from unbounded IPC buffer accumulation
 *
 * Security Features:
 * - Enforced buffer size limits to prevent DoS attacks
 * - Incremental JSON parsing to avoid full accumulation
 * - Backpressure mechanism to pause data sources when overwhelmed
 * - Per-operation type size limits (session, file upload, streaming)
 * - Graceful overflow handling with error callbacks
 *
 * @module electron/utils/streaming-buffer
 */

const { JSON_DELIMITER, JSON_DELIMITER_LENGTH } = require("../config/main-constants");

/**
 * StreamingBufferManager - Manages incremental parsing of delimited JSON messages
 * with strict size limits and overflow protection
 */
class StreamingBufferManager {
  /**
   * Create a new streaming buffer manager
   * @param {Object} options - Configuration options
   * @param {number} options.maxSize - Maximum buffer size in bytes (throws on exceed)
   * @param {Function} options.onMessage - Callback for parsed messages: (message) => void
   * @param {Function} options.onOverflow - Callback for buffer overflow: (bytesReceived) => void
   * @param {string} options.operationType - Type of operation for logging (session|upload|stream)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // Default 10MB
    this.buffer = "";
    this.bytesReceived = 0;
    this.messageCount = 0;
    this.onMessage = options.onMessage || (() => {});
    this.onOverflow = options.onOverflow || (() => {});
    this.operationType = options.operationType || "unknown";
    this.overflowed = false;
    this.lastBackpressureTime = 0;
  }

  /**
   * Append data chunk to buffer and parse complete messages
   * @param {string} chunk - UTF-8 decoded string chunk from stdout
   * @throws {Error} If buffer size exceeds maxSize
   */
  append(chunk) {
    // Check if we've already overflowed
    if (this.overflowed) {
      return; // Silently ignore further data after overflow
    }

    const chunkSize = Buffer.byteLength(chunk, "utf-8");
    const newTotalBytes = this.bytesReceived + chunkSize;

    // Check size BEFORE appending to prevent overflow
    if (newTotalBytes > this.maxSize) {
      this.overflowed = true;
      // Update bytesReceived to reflect the total that caused overflow
      this.bytesReceived = newTotalBytes;

      const error = new Error(
        `Buffer overflow: ${this.operationType} response exceeded ${this.maxSize} bytes (received ${newTotalBytes})`
      );
      error.code = "BUFFER_OVERFLOW";
      error.bytesReceived = newTotalBytes;
      error.maxSize = this.maxSize;
      error.operationType = this.operationType;

      // Trigger overflow callback before throwing
      this.onOverflow(newTotalBytes);
      throw error;
    }

    // Safe to append
    this.buffer += chunk;
    this.bytesReceived += chunkSize;

    // Parse complete messages immediately (incremental parsing)
    this.parseMessages();
  }

  /**
   * Parse complete JSON messages from buffer
   * Extracts messages delimited by JSON_DELIMITER and invokes onMessage callback
   * Incomplete messages remain in buffer for next append
   */
  parseMessages() {
    while (true) {
      // Find start delimiter
      const startIdx = this.buffer.indexOf(JSON_DELIMITER);
      if (startIdx === -1) break; // No complete message

      // Find end delimiter after start
      const contentStart = startIdx + JSON_DELIMITER_LENGTH;
      const endIdx = this.buffer.indexOf(JSON_DELIMITER, contentStart);
      if (endIdx === -1) break; // Incomplete message, wait for more data

      // Extract message content between delimiters
      const jsonStr = this.buffer.substring(contentStart, endIdx);

      // Remove message from buffer (including both delimiters)
      this.buffer = this.buffer.substring(endIdx + JSON_DELIMITER_LENGTH);

      // Parse and invoke callback
      try {
        const message = JSON.parse(jsonStr);
        this.messageCount++;
        this.onMessage(message);
      } catch (error) {
        // Malformed JSON - log and continue to next message
        console.error(`Failed to parse JSON message in ${this.operationType} buffer:`, error.message);
      }
    }
  }

  /**
   * Check if backpressure should be applied based on buffer fill rate
   * @param {number} checkInterval - Interval in bytes for backpressure checks
   * @returns {boolean} True if backpressure should be applied
   */
  shouldApplyBackpressure(checkInterval = 1024 * 1024) {
    // Apply backpressure if we've received more than checkInterval bytes
    // since last backpressure (prevents rapid accumulation)
    if (
      this.bytesReceived - this.lastBackpressureTime > checkInterval &&
      this.buffer.length > checkInterval / 2 // Buffer has significant unparsed data
    ) {
      this.lastBackpressureTime = this.bytesReceived;
      return true;
    }
    return false;
  }

  /**
   * Reset buffer state for reuse
   * Call after successful operation completion or error recovery
   */
  reset() {
    this.buffer = "";
    this.bytesReceived = 0;
    this.messageCount = 0;
    this.overflowed = false;
    this.lastBackpressureTime = 0;
  }

  /**
   * Get buffer statistics for monitoring
   * @returns {Object} Statistics about buffer state
   */
  getStats() {
    return {
      bufferSize: this.buffer.length,
      bytesReceived: this.bytesReceived,
      messageCount: this.messageCount,
      maxSize: this.maxSize,
      utilizationPercent: ((this.bytesReceived / this.maxSize) * 100).toFixed(2),
      overflowed: this.overflowed,
    };
  }
}

module.exports = StreamingBufferManager;
