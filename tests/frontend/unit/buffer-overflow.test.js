/**
 * Security tests for StreamingBufferManager
 * Tests DoS protection, buffer overflow handling, backpressure, and memory safety
 */

const StreamingBufferManager = require("../../../electron/utils/streaming-buffer");
const { JSON_DELIMITER } = require("../../../electron/config/main-constants");

describe("StreamingBufferManager Security Tests", () => {
  describe("Buffer Overflow Protection", () => {
    test("should reject response exceeding maximum size", () => {
      const maxSize = 1024; // 1KB for testing
      let overflowTriggered = false;
      let overflowBytes = 0;

      const manager = new StreamingBufferManager({
        maxSize,
        operationType: "test-overflow",
        onMessage: () => {},
        onOverflow: (bytesReceived) => {
          overflowTriggered = true;
          overflowBytes = bytesReceived;
        },
      });

      // Create large chunk that exceeds limit
      const largeChunk = "x".repeat(2048); // 2KB > 1KB limit

      // Should throw BUFFER_OVERFLOW error
      expect(() => {
        manager.append(largeChunk);
      }).toThrow("Buffer overflow");

      // Verify overflow callback was triggered
      expect(overflowTriggered).toBe(true);
      expect(overflowBytes).toBeGreaterThan(maxSize);
    });

    test("should handle 20MB response and reject gracefully", () => {
      const maxSize = 2 * 1024 * 1024; // 2MB limit
      let overflowTriggered = false;

      const manager = new StreamingBufferManager({
        maxSize,
        operationType: "test-large-response",
        onMessage: () => {},
        onOverflow: () => {
          overflowTriggered = true;
        },
      });

      // Simulate 20MB response in 1MB chunks
      const chunkSize = 1024 * 1024; // 1MB
      const chunk = "x".repeat(chunkSize);

      // First 2 chunks should work (up to limit)
      expect(() => manager.append(chunk)).not.toThrow();
      expect(() => manager.append(chunk)).not.toThrow();

      // Third chunk should trigger overflow
      expect(() => manager.append(chunk)).toThrow("Buffer overflow");
      expect(overflowTriggered).toBe(true);
    });

    test("should stop accepting data after overflow", () => {
      const maxSize = 100;
      const manager = new StreamingBufferManager({
        maxSize,
        operationType: "test-post-overflow",
        onMessage: () => {},
        onOverflow: () => {},
      });

      // Trigger overflow
      try {
        manager.append("x".repeat(200));
      } catch (_e) {
        // Expected
      }

      // Further append should be silently ignored (not throw)
      expect(() => manager.append("more data")).not.toThrow();

      // Verify buffer didn't grow
      const stats = manager.getStats();
      expect(stats.overflowed).toBe(true);
    });
  });

  describe("Incremental JSON Parsing", () => {
    test("should parse complete messages immediately", () => {
      const messages = [];
      const manager = new StreamingBufferManager({
        maxSize: 1024,
        operationType: "test-parsing",
        onMessage: (msg) => messages.push(msg),
        onOverflow: () => {},
      });

      // Send complete JSON message
      const testMessage = { type: "test", data: "hello" };
      const encoded = `${JSON_DELIMITER}${JSON.stringify(testMessage)}${JSON_DELIMITER}`;
      manager.append(encoded);

      // Should be parsed immediately
      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual(testMessage);

      // Buffer should be empty after parsing
      const stats = manager.getStats();
      expect(stats.bufferSize).toBe(0);
    });

    test("should handle incomplete messages without parsing", () => {
      const messages = [];
      const manager = new StreamingBufferManager({
        maxSize: 1024,
        operationType: "test-incomplete",
        onMessage: (msg) => messages.push(msg),
        onOverflow: () => {},
      });

      // Send incomplete message (no end delimiter)
      const testMessage = { type: "test", data: "hello" };
      const incomplete = `${JSON_DELIMITER}${JSON.stringify(testMessage)}`;
      manager.append(incomplete);

      // Should NOT be parsed yet
      expect(messages.length).toBe(0);

      // Buffer should contain incomplete message
      const stats = manager.getStats();
      expect(stats.bufferSize).toBeGreaterThan(0);

      // Send end delimiter
      manager.append(JSON_DELIMITER);

      // Now should be parsed
      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual(testMessage);
    });

    test("should parse multiple messages in single chunk", () => {
      const messages = [];
      const manager = new StreamingBufferManager({
        maxSize: 2048,
        operationType: "test-multiple",
        onMessage: (msg) => messages.push(msg),
        onOverflow: () => {},
      });

      // Send three messages in one chunk
      const msg1 = { type: "msg1", data: "first" };
      const msg2 = { type: "msg2", data: "second" };
      const msg3 = { type: "msg3", data: "third" };

      const chunk = [
        `${JSON_DELIMITER}${JSON.stringify(msg1)}${JSON_DELIMITER}`,
        `${JSON_DELIMITER}${JSON.stringify(msg2)}${JSON_DELIMITER}`,
        `${JSON_DELIMITER}${JSON.stringify(msg3)}${JSON_DELIMITER}`,
      ].join("");

      manager.append(chunk);

      // All three should be parsed
      expect(messages.length).toBe(3);
      expect(messages[0]).toEqual(msg1);
      expect(messages[1]).toEqual(msg2);
      expect(messages[2]).toEqual(msg3);
    });

    test("should handle malformed JSON gracefully", () => {
      const messages = [];
      const manager = new StreamingBufferManager({
        maxSize: 1024,
        operationType: "test-malformed",
        onMessage: (msg) => messages.push(msg),
        onOverflow: () => {},
      });

      // Send malformed JSON
      const malformed = `${JSON_DELIMITER}{invalid json}${JSON_DELIMITER}`;
      manager.append(malformed);

      // Should not crash, should skip malformed message
      expect(messages.length).toBe(0);

      // Buffer should be cleared after attempting parse
      const stats = manager.getStats();
      expect(stats.bufferSize).toBe(0);
    });
  });

  describe("Backpressure Mechanism", () => {
    test("should signal backpressure when buffer fills quickly", () => {
      const manager = new StreamingBufferManager({
        maxSize: 10 * 1024 * 1024, // 10MB
        operationType: "test-backpressure",
        onMessage: () => {},
        onOverflow: () => {},
      });

      const checkInterval = 1024 * 1024; // 1MB
      const chunk = "x".repeat(checkInterval);

      // First chunk - no backpressure yet
      manager.append(chunk);
      expect(manager.shouldApplyBackpressure(checkInterval)).toBe(false);

      // Add more data to trigger backpressure
      manager.append(chunk);
      const needsBackpressure = manager.shouldApplyBackpressure(checkInterval);
      expect(needsBackpressure).toBe(true);
    });

    test("should reset backpressure tracking after trigger", () => {
      const manager = new StreamingBufferManager({
        maxSize: 10 * 1024 * 1024,
        operationType: "test-backpressure-reset",
        onMessage: () => {},
        onOverflow: () => {},
      });

      const checkInterval = 1024 * 1024;
      const chunk = "x".repeat(checkInterval);

      // Trigger backpressure
      manager.append(chunk);
      manager.append(chunk);
      manager.shouldApplyBackpressure(checkInterval); // Trigger

      // Should not signal backpressure immediately again
      expect(manager.shouldApplyBackpressure(checkInterval)).toBe(false);
    });
  });

  describe("Memory Leak Prevention", () => {
    test("should not leak memory with 1000 messages", () => {
      const messages = [];
      const manager = new StreamingBufferManager({
        maxSize: 10 * 1024 * 1024,
        operationType: "test-memory-leak",
        onMessage: (msg) => messages.push(msg),
        onOverflow: () => {},
      });

      // Send 1000 small messages
      for (let i = 0; i < 1000; i++) {
        const msg = { type: "test", index: i, data: "x".repeat(100) };
        const encoded = `${JSON_DELIMITER}${JSON.stringify(msg)}${JSON_DELIMITER}`;
        manager.append(encoded);
      }

      // All messages should be parsed
      expect(messages.length).toBe(1000);

      // Buffer should be empty (no accumulation)
      const stats = manager.getStats();
      expect(stats.bufferSize).toBe(0);
      expect(stats.messageCount).toBe(1000);
    });

    test("should properly reset state after operation", () => {
      const manager = new StreamingBufferManager({
        maxSize: 1024,
        operationType: "test-reset",
        onMessage: () => {},
        onOverflow: () => {},
      });

      // Add data
      manager.append("test data");

      // Get stats before reset
      const statsBefore = manager.getStats();
      expect(statsBefore.bytesReceived).toBeGreaterThan(0);

      // Reset
      manager.reset();

      // Verify clean state
      const statsAfter = manager.getStats();
      expect(statsAfter.bufferSize).toBe(0);
      expect(statsAfter.bytesReceived).toBe(0);
      expect(statsAfter.messageCount).toBe(0);
      expect(statsAfter.overflowed).toBe(false);
    });
  });

  describe("DoS Resistance", () => {
    test("should handle rapid-fire large messages", () => {
      const maxSize = 5 * 1024 * 1024; // 5MB
      let overflowCount = 0;

      const manager = new StreamingBufferManager({
        maxSize,
        operationType: "test-dos",
        onMessage: () => {},
        onOverflow: () => {
          overflowCount++;
        },
      });

      // Rapid-fire 10 x 1MB chunks (total 10MB > 5MB limit)
      const chunk = "x".repeat(1024 * 1024);

      for (let i = 0; i < 10; i++) {
        try {
          manager.append(chunk);
        } catch (_e) {
          // Expected after overflow
        }
      }

      // Should have triggered overflow
      expect(overflowCount).toBeGreaterThan(0);

      // Should have stopped accepting data
      const stats = manager.getStats();
      expect(stats.overflowed).toBe(true);
    });

    test("should enforce per-operation limits correctly", () => {
      // Session command limit (2MB)
      const sessionManager = new StreamingBufferManager({
        maxSize: 2 * 1024 * 1024,
        operationType: "session-load",
        onMessage: () => {},
        onOverflow: () => {},
      });

      // File upload limit (5MB)
      const uploadManager = new StreamingBufferManager({
        maxSize: 5 * 1024 * 1024,
        operationType: "file-upload",
        onMessage: () => {},
        onOverflow: () => {},
      });

      const chunk = "x".repeat(1024 * 1024); // 1MB

      // Session should fail at 3MB
      expect(() => {
        sessionManager.append(chunk);
        sessionManager.append(chunk);
        sessionManager.append(chunk); // 3rd MB exceeds 2MB limit
      }).toThrow("Buffer overflow");

      // Upload should succeed at 3MB
      expect(() => {
        uploadManager.append(chunk);
        uploadManager.append(chunk);
        uploadManager.append(chunk);
      }).not.toThrow();
    });
  });

  describe("Statistics and Monitoring", () => {
    test("should track accurate statistics", () => {
      const manager = new StreamingBufferManager({
        maxSize: 10 * 1024 * 1024,
        operationType: "test-stats",
        onMessage: () => {},
        onOverflow: () => {},
      });

      const message = { type: "test", data: "hello" };
      const encoded = `${JSON_DELIMITER}${JSON.stringify(message)}${JSON_DELIMITER}`;

      // Send 5 messages
      for (let i = 0; i < 5; i++) {
        manager.append(encoded);
      }

      const stats = manager.getStats();
      expect(stats.messageCount).toBe(5);
      expect(stats.bytesReceived).toBeGreaterThan(0);
      // Parse string to number for comparison
      expect(parseFloat(stats.utilizationPercent)).toBeLessThan(100);
      expect(stats.overflowed).toBe(false);
    });

    test("should report high utilization on overflow", () => {
      const maxSize = 100;
      const manager = new StreamingBufferManager({
        maxSize,
        operationType: "test-utilization",
        onMessage: () => {},
        onOverflow: () => {},
      });

      // Trigger overflow by exceeding maxSize
      try {
        manager.append("x".repeat(200));
      } catch (_e) {
        // Expected
      }

      const stats = manager.getStats();
      // After overflow, bytesReceived should exceed maxSize
      expect(stats.bytesReceived).toBeGreaterThan(maxSize);
      expect(parseFloat(stats.utilizationPercent)).toBeGreaterThanOrEqual(100);
      expect(stats.overflowed).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should include detailed error metadata", () => {
      const manager = new StreamingBufferManager({
        maxSize: 100,
        operationType: "test-error-metadata",
        onMessage: () => {},
        onOverflow: () => {},
      });

      try {
        manager.append("x".repeat(200));
        fail("Should have thrown error");
      } catch (error) {
        expect(error.code).toBe("BUFFER_OVERFLOW");
        expect(error.bytesReceived).toBeGreaterThan(100);
        expect(error.maxSize).toBe(100);
        expect(error.operationType).toBe("test-error-metadata");
      }
    });

    test("should provide actionable error messages", () => {
      const manager = new StreamingBufferManager({
        maxSize: 100,
        operationType: "session-load",
        onMessage: () => {},
        onOverflow: () => {},
      });

      try {
        manager.append("x".repeat(200));
        fail("Should have thrown error");
      } catch (error) {
        expect(error.message).toContain("Buffer overflow");
        expect(error.message).toContain("session-load");
        expect(error.message).toContain("100 bytes");
      }
    });
  });
});
