/**
 * DOM Manager
 * Centralized DOM element management with initialization
 */

/**
 * DOM elements registry
 * All DOM elements used throughout the application
 */
export const elements = {};

/**
 * Initialize all DOM element references
 * Should be called once on application startup
 */
export function initializeElements() {
  elements.chatContainer = document.getElementById("chat-container");
  elements.userInput = document.getElementById("user-input");
  elements.sendBtn = document.getElementById("send-btn");
  elements.restartBtn = document.getElementById("restart-btn");
  elements.statusIndicator = document.getElementById("status-indicator");
  elements.statusText = document.getElementById("status-text");
  elements.typingIndicator = document.getElementById("typing-indicator");
  elements.aiThinking = document.getElementById("ai-thinking");
  elements.filesPanel = document.getElementById("files-panel");
  elements.filesContainer = document.getElementById("files-container");
  elements.openFilesBtn = document.getElementById("open-files-btn");
  elements.refreshFilesBtn = document.getElementById("refresh-files-btn");
  elements.themeToggle = document.getElementById("theme-toggle");
  elements.themeIcon = document.getElementById("theme-icon");
  elements.themeText = document.getElementById("theme-text");
  elements.sessionsList = document.getElementById("sessions-list");
  elements.newSessionBtn = document.getElementById("new-session-btn");
  elements.sidebar = document.getElementById("sidebar");
  elements.sidebarToggle = document.getElementById("sidebar-toggle");
  elements.fileDropZone = document.getElementById("file-drop-zone");
  elements.chatPanel = document.querySelector(".chat-panel");
  elements.uploadProgress = document.getElementById("file-upload-progress");
  elements.progressBar = document.getElementById("progress-bar-fill");
  elements.progressText = document.getElementById("progress-text");
  elements.welcomePageContainer = document.getElementById("welcome-page-container");
}
