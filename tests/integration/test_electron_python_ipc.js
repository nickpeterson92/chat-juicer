/**
 * Integration tests for Electron ↔ Python Binary IPC (V2 Protocol)
 *
 * These tests spawn the actual Python backend and communicate via binary V2 protocol.
 * Run with: node tests/integration/test_electron_python_ipc.js
 *
 * Tests verify:
 * - Protocol negotiation handshake
 * - Binary message encoding/decoding through real pipes
 * - Session commands round-trip
 * - Error handling for malformed messages
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert");

// Import our V2 protocol implementation
const IPCProtocolV2 = require("../../src/frontend/utils/ipc-v2-protocol");
const BinaryMessageParser = require("../../src/frontend/utils/binary-message-parser");

// Paths
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const MAIN_PY = path.join(PROJECT_ROOT, "src", "main.py");

// Test utilities
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

function _log(message) {
  console.log(`[TEST] ${message}`);
}

function pass(testName, duration) {
  testResults.passed++;
  testResults.tests.push({ name: testName, status: "PASS", duration });
  console.log(`✅ PASS: ${testName} (${duration}ms)`);
}

function fail(testName, error, duration) {
  testResults.failed++;
  testResults.tests.push({ name: testName, status: "FAIL", error: error.message, duration });
  console.log(`❌ FAIL: ${testName} (${duration}ms)`);
  console.log(`   Error: ${error.message}`);
}

/**
 * Spawn Python backend process
 */
function spawnPython() {
  return spawn("python", [MAIN_PY], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: PROJECT_ROOT,
  });
}

/**
 * Wait for a binary response from Python stdout
 */
function waitForBinaryResponse(proc, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const parser = new BinaryMessageParser({
      onMessage: (message) => {
        resolve(message);
      },
      onError: (error) => {
        reject(error);
      },
    });

    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for response after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (data) => {
      parser.feed(data);
    });

    proc.stdout.once("end", () => {
      clearTimeout(timeout);
      reject(new Error("Process stdout ended before response received"));
    });
  });
}

/**
 * Test 1: Protocol Negotiation
 */
async function testProtocolNegotiation() {
  const testName = "Protocol Negotiation";
  const startTime = Date.now();

  const proc = spawnPython();

  try {
    // Send negotiation request
    const negotiation = {
      type: "protocol_negotiation",
      supported_versions: [2],
      client_version: "1.0.0-test",
    };

    const binaryMessage = IPCProtocolV2.encode(negotiation);
    proc.stdin.write(binaryMessage);

    // Wait for response
    const response = await waitForBinaryResponse(proc);

    // Verify response
    assert.strictEqual(
      response.type,
      "protocol_negotiation_response",
      "Response type should be protocol_negotiation_response"
    );
    assert.strictEqual(response.selected_version, 2, "Selected version should be 2");
    assert.ok(response.server_version, "Response should include server_version");

    pass(testName, Date.now() - startTime);
  } catch (error) {
    fail(testName, error, Date.now() - startTime);
  } finally {
    proc.kill();
  }
}

/**
 * Test 2: Message Encoding Round-Trip
 */
async function testMessageEncodingRoundTrip() {
  const testName = "Message Encoding Round-Trip";
  const startTime = Date.now();

  try {
    // Test encoding and decoding of various message types
    const messages = [
      { type: "protocol_negotiation", supported_versions: [2], client_version: "1.0.0" },
      { type: "session", command: "list", params: {} },
      { type: "message", role: "user", content: "Hello, world!" },
      { type: "message", role: "user", content: "Multi-line\nmessage\nwith\nnewlines" },
      { type: "message", role: "user", content: "Unicode: 你好 👋 🎉" },
      { type: "file_upload", filename: "test.txt", content: "file content", mime_type: "text/plain" },
    ];

    for (const msg of messages) {
      const encoded = IPCProtocolV2.encode(msg);
      const decoded = IPCProtocolV2.decode(encoded);

      assert.strictEqual(decoded.type, msg.type, `Type should match for ${msg.type}`);
      if (msg.content) {
        assert.strictEqual(decoded.content, msg.content, `Content should match for ${msg.type}`);
      }
    }

    pass(testName, Date.now() - startTime);
  } catch (error) {
    fail(testName, error, Date.now() - startTime);
  }
}

/**
 * Test 3: Large Message Compression
 */
