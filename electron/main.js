const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const { fileURLToPath } = require("node:url");
const Logger = require("./logger");
const { apiRequest, connectWebSocket, sendWebSocketMessage, closeWebSocket, API_BASE } = require("./api-client");
const {
  RESTART_DELAY,
  RESTART_CALLBACK_DELAY,
  FILE_UPLOAD_TIMEOUT,
  SESSION_COMMAND_TIMEOUT,
  SUMMARIZE_COMMAND_TIMEOUT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
} = require("./config/main-constants");

const logger = new Logger("main");
let mainWindow;
let activeSessionId = null;
// Map of sessionId -> WebSocket for concurrent session support
const sessionWebSockets = new Map();
let reconnectTimer = null;

function createWindow() {
  // Platform detection for cross-platform borderless window support
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";

  // Build platform-specific window configuration
  const windowConfig = {
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Reduce GPU memory usage
      offscreen: false,
      backgroundThrottling: true,
    },
    // Hardware acceleration options
    disableHardwareAcceleration: false, // Set to true if issues persist
    transparent: false,
    icon: path.join(__dirname, "icon.png"),
  };

  // Platform-specific title bar configuration
  if (isMac) {
    // macOS: Use native traffic light buttons with hidden title bar
    windowConfig.titleBarStyle = "hidden";
    windowConfig.trafficLightPosition = { x: 10, y: 10 };
  } else if (isWindows || isLinux) {
    // Windows/Linux: Use frameless window for custom titlebar
    windowConfig.frame = false;
    windowConfig.titleBarStyle = "hidden";
  }

  mainWindow = new BrowserWindow(windowConfig);

  // Load from Vite dev server in development, built files in production
  if (process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    logger.info("Loading from Vite dev server", { url: devUrl });
    mainWindow.loadURL(devUrl);
  } else {
    const prodPath = path.join(__dirname, "..", "dist", "renderer", "ui", "index.html");
    logger.info("Loading from built files", { path: prodPath });
    mainWindow.loadFile(prodPath);
  }

  // Open DevTools in development
  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    // Clean up any window-specific resources
    if (mainWindow) {
      mainWindow.removeAllListeners();
    }
    mainWindow = null;
  });

  // Clean up on window close to prevent memory leaks
  mainWindow.on("close", (_event) => {
    // Send cleanup signal to renderer before closing
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cleanup-requested");
    }
  });
}

function parseSessionFolder(dirPath) {
  // Match session ID and full folder path including subdirectories
  // e.g., "data/files/chat_abc123/output/code/python" -> { sessionId: "chat_abc123", folder: "output/code/python" }
  const match = dirPath?.match(/data\/files\/(chat_[^/]+)\/((?:sources|output)(?:\/.*)?)/);
  if (!match) return null;
  return { sessionId: match[1], folder: match[2] };
}

function forwardBotMessage(message) {
  if (mainWindow) {
    mainWindow.webContents.send("bot-message", message);
    logger.logIPC("send", "bot-message", message.type, { toRenderer: true });
  }
}

function mapWebSocketMessage(message, sessionId) {
  const base = { session_id: sessionId };
  switch (message.type) {
    case "stream_start":
      return { ...base, type: "assistant_start" };
    case "delta":
      return { ...base, type: "assistant_delta", content: message.content || "" };
    case "stream_end":
      return { ...base, type: "assistant_end", finish_reason: message.finish_reason || "stop" };
    case "tool_call":
      if (message.status === "detected") {
        return {
          ...base,
          type: "function_detected",
          call_id: message.id,
          name: message.name,
          arguments: message.arguments,
        };
      }
      return {
        ...base,
        type: "function_completed",
        call_id: message.id,
        name: message.name,
        success: message.success !== false,
        result: message.result,
        error: message.error,
      };
    case "tool_call_arguments_delta":
      return {
        ...base,
        type: "function_executing",
        call_id: message.id,
        arguments: message.delta,
      };
    case "error":
      return { ...base, type: "error", message: message.message || "Unknown error" };
    default:
      return { ...base, ...message };
  }
}

function ensureWebSocket(sessionId) {
  // Return existing WebSocket if already connected for this session
  if (sessionWebSockets.has(sessionId)) {
    const existing = sessionWebSockets.get(sessionId);
    if (existing.readyState === 1) {
      // WebSocket.OPEN
      return existing;
    }
    // Clean up stale connection
    sessionWebSockets.delete(sessionId);
  }

  // Create new WebSocket for this session (don't close others!)
  const ws = connectWebSocket(
    sessionId,
    (msg) => {
      const mapped = mapWebSocketMessage(msg, sessionId);
      forwardBotMessage(mapped);
    },
    () => {
      // On close/error, remove from map and notify if it was active session
      sessionWebSockets.delete(sessionId);
      if (sessionId === activeSessionId && mainWindow) {
        mainWindow.webContents.send("bot-disconnected");
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        // Only reconnect if this session is still active
        if (sessionId === activeSessionId) {
          ensureWebSocket(sessionId);
        }
      }, RESTART_DELAY);
    }
  );

  sessionWebSockets.set(sessionId, ws);
  return ws;
}

