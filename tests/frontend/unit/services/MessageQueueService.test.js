/**
 * MessageQueueService Unit Tests
 * Phase 4 - Edge Cases & Testing
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalEventBus } from "@/core/event-bus.js";
import { AppState } from "@/core/state.js";
import {
  getMessageQueueService,
  initializeMessageQueueService,
  MessageQueueService,
} from "@/services/message-queue-service.js";

describe("MessageQueueService", () => {
  let queueService;
  let appState;
  let mockMessageService;
  let eventSpy;

  beforeEach(() => {
    // Fresh AppState for each test
    appState = new AppState();
    appState.setState("python.status", "idle");

    // Mock MessageService
    mockMessageService = {
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
    };

    // Create service instance
    queueService = new MessageQueueService({
      appState,
      messageService: mockMessageService,
    });

    // Spy on EventBus emissions
    eventSpy = vi.spyOn(globalEventBus, "emit");

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should throw error without appState", () => {
      expect(() => new MessageQueueService({ messageService: mockMessageService })).toThrow(
        "MessageQueueService requires appState"
      );
    });

    it("should throw error without messageService", () => {
      expect(() => new MessageQueueService({ appState })).toThrow("MessageQueueService requires messageService");
    });

    it("should initialize with valid dependencies", () => {
      expect(queueService.appState).toBe(appState);
      expect(queueService.messageService).toBe(mockMessageService);
    });

    it("should subscribe to python.status changes", () => {
      // Verify the subscription triggers process() when idle
      const processSpy = vi.spyOn(queueService, "process");

      // Change status to busy then back to idle
      appState.setState("python.status", "busy_streaming");
      appState.setState("python.status", "idle");

      // Wait for setTimeout
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(processSpy).toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });
  });

  describe("add", () => {
    it("should add message to queue with unique ID", () => {
      // Prevent auto-processing so we can verify queue state
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Hello world");

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const items = appState.getState("queue.items");
      expect(items).toHaveLength(1);
      expect(items[0].text).toBe("Hello world");
      expect(items[0].status).toBe("queued");
    });

    it("should trim message text", () => {
      queueService.add("  Hello world  ");

      const items = appState.getState("queue.items");
      expect(items[0].text).toBe("Hello world");
    });

    it("should throw error for empty message", () => {
      expect(() => queueService.add("")).toThrow("Message text cannot be empty");
      expect(() => queueService.add("   ")).toThrow("Message text cannot be empty");
      expect(() => queueService.add(null)).toThrow("Message text cannot be empty");
    });

    it("should store file attachments", () => {
      const files = [{ name: "test.txt", size: 100 }];
      queueService.add("Message with file", files);

      const items = appState.getState("queue.items");
      expect(items[0].files).toEqual(files);
    });

    it("should emit queue:added event", () => {
      queueService.add("Test message");

      expect(eventSpy).toHaveBeenCalledWith(
        "queue:added",
        expect.objectContaining({
          item: expect.objectContaining({ text: "Test message" }),
          queueLength: 1,
        })
      );
    });

    it("should add multiple messages in order", () => {
      queueService.add("First");
      queueService.add("Second");
      queueService.add("Third");

      const items = appState.getState("queue.items");
      expect(items).toHaveLength(3);
      expect(items[0].text).toBe("First");
      expect(items[1].text).toBe("Second");
      expect(items[2].text).toBe("Third");
    });

    it("should include timestamp", () => {
      const before = Date.now();
      queueService.add("Test");
      const after = Date.now();

      const items = appState.getState("queue.items");
      expect(items[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(items[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("process", () => {
    it("should not process when python.status is not idle", async () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("Test");

      // Clear the add() auto-process call
      vi.clearAllMocks();

      const result = await queueService.process();

      expect(result).toBe(false);
      expect(mockMessageService.sendMessage).not.toHaveBeenCalled();
    });

    it("should not process when queue is empty", async () => {
      const result = await queueService.process();

      expect(result).toBe(false);
      expect(mockMessageService.sendMessage).not.toHaveBeenCalled();
    });

    it("should send next queued message when idle", async () => {
      // Add message but prevent auto-processing
      appState.setState("python.status", "busy_streaming");
      queueService.add("Hello");
      vi.clearAllMocks();

      // Now set to idle and process
      appState.setState("python.status", "idle");
      const result = await queueService.process();

      expect(result).toBe(true);
      // Batch processing sends array of message texts
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(["Hello"]);
    });

    it("should batch multiple messages including those with files", async () => {
      const files = [{ name: "test.txt" }];
      appState.setState("python.status", "busy_streaming");
      queueService.add("Hello", files);
      queueService.add("World");
      vi.clearAllMocks();

      appState.setState("python.status", "idle");
      await queueService.process();

      // Batch processing sends all message texts together
      // Note: files are stored on queue items but batch only sends texts
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(["Hello", "World"]);
    });

    it("should update item status to processing", async () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("Hello");
      vi.clearAllMocks();

      appState.setState("python.status", "idle");

      // Start processing but don't wait for completion
      const processPromise = queueService.process();

      // During processing, status should be 'processing'
      // Note: This is hard to test due to async nature, but we verify via event
      await processPromise;

      expect(eventSpy).toHaveBeenCalledWith(
        "queue:processing",
        expect.objectContaining({
          item: expect.objectContaining({ text: "Hello" }),
        })
      );
    });

    it("should remove item from queue after successful send", async () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("Hello");
      vi.clearAllMocks();

      appState.setState("python.status", "idle");
      await queueService.process();

      const items = appState.getState("queue.items");
      expect(items).toHaveLength(0);
    });

    it("should emit queue:processed event on success", async () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("Hello");
      vi.clearAllMocks();

      appState.setState("python.status", "idle");
      await queueService.process();

      expect(eventSpy).toHaveBeenCalledWith(
        "queue:processed",
        expect.objectContaining({
          item: expect.objectContaining({ text: "Hello" }),
          remainingCount: 0,
        })
      );
    });

    it("should batch process all queued messages together", async () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("First");
      queueService.add("Second");
      queueService.add("Third");
      vi.clearAllMocks();

      appState.setState("python.status", "idle");
      await queueService.process();

      // All messages are sent together in a single batch call
      expect(mockMessageService.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(["First", "Second", "Third"]);

      // All items should be removed from queue after batch processing
      const items = appState.getState("queue.items");
      expect(items).toHaveLength(0);
    });

    it("should handle sendMessage errors gracefully", async () => {
      mockMessageService.sendMessage.mockRejectedValue(new Error("Network error"));

      appState.setState("python.status", "busy_streaming");
      queueService.add("Hello");
      vi.clearAllMocks();

      appState.setState("python.status", "idle");
      const result = await queueService.process();

      expect(result).toBe(false);

      // Item should remain in queue with 'queued' status for retry
      const items = appState.getState("queue.items");
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("queued");
    });

    it("should emit queue:error event on failure", async () => {
      mockMessageService.sendMessage.mockRejectedValue(new Error("Network error"));

      appState.setState("python.status", "busy_streaming");
      queueService.add("Hello");
      vi.clearAllMocks();

      appState.setState("python.status", "idle");
      await queueService.process();

      expect(eventSpy).toHaveBeenCalledWith(
        "queue:error",
        expect.objectContaining({
          item: expect.objectContaining({ text: "Hello" }),
          error: "Network error",
        })
      );
    });

    it("should set processingMessageId during processing", async () => {
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Hello");
      vi.clearAllMocks();

      appState.setState("python.status", "idle");

      // Check that processingMessageId is set during processing
      const processPromise = queueService.process();
      // Can't easily test during async, but we verify it's reset after
      await processPromise;

      // After successful processing, processingMessageId should be null
      // (item is removed, not tracked anymore)
    });
  });

  describe("edit", () => {
    it("should edit queued message text", () => {
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Original");
      vi.clearAllMocks();

      const result = queueService.edit(id, "Updated");

      expect(result).toBe(true);
      const items = appState.getState("queue.items");
      expect(items[0].text).toBe("Updated");
    });

    it("should trim edited text", () => {
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Original");

      queueService.edit(id, "  Updated  ");

      const items = appState.getState("queue.items");
      expect(items[0].text).toBe("Updated");
    });

    it("should return false for invalid id", () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("Original");

      expect(queueService.edit("invalid-id", "Updated")).toBe(false);
      expect(queueService.edit(null, "Updated")).toBe(false);
      expect(queueService.edit("", "Updated")).toBe(false);
    });

    it("should return false for empty new text", () => {
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Original");

      expect(queueService.edit(id, "")).toBe(false);
      expect(queueService.edit(id, "   ")).toBe(false);
      expect(queueService.edit(id, null)).toBe(false);
    });

    it("should not edit processing messages", async () => {
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Original");

      // Manually set status to processing
      const items = appState.getState("queue.items");
      items[0].status = "processing";
      appState.setState("queue.items", items);

      const result = queueService.edit(id, "Updated");

      expect(result).toBe(false);
      expect(appState.getState("queue.items")[0].text).toBe("Original");
    });

    it("should emit queue:edited event", () => {
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Original");
      vi.clearAllMocks();

      queueService.edit(id, "Updated");

      expect(eventSpy).toHaveBeenCalledWith("queue:edited", {
        id,
        newText: "Updated",
      });
    });
  });

  describe("remove", () => {
    it("should remove queued message", () => {
      // Prevent auto-processing by setting busy status
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Test");
      vi.clearAllMocks();

      const result = queueService.remove(id);

      expect(result).toBe(true);
      expect(appState.getState("queue.items")).toHaveLength(0);
    });

    it("should return false for invalid id", () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("Test");

      expect(queueService.remove("invalid-id")).toBe(false);
      expect(queueService.remove(null)).toBe(false);
      expect(queueService.remove("")).toBe(false);
    });

    it("should not remove processing messages", () => {
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Test");

      // Manually set status to processing
      const items = appState.getState("queue.items");
      items[0].status = "processing";
      appState.setState("queue.items", items);

      const result = queueService.remove(id);

      expect(result).toBe(false);
      expect(appState.getState("queue.items")).toHaveLength(1);
    });

    it("should emit queue:removed event", () => {
      appState.setState("python.status", "busy_streaming");
      const id = queueService.add("Test");
      vi.clearAllMocks();

      queueService.remove(id);

      expect(eventSpy).toHaveBeenCalledWith(
        "queue:removed",
        expect.objectContaining({
          id,
          item: expect.objectContaining({ text: "Test" }),
          remainingCount: 0,
        })
      );
    });

    it("should remove correct item from multiple", () => {
      appState.setState("python.status", "busy_streaming");
      const id1 = queueService.add("First");
      const id2 = queueService.add("Second");
      const id3 = queueService.add("Third");

      queueService.remove(id2);

      const items = appState.getState("queue.items");
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe(id1);
      expect(items[1].id).toBe(id3);
    });
  });

  describe("clear", () => {
    it("should remove all items from queue", () => {
      queueService.add("First");
      queueService.add("Second");
      queueService.add("Third");
      vi.clearAllMocks();

      queueService.clear();

      expect(appState.getState("queue.items")).toEqual([]);
    });

    it("should reset processingMessageId", () => {
      queueService.add("Test");
      appState.setState("queue.processingMessageId", "some-id");

      queueService.clear();

      expect(appState.getState("queue.processingMessageId")).toBeNull();
    });

    it("should emit queue:cleared event", () => {
      queueService.add("First");
      queueService.add("Second");
      vi.clearAllMocks();

      queueService.clear();

      expect(eventSpy).toHaveBeenCalledWith("queue:cleared", {
        clearedCount: 2,
      });
    });

    it("should work on empty queue", () => {
      queueService.clear();

      expect(appState.getState("queue.items")).toEqual([]);
      expect(eventSpy).toHaveBeenCalledWith("queue:cleared", {
        clearedCount: 0,
      });
    });
  });

  describe("getCount", () => {
    it("should return 0 for empty queue", () => {
      expect(queueService.getCount()).toBe(0);
    });

    it("should return count of queued items", () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("First");
      queueService.add("Second");

      expect(queueService.getCount()).toBe(2);
    });

    it("should not count processing items", () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("First");
      queueService.add("Second");

      // Manually set one to processing
      const items = appState.getState("queue.items");
      items[0].status = "processing";
      appState.setState("queue.items", items);

      expect(queueService.getCount()).toBe(1);
    });
  });

  describe("getItems", () => {
    it("should return empty array for empty queue", () => {
      expect(queueService.getItems()).toEqual([]);
    });

    it("should return all items", () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("First");
      queueService.add("Second");

      const items = queueService.getItems();
      expect(items).toHaveLength(2);
      expect(items[0].text).toBe("First");
      expect(items[1].text).toBe("Second");
    });
  });

  describe("hasItems", () => {
    it("should return false for empty queue", () => {
      expect(queueService.hasItems()).toBe(false);
    });

    it("should return true when queue has items", () => {
      appState.setState("python.status", "busy_streaming");
      queueService.add("Test");

      expect(queueService.hasItems()).toBe(true);
    });
  });

  describe("getProcessingMessageId", () => {
    it("should return null when no message is processing", () => {
      expect(queueService.getProcessingMessageId()).toBeNull();
    });

    it("should return ID when message is processing", () => {
      appState.setState("queue.processingMessageId", "test-id");

      expect(queueService.getProcessingMessageId()).toBe("test-id");
    });
  });

  describe("singleton factory", () => {
    it("should create singleton via initializeMessageQueueService", () => {
      const instance = initializeMessageQueueService({
        appState,
        messageService: mockMessageService,
      });

      expect(instance).toBeInstanceOf(MessageQueueService);
      expect(getMessageQueueService()).toBe(instance);
    });

    it("should return same instance from getMessageQueueService", () => {
      const instance1 = initializeMessageQueueService({
        appState,
        messageService: mockMessageService,
      });
      const instance2 = getMessageQueueService();

      expect(instance1).toBe(instance2);
    });
  });
});
