/**
 * Cross-platform custom titlebar manager
 *
 * Creates a simple custom titlebar for Windows/Linux with minimize/maximize/close buttons.
 * On macOS, uses native traffic light buttons (no custom titlebar needed).
 */

import { ComponentLifecycle } from "../core/component-lifecycle.js";
import { globalLifecycleManager } from "../core/lifecycle-manager.js";

// Titlebar component for lifecycle management
const titlebarComponent = {};

/**
 * Initialize custom titlebar based on platform
 * Creates and injects titlebar HTML for Windows/Linux only
 */
export function initializeTitlebar() {
  // Skip entirely in browser - window controls only applicable in Electron
  if (!window.electronAPI?.platform) {
    return;
  }

  const platform = window.electronAPI.platform;
  const isMac = platform === "darwin";

  // On macOS, use native traffic lights - no custom titlebar needed
  if (isMac) {
    return;
  }

  // Mount titlebar component with lifecycle management
  ComponentLifecycle.mount(titlebarComponent, "Titlebar", globalLifecycleManager);

  // Create titlebar container
  const titlebar = document.createElement("div");
  titlebar.id = "custom-titlebar";
  titlebar.className = "custom-titlebar";

  // Create titlebar content
  titlebar.innerHTML = `
    <div class="titlebar-drag-region">
      <div class="titlebar-title">Chat Juicer</div>
    </div>
    <div class="titlebar-controls">
      <button class="titlebar-button titlebar-minimize" id="titlebar-minimize" title="Minimize" aria-label="Minimize">
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor"/>
        </svg>
      </button>
      <button class="titlebar-button titlebar-maximize" id="titlebar-maximize" title="Maximize" aria-label="Maximize">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect width="9" height="9" x="0.5" y="0.5" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
      <button class="titlebar-button titlebar-close" id="titlebar-close" title="Close" aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1"/>
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
    </div>
  `;

  // Insert at the beginning of body
  document.body.insertBefore(titlebar, document.body.firstChild);

  // Set up button handlers
  setupTitlebarHandlers();

  // Update maximize icon based on window state
  updateMaximizeIcon();
}

/**
 * Set up event handlers for titlebar buttons
 */
function setupTitlebarHandlers() {
  const minimizeBtn = document.getElementById("titlebar-minimize");
  const maximizeBtn = document.getElementById("titlebar-maximize");
  const closeBtn = document.getElementById("titlebar-close");

  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
      window.electronAPI.windowMinimize();
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener("click", async () => {
      window.electronAPI.windowMaximize();
      // Update icon after a short delay to reflect new state (lifecycle-managed)
      titlebarComponent.setTimeout(updateMaximizeIcon, 100);
    });

    // Double-click titlebar to maximize (Windows convention)
    const dragRegion = document.querySelector(".titlebar-drag-region");
    if (dragRegion) {
      dragRegion.addEventListener("dblclick", async () => {
        window.electronAPI.windowMaximize();
        titlebarComponent.setTimeout(updateMaximizeIcon, 100);
      });
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.electronAPI.windowClose();
    });
  }
}

/**
 * Update maximize button icon based on window maximized state
 */
async function updateMaximizeIcon() {
  const maximizeBtn = document.getElementById("titlebar-maximize");
  if (!maximizeBtn) return;

  const isMaximized = await window.electronAPI.windowIsMaximized();

  if (isMaximized) {
    // Show restore icon (two overlapping squares)
    maximizeBtn.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect width="7" height="7" x="2.5" y="0.5" fill="none" stroke="currentColor" stroke-width="1"/>
        <rect width="7" height="7" x="0.5" y="2.5" fill="none" stroke="currentColor" stroke-width="1"/>
      </svg>
    `;
    maximizeBtn.title = "Restore";
    maximizeBtn.setAttribute("aria-label", "Restore");
  } else {
    // Show maximize icon (single square)
    maximizeBtn.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect width="9" height="9" x="0.5" y="0.5" fill="none" stroke="currentColor" stroke-width="1"/>
      </svg>
    `;
    maximizeBtn.title = "Maximize";
    maximizeBtn.setAttribute("aria-label", "Maximize");
  }
}

/**
 * Update titlebar title
 * @param {string} title - New title
 */
function _updateTitle(title) {
  const titleElement = document.querySelector(".titlebar-title");
  if (titleElement) {
    titleElement.textContent = title;
  } else {
    // On macOS or before titlebar is created
    document.title = title;
  }
}

/**
 * Cleanup titlebar (no-op for custom titlebar, just for API consistency)
 */
function _cleanupTitlebar() {
  // Custom titlebar is part of DOM and will be cleaned up automatically
}
