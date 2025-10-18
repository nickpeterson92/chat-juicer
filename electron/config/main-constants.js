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

// IPC operation timeouts
const FILE_UPLOAD_TIMEOUT = 10000; // 10 seconds - timeout for file upload operations
const SESSION_COMMAND_TIMEOUT = 5000; // 5 seconds - default session command timeout
const SUMMARIZE_COMMAND_TIMEOUT = 30000; // 30 seconds - LLM summarization needs longer timeout

// Window configuration
const WINDOW_DEFAULT_WIDTH = 1200; // Default window width
const WINDOW_DEFAULT_HEIGHT = 800; // Default window height
const WINDOW_MIN_WIDTH = 800; // Minimum window width
const WINDOW_MIN_HEIGHT = 600; // Minimum window height

// File system constants
const HIDDEN_FILE_PREFIX = "."; // Prefix for hidden files/directories (Unix convention)

module.exports = {
  RESTART_DELAY,
  RESTART_CALLBACK_DELAY,
  GRACEFUL_SHUTDOWN_TIMEOUT,
  SIGTERM_DELAY,
  HEALTH_CHECK_INTERVAL,
  FILE_UPLOAD_TIMEOUT,
  SESSION_COMMAND_TIMEOUT,
  SUMMARIZE_COMMAND_TIMEOUT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  HIDDEN_FILE_PREFIX,
};
