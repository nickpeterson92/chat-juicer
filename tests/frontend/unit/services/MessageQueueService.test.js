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
      // Keep sendMessage pending so items remain visible for assertion
      mockMessageService.sendMessage.mockReturnValue(new Promise(() => {}));
      const id = queueService.add("Hello world");

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const items = appState.getState("queue.items");
      expect(items).toHaveLength(1);
      expect(items[0].text).toBe("Hello world");
      expect(items[0].status).toBe("processing");
    });

    it("should trim message text", () => {
      mockMessageService.sendMessage.mockReturnValue(new Promise(() => {}));
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
      mockMessageService.sendMessage.mockReturnValue(new Promise(() => {}));
      const files = [{ name: "test.txt", size: 100 }];
      queueService.add("Message with file", files);

      const items = appState.getState("queue.items");
      expect(items[0].files).toEqual(files);
    });

    it("should emit queue:added event", () => {
      mockMessageService.sendMessage.mockReturnValue(new Promise(() => {}));
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
      mockMessageService.sendMessage.mockReturnValue(new Promise(() => {}));
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
      mockMessageService.sendMessage.mockReturnValue(new Promise(() => {}));
      const before = Date.now();
      queueService.add("Test");
      const after = Date.now();

      const items = appState.getState("queue.items");
      expect(items[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(items[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("process", () => {
    it("should return false when queue is empty", async () => {
      const result = await queueService.process();

      expect(result).toBe(false);
      expect(mockMessageService.sendMessage).not.toHaveBeenCalled();
    });

    it("should process queued messages even when python.status is busy", async () => {
      const item = {
        id: "id-1",
        text: "Hello",
        files: [],
        sessionId: null,
        timestamp: Date.now(),
        status: "queued",
      };
      const sessionId = item.sessionId;
      appState.setState("python.status", "busy_streaming");
      appState.setState("queue.items", [item]);

      const result = await queueService.process();

      expect(result).toBe(true);
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(["Hello"], sessionId);
    });

    it("should batch multiple messages including those with files", async () => {
      const items = [
        {
          id: "id-1",
          text: "Hello",
          files: [{ name: "test.txt" }],
          sessionId: null,
          timestamp: Date.now(),
          status: "queued",
        },
        {
          id: "id-2",
          text: "World",
          files: [],
          sessionId: null,
          timestamp: Date.now(),
          status: "queued",
        },
      ];
      const sessionId = items[0].sessionId;
      appState.setState("queue.items", items);

      await queueService.process();

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(["Hello", "World"], sessionId);
    });

    it("should emit processing event and update state", async () => {
      const items = [
        { id: "id-1", text: "Hello", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ];
      appState.setState("queue.items", items);

      await queueService.process();

      expect(eventSpy).toHaveBeenCalledWith(
        "queue:processing",
        expect.objectContaining({
          item: expect.objectContaining({ text: "Hello" }),
          batchSize: 1,
        })
      );
    });

    it("should remove items from queue after successful send", async () => {
      const items = [
        { id: "id-1", text: "Hello", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ];
      appState.setState("queue.items", items);

      await queueService.process();

      expect(appState.getState("queue.items")).toHaveLength(0);
      expect(appState.getState("queue.processingMessageId")).toBeNull();
    });

    it("should emit processed event on success", async () => {
      const items = [
        { id: "id-1", text: "Hello", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ];
      appState.setState("queue.items", items);

      await queueService.process();

      expect(eventSpy).toHaveBeenCalledWith(
        "queue:processed",
        expect.objectContaining({
          item: expect.objectContaining({ text: "Hello" }),
          remainingCount: 0,
          batchSize: 1,
        })
      );
    });

    it("should batch process all queued messages together", async () => {
      const items = [
        { id: "id-1", text: "First", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
        { id: "id-2", text: "Second", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
        { id: "id-3", text: "Third", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ];
      appState.setState("queue.items", items);

      await queueService.process();

      expect(mockMessageService.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(["First", "Second", "Third"], null);
      expect(appState.getState("queue.items")).toHaveLength(0);
    });

    it("should handle sendMessage errors gracefully", async () => {
      mockMessageService.sendMessage.mockRejectedValue(new Error("Network error"));
      const items = [
        { id: "id-1", text: "Hello", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ];
      appState.setState("queue.items", items);

      const result = await queueService.process();

      expect(result).toBe(false);
      const queued = appState.getState("queue.items");
      expect(queued).toHaveLength(1);
      expect(queued[0].status).toBe("queued");
      expect(eventSpy).toHaveBeenCalledWith(
        "queue:error",
        expect.objectContaining({
          item: expect.objectContaining({ text: "Hello" }),
          error: "Network error",
        })
      );
    });

    it("should reset processingMessageId after failure", async () => {
      mockMessageService.sendMessage.mockRejectedValue(new Error("Network error"));
      const items = [
        { id: "id-1", text: "Hello", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ];
      appState.setState("queue.items", items);

      await queueService.process();

      expect(appState.getState("queue.processingMessageId")).toBeNull();
    });
  });

  describe("edit", () => {
    it("should edit queued message text", () => {
      const id = "edit-1";
      appState.setState("queue.items", [
        { id, text: "Original", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

      const result = queueService.edit(id, "Updated");

      expect(result).toBe(true);
      const items = appState.getState("queue.items");
      expect(items[0].text).toBe("Updated");
    });

    it("should trim edited text", () => {
      const id = "edit-2";
      appState.setState("queue.items", [
        { id, text: "Original", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

      queueService.edit(id, "  Updated  ");

      const items = appState.getState("queue.items");
      expect(items[0].text).toBe("Updated");
    });

    it("should return false for invalid id", () => {
      appState.setState("queue.items", [
        { id: "valid-id", text: "Original", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

      expect(queueService.edit("invalid-id", "Updated")).toBe(false);
      expect(queueService.edit(null, "Updated")).toBe(false);
      expect(queueService.edit("", "Updated")).toBe(false);
    });

    it("should return false for empty new text", () => {
      const id = "edit-3";
      appState.setState("queue.items", [
        { id, text: "Original", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

      expect(queueService.edit(id, "")).toBe(false);
      expect(queueService.edit(id, "   ")).toBe(false);
      expect(queueService.edit(id, null)).toBe(false);
    });

    it("should not edit processing messages", async () => {
      const id = "edit-4";
      appState.setState("queue.items", [
        { id, text: "Original", files: [], sessionId: null, timestamp: Date.now(), status: "processing" },
      ]);

      const result = queueService.edit(id, "Updated");

      expect(result).toBe(false);
      expect(appState.getState("queue.items")[0].text).toBe("Original");
    });

    it("should emit queue:edited event", () => {
      const id = "edit-5";
      appState.setState("queue.items", [
        { id, text: "Original", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);
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
      const id = "remove-1";
      appState.setState("queue.items", [
        { id, text: "Test", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);
      vi.clearAllMocks();

      const result = queueService.remove(id);

      expect(result).toBe(true);
      expect(appState.getState("queue.items")).toHaveLength(0);
    });

    it("should return false for invalid id", () => {
      appState.setState("queue.items", [
        { id: "valid-id", text: "Test", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

      expect(queueService.remove("invalid-id")).toBe(false);
      expect(queueService.remove(null)).toBe(false);
      expect(queueService.remove("")).toBe(false);
    });

    it("should not remove processing messages", () => {
      const id = "remove-2";
      appState.setState("queue.items", [
        { id, text: "Test", files: [], sessionId: null, timestamp: Date.now(), status: "processing" },
      ]);

      const result = queueService.remove(id);

      expect(result).toBe(false);
      expect(appState.getState("queue.items")).toHaveLength(1);
    });

    it("should emit queue:removed event", () => {
      const id = "remove-3";
      appState.setState("queue.items", [
        { id, text: "Test", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);
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
      const id1 = "remove-first";
      const id2 = "remove-second";
      const id3 = "remove-third";
      appState.setState("queue.items", [
        { id: id1, text: "First", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
        { id: id2, text: "Second", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
        { id: id3, text: "Third", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

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
      appState.setState("queue.items", [
        { id: "c1", text: "First", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
        { id: "c2", text: "Second", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

      expect(queueService.getCount()).toBe(2);
    });

    it("should not count processing items", () => {
      appState.setState("queue.items", [
        { id: "c1", text: "First", files: [], sessionId: null, timestamp: Date.now(), status: "processing" },
        { id: "c2", text: "Second", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

      expect(queueService.getCount()).toBe(1);
    });
  });

  describe("getItems", () => {
    it("should return empty array for empty queue", () => {
      expect(queueService.getItems()).toEqual([]);
    });

    it("should return all items", () => {
      appState.setState("queue.items", [
        { id: "g1", text: "First", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
        { id: "g2", text: "Second", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

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
      appState.setState("queue.items", [
        { id: "h1", text: "Test", files: [], sessionId: null, timestamp: Date.now(), status: "queued" },
      ]);

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
