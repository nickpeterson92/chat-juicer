const WebSocket = require("ws");

const API_BASE = process.env.API_URL || "http://localhost:8000";

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const init = { ...options };
  init.headers = { ...(options.headers || {}) };

  if (options.token) {
    init.headers.Authorization = `Bearer ${options.token}`;
  }

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData) {
    if (!init.headers["Content-Type"]) {
      init.headers["Content-Type"] = "application/json";
    }
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.message || json?.detail || detail;
    } catch {
      // ignore
    }
    const error = new Error(detail || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  // Return raw Response for binary content (e.g., file downloads)
  if (options.rawResponse) {
    return response;
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function connectWebSocket(sessionId, onMessage, onClose, token = null) {
  let wsUrl = `${API_BASE.replace(/^http/, "ws")}/ws/chat/${sessionId}`;
  if (token) {
    wsUrl += `?token=${encodeURIComponent(token)}`;
  }
  const ws = new WebSocket(wsUrl);

  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      onMessage(parsed);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to parse WS message", err);
    }
  });

  if (onClose) {
    ws.on("close", (code, reason) => onClose(code, reason));
    ws.on("error", (err) => onClose(undefined, undefined, err));
  }

  return ws;
}

function sendWebSocketMessage(ws, message) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function closeWebSocket(ws) {
  if (!ws) return;
  if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) return;
  ws.close();
}

module.exports = {
  apiRequest,
  connectWebSocket,
  sendWebSocketMessage,
  closeWebSocket,
  API_BASE,
};
