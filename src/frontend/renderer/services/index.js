/**
 * Services barrel export
 * Central export point for all business logic services
 *
 * Phase 2 State Management Migration (2025-12-06):
 * - SessionService: Now requires appState in constructor
 *   - All session state (current, list, totalCount, hasMore, isLoading) managed via AppState
 *   - Observer pattern deprecated in favor of appState.subscribe()
 *   - Backwards compatible during transition period
 *
 * - FileService: Now requires appState in constructor
 *   - activeDirectory managed via AppState (files.activeDirectory)
 *   - fileCache remains internal (cache, not UI state)
 *
 * - StreamManager: New Phase 2 service for concurrent session streaming
 *   - Per-session streaming state management
 *   - Background session event buffering
 *   - Stream state reconstruction on session switch
 *
 * Constructor Requirements:
 * - SessionService({ ipcAdapter, storageAdapter, appState })
 * - FileService({ ipcAdapter, storageAdapter, appState })
 * - MessageService({ ipcAdapter, storageAdapter }) - unchanged
 * - FunctionCallService({ ipcAdapter, storageAdapter }) - unchanged
 * - MessageQueueService({ appState, messageService }) - message queue management
 * - StreamManager({ appState }) - concurrent session streaming
 */

export { FileService } from "./file-service.js";
export { CallStatus, FunctionCallService } from "./function-call-service.js";
export {
  getMessageQueueService,
  initializeMessageQueueService,
  MessageQueueService,
} from "./message-queue-service.js";
export { MessageService } from "./message-service.js";
export { SessionService } from "./session-service.js";
export { StreamManager } from "./stream-manager.js";
