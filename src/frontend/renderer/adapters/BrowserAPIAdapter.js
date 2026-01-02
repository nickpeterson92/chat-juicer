/**
 * BrowserAPIAdapter - Browser-native implementation of the adapter interface
 *
 * This adapter provides the same interface as IPCAdapter but uses direct HTTP/WebSocket
 * communication instead of Electron IPC. Used when running in a browser environment.
 *
 * Key differences from IPCAdapter:
 * - Direct fetch() calls to API
 * - Native WebSocket in renderer (not via IPC)
 * - localStorage for token storage
 * - No window controls, file dialogs handled via HTML input
 */

import { WebSocketManager } from "../core/websocket-manager.js";

/**
 * Browser-native implementation of the adapter
 * Used when running in a browser without Electron
 */
export class BrowserAPIAdapter {
  /**
   * Create browser adapter
   * @param {string} apiBase - API base URL (e.g., 'https://api.chat-juicer.com')
   */
  constructor(apiBase) {
    this.apiBase = apiBase || "https://api.chat-juicer.com";
    this.appState = null;
    this.commandQueue = [];
    // Map of sessionId -> WebSocketManager for concurrent connections
    this.sessionWebSockets = new Map();
    this._messageCallbacks = [];
    this._errorCallbacks = [];
    this._disconnectCallbacks = [];
  }

  /**
   * Inject AppState reference
   * @param {object} appState - AppState instance
   */
  setAppState(appState) {
    this.appState = appState;
  }

  /**
   * Get auth token from localStorage
   * @returns {string|null}
   */
  _getAccessToken() {
    try {
      const tokens = JSON.parse(localStorage.getItem("auth_tokens") || "null");
      return tokens?.accessToken || null;
    } catch {
      return null;
    }
  }

