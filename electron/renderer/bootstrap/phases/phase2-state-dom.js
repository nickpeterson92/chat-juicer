/**
 * Phase 2: State & DOM
 * Initialize application state and verify DOM structure
 *
 * Dependencies: Phase 1 (adapters)
 * Outputs: AppState, DOM elements
 * Criticality: CRITICAL (missing DOM elements indicate HTML structure problem)
 */

import { AppState } from "../../core/state.js";
import { initializeElements } from "../../managers/dom-manager.js";

/**
 * Initialize state and DOM
 * @param {import('../types.js').AdapterPhaseResult} deps - Dependencies from Phase 1
 * @returns {Promise<import('../types.js').StateDomPhaseResult>}
 * @throws {Error} If required DOM elements are missing
 */
export async function initializeStateAndDOM({ domAdapter: _domAdapter, ipcAdapter }) {
  console.log("📦 Phase 2: Initializing state and DOM...");

  try {
    // Create state
    const appState = new AppState();
    console.log("  ✓ AppState created");

    // Inject appState into IPCAdapter for command queuing
    if (ipcAdapter) {
      ipcAdapter.setAppState(appState);
      console.log("  ✓ AppState injected into IPCAdapter");
    }

    // Initialize DOM element references
    initializeElements();
    const { elements } = await import("../../managers/dom-manager.js");
    console.log("  ✓ DOM elements initialized");

    // Verify critical DOM elements exist
    const requiredElements = [
      "chat-container",
      "sessions-list",
      "user-input",
      "send-btn",
      "welcome-page-container",
      "files-panel",
    ];

    const missing = requiredElements.filter((id) => !document.getElementById(id));

    if (missing.length > 0) {
      throw new Error(`Missing required DOM elements: ${missing.join(", ")}`);
    }

    console.log("  ✓ All required DOM elements present");

    return {
      appState,
      elements,
    };
  } catch (error) {
    console.error("❌ Phase 2 failed:", error);
    throw new Error(`State & DOM initialization failed: ${error.message}`);
  }
}
