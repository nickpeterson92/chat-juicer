/**
 * AuthModal - Login/Register modal component
 *
 * A modal overlay that gates the application until the user is authenticated.
 * Supports switching between login and register modes.
 */
export class AuthModal {
  /**
   * Create auth modal
   * @param {object} options
   * @param {object} options.authService - AuthService instance
   * @param {object} options.eventBus - Event bus for auth events
   */
  constructor({ authService, eventBus }) {
    this.authService = authService;
    this.eventBus = eventBus;

    this._mode = "login"; // "login" | "register"
    this._element = null;
    this._errorMessage = null;
    this._isLoading = false;
    this._isVisible = false;

    // Bind methods
    this._handleSubmit = this._handleSubmit.bind(this);
    this._handleModeSwitch = this._handleModeSwitch.bind(this);
  }

  /** Show the modal */
  show() {
    this._isVisible = true;
    this._render();
    if (!this._element.parentNode) {
      document.body.appendChild(this._element);
    }
    requestAnimationFrame(() => {
      this._element.querySelector("input[name='email']")?.focus();
    });
  }

  /** Hide the modal */
  hide() {
    if (this._element) {
      this._isVisible = false;
      this._element.classList.add("auth-modal-hiding");
      setTimeout(() => {
        if (!this._isVisible) {
          this._element?.remove();
          this._element = null;
        }
      }, 200);
    }
  }

  /** Render modal HTML */
  _render() {
    if (!this._element) {
      this._element = document.createElement("div");
      this._element.className = "auth-modal-overlay";
    }

    // Capture current email to preserve it across re-renders
    const currentEmail = this._element.querySelector("input[name='email']")?.value;
    const currentDisplayName = this._element.querySelector("input[name='displayName']")?.value;

    this._element.innerHTML = `
      <div class="auth-modal">
        <div class="auth-modal-header">
          <h2>${this._mode === "login" ? "Welcome Back" : "Create Account"}</h2>
          <p class="auth-modal-subtitle">
            ${this._mode === "login" ? "Sign in to continue to Chat Juicer" : "Get started with Chat Juicer"}
          </p>
        </div>

        <form class="auth-modal-form" id="auth-form">
          ${
            this._mode === "register"
              ? `
            <div class="form-group">
              <label for="display-name">Display Name</label>
              <input
                type="text"
                id="display-name"
                name="displayName"
                placeholder="Your name"
                autocomplete="name"
              >
            </div>

            <div class="form-group">
              <label for="invite-code">Invite Code (Required)</label>
              <input
                type="text"
                id="invite-code"
                name="inviteCode"
                placeholder="Ask your admin for the code"
                autocomplete="off"
              >
            </div>
          `
              : ""
          }

          <div class="form-group">
            <label for="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              required
              placeholder="you@example.com"
              autocomplete="email"
            >
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              required
              minlength="8"
              placeholder="Minimum 8 characters"
              autocomplete="${this._mode === "login" ? "current-password" : "new-password"}"
            >
          </div>

          ${
            this._errorMessage
              ? `
            <div class="auth-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
                <path d="M8 4.5v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
              </svg>
              <span>${this._errorMessage}</span>
            </div>
          `
              : ""
          }

          <button type="submit" class="auth-submit" ${this._isLoading ? "disabled" : ""}>
            ${this._isLoading ? this._getLoadingSpinner() : ""}
            <span>${this._isLoading ? "Please wait..." : this._mode === "login" ? "Sign In" : "Create Account"}</span>
          </button>
        </form>

        <div class="auth-modal-footer">
          ${
            this._mode === "login"
              ? `<span>Don't have an account? <a href="#" class="auth-switch">Sign up</a></span>`
              : `<span>Already have an account? <a href="#" class="auth-switch">Sign in</a></span>`
          }
        </div>
      </div>
    `;

    // Restore preserved values
    if (currentEmail) {
      const emailInput = this._element.querySelector("input[name='email']");
      if (emailInput) emailInput.value = currentEmail;
    }
    if (currentDisplayName && this._mode === "register") {
      const nameInput = this._element.querySelector("input[name='displayName']");
      if (nameInput) nameInput.value = currentDisplayName;
    }

    // Re-attach listeners
    this._element.querySelector("#auth-form").addEventListener("submit", this._handleSubmit);
    this._element.querySelector(".auth-switch").addEventListener("click", this._handleModeSwitch);
  }

  /** Get loading spinner SVG */
  _getLoadingSpinner() {
    return `
      <svg class="auth-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-opacity="0.3"/>
        <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  /** Handle form submission */
  async _handleSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const email = form.email.value.trim();
    const password = form.password.value;
    const displayName = form.displayName?.value?.trim();
    const inviteCode = form.inviteCode?.value?.trim();

    // Basic validation
    if (!email || !password) {
      this._errorMessage = "Please fill in all required fields";
      this._render();
      return;
    }

    if (password.length < 8) {
      this._errorMessage = "Password must be at least 8 characters";
      this._render();
      return;
    }

    this._isLoading = true;
    this._errorMessage = null;
    this._render();

    try {
      if (this._mode === "login") {
        await this.authService.login(email, password);
      } else {
        await this.authService.register(email, password, displayName, inviteCode);
      }
      this.hide();
    } catch (error) {
      this._errorMessage = this._formatError(error.message);
      this._isLoading = false;
      this._render();
      // Focus back on email for corrections
      this._element.querySelector("input[name='email']")?.focus();
    }
  }

  /** Format error message for display */
  _formatError(message) {
    // Make common errors more user-friendly
    if (message.includes("Invalid credentials")) {
      return "Invalid email or password. Please try again.";
    }
    if (message.includes("already registered") || message.includes("already exists")) {
      return "This email is already registered. Try signing in instead.";
    }
    if (message.includes("network") || message.includes("fetch")) {
      return "Unable to connect. Please check your connection and try again.";
    }
    if (message.includes("Invalid or missing invite code")) {
      return "Invalid invite code. Please ask your administrator for the correct code.";
    }
    return message || "Something went wrong. Please try again.";
  }

  /** Handle mode switch (login <-> register) */
  _handleModeSwitch(e) {
    e.preventDefault();
    this._mode = this._mode === "login" ? "register" : "login";
    this._errorMessage = null;
    this._render();
    this._element.querySelector("input[name='email']")?.focus();
  }
}
