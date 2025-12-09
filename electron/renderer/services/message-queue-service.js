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
   */
  constructor({ appState, messageService }) {
    if (!appState) {
      throw new Error("MessageQueueService requires appState");
    }
    if (!messageService) {
      throw new Error("MessageQueueService requires messageService");
    }

    this.appState = appState;
    this.messageService = messageService;

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
   * Note: With concurrent sessions, we don't check global python.status.
   * The backend enforces MAX_CONCURRENT_STREAMS and rejects if limit exceeded.
   * @returns {Promise<boolean>} True if messages were sent
   */
  async process() {
    // Get ALL queued messages (not just the next one)
    const items = this.appState.getState("queue.items") || [];
    const queuedItems = items.filter((item) => item.status === "queued");

    if (queuedItems.length === 0) {
      return false;
    }

    // Mark ALL queued items as processing
    const queuedIds = new Set(queuedItems.map((item) => item.id));
    const updatedItems = items.map((item) => (queuedIds.has(item.id) ? { ...item, status: "processing" } : item));
    this.appState.setState("queue.items", updatedItems);
    // Store first item ID for backwards compatibility
    this.appState.setState("queue.processingMessageId", queuedItems[0].id);

    // Publish processing event for batch
    globalEventBus.emit("queue:processing", {
      item: queuedItems[0], // First item for backwards compatibility
      items: queuedItems, // All items for batch-aware handlers
      batchSize: queuedItems.length,
    });

    try {
      // Extract text from all queued items and send as batch
      const messageTexts = queuedItems.map((item) => item.text);

      // Get sessionId from first queued item (all should be for same session)
      const sessionId = queuedItems[0]?.sessionId || null;

      // Send all messages via MessageService with sessionId for proper routing
      await this.messageService.sendMessage(messageTexts, sessionId);

      // Remove ALL processed items from queue (they're now "in flight")
      const remainingItems = updatedItems.filter((item) => !queuedIds.has(item.id));
      this.appState.setState("queue.items", remainingItems);
      this.appState.setState("queue.processingMessageId", null);

      // Publish processed event for batch
      globalEventBus.emit("queue:processed", {
        item: queuedItems[0], // First item for backwards compatibility
        items: queuedItems, // All items for batch-aware handlers
        batchSize: queuedItems.length,
        remainingCount: remainingItems.length,
      });

      return true;
    } catch (error) {
      // On error, mark ALL as failed but leave in queue for user to retry/cancel
      const errorItems = updatedItems.map((item) => (queuedIds.has(item.id) ? { ...item, status: "queued" } : item));
      this.appState.setState("queue.items", errorItems);
      this.appState.setState("queue.processingMessageId", null);

      globalEventBus.emit("queue:error", {
        item: queuedItems[0], // First item for backwards compatibility
        items: queuedItems, // All items for batch-aware handlers
        batchSize: queuedItems.length,
        error: error.message,
      });

      return false;
    }
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
 * @returns {MessageQueueService}
 */
export function initializeMessageQueueService({ appState, messageService }) {
  instance = new MessageQueueService({ appState, messageService });
  return instance;
}

/**
 * Get MessageQueueService singleton instance
 * @returns {MessageQueueService|null}
 */
export function getMessageQueueService() {
  return instance;
}
