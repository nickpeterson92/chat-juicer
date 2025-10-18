const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "renderer", "ui", "index.html"));
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

    // Don't forward upload_response to renderer (handled by IPC handler)
    if (output.includes('"type":"upload_response"')) {
      logger.trace("Skipping upload_response forwarding to renderer");
      return;
    }

    if (mainWindow) {
      // Send to renderer process
      mainWindow.webContents.send("bot-output", output);
      logger.logIPC("send", "bot-output", output, { toRenderer: true });
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
      const timeoutMs = command === "summarize" ? 30000 : 5000;
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn("Session command timed out", { command });
          resolve({ error: "Command timed out" });
        }, timeoutMs);

        // Listen for response from Python
        const responseHandler = (data) => {
          const output = data.toString("utf-8");

          // Look for session_response in the output
          const jsonStart = output.indexOf("__JSON__");
          if (jsonStart !== -1) {
            const jsonEnd = output.indexOf("__JSON__", jsonStart + 8);
            if (jsonEnd !== -1) {
              try {
                const jsonStr = output.substring(jsonStart + 8, jsonEnd);
                const message = JSON.parse(jsonStr);

                if (message.type === "session_response") {
                  clearTimeout(timeout);
                  pythonProcess.stdout.removeListener("data", responseHandler);
                  resolve(message.data);
                }
              } catch (e) {
                logger.error("Failed to parse session response", { error: e.message });
              }
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
        const timeout = setTimeout(() => {
          logger.warn("File upload timed out", { filename });
          resolve({ success: false, error: "Upload timed out" });
        }, FILE_UPLOAD_TIMEOUT);

        const responseHandler = (data) => {
          const output = data.toString("utf-8");

          const jsonStart = output.indexOf("__JSON__");
          if (jsonStart !== -1) {
            const jsonEnd = output.indexOf("__JSON__", jsonStart + 8);
            if (jsonEnd !== -1) {
              try {
                const jsonStr = output.substring(jsonStart + 8, jsonEnd);
                const message = JSON.parse(jsonStr);

                if (message.type === "upload_response") {
                  clearTimeout(timeout);
                  pythonProcess.stdout.removeListener("data", responseHandler);
                  resolve(message.data);
                }
              } catch (e) {
                logger.error("Failed to parse upload response", { error: e.message });
              }
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
