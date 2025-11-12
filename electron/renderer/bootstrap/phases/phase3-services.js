/**
 * Phase 3: Services
 * Create service layer for business operations
 *
 * Dependencies: Phase 1 (adapters)
 * Outputs: MessageService, FileService, FunctionCallService, SessionService
 * Criticality: HIGH (services are core functionality)
 */

import { FileService } from "../../services/file-service.js";
import { FunctionCallService } from "../../services/function-call-service.js";
import { MessageService } from "../../services/message-service.js";
import { SessionService } from "../../services/session-service.js";

/**
 * Initialize services
 * @param {import('../types.js').AdapterPhaseResult} deps - Dependencies from Phase 1
 * @returns {Promise<import('../types.js').ServicesPhaseResult>}
 * @throws {Error} If service initialization fails
 */
export async function initializeServices({ ipcAdapter, storageAdapter }) {
  console.log("📦 Phase 3: Initializing services...");

  try {
    const messageService = new MessageService({ ipcAdapter, storageAdapter });
    const fileService = new FileService({ ipcAdapter, storageAdapter });
    const functionCallService = new FunctionCallService({ ipcAdapter, storageAdapter });
    const sessionService = new SessionService({ ipcAdapter, storageAdapter });

    console.log("  ✓ MessageService created");
    console.log("  ✓ FileService created");
    console.log("  ✓ FunctionCallService created");
    console.log("  ✓ SessionService created");

    return {
      messageService,
      fileService,
      functionCallService,
      sessionService,
    };
  } catch (error) {
    console.error("❌ Phase 3 failed:", error);
    throw new Error(`Service initialization failed: ${error.message}`);
  }
}