async function testLargeMessageCompression() {
  const testName = "Large Message Compression";
  const startTime = Date.now();

  try {
    // Create a large message that should be compressed
    const largeContent = "x".repeat(10000); // 10KB of repeated chars
    const message = {
      type: "message",
      role: "user",
      content: largeContent,
    };

    const encoded = IPCProtocolV2.encode(message);

    // Check compression flag is set
    const flags = encoded.readUInt8(2);
    assert.ok(flags & 0x01, "Compression flag should be set for large messages");

    // Verify decoded content is correct
    const decoded = IPCProtocolV2.decode(encoded);
    assert.strictEqual(decoded.content, largeContent, "Decoded content should match original");

    // Verify compression actually reduced size
    assert.ok(
      encoded.length < largeContent.length,
      `Encoded size (${encoded.length}) should be less than original (${largeContent.length})`
    );

    pass(testName, Date.now() - startTime);
  } catch (error) {
    fail(testName, error, Date.now() - startTime);
  }
}

/**
 * Test 4: BinaryMessageParser Streaming
 */
async function testBinaryMessageParserStreaming() {
  const testName = "BinaryMessageParser Streaming";
  const startTime = Date.now();

  try {
    const receivedMessages = [];
    const parser = new BinaryMessageParser({
      onMessage: (message) => receivedMessages.push(message),
      onError: (error) => {
        throw error;
      },
    });

    // Encode two messages
    const msg1 = { type: "message", content: "First message" };
    const msg2 = { type: "message", content: "Second message" };
    const encoded1 = IPCProtocolV2.encode(msg1);
    const encoded2 = IPCProtocolV2.encode(msg2);

    // Concatenate them
    const combined = Buffer.concat([encoded1, encoded2]);

    // Feed in chunks to simulate streaming
    const chunkSize = 5;
    for (let i = 0; i < combined.length; i += chunkSize) {
      const chunk = combined.subarray(i, Math.min(i + chunkSize, combined.length));
      parser.feed(chunk);
    }

    // Verify both messages received
    assert.strictEqual(receivedMessages.length, 2, "Should receive 2 messages");
    assert.strictEqual(receivedMessages[0].content, msg1.content, "First message content should match");
    assert.strictEqual(receivedMessages[1].content, msg2.content, "Second message content should match");

    pass(testName, Date.now() - startTime);
  } catch (error) {
    fail(testName, error, Date.now() - startTime);
  }
}

/**
 * Test 5: Error Handling for Invalid Protocol Version
 */
async function testInvalidProtocolVersion() {
  const testName = "Invalid Protocol Version Error";
  const startTime = Date.now();

  try {
    // Create a message with invalid version
    const invalidMessage = Buffer.alloc(10);
    invalidMessage.writeUInt16BE(99, 0); // Version 99 (invalid)
    invalidMessage.writeUInt8(0, 2); // No compression
    invalidMessage.writeUInt32BE(3, 3); // Length 3
    invalidMessage.write("xxx", 7); // Garbage payload

    let errorCaught = false;
    const parser = new BinaryMessageParser({
      onMessage: () => {},
      onError: (error) => {
        if (error.code === "INVALID_VERSION") {
          errorCaught = true;
        }
      },
    });

    parser.feed(invalidMessage);
    assert.ok(errorCaught, "Should catch invalid version error");

    pass(testName, Date.now() - startTime);
  } catch (error) {
    fail(testName, error, Date.now() - startTime);
  }
}

/**
 * Test 6: Python Backend Unknown Message Type
 */
async function testUnknownMessageType() {
  const testName = "Unknown Message Type Handling";
  const startTime = Date.now();

  const proc = spawnPython();

  try {
    // First negotiate protocol
    const negotiation = {
      type: "protocol_negotiation",
      supported_versions: [2],
      client_version: "1.0.0-test",
    };
    proc.stdin.write(IPCProtocolV2.encode(negotiation));

    // Wait for negotiation response
    await waitForBinaryResponse(proc);

    // Send unknown message type
    const unknownMsg = {
      type: "unknown_message_type_xyz",
      data: "some data",
    };
    proc.stdin.write(IPCProtocolV2.encode(unknownMsg));

    // Wait for error response
    const response = await waitForBinaryResponse(proc);

    assert.strictEqual(response.type, "error", "Response type should be error");
    assert.ok(response.error.includes("Unknown message type"), "Error should mention unknown message type");

    pass(testName, Date.now() - startTime);
  } catch (error) {
    fail(testName, error, Date.now() - startTime);
  } finally {
    proc.kill();
  }
}

