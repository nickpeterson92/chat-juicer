/**
 * MessageQueueService - Message queue management for queuing user messages
 * Allows users to queue messages while the agent is processing
 *
 * Uses EventBus for decoupled communication and AppState for state management.
 * Queue is frontend-only - backend processes messages one at a time as before.
 */

import { globalEventBus } from "../core/event-bus.js";

/**
 * @typedef {Object} QueueItem
 * @property {string} id - Unique identifier (crypto.randomUUID())
 * @property {string} text - Message text content
 * @property {Array} files - Array of file objects to send with message
 * @property {number} timestamp - Date.now() when queued
 * @property {'queued' | 'processing' | 'cancelled'} status - Current status
 */

/**
 * MessageQueueService class
 * Manages message queue with EventBus integration
 */
export class MessageQueueService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.appState - AppState instance for state management
   * @param {Object} dependencies.messageService - MessageService for sending messages
   * @param {Object} dependencies.streamManager - StreamManager for checking streaming state
   */
  constructor({ appState, messageService, streamManager }) {
    if (!appState) {
      throw new Error("MessageQueueService requires appState");
    }
    if (!messageService) {
      throw new Error("MessageQueueService requires messageService");
    }
    if (!streamManager) {
      throw new Error("MessageQueueService requires streamManager");
    }

    this.appState = appState;
    this.messageService = messageService;
    this.streamManager = streamManager;

    // Subscribe to python.status changes to auto-process queue when idle
    this.appState.subscribe("python.status", (status) => {
      if (status === "idle") {
        // Small delay to ensure UI state is settled
        setTimeout(() => this.process(), 50);
      }
    });
  }

  /**
   * Add message to queue and attempt to process
   * @param {string} text - Message text
   * @param {Array} files - File attachments (optional)
   * @param {string|null} sessionId - Session ID for routing (Phase 3: Concurrent Sessions)
   * @returns {string} Queue item ID
   */
  add(text, files = [], sessionId = null) {
    if (!text || typeof text !== "string" || !text.trim()) {
      throw new Error("Message text cannot be empty");
    }

    // Create queue item with sessionId for concurrent session support
    const item = {
      id: crypto.randomUUID(),
      text: text.trim(),
      files: files || [],
      sessionId: sessionId, // Track which session this message belongs to
      timestamp: Date.now(),
      status: "queued",
    };

    // Get current queue items and add new item
    const currentItems = [...(this.appState.getState("queue.items") || [])];
    currentItems.push(item);
    this.appState.setState("queue.items", currentItems);

    // Publish event
    globalEventBus.emit("queue:added", {
      item,
      queueLength: currentItems.length,
    });

    // Attempt to process immediately
    this.process();

    return item.id;
  }

  /**
   * Process all queued messages as a batch
   * All queued messages are sent together and receive a single agent response.
   * Note: With concurrent sessions, we filter out items whose sessions are still streaming.
   * Only items for idle sessions are processed.
   * @returns {Promise<boolean>} True if messages were sent
   */
  async process() {
    // Get ALL queued messages (not just the next one)
    const items = this.appState.getState("queue.items") || [];
    const queuedItems = items.filter((item) => item.status === "queued");

    if (queuedItems.length === 0) {
      return false;
    }

    // Filter out items whose sessions are currently streaming
    // These should stay queued until their session becomes idle
    const readyItems = queuedItems.filter((item) => {
      if (!item.sessionId) {
        // No session ID - check global streaming state
        return !this.appState.getState("message.isStreaming");
      }
      // Check if this specific session is streaming
      return !this.streamManager.isStreaming(item.sessionId);
    });

    if (readyItems.length === 0) {
      // All queued items belong to sessions that are still streaming
      return false;
    }

    // Mark only READY items as processing (not all queued items)
    const readyIds = new Set(readyItems.map((item) => item.id));
    const updatedItems = items.map((item) => (readyIds.has(item.id) ? { ...item, status: "processing" } : item));
    this.appState.setState("queue.items", updatedItems);
    // Store first item ID for backwards compatibility
    this.appState.setState("queue.processingMessageId", readyItems[0].id);

    // Publish processing event for batch
    globalEventBus.emit("queue:processing", {
      item: readyItems[0], // First item for backwards compatibility
      items: readyItems, // All items for batch-aware handlers
      batchSize: readyItems.length,
    });

    // Group items by session ID to prevent cross-session message leaks
    const itemsBySession = {};
    for (const item of readyItems) {
      const sid = item.sessionId || "null"; // Use string key
      if (!itemsBySession[sid]) itemsBySession[sid] = [];
      itemsBySession[sid].push(item);
    }

    let anySuccess = false;

    // Process each session's batch in parallel
    const promises = Object.entries(itemsBySession).map(async ([sidKey, sessionItems]) => {
      const sessionId = sidKey === "null" ? null : sidKey;

      try {
        // Extract text from all queued items for this session
        const messageTexts = sessionItems.map((item) => item.text);

        // Send messages via MessageService with sessionId for proper routing
        await this.messageService.sendMessage(messageTexts, sessionId);

        // Mark these items as successful (to be removed)
        return { success: true, items: sessionItems };
      } catch (error) {
        // Return failure info
        return { success: false, items: sessionItems, error: error.message };
      }
    });

    const results = await Promise.all(promises);

    // Process results to update state once
    const successfulIds = new Set();
    const failedIds = new Set();
    const errors = [];

    for (const result of results) {
      if (result.success) {
        anySuccess = true;
        for (const item of result.items) {
          successfulIds.add(item.id);
        }

        // Emit processed event for this session's batch
        globalEventBus.emit("queue:processed", {
          item: result.items[0],
          items: result.items,
          batchSize: result.items.length,
          remainingCount: 0, // Approximate, mostly for UI triggers
        });
      } else {
        for (const item of result.items) {
          failedIds.add(item.id);
        }
        errors.push(result.error);

        // Emit error for this batch
        globalEventBus.emit("queue:error", {
          item: result.items[0],
          items: result.items,
          batchSize: result.items.length,
          error: result.error,
        });
      }
    }

    // Final state update
    const finalItems = this.appState.getState("queue.items") || [];
    const nextItems = finalItems
      .filter((item) => !successfulIds.has(item.id))
      .map((item) => {
        // Revert failed items to queued
        if (failedIds.has(item.id)) {
          return { ...item, status: "queued" };
        }
        return item;
      });

    this.appState.setState("queue.items", nextItems);
    this.appState.setState("queue.processingMessageId", null);

    return anySuccess;
  }

  /**
   * Edit a queued message's text
   * @param {string} id - Queue item ID
   * @param {string} newText - Updated message text
   * @returns {boolean} True if edit was successful
   */
  edit(id, newText) {
    if (!id || typeof id !== "string") {
      return false;
    }
    if (!newText || typeof newText !== "string" || !newText.trim()) {
      return false;
    }

    const items = this.appState.getState("queue.items") || [];
    const itemIndex = items.findIndex((item) => item.id === id);

    if (itemIndex === -1) {
      return false;
    }

    const item = items[itemIndex];

    // Can only edit queued items, not processing ones
    if (item.status !== "queued") {
      return false;
    }

    // Update item text
    const updatedItems = [...items];
    updatedItems[itemIndex] = { ...item, text: newText.trim() };
    this.appState.setState("queue.items", updatedItems);

    // Publish event
    globalEventBus.emit("queue:edited", {
      id,
      newText: newText.trim(),
    });

    return true;
  }

  /**
   * Remove a queued message (cancel it)
   * @param {string} id - Queue item ID
   * @returns {boolean} True if removal was successful
   */
  remove(id) {
    if (!id || typeof id !== "string") {
      return false;
    }

    const items = this.appState.getState("queue.items") || [];
    const item = items.find((i) => i.id === id);

    if (!item) {
      return false;
    }

    // Can only remove queued items, not processing ones
    if (item.status === "processing") {
      return false;
    }

    // Remove item from queue
    const remainingItems = items.filter((i) => i.id !== id);
    this.appState.setState("queue.items", remainingItems);

    // Publish event
    globalEventBus.emit("queue:removed", {
      id,
      item,
      remainingCount: remainingItems.length,
    });

    return true;
  }

  /**
   * Clear entire queue (e.g., on session switch)
   */
  clear() {
    const items = this.appState.getState("queue.items") || [];
    const clearedCount = items.length;

    this.appState.setState("queue.items", []);
    this.appState.setState("queue.processingMessageId", null);

    // Publish event
    globalEventBus.emit("queue:cleared", {
      clearedCount,
    });
  }

  /**
   * Get queue count for UI display
   * @returns {number} Count of items with status === 'queued'
   */
  getCount() {
    const items = this.appState.getState("queue.items") || [];
    return items.filter((item) => item.status === "queued").length;
  }

  /**
   * Get all queue items
   * @returns {QueueItem[]} Array of queue items
   */
  getItems() {
    return this.appState.getState("queue.items") || [];
  }

  /**
   * Check if queue has items
   * @returns {boolean} True if queue has items
   */
  hasItems() {
    const items = this.appState.getState("queue.items") || [];
    return items.length > 0;
  }

  /**
   * Get processing message ID
   * @returns {string|null} ID of currently processing message or null
   */
  getProcessingMessageId() {
    return this.appState.getState("queue.processingMessageId");
  }
}

// Factory function for creating MessageQueueService with dependencies
let instance = null;

/**
 * Initialize MessageQueueService singleton
 * @param {Object} dependencies
 * @param {Object} dependencies.appState - AppState instance
 * @param {Object} dependencies.messageService - MessageService instance
 * @param {Object} dependencies.streamManager - StreamManager instance
 * @returns {MessageQueueService}
 */
export function initializeMessageQueueService({ appState, messageService, streamManager }) {
  instance = new MessageQueueService({ appState, messageService, streamManager });
  return instance;
}

/**
 * Get MessageQueueService singleton instance
 * @returns {MessageQueueService|null}
 */
export function getMessageQueueService() {
  return instance;
}
