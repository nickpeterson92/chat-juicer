/**
 * AuthService - Manages authentication state, tokens, and auto-refresh
 *
 * Responsibilities:
 * - Token storage/retrieval via IPC to main process (encrypted storage)
 * - JWT decode to extract expiry time
 * - Auto-refresh scheduling (1 minute before expiry)
 * - Event emission for auth state changes
 * - Clean logout with token clearing
 */
export class AuthService {
  /**
   * Create auth service
   * @param {object} deps
   * @param {object} deps.ipcAdapter - IPC adapter for main process communication
   * @param {object} deps.appState - Global application state
   * @param {object} deps.eventBus - Event bus for auth events
   */
  constructor({ ipcAdapter, appState, eventBus }) {
    this.ipcAdapter = ipcAdapter;
    this.appState = appState;
    this.eventBus = eventBus;

    this._accessToken = null;
    this._refreshToken = null;
    this._user = null;
    this._tokenExpiry = null;
    this._refreshTimer = null;
  }

  /** Get current access token (or null if not authenticated) */
  get accessToken() {
    return this._accessToken;
  }

  /** Get current user info (or null) */
  get user() {
    return this._user;
  }

  /** Check if user is authenticated */
  get isAuthenticated() {
    return !!this._accessToken;
  }

  /**
   * Initialize from stored tokens (call on app start)
   * @returns {Promise<boolean>} True if restored valid session
   */
  async initialize() {
    try {
      const tokens = await this.ipcAdapter.authGetTokens();
      if (tokens?.accessToken) {
        // Check if token is expired
        const payload = this._decodeJWT(tokens.accessToken);
        const now = Date.now();
        if (payload.exp * 1000 > now) {
          await this._setTokens(tokens.accessToken, tokens.refreshToken, tokens.user);
          return true;
        }
        // Token expired - try refresh
        if (tokens.refreshToken) {
          try {
            await this.refresh(tokens.refreshToken);
            return true;
          } catch {
            // Refresh failed - clear tokens
            await this.logout();
          }
        }
      }
    } catch (error) {
      console.error("[AuthService] Initialize failed:", error);
    }
    return false;
  }

  /**
   * Login with credentials
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>} User info
   */
  async login(email, password) {
    const result = await this.ipcAdapter.authLogin(email, password);
    if (result.error) {
      throw new Error(result.error);
    }
    await this._setTokens(result.access_token, result.refresh_token, result.user);
    this.eventBus.emit("auth:login", { user: result.user });
    return result.user;
  }

  /**
   * Register new account
   * @param {string} email
   * @param {string} password
   * @param {string} [displayName]
   * @param {string} [inviteCode]
   * @returns {Promise<object>} User info
   */
  async register(email, password, displayName, inviteCode) {
    const result = await this.ipcAdapter.authRegister(email, password, displayName, inviteCode);
    if (result.error) {
      throw new Error(result.error);
    }
    await this._setTokens(result.access_token, result.refresh_token, result.user);
    this.eventBus.emit("auth:login", { user: result.user });
    return result.user;
  }

  /**
   * Logout - clear tokens and emit event
   */
  async logout() {
    try {
      this._clearTokens();
      await this.ipcAdapter.authLogout();
    } catch (error) {
      console.error("[AuthService] Logout failed:", error);
    } finally {
      this.eventBus.emit("auth:logout");
    }
  }

  /**
   * Refresh the access token
   * @param {string} [refreshToken] - Use provided or stored refresh token
   * @returns {Promise<boolean>} True if successful
   */
  async refresh(refreshToken = null) {
    const token = refreshToken || this._refreshToken;
    if (!token) {
      throw new Error("No refresh token");
    }

    const result = await this.ipcAdapter.authRefresh(token);
    if (result.error) {
      throw new Error(result.error);
    }

    await this._setTokens(result.access_token, result.refresh_token || token, result.user);
    return true;
  }

  /**
   * Internal: Set tokens and schedule refresh
   * @private
   */
  async _setTokens(accessToken, refreshToken, user) {
    // Normalize user object: Convert snake_case from backend to camelCase for frontend
    const normalizedUser = user
      ? {
          id: user.id || user.sub,
          email: user.email,
          displayName: user.display_name || user.displayName || null,
        }
      : null;

    this._accessToken = accessToken;
    this._refreshToken = refreshToken;
    this._user = normalizedUser;

    if (this.appState) {
      this.appState.setState("auth.isAuthenticated", true);
      this.appState.setState("auth.user", normalizedUser);
      this.appState.setState("auth.isLoading", false);
    }

    // Decode JWT to get expiry
    const payload = this._decodeJWT(accessToken);
    this._tokenExpiry = payload.exp * 1000; // Convert to ms

    // Store securely via main process
    await this.ipcAdapter.authStoreTokens(accessToken, refreshToken, user);

    // Schedule refresh 1 minute before expiry
    this._scheduleRefresh();
  }

  /**
   * Internal: Schedule automatic token refresh
   * @private
   */
  _scheduleRefresh() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }

    const expiresIn = this._tokenExpiry - Date.now();
    const refreshIn = Math.max(expiresIn - 60000, 10000); // 1 min before, min 10s

    this._refreshTimer = setTimeout(async () => {
      try {
        await this.refresh();
        console.log("[AuthService] Token auto-refreshed");
      } catch (error) {
        console.error("[AuthService] Auto-refresh failed:", error);
        this.eventBus.emit("auth:session-expired");
      }
    }, refreshIn);
  }

  /**
   * Internal: Clear all token state
   * @private
   */
  _clearTokens() {
    this._accessToken = null;
    this._refreshToken = null;
    this._user = null;
    this._tokenExpiry = null;

    if (this.appState) {
      this.appState.setState("auth.isAuthenticated", false);
      this.appState.setState("auth.user", null);
    }
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  /**
   * Internal: Decode JWT payload (without verification)
   * @private
   * @param {string} token - JWT token
   * @returns {object} Decoded payload
   */
  _decodeJWT(token) {
    try {
      const base64Payload = token.split(".")[1];
      const payload = atob(base64Payload);
      return JSON.parse(payload);
    } catch {
      throw new Error("Invalid JWT token");
    }
  }
}
