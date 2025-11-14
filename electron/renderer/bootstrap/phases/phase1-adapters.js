/**
 * Phase 1: Adapters
 * Initialize platform abstraction layer
 *
 * Dependencies: None (foundation layer)
 * Outputs: DOMAdapter, IPCAdapter, StorageAdapter, EventBus
 * Criticality: CRITICAL (cannot proceed without adapters)
 */

import { DOMAdapter } from "../../adapters/DOMAdapter.js";
import { IPCAdapter } from "../../adapters/IPCAdapter.js";
import { StorageAdapter } from "../../adapters/StorageAdapter.js";

/**
 * Initialize adapters (platform abstraction layer)
 * @returns {Promise<import('../types.js').AdapterPhaseResult>}
 * @throws {Error} If any adapter fails to initialize
 */
export async function initializeAdapters() {
  console.log("📦 Phase 1: Initializing adapters...");

  // One-time cleanup: Remove legacy theme preference
  if (localStorage.getItem("theme")) {
    localStorage.removeItem("theme");
    console.log("  ✓ Cleaned up legacy theme preference");
  }

  try {
    // Create adapters (synchronous, no network calls)
    const domAdapter = new DOMAdapter();
    const ipcAdapter = new IPCAdapter();
    const storageAdapter = new StorageAdapter();

    // Import global event bus
    const { globalEventBus } = await import("../../core/event-bus.js");

    // Verify adapters initialized correctly
    if (!domAdapter || !ipcAdapter || !storageAdapter || !globalEventBus) {
      throw new Error("One or more adapters failed to initialize");
    }

    console.log("  ✓ DOMAdapter initialized");
    console.log("  ✓ IPCAdapter initialized");
    console.log("  ✓ StorageAdapter initialized");
    console.log("  ✓ EventBus ready");

    return {
      domAdapter,
      ipcAdapter,
      storageAdapter,
      eventBus: globalEventBus,
    };
  } catch (error) {
    console.error("❌ Phase 1 failed:", error);
    throw new Error(`Adapter initialization failed: ${error.message}`);
  }
}
