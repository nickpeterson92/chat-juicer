/**
 * Welcome Page Component
 * Displays on app startup and when creating new sessions
 *
 * Architecture: Composable template functions for maintainability
 */

import { animateWelcomeScreen } from "./utils/welcome-animations.js";

// Inline SVG logo (needed for color override with currentColor)
const LOGO_SVG = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" d="M277.821,153.703c29.216,0,54.766,15.433,69.06,38.609l10.771-6.639c-16.484-26.76-46.078-44.63-79.832-44.63c-33.753,0-63.356,17.87-79.84,44.63l10.772,6.639C223.046,169.136,248.606,153.703,277.821,153.703z"/>
  <path fill="currentColor" d="M277.821,128.082c14.55-0.009,26.319-11.796,26.328-26.337c-0.009-14.541-11.787-26.319-26.328-26.328c-14.541,0.009-26.319,11.786-26.328,26.328C251.502,116.286,263.27,128.072,277.821,128.082z M277.821,88.078c7.549,0.009,13.659,6.119,13.667,13.667c-0.008,7.549-6.127,13.667-13.667,13.676c-7.54-0.009-13.658-6.127-13.667-13.676C264.163,94.197,270.273,88.087,277.821,88.078z"/>
  <path fill="currentColor" d="M496.152,190.556c-9.994-10.966-24.359-18.011-40.798-17.994c-1.598,0-3.222,0.062-4.856,0.204c-24.032,1.925-41.134,13.12-52.391,25.366c-7.892,8.537-13.076,17.525-16.431,24.553l-25.224-20.351H197.998l-1.854,1.854c-4.379,4.388-11.222,10.453-19.388,15.292c-8.176,4.865-17.578,8.432-27.141,8.414c-2.322,0-4.661-0.202-7.027-0.653c-4.132-0.644-10.93-4.944-18.328-11.672c-11.204-10.021-24.121-24.836-37.629-37.938c-6.772-6.56-13.711-12.705-20.854-17.667c-7.151-4.935-14.523-8.759-22.337-10.304c-11.372-2.233-19.688-3.205-25.957-3.213c-4.573,0.035-8.052,0.441-11.256,1.862c-1.59,0.724-3.161,1.793-4.38,3.426c-1.227,1.616-1.871,3.753-1.845,5.606c0.133,4.07,1.978,6.587,3.805,8.856c1.916,2.252,4.23,4.22,6.736,6.021c0.133,0.071,1.087,0.901,2.278,2.172c4.344,4.52,12.598,14.603,23.979,28.879c11.416,14.302,26.072,32.914,43.677,54.943c27.025,33.796,51.349,62.314,81.094,82.577c29.727,20.28,64.849,31.854,111.845,31.81c27.078-0.009,51.755-9.006,72.336-21.251c19.052-11.336,34.45-25.392,45.521-38.22c6.781,1.871,14.391,3.01,22.664,3.01c22.019,0.026,48.382-7.884,72.556-30.001c17.648-16.086,25.533-35.66,25.507-53.936C512,216.354,506.172,201.521,496.152,190.556z M477.947,276.796c-21.905,19.989-44.948,26.663-64.01,26.681c-8.59,0.009-16.36-1.377-22.7-3.522l-4.141-1.404l-2.772,3.39c-10.259,12.519-25.922,27.175-45.037,38.529c-19.14,11.381-41.646,19.477-65.872,19.468c-45.001-0.044-76.927-10.753-104.729-29.612c-27.784-18.876-51.455-46.361-78.322-80.008c-20.085-25.136-36.34-45.822-48.382-60.831c-6.021-7.505-10.992-13.587-14.895-18.143c-1.96-2.278-3.646-4.168-5.121-5.704c-1.492-1.545-2.657-2.692-4.061-3.717c-1.254-0.892-2.304-1.801-3.205-2.666c0.821-0.08,1.651-0.159,2.781-0.151c4.926-0.008,12.644,0.83,23.521,2.967c7.072,1.351,15.371,6.145,23.891,13.067c12.828,10.338,26.08,25.101,38.591,37.903c6.269,6.401,12.37,12.325,18.365,17.039c6.012,4.689,11.883,8.326,18.408,9.606c3.16,0.592,6.295,0.865,9.358,0.857c12.705-0.009,24.165-4.592,33.603-10.18c8.344-4.962,15.071-10.71,19.936-15.371h148.829l34.946,28.191l3.134-8.079c2.374-6.136,7.637-17.922,17.33-28.384c9.739-10.463,23.539-19.619,44.136-21.349l-0.512-6.303l0.522,6.303c1.288-0.106,2.56-0.159,3.814-0.159c12.82,0.027,23.609,5.342,31.457,13.88c7.831,8.555,12.537,20.377,12.529,33.108C499.312,246.875,493.211,262.812,477.947,276.796z"/>
  <path fill="currentColor" d="M471.934,211.542c-3.452-3.629-9.2-7.028-16.581-6.984h-0.15l-1.827,0.08h-0.141l-0.124,0.017c-10.612,0.839-20.218,4.838-27.962,11.725c-7.778,6.869-13.702,16.422-18.011,28.262h0.009l-0.459,1.175h-0.009c-3.708,8.882-7.292,21.154-8.626,30.194l-0.865,5.951l5.898,1.165c3.037,0.6,6.648,1.015,10.842,1.015c12.599,0.044,31.758-4.008,50.978-21.631c9.473-8.661,15.088-19.344,15.106-30.362c0.008-3.814-0.689-7.629-2.102-11.249C477.143,218.958,475.457,215.179,471.934,211.542z M456.36,253.17c-16.908,15.398-32.358,18.268-42.432,18.311c-0.768,0-1.404-0.07-2.11-0.097c1.58-6.851,4.132-14.982,6.534-20.66l0.035-0.088l0.591-1.528l0.026-0.062l0.035-0.079c3.779-10.41,8.714-18.011,14.489-23.106c5.774-5.085,12.396-7.875,20.562-8.59l1.271-0.052c3.646,0.044,5.669,1.351,7.505,3.152c1.775,1.793,2.896,4.159,3.249,5.104c0.838,2.162,1.245,4.378,1.245,6.675C467.378,238.682,463.917,246.266,456.36,253.17z"/>
  <path fill="currentColor" d="M313.984,368.634l-7.522,10.171c9.402,6.949,18.391,14.956,24.844,23.652c5.059,6.834,8.468,13.968,9.739,21.464H272.7h-68.362c1.218-7.152,4.379-13.968,9.076-20.519c6.039-8.432,14.515-16.244,23.512-23.088l-7.664-10.065c-9.623,7.329-18.991,15.84-26.133,25.772c-7.116,9.898-12.042,21.41-12.042,34.23v6.33H272.7h81.624v-6.33c0-13.296-5.297-25.181-12.854-35.334C333.894,384.73,323.996,376.042,313.984,368.634z"/>
