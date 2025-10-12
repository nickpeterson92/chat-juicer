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
});
