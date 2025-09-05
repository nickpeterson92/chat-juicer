const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const Logger = require('./logger');

// Initialize logger for main process
const logger = new Logger('main');

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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icon.png') // Optional, you can add an icon later
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startPythonBot() {
  // Prevent multiple instances
  if (pythonProcess && !pythonProcess.killed) {
    logger.warn('Python process already running, skipping start');
    return;
  }
  
  logger.info('Starting Python bot process');
  
  try {
    // Spawn Python process with detached flag for better cleanup
    pythonProcess = spawn('python', [path.join(__dirname, '..', 'src', 'main.py')], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }, // Ensures real-time output
      stdio: ['pipe', 'pipe', 'inherit'], // [stdin, stdout, stderr -> terminal]
      detached: process.platform !== 'win32' // Detached on Unix for process group management
    });
    
    pythonProcessPID = pythonProcess.pid;
    logger.logPythonProcess('started', { pid: pythonProcessPID });
    
    // Start health monitoring
    startHealthCheck();
  } catch (error) {
    logger.error('Failed to start Python process', { error: error.message });
    if (mainWindow) {
      mainWindow.webContents.send('bot-error', 'Failed to start Python process');
    }
    return;
  }

  // Handle Python stdout (bot responses)
  pythonProcess.stdout.on('data', (data) => {
    const output = data.toString();
    logger.trace('Python stdout received', { length: output.length });
    
    if (mainWindow) {
      // Send to renderer process
      mainWindow.webContents.send('bot-output', output);
      logger.logIPC('send', 'bot-output', output, { toRenderer: true });
    }
  });

  // stderr now goes directly to terminal for debugging (not captured)

  // Handle Python process exit
  pythonProcess.on('close', (code) => {
    logger.warn(`Python process exited with code ${code}`);
    logger.logPythonProcess('exited', { exitCode: code });
    
    pythonProcess = null;
    pythonProcessPID = null;
    stopHealthCheck();
    
    if (mainWindow && !isShuttingDown) {
      mainWindow.webContents.send('bot-disconnected');
      
      // Auto-restart on unexpected exit (not user-initiated)
      if (code !== 0 && code !== null) {
        logger.info('Attempting to auto-restart Python process after unexpected exit');
        setTimeout(() => {
          if (!isShuttingDown) {
            startPythonBot();
          }
        }, 2000);
      }
    }
  });
  
  // Handle process errors
  pythonProcess.on('error', (error) => {
    logger.error('Python process error', { error: error.message });
    if (mainWindow) {
      mainWindow.webContents.send('bot-error', `Process error: ${error.message}`);
    }
  });
}

// IPC handler for user input
ipcMain.on('user-input', (event, message) => {
  logger.logIPC('receive', 'user-input', message, { fromRenderer: true });
  logger.logUserInteraction('chat-input', { messageLength: message.length });
  
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.stdin.write(message + '\n');
    logger.debug('Sent input to Python process');
  } else {
    logger.error('Python process is not running');
    event.reply('bot-error', 'Python process is not running');
  }
});

// IPC handler for restart request
ipcMain.on('restart-bot', () => {
  logger.info('Restart requested');
  
  // Graceful shutdown with proper cleanup (non-blocking)
  stopPythonBot().then(() => {
    // Wait a bit longer to ensure process is fully terminated
    setTimeout(() => {
      startPythonBot();
      if (mainWindow) {
        mainWindow.webContents.send('bot-restarted');
      }
    }, 2000);
  });
});

app.whenReady().then(() => {
  logger.info('Electron app ready, initializing...');
  createWindow();
  startPythonBot();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');
  isShuttingDown = true;
  
  // Graceful shutdown (non-blocking)
  stopPythonBot().then(() => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
});

app.on('before-quit', (event) => {
  if (!isShuttingDown) {
    event.preventDefault();
    isShuttingDown = true;
    
    logger.info('App quitting, cleaning up...');
    
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
        logger.warn('Graceful shutdown timed out, force killing Python process');
        
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', pythonProcessPID.toString(), '/f']);
        } else {
          // Kill entire process group on Unix
          try {
            process.kill(-pythonProcess.pid, 'SIGKILL');
          } catch (e) {
            pythonProcess.kill('SIGKILL');
          }
        }
      }
      resolve();
    }, 5000); // 5 second timeout
    
    // Listen for process exit
    pythonProcess.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    
    // Try graceful shutdown first
    if (pythonProcess && !pythonProcess.killed) {
      logger.info('Attempting graceful Python process shutdown');
      
      // Send quit command through stdin first
      try {
        pythonProcess.stdin.write('quit\n');
      } catch (e) {
        // Stdin might be closed
      }
      
      // Then send SIGTERM
      setTimeout(() => {
        if (pythonProcess && !pythonProcess.killed) {
          if (process.platform === 'win32') {
            pythonProcess.kill();
          } else {
            // Kill process group on Unix to prevent zombies
            try {
              process.kill(-pythonProcess.pid, 'SIGTERM');
            } catch (e) {
              pythonProcess.kill('SIGTERM');
            }
          }
        }
      }, 500);
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
        logger.trace('Python process health check passed', { pid: pythonProcessPID });
      } catch (e) {
        logger.error('Python process health check failed - process may be zombie', { 
          pid: pythonProcessPID,
          error: e.message 
        });
        
        // Process is dead, clean up
        pythonProcess = null;
        pythonProcessPID = null;
        stopHealthCheck();
        
        if (mainWindow && !isShuttingDown) {
          mainWindow.webContents.send('bot-disconnected');
          
          // Attempt restart
          logger.info('Restarting Python process after health check failure');
          startPythonBot();
        }
      }
    }
  }, 30000);
}

function stopHealthCheck() {
  if (processHealthCheckInterval) {
    clearInterval(processHealthCheckInterval);
    processHealthCheckInterval = null;
  }
}