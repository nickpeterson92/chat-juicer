/**
 * Theme Manager
 * Manages theme initialization and switching between light and dark modes
 */

/**
 * Initialize theme from localStorage
 * Should be called on application startup
 * @param {Object} elements - DOM elements from dom-manager
 */
export function initializeTheme(elements) {
  const savedTheme = localStorage.getItem("theme") || "light";

  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    updateThemeToggle(elements, true);
  } else {
    document.documentElement.removeAttribute("data-theme");
    updateThemeToggle(elements, false);
  }
}

/**
 * Update theme toggle button UI
 * @param {Object} elements - DOM elements from dom-manager
 * @param {boolean} isDark - Whether dark mode is active
 */
function updateThemeToggle(elements, isDark) {
  if (elements.themeIcon && elements.themeText) {
    if (isDark) {
      // Sun icon for switching to light mode
      elements.themeIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42m12.72-12.72l1.42-1.42"/>
      </svg>`;
      elements.themeText.textContent = "Light";
    } else {
      // Moon icon for switching to dark mode
      elements.themeIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>`;
      elements.themeText.textContent = "Dark";
    }
  }
}

/**
 * Toggle between light and dark themes
 * @param {Object} elements - DOM elements from dom-manager
 */
export function toggleTheme(elements) {
  const currentTheme = document.documentElement.getAttribute("data-theme");

  if (currentTheme === "dark") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");
    updateThemeToggle(elements, false);
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
    updateThemeToggle(elements, true);
  }
}