  /**
   * Make authenticated API request
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @returns {Promise<any>}
   */
  async _fetch(endpoint, options = {}) {
    const url = `${this.apiBase}${endpoint}`;
    const headers = { ...options.headers };

    const token = this._getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const json = await response.json();
        detail = json?.message || json?.detail || detail;
      } catch {
        // ignore
      }
      const error = new Error(detail || `Request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return response.json();
    }
    return response;
  }

  /**
   * Ensure WebSocket is connected for session (maintains multiple concurrent connections)
   * @param {string} sessionId
   * @returns {WebSocketManager}
   */
  _ensureWebSocket(sessionId) {
    // Check if we already have a connection for this session
    if (this.sessionWebSockets.has(sessionId)) {
      const existing = this.sessionWebSockets.get(sessionId);
      // Return if connected or connecting (readyState: 0=CONNECTING, 1=OPEN)
      if (existing.isConnected() || existing.isConnecting()) {
        return existing;
      }
      // Clean up stale connection
      existing.close();
      this.sessionWebSockets.delete(sessionId);
    }

    // Create new WebSocket for this session (don't close others!)
    const wsManager = new WebSocketManager(this.apiBase, () => this._getAccessToken());
    wsManager.connect(sessionId);

    // Wire up callbacks - inject session_id to match Electron's mapWebSocketMessage behavior
    wsManager.onMessage((msg) => {
      // Ensure every message has session_id for correct frontend routing
      // (Backend messages may not include it; Electron's main.js injects it there)
      const enrichedMsg = msg.session_id ? msg : { ...msg, session_id: sessionId };
      this._messageCallbacks.forEach((cb) => {
        cb(enrichedMsg);
      });
    });
    wsManager.onClose((code, reason, isIdle) => {
      // Remove from map when connection closes
      if (this.sessionWebSockets.get(sessionId) === wsManager) {
        this.sessionWebSockets.delete(sessionId);
      }
      this._disconnectCallbacks.forEach((cb) => {
        cb({ code, reason, isIdle, sessionId });
      });
    });
    wsManager.onError((err) => {
      this._errorCallbacks.forEach((cb) => {
        cb(err.message || "WebSocket error");
      });
    });

    this.sessionWebSockets.set(sessionId, wsManager);
    return wsManager;
  }

  /**
   * Get existing WebSocket for session (without creating new one)
   * @param {string} sessionId
   * @returns {WebSocketManager|null}
   */
  _getWebSocket(sessionId) {
    const wsManager = this.sessionWebSockets.get(sessionId);
    if (wsManager && (wsManager.isConnected() || wsManager.isConnecting())) {
      return wsManager;
    }
    return null;
  }

  // ==========================================
  // Message Operations
  // ==========================================

  /**
   * Send message(s) to backend via WebSocket
   * @param {string|string[]} content
   * @param {string|null} sessionId
   */
  async sendMessage(content, sessionId = null) {
    const targetSession = sessionId || this.appState?.getState("session.current");
    if (!targetSession) {
      throw new Error("No active session");
    }

    const rawMessages = Array.isArray(content) ? content : [content];
    const pendingAttachments = this.appState?.getState("message.pendingAttachments") || [];

    const messages = rawMessages.map((msg, index) => {
      const msgObj = typeof msg === "string" ? { content: msg } : { ...msg };

      if (index === 0 && pendingAttachments.length > 0) {
        msgObj.attachments = pendingAttachments.map((att) => ({
          type: "image_ref",
          filename: att.filename,
          path: att.path || `input/${att.filename}`,
        }));
      }
      return msgObj;
    });

    if (pendingAttachments.length > 0) {
      this.appState?.setState("message.pendingAttachments", []);
    }

    const ws = this._ensureWebSocket(targetSession);
    ws.send({
      type: "message",
      messages,
      session_id: targetSession,
    });
  }

  async stopGeneration() {
    // Close WebSocket for current session only
    const sessionId = this.appState?.getState("session.current");
    if (sessionId) {
      const wsManager = this.sessionWebSockets.get(sessionId);
      if (wsManager) {
        wsManager.close();
        this.sessionWebSockets.delete(sessionId);
      }
    }
  }

  async interruptStream(sessionId = null) {
    const targetSession = sessionId || this.appState?.getState("session.current");
    if (!targetSession) {
      return { success: false, error: "No active session" };
    }
    const wsManager = this._getWebSocket(targetSession);
    if (!wsManager) {
      return { success: false, error: "No WebSocket connection for session" };
    }
    wsManager.send({ type: "interrupt", session_id: targetSession });
    return { success: true };
  }

  async restartBot() {
    // Same as stopGeneration in browser
    return this.stopGeneration();
  }

  // ==========================================
  // Session Operations
  // ==========================================

  async sendSessionCommand(command, data = {}) {
    return this._executeSessionCommand(command, data);
  }

  async _executeSessionCommand(command, data) {
    switch (command) {
      case "list": {
        const offset = data?.offset ?? 0;
        const limit = data?.limit ?? 50;
        return this._fetch(`/api/v1/sessions?offset=${offset}&limit=${limit}`);
      }
      case "new": {
        const response = await this._fetch("/api/v1/sessions", {
          method: "POST",
          body: data || {},
        });
        // Pre-connect WebSocket
        if (response.session_id) {
          this._ensureWebSocket(response.session_id);
        }
        return response;
      }
      case "switch": {
        const sessionId = data?.session_id;
        if (!sessionId) return { error: "Missing session_id" };
        const response = await this._fetch(`/api/v1/sessions/${sessionId}`);
        this._ensureWebSocket(sessionId);
        return response;
      }
      case "delete": {
        const sessionId = data?.session_id;
        if (!sessionId) return { error: "Missing session_id" };
        if (this.wsManager?.sessionId === sessionId) {
          this.wsManager.close();
          this.wsManager = null;
        }
        return this._fetch(`/api/v1/sessions/${sessionId}`, { method: "DELETE" });
      }
      case "rename": {
        const sessionId = data?.session_id;
        if (!sessionId) return { error: "Missing session_id" };
        return this._fetch(`/api/v1/sessions/${sessionId}`, {
          method: "PATCH",
          body: { title: data?.title },
        });
      }
      case "pin": {
        const sessionId = data?.session_id;
        if (!sessionId) return { error: "Missing session_id" };
        return this._fetch(`/api/v1/sessions/${sessionId}`, {
          method: "PATCH",
          body: { pinned: data?.pinned },
        });
      }
      case "summarize": {
        const sessionId = data?.session_id || this.appState?.getState("session.current");
        if (!sessionId) return { error: "Missing session_id" };
        return this._fetch(`/api/v1/sessions/${sessionId}/summarize`, { method: "POST" });
      }
      case "load_more": {
        const sessionId = data?.session_id;
        if (!sessionId) return { error: "Missing session_id", messages: [] };
        const offset = data?.offset ?? 0;
        const limit = data?.limit ?? 50;
        const result = await this._fetch(`/api/v1/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`);
        return { success: true, messages: result.messages || [] };
      }
      case "update_config": {
        const sessionId = data?.session_id;
        if (!sessionId) return { error: "Missing session_id" };
        return this._fetch(`/api/v1/sessions/${sessionId}`, {
          method: "PATCH",
          body: {
            model: data?.model,
            mcp_config: data?.mcp_config,
            reasoning_effort: data?.reasoning_effort,
          },
        });
      }
      case "config_metadata": {
        const config = await this._fetch("/api/v1/config");
        return {
          success: config.success ?? true,
          models: config.models || [],
          reasoning_levels: config.reasoning_levels || [],
        };
      }
      default:
        return { error: `Unknown command: ${command}` };
    }
  }

  async processQueue() {
    // Browser adapter doesn't need queuing
  }

  // ==========================================
  // File Operations
  // ==========================================

  async uploadFile(_filePath, fileData, fileName, mimeType) {
    const sessionId = this.appState?.getState("session.current");
    if (!sessionId) {
      return { success: false, error: "No active session" };
    }

    const formData = new FormData();
    // Convert base64 to Blob if needed
    let blob;
    if (typeof fileData === "string") {
      const byteString = atob(fileData);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab], { type: mimeType });
    } else {
      blob = new Blob([fileData], { type: mimeType });
    }
    formData.append("file", blob, fileName);

    const result = await this._fetch(`/api/v1/sessions/${sessionId}/files/upload?folder=input`, {
      method: "POST",
      body: formData,
    });
    return { success: true, ...result };
  }

  async deleteFile(dirPath, filename) {
    const parsed = this._parseSessionFolder(dirPath);
    if (!parsed) return { success: false, error: "Invalid path" };
    await this._fetch(
      `/api/v1/sessions/${parsed.sessionId}/files/${encodeURIComponent(filename)}?folder=${encodeURIComponent(parsed.folder)}`,
      { method: "DELETE" }
    );
    return { success: true };
  }

  async openFile(_dirPath, _filename) {
    // In browser, we don't open files externally - use preview instead
    return { success: false, error: "Use preview in browser" };
  }

  async readFile(_filePath) {
    // Not supported in browser - files must be uploaded first
    return { success: false, error: "Local file access not available in browser" };
  }

  async listDirectory(dirPath) {
    const parsed = this._parseSessionFolder(dirPath);
    if (!parsed) return { success: false, error: "Invalid path" };
    const response = await this._fetch(
      `/api/v1/sessions/${parsed.sessionId}/files?folder=${encodeURIComponent(parsed.folder)}`
    );
    return { success: true, files: response.files || [] };
  }

  async downloadFile(dirPath, filename) {
    const parsed = this._parseSessionFolder(dirPath);
    if (!parsed) return { success: false, error: "Invalid path" };
    const response = await this._fetch(
      `/api/v1/sessions/${parsed.sessionId}/files/${encodeURIComponent(filename)}/presign-download?folder=${encodeURIComponent(parsed.folder)}`
    );
    return { success: true, downloadUrl: response.download_url };
  }

  async getFileContent(dirPath, filename) {
    const parsed = this._parseSessionFolder(dirPath);
    if (!parsed) return { success: false, error: "Invalid path" };
    const response = await this._fetch(
      `/api/v1/sessions/${parsed.sessionId}/files/${encodeURIComponent(filename)}/download?folder=${encodeURIComponent(parsed.folder)}`
    );
    const buffer = await response.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const mimeTypes = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      pdf: "application/pdf",
      txt: "text/plain",
      md: "text/markdown",
      json: "application/json",
    };
    return { success: true, data: base64, mimeType: mimeTypes[ext] || "application/octet-stream" };
  }

  _parseSessionFolder(dirPath) {
    // Parse paths like "sessions/abc123/input", "data/files/abc123/input", or just "input"
    const matchSessions = dirPath.match(/sessions\/([^/]+)\/(.+)/);
    if (matchSessions) {
      return { sessionId: matchSessions[1], folder: matchSessions[2] };
    }

    const matchData = dirPath.match(/data\/files\/([^/]+)\/(.+)/);
    if (matchData) {
      return { sessionId: matchData[1], folder: matchData[2] };
    }

    // Fallback: use active session
    const sessionId = this.appState?.getState("session.current");
    if (sessionId) {
      return { sessionId, folder: dirPath };
    }
    return null;
  }

  // ==========================================
  // Dialog Operations
  // ==========================================

  async openFileDialog(_options = {}) {
    // In browser, return null - UI should use <input type="file">
    return null;
  }

  async saveFileDialog(_options = {}) {
    return null;
  }

  async showFileInFolder(_filePath) {
    // Not available in browser
  }

  // ==========================================
  // External URL
  // ==========================================

  async openExternalUrl(url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return { success: true };
  }

  // ==========================================
  // User Info
  // ==========================================

  async getUsername() {
    // Return from stored user info or default
    try {
      const tokens = JSON.parse(localStorage.getItem("auth_tokens") || "null");
      return tokens?.user?.displayName || tokens?.user?.email?.split("@")[0] || "User";
    } catch {
      return "User";
    }
  }

  async getVersion() {
    return "1.0.0";
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  onBotMessage(callback) {
    this._messageCallbacks.push(callback);
  }

  onPythonStderr(callback) {
    this._errorCallbacks.push(callback);
  }

  onPythonExit(callback) {
    this._disconnectCallbacks.push(callback);
  }

  // ==========================================
  // Logging
  // ==========================================

  log(level, message, data) {
    // Browser logging - just use console
    const fn = console[level] || console.log;
    if (data) {
      fn(`[Browser] ${message}`, data);
    } else {
      fn(`[Browser] ${message}`);
    }
  }

  // ==========================================
  // Auth Operations
  // ==========================================

  async authLogin(email, password) {
    try {
      const result = await this._fetch("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if (result.access_token) {
        await this.authStoreTokens(result.access_token, result.refresh_token, result.user);
      }
      return result;
    } catch (error) {
      return { error: error.message };
    }
  }

  async authRegister(email, password, displayName, inviteCode) {
    try {
      const result = await this._fetch("/api/v1/auth/register", {
        method: "POST",
        body: { email, password, display_name: displayName, invite_code: inviteCode },
      });
      if (result.access_token) {
        await this.authStoreTokens(result.access_token, result.refresh_token, result.user);
      }
      return result;
    } catch (error) {
      return { error: error.message };
    }
  }

  async authRefresh(refreshToken) {
    try {
      const result = await this._fetch("/api/v1/auth/refresh", {
        method: "POST",
        body: { refresh_token: refreshToken },
      });
      if (result.access_token) {
        const stored = JSON.parse(localStorage.getItem("auth_tokens") || "{}");
        await this.authStoreTokens(
          result.access_token,
          result.refresh_token || refreshToken,
          result.user || stored.user
        );
      }
      return result;
    } catch (error) {
      return { error: error.message };
    }
  }

  async authLogout() {
    localStorage.removeItem("auth_tokens");
    if (this.wsManager) {
      this.wsManager.close();
      this.wsManager = null;
    }
    return { success: true };
  }

  async authGetTokens() {
    try {
      return JSON.parse(localStorage.getItem("auth_tokens") || "null");
    } catch {
      return null;
    }
  }

  async authStoreTokens(accessToken, refreshToken, user) {
    localStorage.setItem("auth_tokens", JSON.stringify({ accessToken, refreshToken, user }));
    return { success: true };
  }

  async authGetAccessToken() {
    return this._getAccessToken();
  }

  // ==========================================
  // Utility
  // ==========================================

  isAvailable() {
    return true; // Browser adapter is always available in browser
  }

  getRawAPI() {
    return null; // No raw API in browser
  }

  _showToast(message, type) {
    import("../utils/toast.js")
      .then((module) => module.showToast(message, type))
      .catch(() => console.warn("Toast not available:", message));
  }

  async invoke(channel, _data) {
    console.warn(`BrowserAPIAdapter.invoke(${channel}) - not implemented`);
    throw new Error(`Browser invoke not implemented: ${channel}`);
  }

  async send(channel, _data) {
    console.debug(`Browser send: ${channel}`);
  }

  // ==========================================
  // Project Operations
  // ==========================================

  /**
   * List all projects for the current user
   * @returns {Promise<object>} { projects: [], pagination: {...} }
   */
  async listProjects(offset = 0, limit = 50) {
    return this._fetch(`/api/v1/projects?offset=${offset}&limit=${limit}`);
  }

  /**
   * Create a new project
   * @param {string} name - Project name
   * @param {string} [description] - Optional description
   * @returns {Promise<object>} Created project
   */
  async createProject(name, description = "") {
    return this._fetch("/api/v1/projects", {
      method: "POST",
      body: { name, description },
    });
  }

  /**
   * Update a project
   * @param {string} projectId - Project ID
   * @param {object} updates - Fields to update (name, description)
   * @returns {Promise<object>} Updated project
   */
  async updateProject(projectId, updates) {
    return this._fetch(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      body: updates,
    });
  }

  /**
   * Delete a project
   * @param {string} projectId - Project ID
   * @returns {Promise<object>} Deletion result
   */
  async deleteProject(projectId) {
    return this._fetch(`/api/v1/projects/${projectId}`, {
      method: "DELETE",
    });
  }
}
