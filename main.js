const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

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
  // Spawn Python process
  pythonProcess = spawn('python', [path.join(__dirname, 'src', 'main.py')], {
    env: { ...process.env, PYTHONUNBUFFERED: '1' } // Ensures real-time output
  });

  // Handle Python stdout (bot responses)
  pythonProcess.stdout.on('data', (data) => {
    const output = data.toString();
    // Debug: Python output (comment out in production)
    // console.log('Python output:', output);
    
    if (mainWindow) {
      // Send to renderer process
      mainWindow.webContents.send('bot-output', output);
    }
  });

  // Handle Python stderr (errors)
  pythonProcess.stderr.on('data', (data) => {
    const error = data.toString();
    // Log Python errors for debugging
    
    if (mainWindow) {
      mainWindow.webContents.send('bot-error', error);
    }
  });

  // Handle Python process exit
  pythonProcess.on('close', (code) => {
    // Log process exit for debugging
    // console.log(`Python process exited with code ${code}`);
    if (mainWindow) {
      mainWindow.webContents.send('bot-disconnected');
    }
  });
}

// IPC handler for user input
ipcMain.on('user-input', (event, message) => {
  // Debug: User input (comment out in production)
  // console.log('User input:', message);
  
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.stdin.write(message + '\n');
  } else {
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
  createWindow();
  startPythonBot();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Kill Python process when app closes
  if (pythonProcess && !pythonProcess.killed) {
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