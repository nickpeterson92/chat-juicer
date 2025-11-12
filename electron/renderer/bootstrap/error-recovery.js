/**
 * Bootstrap Error Recovery System
 * Provides graceful degradation strategies for phase failures
 */

/**
 * Error recovery strategies
 */
export const ErrorRecoveryStrategy = {
  FAIL_IMMEDIATELY: "fail_immediately", // Critical error, cannot continue
  CONTINUE_DEGRADED: "continue_degraded", // Continue with reduced functionality
  RETRY: "retry", // Retry the operation
  SHOW_ERROR_UI: "show_error_ui", // Show error to user, wait for action
};

/**
 * Phase criticality levels
 */
const PhaseCriticality = {
  CRITICAL: "critical", // Must succeed or app is unusable
  HIGH: "high", // Important but app can work in degraded mode
  MEDIUM: "medium", // App works without this feature
  LOW: "low", // Enhancement only, app fully functional without it
};

/**
 * Phase error handling configuration
 */
const phaseErrorHandling = {
  adapters: {
    criticality: PhaseCriticality.CRITICAL,
    strategy: ErrorRecoveryStrategy.FAIL_IMMEDIATELY,
    message: "Cannot initialize platform adapters. Please reload the application.",
  },
  stateDOM: {
    criticality: PhaseCriticality.CRITICAL,
    strategy: ErrorRecoveryStrategy.SHOW_ERROR_UI,
    message: "Missing required DOM elements. Check that index.html is properly loaded.",
  },
  services: {
    criticality: PhaseCriticality.HIGH,
    strategy: ErrorRecoveryStrategy.RETRY,
    retries: 3,
    retryDelay: 1000,
    fallback: ErrorRecoveryStrategy.CONTINUE_DEGRADED,
    message: "Backend services unavailable. Running in offline mode.",
  },
  components: {
    criticality: PhaseCriticality.HIGH,
    strategy: ErrorRecoveryStrategy.CONTINUE_DEGRADED,
    message: "Some UI components failed to initialize. Functionality may be limited.",
  },
  eventHandlers: {
    criticality: PhaseCriticality.MEDIUM,
    strategy: ErrorRecoveryStrategy.CONTINUE_DEGRADED,
    message: "Some event handlers failed to attach. Some interactions may not work.",
  },
  plugins: {
    criticality: PhaseCriticality.LOW,
    strategy: ErrorRecoveryStrategy.CONTINUE_DEGRADED,
    message: "Plugin system partially unavailable. Core functionality works.",
  },
  dataLoading: {
    criticality: PhaseCriticality.LOW,
    strategy: ErrorRecoveryStrategy.CONTINUE_DEGRADED,
    message: "Failed to load initial data. You can reload sessions manually.",
  },
  finalization: {
    criticality: PhaseCriticality.HIGH,
    strategy: ErrorRecoveryStrategy.SHOW_ERROR_UI,
    message: "An error occurred during application finalization. Please reload the application.",
  },
};

/**
 * Handle phase error with appropriate recovery strategy
 * @param {Error} error - The error that occurred
 * @param {Object} phaseResults - Completed phase results
 * @returns {Object} Recovery decision
 */
export async function handlePhaseError(error, phaseResults) {
  // Determine which phase failed
  const failedPhase = identifyFailedPhase(error, phaseResults);
  const config = phaseErrorHandling[failedPhase];

  console.error(`❌ Phase ${failedPhase} failed:`, error.message);
  console.error("Stack:", error.stack);

  // Log completed phases
  const completedPhases = Object.keys(phaseResults);
  console.log("✅ Completed phases:", completedPhases.join(", "));

  // Execute recovery strategy
  switch (config.strategy) {
    case ErrorRecoveryStrategy.FAIL_IMMEDIATELY:
      return {
        strategy: ErrorRecoveryStrategy.FAIL_IMMEDIATELY,
        message: config.message,
        phase: failedPhase,
      };

    case ErrorRecoveryStrategy.RETRY:
      if (config.retries > 0) {
        console.log(`🔄 Retrying phase ${failedPhase} (${config.retries} attempts remaining)...`);
        return {
          strategy: ErrorRecoveryStrategy.RETRY,
          message: `Retrying ${failedPhase}...`,
          phase: failedPhase,
        };
      }
      // Fall through to fallback strategy
      return {
        strategy: config.fallback,
        message: config.message,
        phase: failedPhase,
      };

    case ErrorRecoveryStrategy.CONTINUE_DEGRADED:
      return {
        strategy: ErrorRecoveryStrategy.CONTINUE_DEGRADED,
        message: config.message,
        phase: failedPhase,
        degradedFeatures: getDegradedFeatures(failedPhase),
      };

    case ErrorRecoveryStrategy.SHOW_ERROR_UI:
      return {
        strategy: ErrorRecoveryStrategy.SHOW_ERROR_UI,
        message: config.message,
        phase: failedPhase,
        error: error,
      };

    default:
      return {
        strategy: ErrorRecoveryStrategy.FAIL_IMMEDIATELY,
        message: "Unknown error recovery strategy",
        phase: failedPhase,
      };
  }
}

/**
 * Identify which phase failed based on error and completed phases
 */
function identifyFailedPhase(_error, phaseResults) {
  const phases = ["adapters", "stateDOM", "services", "components", "eventHandlers", "plugins", "dataLoading"];
  const completedPhases = Object.keys(phaseResults);

  // Find first phase not completed
  for (const phase of phases) {
    if (!completedPhases.includes(phase)) {
      return phase;
    }
  }

  // If all phases completed but error occurred, it's in finalization
  return "finalization";
}

/**
 * Get list of degraded features for failed phase
 */
function getDegradedFeatures(failedPhase) {
  const degradationMap = {
    services: [
      "Cannot send messages to backend",
      "Cannot upload files",
      "Cannot create/switch sessions",
      "UI-only mode (view existing data only)",
    ],
    components: [
      "Some UI components may not render",
      "File drag-and-drop may not work",
      "Input area may have limited functionality",
    ],
    eventHandlers: [
      "Some buttons may not respond",
      "Drag-and-drop may not work",
      "Keyboard shortcuts may be unavailable",
    ],
    plugins: ["Analytics disabled", "Performance metrics unavailable", "Debug tools unavailable"],
    dataLoading: [
      "Session list may be empty",
      "Model configuration may use defaults",
      "Welcome page may show placeholder content",
    ],
    finalization: [
      "Application state may be inconsistent",
      "Some features may not work correctly",
      "Reload recommended",
    ],
  };

  return degradationMap[failedPhase] || ["Unknown degradation"];
}