</svg>`;

// ============================================================================
// TEMPLATE FUNCTIONS - Composable UI sections
// ============================================================================

/**
 * Get time-based greeting
 * @returns {string} Greeting text (Morning, Afternoon, Evening)
 */
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

/**
 * Create welcome header with logo and greeting
 */
function createWelcomeHeader(userName, greeting) {
  return `
    <div class="welcome-header">
      <div class="welcome-logo">${LOGO_SVG}</div>
      <h1 class="welcome-greeting">${greeting}, ${userName}</h1>
    </div>
  `;
}

/**
 * Create MCP toggle buttons
 */
function createMcpToggles() {
  return `
    <div class="mcp-toggle-buttons">
      <button class="mcp-toggle-btn active" data-mcp="sequential" title="Sequential Thinking">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
        </svg>
      </button>
      <button class="mcp-toggle-btn active" data-mcp="fetch" title="Web Fetch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Create model selector container (populated by ModelSelector component)
 */
function createModelSelector() {
  return `<div class="model-config-inline"></div>`;
}

/**
 * Create send button with arrow icon
 */
function createSendButton() {
  return `
    <button id="welcome-send-btn" class="welcome-send-btn" title="Send message">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </button>
  `;
}

/**
 * Create input section with textarea and footer controls
 */
function createInputSection() {
  return `
    <div class="welcome-input-section">
      <textarea
        id="welcome-input"
        class="welcome-input"
        placeholder="How can I help you today?"
        rows="1"
      ></textarea>
      <div class="welcome-input-footer">
        ${createMcpToggles()}
        ${createModelSelector()}
        ${createSendButton()}
      </div>
    </div>
  `;
}

/**
 * Create files section for session file management
 */
