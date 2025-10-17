/**
 * Main process configuration constants
 * @module config/main-constants
 */

// Process lifecycle timing
const RESTART_DELAY = 2000; // 2 seconds - delay before restarting Python process
const RESTART_CALLBACK_DELAY = 500; // 500ms - delay before sending restart event
const GRACEFUL_SHUTDOWN_TIMEOUT = 5000; // 5 seconds - timeout for graceful shutdown
const SIGTERM_DELAY = 500; // 500ms - delay before sending SIGTERM after quit command

// Health monitoring
const HEALTH_CHECK_INTERVAL = 300000; // 5 minutes - interval for process health checks (reduced from 30s for performance)

module.exports = {
  RESTART_DELAY,
  RESTART_CALLBACK_DELAY,
  GRACEFUL_SHUTDOWN_TIMEOUT,
  SIGTERM_DELAY,
  HEALTH_CHECK_INTERVAL,
};