/**
 * Test 7: Multiple Messages in Sequence
 *
 * Tests that multiple messages can be processed sequentially.
 */
async function testMultipleMessagesInSequence() {
  const testName = "Multiple Messages in Sequence";
  const startTime = Date.now();

  const proc = spawnPython();

  try {
    // Set up parser that collects all messages
    const responses = [];
    let resolveWait;
    const waitPromise = new Promise((resolve) => {
      resolveWait = resolve;
    });

    const parser = new BinaryMessageParser({
      onMessage: (message) => {
        responses.push(message);
        // Resolve when we have at least 4 messages
        if (responses.length >= 4) {
          resolveWait();
        }
      },
      onError: () => {},
    });

    proc.stdout.on("data", (data) => parser.feed(data));

    // Send negotiation
    const negotiation = {
      type: "protocol_negotiation",
      supported_versions: [2],
      client_version: "1.0.0-test",
    };
    proc.stdin.write(IPCProtocolV2.encode(negotiation));

    // Send 3 unknown messages (will generate errors)
    for (let i = 0; i < 3; i++) {
      const msg = { type: `unknown_type_${i}` };
      proc.stdin.write(IPCProtocolV2.encode(msg));
    }

    // Wait for all responses with timeout
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout waiting for responses")), 5000)
    );

    await Promise.race([waitPromise, timeout]);

    // Should have received: 1 negotiation response + 3 error responses = 4 total
    assert.ok(responses.length >= 4, `Should receive at least 4 responses, got ${responses.length}`);

    // First should be negotiation response
    assert.strictEqual(responses[0].type, "protocol_negotiation_response", "First response should be negotiation");

    // Rest should be errors
    const errors = responses.filter((r) => r.type === "error");
    assert.ok(errors.length >= 3, `Should receive at least 3 error responses, got ${errors.length}`);

    pass(testName, Date.now() - startTime);
  } catch (error) {
    fail(testName, error, Date.now() - startTime);
  } finally {
    proc.kill();
  }
}

/**
 * Test 8: Binary Data with Special Characters
 */
async function testSpecialCharacters() {
  const testName = "Special Characters in Content";
  const startTime = Date.now();

  try {
    const specialContents = [
      "Null byte: \x00 in the middle",
      "Control chars: \x01\x02\x03\x04",
      "All high bytes: \xFF\xFF\xFF",
      "Mixed: Hello\x00World\nNewline\tTab",
      "Unicode: 日本語 한국어 العربية",
      "Emoji: 👋🎉🚀💻",
      'JSON-like: {"key": "value"}',
      "Delimiter-like: __JSON__fake__JSON__",
    ];

    for (const content of specialContents) {
      const msg = { type: "message", content: content };
      const encoded = IPCProtocolV2.encode(msg);
      const decoded = IPCProtocolV2.decode(encoded);

      assert.strictEqual(decoded.content, content, `Content should match for: ${content.substring(0, 20)}...`);
    }

    pass(testName, Date.now() - startTime);
  } catch (error) {
    fail(testName, error, Date.now() - startTime);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log("=".repeat(60));
  console.log("Electron ↔ Python Binary IPC Integration Tests");
  console.log("=".repeat(60));
  console.log("");

  // Run tests in sequence
  await testProtocolNegotiation();
  await testMessageEncodingRoundTrip();
  await testLargeMessageCompression();
  await testBinaryMessageParserStreaming();
  await testInvalidProtocolVersion();
  await testUnknownMessageType();
  await testMultipleMessagesInSequence();
  await testSpecialCharacters();

  // Summary
  console.log("");
  console.log("=".repeat(60));
  console.log("Test Summary");
  console.log("=".repeat(60));
  console.log(`Total: ${testResults.passed + testResults.failed}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log("");

  if (testResults.failed > 0) {
    console.log("Failed tests:");
    testResults.tests
      .filter((t) => t.status === "FAIL")
      .forEach((t) => {
        console.log(`  - ${t.name}: ${t.error}`);
      });
    process.exit(1);
  } else {
    console.log("All tests passed! ✅");
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error("Test runner failed:", error);
    process.exit(1);
  });
}

module.exports = { runTests, testResults };
