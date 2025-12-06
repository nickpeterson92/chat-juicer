/**
 * BinaryMessageParser - Parses binary V2 protocol messages from a stream
 *
 * Handles fragmented data from stdout by accumulating bytes until complete
 * messages can be parsed according to the V2 binary protocol format.
 *
 * Protocol Format (7-byte header + variable payload):
 *   - Version (2 bytes, uint16, big-endian): Protocol version (must be 2)
 *   - Flags (1 byte, uint8): Bit 0 = compression flag
 *   - Length (4 bytes, uint32, big-endian): Payload length
 *   - Payload (variable): MessagePack data (optionally zlib-compressed)
 *
 * @module electron/utils/binary-message-parser
 */

const msgpack = require("msgpack-lite");
const zlib = require("node:zlib");

// Protocol constants (must match Python backend and ipc-v2-protocol.js)
const PROTOCOL_VERSION = 2;
const FLAG_COMPRESSED = 0x01;
const HEADER_SIZE = 7;
const MAX_MESSAGE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * BinaryMessageParser - Streaming parser for binary V2 protocol messages
 *
 * Usage:
 *   const parser = new BinaryMessageParser({
 *     onMessage: (message) => console.log('Got message:', message),
 *     onError: (error) => console.error('Parse error:', error)
 *   });
 *
 *   process.stdout.on('data', (chunk) => parser.feed(chunk));
 */
class BinaryMessageParser {
  /**
   * Create a new binary message parser
   * @param {Object} options - Configuration options
   * @param {Function} options.onMessage - Callback for parsed messages: (message) => void
   * @param {Function} options.onError - Callback for parse errors: (error) => void
   */
  constructor(options = {}) {
    this.buffer = Buffer.alloc(0);
    this.onMessage = options.onMessage || (() => {});
    this.onError = options.onError || ((err) => console.error("BinaryMessageParser error:", err));
    this.messageCount = 0;
    this.bytesReceived = 0;
  }

  /**
   * Feed binary data into the parser
   * Will parse and emit complete messages via onMessage callback
   *
   * @param {Buffer} chunk - Binary data chunk from stdout
   */
  feed(chunk) {
    // Ensure chunk is a Buffer
    if (!Buffer.isBuffer(chunk)) {
      chunk = Buffer.from(chunk);
    }

    this.bytesReceived += chunk.length;

    // Append to buffer
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Try to parse complete messages
    this._parseMessages();
  }

  /**
   * Parse complete messages from the buffer
   * Messages are removed from buffer once fully parsed
   */
  _parseMessages() {
    while (true) {
      // Need at least header to proceed
      if (this.buffer.length < HEADER_SIZE) {
        break;
      }

      // Parse header
      const version = this.buffer.readUInt16BE(0);
      const flags = this.buffer.readUInt8(2);
      const length = this.buffer.readUInt32BE(3);

      // Validate version
      if (version !== PROTOCOL_VERSION) {
        const error = new Error(`Unsupported protocol version: ${version}, expected ${PROTOCOL_VERSION}`);
        error.code = "INVALID_VERSION";
        this.onError(error);
        // Skip one byte and try to resync (recovery attempt)
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      // Validate length
      if (length > MAX_MESSAGE_SIZE) {
        const error = new Error(`Message too large: ${length} bytes (max ${MAX_MESSAGE_SIZE})`);
        error.code = "MESSAGE_TOO_LARGE";
        this.onError(error);
        // Skip header and try to resync
        this.buffer = this.buffer.subarray(HEADER_SIZE);
        continue;
      }

      // Check if we have the complete message
      const totalSize = HEADER_SIZE + length;
      if (this.buffer.length < totalSize) {
        // Wait for more data
        break;
      }

      // Extract payload
      let payload = this.buffer.subarray(HEADER_SIZE, totalSize);

      // Decompress if needed
      const compressed = (flags & FLAG_COMPRESSED) !== 0;
      if (compressed) {
        try {
          payload = zlib.inflateSync(payload);
        } catch (err) {
          const error = new Error(`Decompression failed: ${err.message}`);
          error.code = "DECOMPRESSION_FAILED";
          this.onError(error);
          // Remove this message and continue
          this.buffer = this.buffer.subarray(totalSize);
          continue;
        }
      }

      // Decode MessagePack
      let message;
      try {
        message = msgpack.decode(payload);
      } catch (err) {
        const error = new Error(`MessagePack decode failed: ${err.message}`);
        error.code = "MSGPACK_DECODE_FAILED";
        this.onError(error);
        // Remove this message and continue
        this.buffer = this.buffer.subarray(totalSize);
        continue;
      }

      // Remove parsed message from buffer
      this.buffer = this.buffer.subarray(totalSize);
      this.messageCount++;

      // Add metadata
      message._size = length;
      message._compressed = compressed;

      // Emit parsed message
      try {
        this.onMessage(message);
      } catch (err) {
        // Don't let callback errors break the parser
        console.error("BinaryMessageParser: onMessage callback error:", err);
      }
    }
  }

  /**
   * Reset parser state
   * Call after error recovery or when restarting communication
   */
  reset() {
    this.buffer = Buffer.alloc(0);
    this.messageCount = 0;
    this.bytesReceived = 0;
  }

  /**
   * Get parser statistics
   * @returns {Object} Statistics about parser state
   */
  getStats() {
    return {
      bufferSize: this.buffer.length,
      bytesReceived: this.bytesReceived,
      messageCount: this.messageCount,
      pendingBytes: this.buffer.length,
    };
  }

  /**
   * Check if parser has pending incomplete data
   * @returns {boolean} True if buffer contains incomplete message
   */
  hasPendingData() {
    return this.buffer.length > 0;
  }
}

module.exports = BinaryMessageParser;
