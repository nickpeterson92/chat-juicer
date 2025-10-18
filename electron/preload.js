// Preload script for secure IPC communication
const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to communicate with the main process
contextBridge.exposeInMainWorld("electronAPI", {
  // Send user input to Python bot
  sendUserInput: (message) => {
    ipcRenderer.send("user-input", message);
  },

  // Request bot restart
  restartBot: () => {
    ipcRenderer.send("restart-bot");
  },

  // Listen for bot output
  onBotOutput: (callback) => {
    ipcRenderer.on("bot-output", (_event, data) => callback(data));
  },

  // Listen for bot errors
  onBotError: (callback) => {
    ipcRenderer.on("bot-error", (_event, error) => callback(error));
  },

  // Listen for bot disconnection
  onBotDisconnected: (callback) => {
    ipcRenderer.on("bot-disconnected", () => callback());
  },

  // Listen for bot restart completion
  onBotRestarted: (callback) => {
    ipcRenderer.on("bot-restarted", () => callback());
  },

  // Send log messages to main process
  log: (level, message, data) => {
    ipcRenderer.send("renderer-log", { level, message, data });
  },

  // Session management
  sessionCommand: async (command, data) => {
    return await ipcRenderer.invoke("session-command", { command, data });
  },

  // File upload
  uploadFile: async (fileData) => {
    return await ipcRenderer.invoke("upload-file", fileData);
  },

  // List directory contents
  listDirectory: async (dirPath) => {
    return await ipcRenderer.invoke("list-directory", dirPath);
  },

  // Delete file
  deleteFile: async (dirPath, filename) => {
    return await ipcRenderer.invoke("delete-file", { dirPath, filename });
  },

  // Open file with system default application
  openFile: async (dirPath, filename) => {
    return await ipcRenderer.invoke("open-file", { dirPath, filename });
  },

  // Get system username
  getUsername: async () => {
    return await ipcRenderer.invoke("get-username");
  },

  // Cleanup methods to prevent memory leaks
  removeListener: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  removeAllListeners: () => {
    const channels = ["bot-output", "bot-error", "bot-disconnected", "bot-restarted"];
    channels.forEach((channel) => {
      ipcRenderer.removeAllListeners(channel);
    });
  },
});
