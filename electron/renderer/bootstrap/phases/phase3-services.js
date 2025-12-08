/**
 * Phase 3: Services
 * Create service layer for business operations
 *
 * Dependencies: Phase 1 (adapters), Phase 2 (appState)
 * Outputs: MessageService, FileService, FunctionCallService, SessionService
 * Criticality: HIGH (services are core functionality)
 */

import { FileService } from "../../services/file-service.js";
import { FunctionCallService } from "../../services/function-call-service.js";
import { MessageService } from "../../services/message-service.js";
import { SessionService } from "../../services/session-service.js";
import { StreamManager } from "../../services/stream-manager.js";

/**
 * Initialize services
 * @param {Object} deps - Dependencies
 * @param {Object} deps.ipcAdapter - IPC adapter from Phase 1
 * @param {Object} deps.storageAdapter - Storage adapter from Phase 1
 * @param {Object} deps.appState - Application state from Phase 2
 * @returns {Promise<import('../types.js').ServicesPhaseResult>}
 * @throws {Error} If service initialization fails
 */
export async function initializeServices({ ipcAdapter, storageAdapter, appState }) {
  try {
    const messageService = new MessageService({ ipcAdapter, storageAdapter });
    const fileService = new FileService({ ipcAdapter, storageAdapter, appState });
    const functionCallService = new FunctionCallService({ storageAdapter, appState });
    const sessionService = new SessionService({ ipcAdapter, storageAdapter, appState });
    const streamManager = new StreamManager(appState);

    return {
      messageService,
      fileService,
      functionCallService,
      sessionService,
      streamManager,
    };
  } catch (error) {
    console.error("Phase 3 failed:", error);
    throw new Error(`Service initialization failed: ${error.message}`);
  }
}
