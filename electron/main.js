const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const Logger = require("./logger");
const PythonManager = require("../scripts/python-manager");
const platformConfig = require("../scripts/platform-config");
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
  JSON_DELIMITER,
  JSON_DELIMITER_LENGTH,
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    // macOS-specific: Hide title bar but keep traffic light buttons
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 10, y: 10 },
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
    icon: path.join(__dirname, "icon.png"), // Optional, you can add an icon later
  });

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

    // Start health monitoring
    startHealthCheck();
  } catch (error) {
    logger.error("Failed to start Python process", { error: error.message });
    if (mainWindow) {
      mainWindow.webContents.send("bot-error", `Failed to start Python process: ${error.message}`);
    }
    return;
  }

  // Handle Python stdout (bot responses)
  pythonProcess.stdout.on("data", (data) => {
    const output = data.toString("utf-8");
    logger.trace("Python stdout received", { length: output.length });

    // Parse and filter individual messages to avoid blocking entire chunks
    // A single chunk may contain multiple JSON messages (e.g., function events + session_response)
    let filteredOutput = output;

    // Check if output contains IPC response messages that should not go to renderer
    if (output.includes('"type":"upload_response"') || output.includes('"type":"session_response"')) {
      // Find and remove complete JSON messages that are IPC responses
      // Match pattern: __JSON__<content>__JSON__
      let result = output;
      let startIdx = 0;

      while (true) {
        const start = result.indexOf(JSON_DELIMITER, startIdx);
        if (start === -1) break;

        const contentStart = start + JSON_DELIMITER_LENGTH;
        const end = result.indexOf(JSON_DELIMITER, contentStart);
        if (end === -1) break;

        const content = result.substring(contentStart, end);

        try {
          const message = JSON.parse(content);

          // If this is an IPC response message, remove it
          if (message.type === "upload_response" || message.type === "session_response") {
            logger.trace("Filtering out IPC response message", { type: message.type });
            // Remove the entire message including both delimiters
            result = result.substring(0, start) + result.substring(end + JSON_DELIMITER_LENGTH);
            // Don't advance startIdx - check same position again
            continue;
          }
        } catch (e) {
          // Not valid JSON, skip this message
        }

        // Move past this message
        startIdx = end + JSON_DELIMITER_LENGTH;
      }

      filteredOutput = result;
    }

    // Forward filtered output to renderer (if not empty after filtering)
    if (mainWindow && filteredOutput.trim()) {
      mainWindow.webContents.send("bot-output", filteredOutput);
      logger.logIPC("send", "bot-output", filteredOutput, { toRenderer: true });
    }
  });

  // stderr now goes directly to terminal for debugging (not captured)

  // Handle Python process exit
  pythonProcess.on("close", (code) => {
    logger.warn(`Python process exited with code ${code}`);
    logger.logPythonProcess("exited", { exitCode: code });

    pythonProcess = null;
    pythonProcessPID = null;
    stopHealthCheck();

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

app.whenReady().then(() => {
  logger.info("Electron app ready, initializing...");

  // IPC handler for renderer logging
  ipcMain.on("renderer-log", (_event, { level, message, data }) => {
    const rendererLogger = new Logger("renderer");
    if (data) {
      rendererLogger[level](message, data);
    } else {
      rendererLogger[level](message);
    }
  });

  // IPC handler for user input
  ipcMain.on("user-input", (event, message) => {
    logger.logIPC("receive", "user-input", message, { fromRenderer: true });
    logger.logUserInteraction("chat-input", { messageLength: message.length });

    if (pythonProcess && !pythonProcess.killed) {
      pythonProcess.stdin.write(`${message}\n`);
      logger.debug("Sent input to Python process");
    } else {
      logger.error("Python process is not running");
      event.reply("bot-error", "Python process is not running");
    }
  });

  // IPC handler for session commands
  ipcMain.handle("session-command", async (_event, { command, data }) => {
    logger.info("Session command received", { command });

    if (!pythonProcess || pythonProcess.killed) {
      logger.error("Python process not running for session command");
      return { error: "Backend not available" };
    }

    try {
      // Send command to Python in expected format
      const dataJson = JSON.stringify(data || {});
      const sessionCommand = `__SESSION__${command}__${dataJson}__\n`;
      pythonProcess.stdin.write(sessionCommand);
      logger.debug("Sent session command to Python", { command, dataJson });

      // Wait for response (with timeout)
      // Summarization needs longer timeout since it calls LLM (network delays, large conversations)
      const timeoutMs = command === "summarize" ? SUMMARIZE_COMMAND_TIMEOUT : SESSION_COMMAND_TIMEOUT;
      return new Promise((resolve) => {
        let buffer = ""; // Accumulate chunks for large responses

        const timeout = setTimeout(() => {
          logger.warn("Session command timed out", { command });
          pythonProcess.stdout.removeListener("data", responseHandler);
          resolve({ error: "Command timed out" });
        }, timeoutMs);

        // Listen for response from Python
        const responseHandler = (data) => {
          buffer += data.toString("utf-8");

          // Loop through ALL complete messages in buffer to find session_response
          // A chunk may contain multiple messages (function events + session_response)
          while (true) {
            const jsonStart = buffer.indexOf(JSON_DELIMITER);
            if (jsonStart === -1) break; // No more messages

            const jsonEnd = buffer.indexOf(JSON_DELIMITER, jsonStart + JSON_DELIMITER_LENGTH);
            if (jsonEnd === -1) break; // Incomplete message, wait for more data

            try {
              const jsonStr = buffer.substring(jsonStart + JSON_DELIMITER_LENGTH, jsonEnd);
              const message = JSON.parse(jsonStr);

              // Remove this message from buffer before checking type
              buffer = buffer.substring(jsonEnd + JSON_DELIMITER_LENGTH);

              // If this is the session_response we're waiting for, resolve
              if (message.type === "session_response") {
                clearTimeout(timeout);
                pythonProcess.stdout.removeListener("data", responseHandler);
                resolve(message.data);
                return; // Stop processing
              }

              // Otherwise, continue to next message in buffer
            } catch (e) {
              // Failed to parse, remove malformed message and continue
              buffer = buffer.substring(jsonEnd + JSON_DELIMITER_LENGTH);
              logger.error("Failed to parse message in session response handler", { error: e.message });
            }
          }
        };

        pythonProcess.stdout.on("data", responseHandler);
      });
    } catch (error) {
      logger.error("Session command error", { error: error.message });
      return { error: error.message };
    }
  });

  // IPC handler for file uploads
  ipcMain.handle("upload-file", async (_event, { filename, data, size, type }) => {
    logger.info("File upload requested", { filename, size, type });

    if (!pythonProcess || pythonProcess.killed) {
      logger.error("Python process not running for file upload");
      return { success: false, error: "Backend not available" };
    }

    try {
      // Send upload command to Python
      const uploadData = { filename, data, size, type };
      const dataJson = JSON.stringify(uploadData);
      const uploadCommand = `__UPLOAD__${dataJson}__\n`;
      pythonProcess.stdin.write(uploadCommand);
      logger.debug("Sent upload command to Python", { filename, size });

      // Wait for response with timeout
      return new Promise((resolve) => {
        let buffer = ""; // Accumulate chunks for large responses

        const timeout = setTimeout(() => {
          logger.warn("File upload timed out", { filename });
          pythonProcess.stdout.removeListener("data", responseHandler);
          resolve({ success: false, error: "Upload timed out" });
        }, FILE_UPLOAD_TIMEOUT);

        const responseHandler = (data) => {
          buffer += data.toString("utf-8");

          // Loop through ALL complete messages to find upload_response
          while (true) {
            const jsonStart = buffer.indexOf(JSON_DELIMITER);
            if (jsonStart === -1) break;

            const jsonEnd = buffer.indexOf(JSON_DELIMITER, jsonStart + JSON_DELIMITER_LENGTH);
            if (jsonEnd === -1) break;

            try {
              const jsonStr = buffer.substring(jsonStart + JSON_DELIMITER_LENGTH, jsonEnd);
              const message = JSON.parse(jsonStr);

              // Remove this message from buffer
              buffer = buffer.substring(jsonEnd + JSON_DELIMITER_LENGTH);

              // If this is the upload_response, resolve
              if (message.type === "upload_response") {
                clearTimeout(timeout);
                pythonProcess.stdout.removeListener("data", responseHandler);
                resolve(message.data);
                return;
              }
            } catch (e) {
              buffer = buffer.substring(jsonEnd + JSON_DELIMITER_LENGTH);
              logger.error("Failed to parse message in upload response handler", { error: e.message });
            }
          }
        };

        pythonProcess.stdout.on("data", responseHandler);
      });
    } catch (error) {
      logger.error("File upload error", { error: error.message });
      return { success: false, error: error.message };
    }
  });

  // IPC handler for listing directory contents
  ipcMain.handle("list-directory", async (_event, dirPath) => {
    logger.info("Directory list requested", { dirPath });

    try {
      // Construct absolute path relative to project root
      const projectRoot = path.join(__dirname, "..");
      const absolutePath = path.join(projectRoot, dirPath);

      // Read directory contents
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });

      // Get file stats for each entry (exclude hidden files like .DS_Store)
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && !entry.name.startsWith(HIDDEN_FILE_PREFIX))
          .map(async (entry) => {
            const filePath = path.join(absolutePath, entry.name);
            const stats = await fs.stat(filePath);
            return {
              name: entry.name,
              size: stats.size,
              modified: stats.mtime,
            };
          })
      );

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

      // Send quit command through stdin first
      try {
        pythonProcess.stdin.write("quit\n");
      } catch (_e) {
        // Stdin might be closed
      }

      // Then send SIGTERM
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
