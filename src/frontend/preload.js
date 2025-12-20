// Preload script for secure IPC communication
const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to communicate with the main process
contextBridge.exposeInMainWorld("electronAPI", {
  // Send user input to Python bot (accepts single string or array of strings)
  sendUserInput: (messages, sessionId = null) => {
    // Normalize to array format for unified backend handling
    const messageArray = Array.isArray(messages) ? messages : [messages];
    ipcRenderer.send("user-input", { messages: messageArray, session_id: sessionId });
  },

  // Request bot restart
  restartBot: () => {
    ipcRenderer.send("restart-bot");
  },

  // V2: Listen for bot messages (objects, not text)
  onBotMessage: (callback) => {
    ipcRenderer.on("bot-message", (_event, message) => callback(message));
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

  // Open external URL in system default browser
  openExternalUrl: async (url) => {
    return await ipcRenderer.invoke("open-external-url", url);
  },

  // Get system username
  getUsername: async () => {
    return await ipcRenderer.invoke("get-username");
  },

  // Stream interruption
  interruptStream: (sessionId = null) => ipcRenderer.invoke("interrupt-stream", { session_id: sessionId }),

  // Window controls (for custom titlebar on Windows/Linux)
  windowMinimize: () => {
    ipcRenderer.send("window-minimize");
  },

  windowMaximize: () => {
    ipcRenderer.send("window-maximize");
  },

  windowClose: () => {
    ipcRenderer.send("window-close");
  },

  windowIsMaximized: async () => {
    return await ipcRenderer.invoke("window-is-maximized");
  },

  // Platform detection
  platform: process.platform,

  // Cleanup methods to prevent memory leaks
  removeListener: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  removeAllListeners: () => {
    const channels = ["bot-message", "bot-error", "bot-disconnected", "bot-restarted"];
    channels.forEach((channel) => {
      ipcRenderer.removeAllListeners(channel);
    });
  },
});
