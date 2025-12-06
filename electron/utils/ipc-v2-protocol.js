/**
 * IPC Protocol V2 - Binary MessagePack encoder
 *
 * Encodes JavaScript objects as binary V2 messages compatible with Python backend.
 *
 * Protocol Format:
 *   Header (7 bytes):
 *     - Version (2 bytes, unsigned short, big-endian): Protocol version (2)
 *     - Flags (1 byte): Compression flag (0x01 if compressed)
 *     - Length (4 bytes, unsigned int, big-endian): Payload length
 *   Payload (variable):
 *     - MessagePack-encoded object (optionally zlib-compressed)
 *
 * Matches Python implementation in src/utils/binary_io.py
 */

const msgpack = require("msgpack-lite");
const zlib = require("node:zlib");

// Protocol constants (must match Python backend)
const PROTOCOL_VERSION = 2;
const FLAG_COMPRESSED = 0x01;
const MAX_MESSAGE_SIZE = 100 * 1024 * 1024; // 100MB
const COMPRESSION_THRESHOLD = 1024; // Compress if >1KB

/**
 * Encode a message object as binary V2 format
 *
 * @param {Object} message - Message object to encode
 * @returns {Buffer} - Binary V2 message (header + payload)
 * @throws {Error} - If encoding fails or message too large
 */
function encode(message) {
  // 1. Encode as MessagePack
  let payload = msgpack.encode(message);

  // 2. Compress if large enough
  let flags = 0;
  if (payload.length > COMPRESSION_THRESHOLD) {
    const compressed = zlib.deflateSync(payload, { level: 6 });
    // Only use compression if it actually reduces size
    if (compressed.length < payload.length) {
      payload = compressed;
      flags |= FLAG_COMPRESSED;
    }
  }

  // 3. Validate size
  if (payload.length > MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large: ${payload.length} bytes (max ${MAX_MESSAGE_SIZE})`);
  }

  // 4. Build 7-byte header
  const header = Buffer.allocUnsafe(7);
  header.writeUInt16BE(PROTOCOL_VERSION, 0); // version (2 bytes)
  header.writeUInt8(flags, 2); // flags (1 byte)
  header.writeUInt32BE(payload.length, 3); // length (4 bytes)

  // 5. Concatenate header + payload
  return Buffer.concat([header, payload]);
}

/**
 * Decode a binary V2 message (for testing/debugging)
 *
 * @param {Buffer} buffer - Binary V2 message
 * @returns {Object} - Decoded message object
 * @throws {Error} - If decoding fails
 */
function decode(buffer) {
  if (buffer.length < 7) {
    throw new Error(`Buffer too short: ${buffer.length} bytes (need at least 7)`);
  }

  // 1. Parse header
  const version = buffer.readUInt16BE(0);
  const flags = buffer.readUInt8(2);
  const length = buffer.readUInt32BE(3);

  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version}`);
  }

  if (buffer.length < 7 + length) {
    throw new Error(`Incomplete message: got ${buffer.length} bytes, expected ${7 + length}`);
  }

  // 2. Extract payload
  let payload = buffer.subarray(7, 7 + length);

  // 3. Decompress if needed
  const compressed = (flags & FLAG_COMPRESSED) !== 0;
  if (compressed) {
    payload = zlib.inflateSync(payload);
  }

  // 4. Decode MessagePack
  return msgpack.decode(payload);
}

module.exports = {
  encode,
  decode,
  PROTOCOL_VERSION,
  FLAG_COMPRESSED,
  MAX_MESSAGE_SIZE,
  COMPRESSION_THRESHOLD,
};
