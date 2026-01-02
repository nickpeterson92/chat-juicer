/**
 * WebSocketManager - Browser-native WebSocket management for chat streaming
 *
 * Handles WebSocket connection lifecycle, reconnection, and message routing
 * for browser environments. Used by BrowserAPIAdapter.
 */

export class WebSocketManager {
  /**
   * Create WebSocket manager
   * @param {string} apiBase - API base URL (e.g., 'https://api.chat-juicer.com')
   * @param {Function} getToken - Function that returns current access token
   */
  constructor(apiBase, getToken) {
    this.apiBase = apiBase;
    this.getToken = getToken;
    this.ws = null;
    this.sessionId = null;
    this._messageCallbacks = [];
    this._closeCallbacks = [];
    this._errorCallbacks = [];
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._reconnectDelay = 1000;
  }

  /**
   * Connect to WebSocket for session
   * @param {string} sessionId - Session ID to connect
   */
  connect(sessionId) {
    if (this.ws && this.sessionId === sessionId) {
      // Already connected to this session
      if (this.ws.readyState === WebSocket.OPEN) {
        return;
      }
    }

    // Close existing connection if different session
    if (this.ws) {
      this.close();
    }

    this.sessionId = sessionId;
    this._reconnectAttempts = 0;
    this._connect();
  }

  _connect() {
    const wsBase = this.apiBase.replace(/^http/, "ws");
    let wsUrl = `${wsBase}/ws/chat/${this.sessionId}`;

    const token = this.getToken();
    if (token) {
      wsUrl += `?token=${encodeURIComponent(token)}`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[WebSocketManager] Connected to session ${this.sessionId}`);
        this._reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Inject session_id for correct frontend routing (matches Electron's mapWebSocketMessage)
          // Backend may not include session_id in all messages
          const enrichedData = data.session_id ? data : { ...data, session_id: this.sessionId };
          this._messageCallbacks.forEach((cb) => {
            cb(enrichedData);
          });
        } catch (err) {
          console.error("[WebSocketManager] Failed to parse message:", err);
        }
      };

      this.ws.onclose = (event) => {
        const isIdleTimeout = event.code === 4000; // Custom code for idle timeout
        console.log(`[WebSocketManager] Disconnected: code=${event.code}, reason=${event.reason}`);

        this._closeCallbacks.forEach((cb) => {
          cb(event.code, event.reason, isIdleTimeout);
        });

        // Auto-reconnect unless intentional close or idle timeout
        if (!isIdleTimeout && event.code !== 1000 && this._reconnectAttempts < this._maxReconnectAttempts) {
          this._scheduleReconnect();
        }
      };

      this.ws.onerror = (event) => {
        console.error("[WebSocketManager] Error:", event);
        this._errorCallbacks.forEach((cb) => {
          cb(event);
        });
      };
    } catch (err) {
      console.error("[WebSocketManager] Failed to create WebSocket:", err);
      this._errorCallbacks.forEach((cb) => {
        cb(err);
      });
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    const delay = this._reconnectDelay * 2 ** this._reconnectAttempts;
    this._reconnectAttempts++;

    console.log(`[WebSocketManager] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);

    this._reconnectTimer = setTimeout(() => {
      if (this.sessionId) {
        this._connect();
      }
    }, delay);
  }

  /**
   * Send message over WebSocket
   * @param {object} message - Message to send
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[WebSocketManager] WebSocket not open, queuing message");
      // Wait for connection then send
      const checkAndSend = () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(message));
        } else {
          setTimeout(checkAndSend, 100);
        }
      };
      checkAndSend();
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Close WebSocket connection
   */
  close() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this.ws) {
      // Use code 1000 for intentional close
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, "Client closed");
      }
      this.ws = null;
    }

    this.sessionId = null;
  }

  /**
   * Register message callback
   * @param {Function} callback
   */
  onMessage(callback) {
    this._messageCallbacks.push(callback);
  }

  /**
   * Register close callback
   * @param {Function} callback - (code, reason, isIdle) => void
   */
  onClose(callback) {
    this._closeCallbacks.push(callback);
  }

  /**
   * Register error callback
   * @param {Function} callback
   */
  onError(callback) {
    this._errorCallbacks.push(callback);
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if connecting
   * @returns {boolean}
   */
  isConnecting() {
    return this.ws?.readyState === WebSocket.CONNECTING;
  }
}
