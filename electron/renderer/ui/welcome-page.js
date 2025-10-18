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
 * @param {string} modelName - Model/deployment name to display
 * @returns {string} HTML string for welcome page
 */
export function createWelcomePage(userName = "User", modelName = "Loading...") {
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

        <div class="suggestion-pills">
          <button class="suggestion-pill" data-category="generate">
            <span class="pill-icon">📄</span>
            Generate
          </button>
          <button class="suggestion-pill" data-category="analyze">
            <span class="pill-icon">🔍</span>
            Analyze
          </button>
          <button class="suggestion-pill" data-category="edit">
            <span class="pill-icon">✍️</span>
            Edit
          </button>
          <button class="suggestion-pill" data-category="research">
            <span class="pill-icon">📊</span>
            Research
          </button>
          <button class="suggestion-pill" data-category="code">
            <span class="pill-icon">💻</span>
            Code
          </button>
        </div>

        <div class="model-info">
          <span id="welcome-model-name">${modelName}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Show welcome page
 * @param {HTMLElement} container - Container element
 * @param {string} userName - User's name
 * @param {string} modelName - Model/deployment name to display
 */
export function showWelcomePage(container, userName = "User", modelName = "Loading...") {
  if (!container) return;

  container.innerHTML = createWelcomePage(userName, modelName);

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
