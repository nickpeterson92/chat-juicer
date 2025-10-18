/**
 * Welcome Page Component
 * Displays on app startup and when creating new sessions
 */

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
 * Create welcome page HTML
 * @param {string} userName - User's name for personalized greeting
 * @returns {string} HTML string for welcome page
 */
export function createWelcomePage(userName = "User") {
  const greeting = getTimeBasedGreeting();

  return `
    <div class="welcome-container">
      <div class="welcome-content">
        <div class="welcome-header">
          <span class="welcome-icon">✨</span>
          <h1 class="welcome-greeting">${greeting}, ${userName}</h1>
        </div>

        <div class="welcome-input-section">
          <textarea
            id="welcome-input"
            class="welcome-input"
            placeholder="How can I help you today?"
            rows="1"
          ></textarea>
          <button id="welcome-send-btn" class="welcome-send-btn" title="Send message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <div class="welcome-files-section">
          <div class="welcome-files-header">
            <span class="welcome-files-title flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              Source Files
            </span>
            <button id="welcome-files-refresh" class="welcome-files-refresh-btn" title="Refresh files">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </button>
          </div>
          <div id="welcome-files-container" class="welcome-files-list">
            <!-- Files will be loaded here -->
          </div>
        </div>

        <div class="suggestion-pills">
          <button class="suggestion-pill" data-category="generate">
            <span class="pill-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6M16 13H8m8 4H8"/>
              </svg>
            </span>
            Generate
          </button>
          <button class="suggestion-pill" data-category="analyze">
            <span class="pill-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
            Analyze
          </button>
          <button class="suggestion-pill" data-category="edit">
            <span class="pill-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </span>
            Edit
          </button>
          <button class="suggestion-pill" data-category="research">
            <span class="pill-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"/>
                <path d="M18 17V9l-5 5-5-5v8"/>
              </svg>
            </span>
            Research
          </button>
          <button class="suggestion-pill" data-category="code">
            <span class="pill-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>
              </svg>
            </span>
            Code
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Show welcome page
 * @param {HTMLElement} container - Container element
 * @param {string} userName - User's name
 */
export function showWelcomePage(container, userName = "User") {
  if (!container) return;

  container.innerHTML = createWelcomePage(userName);

  // Auto-resize textarea
  const welcomeInput = document.getElementById("welcome-input");
  if (welcomeInput) {
    welcomeInput.addEventListener("input", () => {
      welcomeInput.style.height = "auto";
      welcomeInput.style.height = `${Math.min(welcomeInput.scrollHeight, 200)}px`;
    });

    // Focus input
    welcomeInput.focus();
  }
}

/**
 * Hide welcome page
 * @param {HTMLElement} container - Container element
 */
export function hideWelcomePage(container) {
  if (!container) return;
  container.innerHTML = "";
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