app.whenReady().then(() => {
  logger.info("Electron app ready, initializing...");

  // Set dock icon on macOS (needed for dev mode)
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(path.join(__dirname, "icon.png"));
  }

  // IPC handler for renderer logging
  ipcMain.on("renderer-log", (_event, { level, message, data }) => {
    const rendererLogger = new Logger("renderer");
    if (data) {
      rendererLogger[level](message, data);
    } else {
      rendererLogger[level](message);
    }
  });

  // IPC handlers for window controls (for custom titlebar on Windows/Linux)
  ipcMain.on("window-minimize", () => {
    if (mainWindow) {
      mainWindow.minimize();
      logger.debug("Window minimized via IPC");
    }
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        logger.debug("Window unmaximized via IPC");
      } else {
        mainWindow.maximize();
        logger.debug("Window maximized via IPC");
      }
    }
  });

  ipcMain.on("window-close", () => {
    if (mainWindow) {
      mainWindow.close();
      logger.debug("Window close requested via IPC");
    }
  });

  ipcMain.handle("window-is-maximized", () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  // IPC handler for user input (Binary V2)
  // Accepts payload with messages array and optional session_id from preload.js
  ipcMain.on("user-input", (event, payload) => {
    const { messages: messageArray, session_id } = payload;
    logger.logIPC("receive", "user-input", messageArray, { fromRenderer: true, sessionId: session_id });
    logger.logUserInteraction("chat-input", { messageCount: messageArray.length, sessionId: session_id });

    const targetSession = session_id || activeSessionId;
    if (!targetSession) {
      logger.error("No active session for user input");
      event.reply("bot-error", "No active session");
      return;
    }

    const ws = ensureWebSocket(targetSession);
    const messages = messageArray.map((content) => ({ content }));

    ws.once("open", () => {
      sendWebSocketMessage(ws, {
        type: "message",
        messages,
        session_id: targetSession,
      });
    });

    if (ws.readyState === ws.OPEN) {
      sendWebSocketMessage(ws, {
        type: "message",
        messages,
        session_id: targetSession,
      });
    }
  });

  // IPC handler for session commands (Binary V2)
  ipcMain.handle("session-command", async (_event, { command, data }) => {
    logger.info("Session command received", { command });

    try {
      const timeoutMs = command === "summarize" ? SUMMARIZE_COMMAND_TIMEOUT : SESSION_COMMAND_TIMEOUT;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const doRequest = async () => {
        switch (command) {
          case "list": {
            const offset = data?.offset ?? 0;
            const limit = data?.limit ?? 50;
            return apiRequest(`/api/sessions?offset=${offset}&limit=${limit}`, { signal: controller.signal });
          }
          case "new": {
            const response = await apiRequest("/api/sessions", {
              method: "POST",
              body: data || {},
              signal: controller.signal,
            });
            activeSessionId = response.session_id || activeSessionId;
            return response;
          }
          case "switch": {
            const sessionId = data?.session_id;
            if (!sessionId) return { error: "Missing session_id" };
            const response = await apiRequest(`/api/sessions/${sessionId}`, { signal: controller.signal });
            activeSessionId = sessionId;
            return response;
          }
          case "delete": {
            const sessionId = data?.session_id;
            if (!sessionId) return { error: "Missing session_id" };
            // Close WebSocket for deleted session (cleanup server-side file context)
            const ws = sessionWebSockets.get(sessionId);
            if (ws) {
              closeWebSocket(ws);
              sessionWebSockets.delete(sessionId);
            }
            const response = await apiRequest(`/api/sessions/${sessionId}`, {
              method: "DELETE",
              signal: controller.signal,
            });
            if (activeSessionId === sessionId) {
              activeSessionId = null;
            }
            return response;
          }
          case "rename": {
            const sessionId = data?.session_id;
            if (!sessionId) return { error: "Missing session_id" };
            return apiRequest(`/api/sessions/${sessionId}`, {
              method: "PATCH",
              body: { title: data?.title },
              signal: controller.signal,
            });
          }
          case "pin": {
            const sessionId = data?.session_id;
            if (!sessionId) return { error: "Missing session_id" };
            return apiRequest(`/api/sessions/${sessionId}`, {
              method: "PATCH",
              body: { pinned: data?.pinned },
              signal: controller.signal,
            });
          }
          case "summarize": {
            const sessionId = data?.session_id || activeSessionId;
            if (!sessionId) return { error: "Missing session_id" };
            return apiRequest(`/api/sessions/${sessionId}/summarize`, {
              method: "POST",
              signal: controller.signal,
            });
          }
          case "load_more": {
            const sessionId = data?.session_id;
            if (!sessionId) return { error: "Missing session_id", messages: [] };
            const offset = data?.offset ?? 0;
            const limit = data?.limit ?? 50;
            const result = await apiRequest(`/api/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`, {
              signal: controller.signal,
            });
            return { success: true, messages: result.messages || [] };
          }
          case "update_config": {
            const sessionId = data?.session_id;
            if (!sessionId) return { error: "Missing session_id" };
            return apiRequest(`/api/sessions/${sessionId}`, {
              method: "PATCH",
              body: {
                model: data?.model,
                mcp_config: data?.mcp_config,
                reasoning_effort: data?.reasoning_effort,
              },
              signal: controller.signal,
            });
          }
          case "config_metadata": {
            const config = await apiRequest("/api/config", { signal: controller.signal });
            // API returns { success, models, reasoning_levels } in ModelSelector format
            return {
              success: config.success ?? true,
              models: config.models || [],
              reasoning_levels: config.reasoning_levels || [],
            };
          }
          default:
            return { error: `Unknown command: ${command}` };
        }
      };
      const result = await doRequest();
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      logger.error("Session command error", { error: error.message });
      return { error: error.message };
    }
  });

  // IPC handler for file uploads (Binary V2)
  ipcMain.handle("upload-file", async (_event, { filename, data, size, type, encoding }) => {
    logger.info("File upload requested", { filename, size, type, encoding: encoding || "array" });

    const sessionId = activeSessionId;
    if (!sessionId) {
      logger.error("No active session for file upload");
      return { success: false, error: "No active session" };
    }

    try {
      const formData = new FormData();
      const buffer = Buffer.from(data, encoding === "base64" ? "base64" : undefined);
      formData.append("file", new Blob([buffer]), filename);

      const upload = await Promise.race([
        apiRequest(`/api/sessions/${sessionId}/files/upload?folder=sources`, {
          method: "POST",
          body: formData,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timed out")), FILE_UPLOAD_TIMEOUT)),
      ]);

      return { success: true, ...upload };
    } catch (error) {
      logger.error("File upload error", { error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for listing directory contents (recursive)
  ipcMain.handle("list-directory", async (_event, dirPath) => {
    logger.info("Directory list requested", { dirPath });

    try {
      const parsed = parseSessionFolder(dirPath);
      if (!parsed) {
        return { success: false, error: "Invalid path" };
      }

      const { sessionId, folder } = parsed;
      const response = await apiRequest(`/api/sessions/${sessionId}/files?folder=${encodeURIComponent(folder)}`);

      logger.debug("Directory listed successfully", { dirPath, fileCount: response.files?.length || 0 });
      return { success: true, files: response.files || [] };
    } catch (error) {
      logger.error("Failed to list directory", { dirPath, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for deleting files
  ipcMain.handle("delete-file", async (_event, { dirPath, filename }) => {
    logger.info("File delete requested", { dirPath, filename });

    try {
      const parsed = parseSessionFolder(dirPath);
      if (!parsed) {
        return { success: false, error: "Invalid path" };
      }
      const { sessionId, folder } = parsed;
      await apiRequest(
        `/api/sessions/${sessionId}/files/${encodeURIComponent(filename)}?folder=${encodeURIComponent(folder)}`,
        { method: "DELETE" }
      );
      logger.info("File deleted successfully", { dirPath, filename });
      return { success: true };
    } catch (error) {
      logger.error("Failed to delete file", { dirPath, filename, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for getting system username
  ipcMain.handle("get-username", async () => {
    try {
      const userInfo = os.userInfo();
      // Get username and extract first name (before any dot)
      const username = userInfo.username;
      const firstName = username.split(".")[0]; // Get everything before first dot
      const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      logger.debug("Username requested", { raw: username, display: capitalizedFirstName });
      return capitalizedFirstName;
    } catch (error) {
      logger.error("Failed to get username", { error: error.message });
      return "User"; // Fallback
    }
  });

  // IPC handler for opening files with system default application
  ipcMain.handle("open-file", async (_event, { dirPath, filename }) => {
    logger.info("File open requested", { dirPath, filename });

    try {
      const parsed = parseSessionFolder(dirPath);
      if (!parsed) {
        return { success: false, error: "Invalid path" };
      }
      const { sessionId, folder } = parsed;
      const response = await apiRequest(
        `/api/sessions/${sessionId}/files/${encodeURIComponent(filename)}/path?folder=${encodeURIComponent(folder)}`
      );
      const absolutePath = response.path;

      try {
        await fs.access(absolutePath);
      } catch (_e) {
        logger.error("File does not exist", { path: absolutePath });
        return { success: false, error: "File not found" };
      }

      const result = await shell.openPath(absolutePath);
      if (result) {
        logger.error("Failed to open file", { path: absolutePath, error: result });
        return { success: false, error: result };
      }

      logger.info("File opened successfully", { dirPath, filename });
      return { success: true };
    } catch (error) {
      logger.error("Failed to open file", { dirPath, filename, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for downloading code interpreter output files
  ipcMain.handle("download-code-output-file", async (_event, { path: filePath, name }) => {
    logger.info("Code output file download requested", { path: filePath, name });

    try {
      // Security check: ensure path is within project directory
      const projectRoot = path.join(__dirname, "..");
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
      const normalizedPath = path.normalize(absolutePath);
      const normalizedRoot = path.normalize(projectRoot);

      if (!normalizedPath.startsWith(normalizedRoot)) {
        logger.error("Security: Attempted to download file outside project", { path: normalizedPath });
        return { success: false, error: "Invalid file path" };
      }

      // Check if file exists
      try {
        await fs.access(normalizedPath);
      } catch (_e) {
        logger.error("File does not exist", { path: normalizedPath });
        return { success: false, error: "File not found" };
      }

      // Show save dialog
      const { canceled, filePath: savePath } = await dialog.showSaveDialog({
        title: "Save Code Output",
        defaultPath: name,
        buttonLabel: "Save",
      });

      if (canceled || !savePath) {
        logger.info("File download canceled by user");
        return { success: false, error: "Download canceled" };
      }

      // Copy file to chosen location
      await fs.copyFile(normalizedPath, savePath);

      logger.info("File downloaded successfully", { from: normalizedPath, to: savePath });
      return { success: true, path: savePath };
    } catch (error) {
      logger.error("Failed to download file", { path: filePath, name, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for opening external URLs in system browser
  ipcMain.handle("open-external-url", async (_event, url) => {
    logger.info("External URL open requested", { url });

    try {
      // Security: Validate URL protocol
      if (!url || typeof url !== "string") {
        logger.error("Invalid URL provided", { url });
        return { success: false, error: "Invalid URL" };
      }

      const parsedUrl = new URL(url);

      // Allow trusted local file URLs for bundled docs/markdown
      if (parsedUrl.protocol === "file:") {
        const filePath = path.normalize(fileURLToPath(parsedUrl));
        const allowedRoots = [path.normalize(app.getAppPath()), path.normalize(path.join(__dirname, ".."))];

        const isAllowed = allowedRoots.some((root) => filePath.startsWith(root));
        if (!isAllowed) {
          logger.error("Security: File URL outside allowed roots", { url, path: filePath });
          return { success: false, error: "File URL not permitted" };
        }

        try {
          await fs.access(filePath);
        } catch (_err) {
          logger.error("File URL does not exist", { url, path: filePath });
          return { success: false, error: "File does not exist" };
        }

        await shell.openExternal(url);
        logger.info("File URL opened successfully", { url });
        return { success: true };
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        logger.error("Security: Rejected non-HTTP(S) URL", { url });
        return { success: false, error: "Only HTTP and HTTPS URLs are allowed" };
      }

      // Open URL in system default browser
      await shell.openExternal(url);

      logger.info("External URL opened successfully", { url });
      return { success: true };
    } catch (error) {
      logger.error("Failed to open external URL", { url, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for stream interruption
  ipcMain.handle("interrupt-stream", (_event, payload) => {
    const { session_id } = payload || {};
    const targetSession = session_id || activeSessionId;
    if (!targetSession) {
      return { success: false, reason: "No active session" };
    }
    const ws = ensureWebSocket(targetSession);
    sendWebSocketMessage(ws, { type: "interrupt", session_id: targetSession });
    return { success: true };
  });

  // IPC handler for restart request
  ipcMain.on("restart-bot", () => {
    logger.info("Restart requested");

    if (mainWindow) {
      mainWindow.webContents.send("bot-disconnected");
    }

    // Close all WebSockets on restart
    for (const [sid, ws] of sessionWebSockets) {
      closeWebSocket(ws);
    }
    sessionWebSockets.clear();

    setTimeout(() => {
      if (mainWindow) {
        mainWindow.webContents.send("bot-restarted");
      }
    }, RESTART_CALLBACK_DELAY);
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  logger.info("All windows closed");
  // Close all WebSockets
  for (const [sid, ws] of sessionWebSockets) {
    closeWebSocket(ws);
  }
  sessionWebSockets.clear();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  // Close all WebSockets before quit
  for (const [sid, ws] of sessionWebSockets) {
    closeWebSocket(ws);
  }
  sessionWebSockets.clear();
});
