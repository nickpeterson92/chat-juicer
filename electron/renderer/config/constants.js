/**
 * Configuration constants for Wishgate renderer
 */

// Memory management limits
export const MAX_FUNCTION_CALLS = 50;
export const MAX_FUNCTION_BUFFERS = 20;
export const MAX_MESSAGES = 100; // Limit chat history to prevent memory issues

// Timing constants
export const FUNCTION_CARD_CLEANUP_DELAY = 30000; // 30 seconds
export const CONNECTION_RESET_DELAY = 1000; // 1 second
export const OLD_CARD_THRESHOLD = 60000; // 1 minute
export const UPLOAD_PROGRESS_HIDE_DELAY = 1000; // 1 second
export const SIDEBAR_TRANSITION_DURATION = 300; // Matches Tailwind duration-300
export const SIDEBAR_COLLAPSE_DELAY = 400; // Transition + render buffer for scroll fix

// Message batching performance
export const MESSAGE_BATCH_SIZE = 10;
export const MESSAGE_BATCH_DELAY = 16; // One animation frame (60fps)

// IPC protocol delimiters
export const JSON_DELIMITER = "__JSON__";
export const JSON_DELIMITER_LENGTH = JSON_DELIMITER.length; // 8 characters
export const SESSION_PREFIX = "__SESSION__";

// File size formatting
export const BYTES_PER_KILOBYTE = 1024;
export const SIZE_PRECISION_MULTIPLIER = 100; // For rounding to 2 decimal places

// Toast animation timing
export const TOAST_ANIMATION_DELAY = 10; // ms before showing toast
export const TOAST_FADE_DURATION = 500; // ms for fadeOut animation
export const TOAST_PULSE_DURATION = 200; // ms for duplicate flash

// Pagination configuration
export const PAGINATION_THROTTLE_DELAY = 100; // ms delay between chunks
export const PAGINATION_CHUNK_SIZE = 50; // messages per chunk (matches backend)
export const INITIAL_RENDER_COUNT = 10; // messages to show immediately
export const IDLE_RENDER_TIMEOUT = 1000; // ms for requestIdleCallback
export const PAGINATION_MAX_RETRIES = 3; // Maximum retry attempts for failed chunks
export const PAGINATION_RETRY_DELAY_BASE = 1000; // Base delay for exponential backoff (ms)

// UI Messages - System notifications
export const DELETE_SESSION_CONFIRM_MESSAGE = "This will permanently remove the conversation history.";
export const MSG_BOT_RESTARTING = "Bot is restarting...";
export const MSG_BOT_RESTARTED = "Bot restarted successfully. Ready for new conversation.";
export const MSG_BOT_DISCONNECTED = 'Bot disconnected. Click "Restart Bot" to reconnect.';
export const MSG_BOT_SESSION_ENDED = 'Chat session ended. Click "Restart Bot" to start a new session.';
export const MSG_FILE_UPLOADED = "Uploaded {count} file(s) to sources/";
export const MSG_FILE_UPLOAD_FAILED = "Failed to upload {count} file(s)";
export const MSG_FILE_UPLOAD_PARTIAL = "Uploaded {success} file(s), {failed} failed";
export const MSG_SESSION_DELETED = "Deleted conversation: {title}";
export const MSG_FILE_DELETED = "Deleted file: {filename}";
export const MSG_NO_FILE_SELECTED = "No file selected.";
export const MSG_NO_SESSION_SELECTED = "No session selected.";
export const MSG_SUMMARIZE_CURRENT_ONLY = "Can only summarize the current session.";
export const MSG_DELETE_FILE_CONFIRM = "Delete {filename}?\n\nThis action cannot be undone.";
export const MSG_DELETE_SESSION_CONFIRM = "Delete {title}?\n\n{message}";
export const MSG_NO_FILES_DROPPED = "No files detected in drop.";

// UI Messages - Loading states
export const MSG_LOADING_FILES = "Loading files...";
export const MSG_NO_FILES = "No files in sources/";
export const MSG_NO_SESSIONS = "No sessions available";
export const MSG_FILES_ERROR = "Error: {error}";
export const MSG_FILES_LOAD_FAILED = "Failed to load files";
export const MSG_FILE_DELETE_FAILED = "Failed to delete {filename}: {error}";
export const MSG_FILE_DELETE_ERROR = "Failed to delete {filename}. Please try again.";
export const MSG_SESSION_CREATE_FAILED = "Failed to create session. Please try again.";
export const MSG_SESSION_DELETE_FAILED = "Failed to delete session. Please try again.";
export const MSG_SUMMARIZE_ERROR = "An unexpected error occurred.";
export const MSG_UPLOADING_FILE = "Uploading {filename} ({current}/{total})";

// UI Components - Loading animations
export const LOADING_SVG = `
  <svg width="48" height="48" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="display: inline-block;">
    <defs>
      <filter id="smokeBlur">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2"/>
      </filter>
    </defs>
    <style>
      @keyframes puff1 { 0% { opacity: 0; transform: translateY(10px) scale(0.3); } 30% { opacity: 0.5; } 100% { opacity: 0; transform: translateY(-45px) scale(1.5); } }
      @keyframes puff2 { 0% { opacity: 0; transform: translateY(10px) scale(0.3); } 30% { opacity: 0.5; } 100% { opacity: 0; transform: translateY(-45px) scale(1.5); } }
      @keyframes puff3 { 0% { opacity: 0; transform: translateY(10px) scale(0.3); } 30% { opacity: 0.5; } 100% { opacity: 0; transform: translateY(-45px) scale(1.5); } }
      .puff-1 { animation: puff1 2.5s ease-out infinite; transform-origin: center; }
      .puff-2 { animation: puff2 2.5s ease-out infinite; animation-delay: 0.8s; transform-origin: center; }
      .puff-3 { animation: puff3 2.5s ease-out infinite; animation-delay: 1.6s; transform-origin: center; }
    </style>
    <ellipse class="puff-1" cx="32" cy="52" rx="8" ry="6" fill="#0066cc" filter="url(#smokeBlur)"/>
    <ellipse class="puff-2" cx="30" cy="52" rx="8" ry="6" fill="#0066cc" filter="url(#smokeBlur)"/>
    <ellipse class="puff-3" cx="34" cy="52" rx="8" ry="6" fill="#0066cc" filter="url(#smokeBlur)"/>
  </svg>
`;
