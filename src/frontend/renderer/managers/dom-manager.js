/**
 * DOM Manager
 * Centralized DOM element management with initialization
 *
 * This is intentionally a pure element registry with no state management.
 * DOM element references are stored here for easy access throughout the application.
 * State management is handled by AppState in core/state.js, with reactive DOM
 * bindings registered in bootstrap/phases/phase5-event-handlers.js.
 *
 * ARCHITECTURE NOTES:
 * - This module is a simple element registry (no business logic)
 * - All DOM manipulation should go through AppState subscriptions
 * - Direct DOM manipulation should ONLY occur in subscription handlers
 * - This module will NOT be deprecated (it serves a valid purpose)
 *
 * DEPRECATION POLICY:
 * - No methods in this file are deprecated
 * - This is a stable, foundational module for element reference management
 * - If you need to manipulate DOM, use AppState.setState() and register subscriptions
 */

/**
 * DOM elements registry
 * All DOM elements used throughout the application
 *
 * @type {Object.<string, HTMLElement>}
 */
export const elements = {};

/**
 * Initialize all DOM element references
 * Should be called once on application startup
 *
 * @returns {void}
 */
export function initializeElements() {
  elements.chatContainer = document.getElementById("chat-container");
  elements.userInput = document.getElementById("user-input");
  elements.sendBtn = document.getElementById("send-btn");
  elements.restartBtn = document.getElementById("restart-btn");
  elements.settingsBtn = document.getElementById("settings-btn");
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
