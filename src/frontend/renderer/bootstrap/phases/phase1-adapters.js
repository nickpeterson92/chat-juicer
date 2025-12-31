/**
 * Phase 1: Adapters
 * Initialize platform abstraction layer
 *
 * Dependencies: None (foundation layer)
 * Outputs: DOMAdapter, IPCAdapter/BrowserAPIAdapter, StorageAdapter, EventBus
 * Criticality: CRITICAL (cannot proceed without adapters)
 *
 * Runtime Detection:
 * - Electron: Uses IPCAdapter (window.electronAPI present)
 * - Browser: Uses BrowserAPIAdapter (direct HTTP/WebSocket)
 */

import { DOMAdapter } from "../../adapters/DOMAdapter.js";
import { StorageAdapter } from "../../adapters/StorageAdapter.js";

// Runtime environment detection
const isElectron = !!globalThis.window?.electronAPI;

// API base URL for browser mode (injected by Vite build)
const API_BASE = import.meta.env?.VITE_API_BASE || "https://api.chat-juicer.com";

/**
 * Initialize adapters (platform abstraction layer)
 * @returns {Promise<import('../types.js').AdapterPhaseResult>}
 * @throws {Error} If any adapter fails to initialize
 */
export async function initializeAdapters() {
  // One-time cleanup: Remove legacy theme preference
  if (localStorage.getItem("theme")) {
    localStorage.removeItem("theme");
  }

  try {
    // Create DOM and storage adapters (same for both platforms)
    const domAdapter = new DOMAdapter();
    const storageAdapter = new StorageAdapter();

    // Create platform-specific IPC adapter
    let ipcAdapter;
    if (isElectron) {
      // Electron environment - use IPC to main process
      const { IPCAdapter } = await import("../../adapters/IPCAdapter.js");
      ipcAdapter = new IPCAdapter();
      console.log("[Phase1] Using IPCAdapter (Electron)");
    } else {
      // Browser environment - direct HTTP/WebSocket
      const { BrowserAPIAdapter } = await import("../../adapters/BrowserAPIAdapter.js");
      ipcAdapter = new BrowserAPIAdapter(API_BASE);
      console.log("[Phase1] Using BrowserAPIAdapter (Browser)", { apiBase: API_BASE });
    }

    // Import global event bus
    const { globalEventBus } = await import("../../core/event-bus.js");

    // Verify adapters initialized correctly
    if (!domAdapter || !ipcAdapter || !storageAdapter || !globalEventBus) {
      throw new Error("One or more adapters failed to initialize");
    }

    return {
      domAdapter,
      ipcAdapter,
      storageAdapter,
      eventBus: globalEventBus,
    };
  } catch (error) {
    console.error("Phase 1 failed:", error);
    throw new Error(`Adapter initialization failed: ${error.message}`);
  }
}

// Export runtime detection for other modules
export { isElectron, API_BASE };
