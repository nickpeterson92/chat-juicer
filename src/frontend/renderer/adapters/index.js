/**
 * Adapters - Centralized export for all adapter interfaces
 *
 * These adapters provide testable abstractions over browser/Electron APIs,
 * enabling proper unit testing without requiring a full browser environment.
 */

export { DOMAdapter, domAdapter } from "./DOMAdapter.js";
export { IPCAdapter, ipcAdapter } from "./IPCAdapter.js";
export { StorageAdapter, storageAdapter } from "./StorageAdapter.js";
