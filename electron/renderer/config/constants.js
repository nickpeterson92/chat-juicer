/**
 * Configuration constants for Chat Juicer renderer
 */

// Memory management limits
export const MAX_FUNCTION_CALLS = 50;
export const MAX_FUNCTION_BUFFERS = 20;
export const MAX_MESSAGES = 100; // Limit chat history to prevent memory issues

// Timing constants
export const FUNCTION_CARD_CLEANUP_DELAY = 30000; // 30 seconds
export const CONNECTION_RESET_DELAY = 1000; // 1 second
export const OLD_CARD_THRESHOLD = 60000; // 1 minute

// Message batching performance
export const MESSAGE_BATCH_SIZE = 10;
export const MESSAGE_BATCH_DELAY = 16; // One animation frame (60fps)

// IPC protocol delimiters
export const JSON_DELIMITER = "__JSON__";
export const SESSION_PREFIX = "__SESSION__";
