const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const Logger = require("./logger");
const PythonManager = require("../scripts/python-manager");
const platformConfig = require("../scripts/platform-config");
const IPCProtocolV2 = require("./utils/ipc-v2-protocol");
const BinaryMessageParser = require("./utils/binary-message-parser");
const {
  RESTART_DELAY,
  RESTART_CALLBACK_DELAY,
  GRACEFUL_SHUTDOWN_TIMEOUT,
  HEALTH_CHECK_INTERVAL,
  SIGTERM_DELAY,
  FILE_UPLOAD_TIMEOUT,
  SESSION_COMMAND_TIMEOUT,
  SUMMARIZE_COMMAND_TIMEOUT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  HIDDEN_FILE_PREFIX,
} = require("./config/main-constants");

// Initialize logger for main process
const logger = new Logger("main");

// Initialize Python manager
const pythonManager = new PythonManager(path.join(__dirname, ".."));

let mainWindow;
let pythonProcess;
let pythonProcessPID = null;
let isShuttingDown = false;
let processHealthCheckInterval = null;

// Request-response correlation map for IPC
// Key: request_id, Value: { resolve, reject, timeoutId, type }
const pendingRequests = new Map();

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

async function startPythonBot() {
  // Prevent multiple instances
  if (pythonProcess && !pythonProcess.killed) {
    logger.warn("Python process already running, skipping start");
    return;
  }

  logger.info("Starting Python bot process");
  logger.info("Platform:", platformConfig.getPlatformName());

  try {
    // Use PythonManager to find Python (cross-platform)
    const pythonPath = await pythonManager.findPython();
    logger.info("Found Python:", pythonPath);

    const spawnOptions = platformConfig.getSpawnOptions({
      stdio: ["pipe", "pipe", "inherit"], // [stdin, stdout, stderr -> terminal]
    });

    pythonProcess = spawn(pythonPath, [path.join(__dirname, "..", "src", "main.py")], spawnOptions);

    pythonProcessPID = pythonProcess.pid;
    logger.logPythonProcess("started", { pid: pythonProcessPID, path: pythonPath });

    // IMPORTANT: Set up stdout listener BEFORE sending protocol negotiation
    // to avoid race condition where response arrives before listener is attached
    const binaryParser = new BinaryMessageParser({
      onMessage: (message) => {
        const messageType = message.type;
        logger.trace("Python binary message received", {
          type: messageType,
          size: message._size,
          compressed: message._compressed,
        });

        // Route messages by type
        switch (messageType) {
          case "protocol_negotiation_response":
            logger.info("Protocol negotiation response received", {
              selectedVersion: message.selected_version,
              serverVersion: message.server_version,
            });
            // Protocol negotiation successful - no action needed for renderer
            break;

          case "session_response":
          case "upload_response": {
            // Route to pending request via request_id correlation
            const requestId = message.request_id;
            const pending = pendingRequests.get(requestId);
            if (pending) {
              clearTimeout(pending.timeoutId);
              pendingRequests.delete(requestId);
              pending.resolve(message.data);
              logger.trace("IPC response routed", { type: messageType, requestId });
            } else {
              logger.warn("Received response with unknown request_id", { type: messageType, requestId });
            }
            break;
          }

          case "error":
            // Error from backend
            logger.error("Backend error received", { error: message.error });
            if (mainWindow) {
              mainWindow.webContents.send("bot-error", message.error);
            }
            break;

          default:
            // Forward messages to renderer as objects (V2 native - no conversion)
            if (mainWindow) {
              mainWindow.webContents.send("bot-message", message);
              logger.logIPC("send", "bot-message", message.type, { toRenderer: true });
            }
            break;
        }
      },
      onError: (error) => {
        logger.error("Binary message parse error", { error: error.message, code: error.code });
      },
    });

    pythonProcess.stdout.on("data", (data) => {
      logger.trace("Python stdout received", { bytes: data.length });
      binaryParser.feed(data);
    });

    // Now safe to send protocol negotiation - listener is ready
    sendProtocolNegotiation();

    // Start health monitoring
    startHealthCheck();
  } catch (error) {
    logger.error("Failed to start Python process", { error: error.message });
    if (mainWindow) {
      mainWindow.webContents.send("bot-error", `Failed to start Python process: ${error.message}`);
    }
    return;
  }

  // stderr now goes directly to terminal for debugging (not captured)

  // Handle Python process exit
  pythonProcess.on("close", (code) => {
    logger.warn(`Python process exited with code ${code}`);
    logger.logPythonProcess("exited", { exitCode: code });

    pythonProcess = null;
    pythonProcessPID = null;
    stopHealthCheck();

    // Reject all pending requests on process exit
    for (const [requestId, pending] of pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Backend process exited"));
      logger.debug("Rejected pending request due to process exit", { requestId, type: pending.type });
    }
    pendingRequests.clear();

    if (mainWindow && !isShuttingDown) {
      mainWindow.webContents.send("bot-disconnected");

      // Auto-restart on unexpected exit (not user-initiated)
      if (code !== 0 && code !== null) {
        logger.info("Attempting to auto-restart Python process after unexpected exit");
        setTimeout(() => {
          if (!isShuttingDown) {
            startPythonBot();
          }
        }, RESTART_DELAY);
      }
    }
  });

  // Handle process errors
  pythonProcess.on("error", (error) => {
    logger.error("Python process error", { error: error.message });
    if (mainWindow) {
      mainWindow.webContents.send("bot-error", `Process error: ${error.message}`);
    }
  });
}

