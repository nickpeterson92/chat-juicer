const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const Logger = require('./logger');

// Initialize logger for main process
const logger = new Logger('main');

let mainWindow;
let pythonProcess;

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

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startPythonBot() {
  logger.info('Starting Python bot process');
  
  // Spawn Python process
  // Let stderr go to the terminal for debugging (not captured by Electron)
  pythonProcess = spawn('python', [path.join(__dirname, 'src', 'main.py')], {
    env: { ...process.env, PYTHONUNBUFFERED: '1' }, // Ensures real-time output
    stdio: ['pipe', 'pipe', 'inherit'] // [stdin, stdout, stderr -> terminal]
  });
  
  logger.logPythonProcess('started', { pid: pythonProcess.pid });

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
    
    if (mainWindow) {
      mainWindow.webContents.send('bot-disconnected');
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
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill();
  }
  setTimeout(() => {
    startPythonBot();
    if (mainWindow) {
      mainWindow.webContents.send('bot-restarted');
    }
  }, 1000);
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
  // Kill Python process when app closes
  if (pythonProcess && !pythonProcess.killed) {
    logger.info('Killing Python process');
    pythonProcess.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Ensure Python process is killed before quitting
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill();
  }
});