function createFilesSection() {
  return `
    <div class="welcome-files-section" id="welcome-files-section" style="display: none;">
      <div class="welcome-files-header">
        <span class="welcome-files-title flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Session Files
        </span>
        <button id="welcome-files-refresh" class="welcome-files-refresh-btn" title="Refresh files">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
      </div>
      <div id="welcome-files-container" class="welcome-files-list">
        <div class="welcome-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-30 mb-3">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <p class="text-sm text-gray-500 dark:text-gray-400">Drag and drop files here</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Files will be uploaded to this session</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Create suggestion pill button
 */
function createSuggestionPill(category, icon, label) {
  return `
    <button class="suggestion-pill pills-pre-animate" data-category="${category}">
      <span class="pill-icon">
        ${icon}
      </span>
      ${label}
    </button>
  `;
}

/**
 * Create all suggestion pills
 */
function createSuggestionPills() {
  const pills = [
    {
      category: "generate",
      label: "Generate",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6M16 13H8m8 4H8"/>
      </svg>`,
    },
    {
      category: "analyze",
      label: "Analyze",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>`,
    },
    {
      category: "edit",
      label: "Edit",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>`,
    },
    {
      category: "research",
      label: "Research",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3v18h18"/>
        <path d="M18 17V9l-5 5-5-5v8"/>
      </svg>`,
    },
    {
      category: "code",
      label: "Code",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>
      </svg>`,
    },
  ];

  return `
    <div class="suggestion-pills">
      ${pills.map(({ category, icon, label }) => createSuggestionPill(category, icon, label)).join("")}
    </div>
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create complete welcome page HTML
 * Orchestrates all template sections
 *
 * @param {string} userName - User's name for personalized greeting
 * @returns {string} Complete HTML string for welcome page
 */
export function createWelcomePage(userName = "User") {
  const greeting = getTimeBasedGreeting();

  return `
    <div class="welcome-container">
      <div class="welcome-content">
        ${createWelcomeHeader(userName, greeting)}
        ${createInputSection()}
        ${createFilesSection()}
        ${createSuggestionPills()}
      </div>
    </div>
  `;
}

/**
 * Show welcome page and setup event listeners
 * @param {HTMLElement} container - Container element
 * @param {string} userName - User's name
 */
export function showWelcomePage(container, userName = "User") {
  if (!container) return;

  container.innerHTML = createWelcomePage(userName);

  const welcomeInput = document.getElementById("welcome-input");
  const welcomeSendBtn = document.getElementById("welcome-send-btn");

  const updateSendButtonState = () => {
    if (!welcomeSendBtn) return;
    const hasValue = welcomeInput ? welcomeInput.value.trim().length > 0 : false;
    welcomeSendBtn.disabled = !hasValue;
    welcomeSendBtn.classList.toggle("ready", hasValue);
  };

  if (welcomeInput) {
    welcomeInput.addEventListener("input", () => {
      welcomeInput.style.height = "auto";
      welcomeInput.style.height = `${Math.min(welcomeInput.scrollHeight, 200)}px`;
      updateSendButtonState();
    });
  }

  updateSendButtonState();

  // Setup MCP toggle buttons
  const mcpButtons = document.querySelectorAll(".mcp-toggle-btn");
  mcpButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.toggle("active");
    });
  });

  // Trigger welcome animations AFTER DOM mount
  const greetingElement = container.querySelector(".welcome-greeting");
  const pillElements = Array.from(container.querySelectorAll(".suggestion-pill"));

  if (greetingElement && pillElements.length > 0) {
    // Use requestAnimationFrame to ensure DOM is fully painted
    requestAnimationFrame(() => {
      const cleanup = animateWelcomeScreen({
        greeting: greetingElement,
        pills: pillElements,
      });

      // Store cleanup function for navigation
      if (container._animationCleanup) {
        container._animationCleanup();
      }
      container._animationCleanup = cleanup;
    });
  }
}

/**
 * Hide welcome page
 * @param {HTMLElement} container - Container element
 */
export function hideWelcomePage(container) {
  if (!container) return;

  // Cleanup animations before removing DOM
  if (container._animationCleanup) {
    container._animationCleanup();
    delete container._animationCleanup;
  }

  container.innerHTML = "";
}

/**
 * Get MCP configuration from toggle buttons
 * @returns {string[]} Array of enabled MCP server keys
 */
export function getMcpConfig() {
  const activeButtons = document.querySelectorAll(".mcp-toggle-btn.active");
  return Array.from(activeButtons).map((btn) => btn.dataset.mcp);
}

/**
 * Get model configuration from ModelSelector component
 * @returns {{model: string, reasoning_effort?: string}} Model configuration object
 */
export function getModelConfig() {
  // Get config from global appState (single source of truth)
  const storedConfig = window.app?.appState?.getState("ui.welcomeModelConfig");

  if (storedConfig?.model) {
    return storedConfig;
  }

  // Fallback to defaults if appState not initialized yet
  return { model: "gpt-5", reasoning_effort: "medium" };
}

/**
 * Get suggestion prompts for each category
 * @param {string} category - Category name
 * @returns {string} Prompt text
 */
export function getSuggestionPrompt(category) {
  const prompts = {
    generate: "Generate a technical specification document",
    analyze: "Analyze this document and extract key insights",
    edit: "Help me refine this business proposal",
    research: "Research best practices for API documentation",
    code: "Review this code and suggest improvements",
  };

  return prompts[category] || "";
}

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================
// NOTE: Model selector functionality has been moved to ModelSelector component
// See: electron/renderer/ui/components/model-selector.js
//
// The ModelSelector component is now responsible for:
// - Rendering model cards
// - Handling dropdown toggles
// - Managing reasoning panel expansion
// - Tracking selection state
// - Syncing with backend (chat page mode)
//
// The initializeModelConfig() export has been removed - use ModelSelector.initialize() instead