function sendProtocolNegotiation() {
  if (!pythonProcess || pythonProcess.killed) {
    logger.warn("Cannot send protocol negotiation: Python process not running");
    return;
  }

  const negotiation = {
    type: "protocol_negotiation",
    supported_versions: [2], // V2 only
    client_version: app.getVersion(),
  };

  try {
    const binaryMessage = IPCProtocolV2.encode(negotiation);
    pythonProcess.stdin.write(binaryMessage);
    logger.info("Sent protocol negotiation (V2 binary)", {
      version: 2,
      size: binaryMessage.length,
    });
  } catch (error) {
    logger.error("Failed to send protocol negotiation", { error: error.message });
  }
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

    if (pythonProcess && !pythonProcess.killed) {
      try {
        // Convert array of strings to array of message objects for Python backend
        const messages = messageArray.map((content) => ({ content }));
        const binaryMessage = IPCProtocolV2.encode({
          type: "message",
          messages: messages, // Array format: [{content: "text1"}, {content: "text2"}]
          session_id: session_id, // Include session_id for routing
        });
        pythonProcess.stdin.write(binaryMessage);
        logger.debug("Sent user messages as V2 binary", {
          messageCount: messages.length,
          binarySize: binaryMessage.length,
          sessionId: session_id,
        });
      } catch (error) {
        logger.error("Failed to encode user message", { error: error.message });
        event.reply("bot-error", `Failed to send message: ${error.message}`);
      }
    } else {
      logger.error("Python process is not running");
      event.reply("bot-error", "Python process is not running");
    }
  });

  // IPC handler for session commands (Binary V2)
  ipcMain.handle("session-command", async (_event, { command, data }) => {
    logger.info("Session command received", { command });

    if (!pythonProcess || pythonProcess.killed) {
      logger.error("Python process not running for session command");
      return { error: "Backend not available" };
    }

    try {
      // Generate unique request ID to correlate request/response
      const requestId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Wait for response (with timeout)
      // Summarization needs longer timeout since it calls LLM (network delays, large conversations)
      const timeoutMs = command === "summarize" ? SUMMARIZE_COMMAND_TIMEOUT : SESSION_COMMAND_TIMEOUT;

      return new Promise((resolve, reject) => {
        // Set timeout for response
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(requestId);
          logger.warn("Session command timed out", { command, requestId });
          reject(new Error("Command timed out"));
        }, timeoutMs);

        // Register in pending requests map BEFORE sending
        pendingRequests.set(requestId, { resolve, reject, timeoutId, type: "session" });

        // Send command to Python as binary V2
        const binaryMessage = IPCProtocolV2.encode({
          type: "session",
          command: command,
          params: data || {},
          request_id: requestId,
        });
        pythonProcess.stdin.write(binaryMessage);
        logger.debug("Sent session command as V2 binary", { command, requestId, binarySize: binaryMessage.length });
      });
    } catch (error) {
      logger.error("Session command error", { error: error.message });
      return { error: error.message };
    }
  });

  // IPC handler for file uploads (Binary V2)
  ipcMain.handle("upload-file", async (_event, { filename, data, size, type, encoding }) => {
    logger.info("File upload requested", { filename, size, type, encoding: encoding || "array" });

    if (!pythonProcess || pythonProcess.killed) {
      logger.error("Python process not running for file upload");
      return { success: false, error: "Backend not available" };
    }

    try {
      // Generate unique request ID to correlate request/response
      const requestId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Wait for response with timeout
      return new Promise((resolve, reject) => {
        // Set timeout
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(requestId);
          logger.warn("File upload timed out", { filename, requestId });
          reject(new Error("Upload timed out"));
        }, FILE_UPLOAD_TIMEOUT);

        // Register in pending requests map BEFORE sending
        pendingRequests.set(requestId, { resolve, reject, timeoutId, type: "upload" });

        // Send upload command to Python as binary V2
        const binaryMessage = IPCProtocolV2.encode({
          type: "file_upload",
          filename: filename,
          content: data,
          mime_type: type,
          encoding: encoding || "array", // "base64" for efficient transfer, "array" for legacy
          request_id: requestId,
        });
        pythonProcess.stdin.write(binaryMessage);
        logger.debug("Sent file upload as V2 binary", { filename, size, requestId, binarySize: binaryMessage.length });
      });
    } catch (error) {
      logger.error("File upload error", { error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for listing directory contents (recursive)
  ipcMain.handle("list-directory", async (_event, dirPath) => {
    logger.info("Directory list requested", { dirPath });

    try {
      // Construct absolute path relative to project root
      const projectRoot = path.join(__dirname, "..");
      const absolutePath = path.join(projectRoot, dirPath);

      // Get entries at current level (non-recursive for explorer navigation)
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      const files = [];

      for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith(HIDDEN_FILE_PREFIX)) continue;

        const fullPath = path.join(absolutePath, entry.name);

        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          files.push({
            name: entry.name,
            type: "file",
            size: stats.size,
            modified: stats.mtime,
          });
        } else if (entry.isDirectory()) {
          // Count items in subdirectory
          let fileCount = 0;
          try {
            const subEntries = await fs.readdir(fullPath);
            fileCount = subEntries.filter((e) => !e.startsWith(HIDDEN_FILE_PREFIX)).length;
          } catch {
            // Ignore errors counting subdirectory
          }
          files.push({
            name: entry.name,
            type: "folder",
            size: 0,
            modified: null,
            file_count: fileCount,
          });
        }
      }

      // Sort: folders first, then files, alphabetically within each group
      files.sort((a, b) => {
        if (a.type === "folder" && b.type !== "folder") return -1;
        if (a.type !== "folder" && b.type === "folder") return 1;
        return a.name.localeCompare(b.name);
      });

      logger.debug("Directory listed successfully", { dirPath, fileCount: files.length });
      return { success: true, files };
    } catch (error) {
      logger.error("Failed to list directory", { dirPath, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for deleting files
  ipcMain.handle("delete-file", async (_event, { dirPath, filename }) => {
    logger.info("File delete requested", { dirPath, filename });

    try {
      // Construct absolute path relative to project root
      const projectRoot = path.join(__dirname, "..");
      const absolutePath = path.join(projectRoot, dirPath, filename);

      // Security check: ensure path is within project directory
      const normalizedPath = path.normalize(absolutePath);
      const normalizedRoot = path.normalize(projectRoot);
      if (!normalizedPath.startsWith(normalizedRoot)) {
        logger.error("Security: Attempted to delete file outside project", { path: normalizedPath });
        return { success: false, error: "Invalid file path" };
      }

      // Delete the file
      await fs.unlink(absolutePath);

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
      // Construct absolute path relative to project root
      const projectRoot = path.join(__dirname, "..");
      const absolutePath = path.join(projectRoot, dirPath, filename);

      // Security check: ensure path is within project directory
      const normalizedPath = path.normalize(absolutePath);
      const normalizedRoot = path.normalize(projectRoot);
      if (!normalizedPath.startsWith(normalizedRoot)) {
        logger.error("Security: Attempted to open file outside project", { path: normalizedPath });
        return { success: false, error: "Invalid file path" };
      }

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch (_e) {
        logger.error("File does not exist", { path: absolutePath });
        return { success: false, error: "File not found" };
      }

      // Open file with system default application
      const result = await shell.openPath(absolutePath);

      if (result) {
        // If result is a non-empty string, it's an error message
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

      // Only allow http and https protocols
      const urlLower = url.toLowerCase();
      if (!urlLower.startsWith("http://") && !urlLower.startsWith("https://")) {
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
  ipcMain.handle("interrupt-stream", (event, payload) => {
    const { session_id } = payload || {};
    if (pythonProcess?.stdin && !isShuttingDown) {
      logger.info("Sending interrupt signal to Python", { sessionId: session_id });
      const msg = { type: "interrupt", session_id: session_id };
      const binaryMessage = IPCProtocolV2.encode(msg);
      pythonProcess.stdin.write(binaryMessage);
      return { success: true };
    }
    return { success: false, reason: "No active process" };
  });

  // IPC handler for restart request
  ipcMain.on("restart-bot", () => {
    logger.info("Restart requested");

    // Send disconnected status first
    if (mainWindow) {
      mainWindow.webContents.send("bot-disconnected");
    }

    // Graceful shutdown with proper cleanup (non-blocking)
    stopPythonBot().then(() => {
      // Wait a bit longer to ensure process is fully terminated
      setTimeout(() => {
        startPythonBot();

        // Send restart event after process starts
        setTimeout(() => {
          if (mainWindow) {
            mainWindow.webContents.send("bot-restarted");
          }
        }, RESTART_CALLBACK_DELAY);
      }, RESTART_DELAY);
    });
  });
  createWindow();
  startPythonBot();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  logger.info("All windows closed");
  isShuttingDown = true;

  // Graceful shutdown (non-blocking)
  stopPythonBot().then(() => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
});

app.on("before-quit", (event) => {
  if (!isShuttingDown) {
    event.preventDefault();
    isShuttingDown = true;

    logger.info("App quitting, cleaning up...");

    // Graceful shutdown with timeout (non-blocking)
    stopPythonBot().then(() => {
      app.quit();
    });
  }
});

// Helper functions for process management
async function stopPythonBot() {
  if (!pythonProcess) return;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Force kill if graceful shutdown takes too long
      if (pythonProcess && !pythonProcess.killed) {
        logger.warn("Graceful shutdown timed out, force killing Python process");

        if (platformConfig.isWindows()) {
          // Windows: Kill process tree with /T flag
          if (pythonProcessPID && typeof pythonProcessPID === "number") {
            spawn("taskkill", ["/pid", pythonProcessPID.toString(), "/f", "/t"]);
          } else {
            logger.error("Invalid PID for taskkill, using fallback method");
            pythonProcess.kill("SIGKILL");
          }
        } else {
          // Kill entire process group on Unix
          try {
            process.kill(-pythonProcess.pid, "SIGKILL");
          } catch (_e) {
            pythonProcess.kill("SIGKILL");
          }
        }
      }
      resolve();
    }, GRACEFUL_SHUTDOWN_TIMEOUT);

    // Listen for process exit
    pythonProcess.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    // Try graceful shutdown first
    if (pythonProcess && !pythonProcess.killed) {
      logger.info("Attempting graceful Python process shutdown");

      // Send SIGTERM to gracefully terminate
      setTimeout(() => {
        if (pythonProcess && !pythonProcess.killed) {
          if (platformConfig.isWindows()) {
            pythonProcess.kill();
          } else {
            // Kill process group on Unix to prevent zombies
            try {
              process.kill(-pythonProcess.pid, "SIGTERM");
            } catch (_e) {
              pythonProcess.kill("SIGTERM");
            }
          }
        }
      }, SIGTERM_DELAY);
    }
  });
}

function startHealthCheck() {
  // Clear any existing interval
  stopHealthCheck();

  // Check process health every 30 seconds
  processHealthCheckInterval = setInterval(() => {
    if (pythonProcess && pythonProcessPID) {
      try {
        // Check if process is still alive
        process.kill(pythonProcessPID, 0);
        logger.trace("Python process health check passed", { pid: pythonProcessPID });
      } catch (e) {
        logger.error("Python process health check failed - process may be zombie", {
          pid: pythonProcessPID,
          error: e.message,
        });

        // Process is dead, clean up
        pythonProcess = null;
        pythonProcessPID = null;
        stopHealthCheck();

        if (mainWindow && !isShuttingDown) {
          mainWindow.webContents.send("bot-disconnected");

          // Attempt restart
          logger.info("Restarting Python process after health check failure");
          startPythonBot();
        }
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

function stopHealthCheck() {
  if (processHealthCheckInterval) {
    clearInterval(processHealthCheckInterval);
    processHealthCheckInterval = null;
  }
}
