/**
 * Phase 7: Data Loading
 * Load initial data and show UI
 *
 * Dependencies: All previous phases
 * Outputs: Loaded sessions, model configuration
 * Criticality: LOW (data loading failures are recoverable)
 */

/**
 * Load initial data and show welcome view
 * @param {Object} deps - Dependencies from previous phases
 * @returns {Promise<import('../types.js').DataLoadingPhaseResult>}
 */
export async function loadInitialData({ elements, appState, services, components, ipcAdapter, updateSessionsList }) {
  try {
    // 1. Send renderer ready signal
    ipcAdapter.send("renderer-ready");

    // 2. Load model config metadata (prefetch for instant selectors)
    let cachedModelConfig = null;
    try {
      const configResult = await ipcAdapter.sendSessionCommand("config_metadata", {});
      if (configResult.success) {
        cachedModelConfig = {
          models: configResult.models,
          reasoning_levels: configResult.reasoning_levels,
        };

        // Initialize model selector via InputArea component
        if (components.inputArea) {
          await components.inputArea.initializeModelSelector(
            cachedModelConfig.models,
            cachedModelConfig.reasoning_levels
          );
        }

        // Cache in appState for welcome page
        appState.setState("ui.cachedModelConfig", cachedModelConfig);
      }
    } catch (error) {
      console.warn("Failed to load model config (non-critical):", error.message);
      // Non-critical - continue without model config
    }

    // 3. Load sessions
    let sessions = [];
    try {
      const result = await services.sessionService.loadSessions();
      if (result.success) {
        sessions = result.sessions || [];

        // Update sessions list UI
        updateSessionsList(sessions);

        // Load files for active session
        const currentSessionId = services.sessionService.getCurrentSessionId();
        if (currentSessionId && components.filePanel) {
          components.filePanel.setSession(currentSessionId);
          components.filePanel.loadSessionFiles();
        }
      }
    } catch (error) {
      console.warn("Failed to load sessions (non-critical):", error.message);
      // Non-critical - continue with empty session list
    }

    // 4. Show welcome page
    const { showWelcomeView } = await import("../../managers/view-manager.js");
    await showWelcomeView(elements, appState);

    return {
      sessions,
      modelConfig: cachedModelConfig,
    };
  } catch (error) {
    console.error("Phase 7 failed:", error);
    throw new Error(`Data loading failed: ${error.message}`);
  }
}
